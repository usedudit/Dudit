import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError } from "@/lib/monitoring/sentry"
import { processTinyWebhook, TINY_PROVIDER } from "@/lib/services/integrations/tiny/tiny-integration"

export async function POST(req: Request) {
  const rateLimitResult = await checkRateLimitForAPI(
    RateLimitCategory.WEBHOOK,
    "tiny-webhook"
  )
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  const url = new URL(req.url)
  const partnerId = url.searchParams.get("partnerId") || req.headers.get("x-partner-id")
  const token = url.searchParams.get("token") || req.headers.get("x-webhook-token")

  if (!partnerId) {
    return NextResponse.json(
      { error: "Identificador do parceiro (partnerId) não fornecido na URL." },
      { status: 400 }
    )
  }

  const supabase = getAdminClient()
  const { data: integration, error: intErr } = await supabase
    .from("partner_integrations")
    .select("id, partner_id, provider_slug, status, config")
    .eq("partner_id", partnerId)
    .eq("provider_slug", TINY_PROVIDER)
    .maybeSingle()

  if (intErr || !integration || integration.status !== "connected") {
    return NextResponse.json(
      { error: "Integração com Tiny ERP não encontrada ou desconectada para esta loja." },
      { status: 401 }
    )
  }

  // Se houver webhook_secret configurado, valida token
  const expectedSecret = (integration.config as any)?.webhook_secret
  if (expectedSecret && token && token !== expectedSecret) {
    return NextResponse.json(
      { error: "Token de autorização do webhook inválido." },
      { status: 401 }
    )
  }

  let payload: any = null
  const contentType = req.headers.get("content-type") || ""

  try {
    if (contentType.includes("application/json")) {
      payload = await req.json()
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData()
      const dados = formData.get("dados")
      if (typeof dados === "string") {
        payload = JSON.parse(dados)
      } else {
        payload = Object.fromEntries(formData.entries())
      }
    } else {
      const text = await req.text()
      try {
        payload = JSON.parse(text)
      } catch {
        // Se vier como dados=...
        const params = new URLSearchParams(text)
        const dados = params.get("dados")
        payload = dados ? JSON.parse(dados) : Object.fromEntries(params.entries())
      }
    }
  } catch (parseErr: any) {
    return NextResponse.json(
      { error: `Formato de payload inválido: ${parseErr.message}` },
      { status: 400 }
    )
  }

  try {
    const result = await processTinyWebhook(partnerId, payload)
    return NextResponse.json({
      received: true,
      event: result.event,
      affectedCount: result.affectedCount,
    })
  } catch (err: any) {
    captureError(err, {
      module: "integrations",
      action: "tiny_webhook_post",
      partnerId,
      metadata: { provider: "tiny" },
    })
    return NextResponse.json(
      { error: err?.message || "Erro interno ao processar webhook do Tiny" },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const partnerId = url.searchParams.get("partnerId")

  if (!partnerId) {
    return NextResponse.json(
      { status: "ok", message: "Endpoint de webhook do Tiny ERP ativo na Dudit." },
      { status: 200 }
    )
  }

  const supabase = getAdminClient()
  const { data: integration } = await supabase
    .from("partner_integrations")
    .select("status")
    .eq("partner_id", partnerId)
    .eq("provider_slug", TINY_PROVIDER)
    .maybeSingle()

  return NextResponse.json({
    status: "ok",
    connected: integration?.status === "connected",
    message: "Endpoint de webhook do Tiny ERP validado com sucesso.",
  })
}
