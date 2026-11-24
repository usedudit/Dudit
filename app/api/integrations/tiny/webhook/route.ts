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
    .select("id, partner_id, provider_slug, status, config, metadata")
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

  const recordWebhookPing = async (eventLabel: string) => {
    try {
      await supabase
        .from("partner_integrations")
        .update({
          metadata: {
            ...((integration.metadata as Record<string, any>) || {}),
            last_webhook_at: new Date().toISOString(),
            last_webhook_event: eventLabel,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)
    } catch { }
  }

  let payload: any = null
  const contentType = req.headers.get("content-type") || ""

  try {
    const rawText = (await req.text()).trim()

    // O Tiny envia um POST com corpo vazio (ou "{}") para validar a URL ao salvar o webhook
    if (!rawText || rawText === "{}") {
      await recordWebhookPing("ping")
      return NextResponse.json({
        received: true,
        event: "ping",
        message: "URL de webhook validada com sucesso.",
      })
    }

    if (contentType.includes("application/json")) {
      payload = JSON.parse(rawText)
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawText)
      const dados = params.get("dados")
      if (dados && dados.trim()) {
        payload = JSON.parse(dados)
      } else {
        const obj = Object.fromEntries(params.entries())
        if (Object.keys(obj).length === 0) {
          await recordWebhookPing("ping")
          return NextResponse.json({ received: true, event: "ping" })
        }
        payload = obj
      }
    } else {
      try {
        payload = JSON.parse(rawText)
      } catch {
        const params = new URLSearchParams(rawText)
        const dados = params.get("dados")
        if (dados && dados.trim()) {
          payload = JSON.parse(dados)
        } else {
          payload = Object.fromEntries(params.entries())
        }
      }
    }
  } catch (parseErr: any) {
    // Se falhar o parse durante validação do Tiny, responde 200 para ping genérico se não parecer payload real
    console.warn("[TINY WEBHOOK] Payload não-JSON recebido:", parseErr?.message)
    await recordWebhookPing("ping")
    return NextResponse.json({
      received: true,
      event: "ping",
      message: "Endpoint de webhook ativo.",
    })
  }

  try {
    const result = await processTinyWebhook(partnerId, payload)
    await recordWebhookPing(result.event || "processed")
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

export async function HEAD() {
  return new NextResponse(null, { status: 200 })
}
