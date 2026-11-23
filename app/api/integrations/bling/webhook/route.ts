import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError } from "@/lib/monitoring/sentry"
import { processBlingWebhook, BLING_PROVIDER } from "@/lib/services/integrations/bling/bling-integration"

export async function POST(req: Request) {
  const rateLimitResult = await checkRateLimitForAPI(RateLimitCategory.WEBHOOK, "bling-webhook")
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  const url = new URL(req.url)
  let partnerId = url.searchParams.get("partnerId") || req.headers.get("x-partner-id")
  const token = url.searchParams.get("token") || req.headers.get("x-webhook-token")

  let payload: any = null
  try {
    payload = await req.json()
  } catch (parseErr: any) {
    return NextResponse.json(
      { error: `Payload JSON inválido: ${parseErr.message}` },
      { status: 400 }
    )
  }

  const supabase = getAdminClient()

  // No Bling v3 (App Público), a URL de webhook é única no aplicativo e o Bling envia `companyId` (hash MD5 de 32 chars) no payload
  const companyId = payload?.companyId ? String(payload.companyId).trim() : null

  if (!partnerId && companyId) {
    const { data: byCompany } = await supabase
      .from("partner_integrations")
      .select("partner_id")
      .eq("provider_slug", BLING_PROVIDER)
      .eq("status", "connected")
      .eq("account_id", companyId)
      .maybeSingle()
    if (byCompany?.partner_id) {
      partnerId = byCompany.partner_id
    }
  }

  // Fallback 1: se o companyId ainda não estava salvo como hash (ex: salvo ID numérico ou null),
  // tenta resolver pelo produto.id presente no payload e grava o companyId para os próximos webhooks
  if (!partnerId && payload?.data?.produto?.id) {
    const blingProdId = String(payload.data.produto.id)
    const { data: matchedProd } = await supabase
      .from("products")
      .select("partner_id")
      .eq("external_provider", BLING_PROVIDER)
      .eq("external_id", blingProdId)
      .limit(1)
      .maybeSingle()

    if (matchedProd?.partner_id) {
      partnerId = matchedProd.partner_id
      if (companyId) {
        await supabase
          .from("partner_integrations")
          .update({ account_id: companyId, updated_at: new Date().toISOString() })
          .eq("partner_id", partnerId)
          .eq("provider_slug", BLING_PROVIDER)
      }
    }
  }

  // Fallback 2: se houver apenas 1 conta Bling conectada sem hash salvo ainda, vincula e processa
  if (!partnerId && companyId) {
    const { data: connectedBlings } = await supabase
      .from("partner_integrations")
      .select("id, partner_id, account_id")
      .eq("provider_slug", BLING_PROVIDER)
      .eq("status", "connected")

    if (connectedBlings && connectedBlings.length === 1) {
      partnerId = connectedBlings[0].partner_id
      await supabase
        .from("partner_integrations")
        .update({ account_id: companyId, updated_at: new Date().toISOString() })
        .eq("id", connectedBlings[0].id)
    }
  }

  if (!partnerId) {
    console.warn("[BLING WEBHOOK] partnerId não resolvido:", { companyId, event: payload?.event, produtoId: payload?.data?.produto?.id })
    return NextResponse.json(
      { error: "Identificador do parceiro (partnerId ou companyId) não resolvido." },
      { status: 400 }
    )
  }

  const { data: integration, error: intErr } = await supabase
    .from("partner_integrations")
    .select("id, partner_id, provider_slug, status, config")
    .eq("partner_id", partnerId)
    .eq("provider_slug", BLING_PROVIDER)
    .maybeSingle()

  if (intErr || !integration || integration.status !== "connected") {
    return NextResponse.json(
      { error: "Integração com Bling ERP não encontrada ou desconectada para esta loja." },
      { status: 401 }
    )
  }

  const expectedSecret = (integration.config as any)?.webhook_secret
  if (expectedSecret && token && token !== expectedSecret) {
    return NextResponse.json(
      { error: "Token de autorização do webhook inválido." },
      { status: 401 }
    )
  }

  try {
    const result = await processBlingWebhook(partnerId, payload)
    return NextResponse.json({
      received: true,
      event: result.event,
      affectedCount: result.affectedCount,
    })
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "bling_webhook_post",
      partnerId,
      metadata: { provider: BLING_PROVIDER },
    })
    return NextResponse.json(
      { error: err?.message || "Erro interno ao processar webhook do Bling" },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const partnerId = url.searchParams.get("partnerId")

  if (!partnerId) {
    return NextResponse.json(
      { status: "ok", message: "Endpoint de webhook do Bling ERP ativo na Dudit." },
      { status: 200 }
    )
  }

  const supabase = getAdminClient()
  const { data: integration } = await supabase
    .from("partner_integrations")
    .select("status")
    .eq("partner_id", partnerId)
    .eq("provider_slug", BLING_PROVIDER)
    .maybeSingle()

  return NextResponse.json({
    status: "ok",
    connected: integration?.status === "connected",
    message: "Endpoint de webhook do Bling ERP validado com sucesso.",
  })
}
