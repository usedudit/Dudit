import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { verifySuperFreteWebhookSignature } from "@/lib/services/shipping/superfrete"
import { decrypt } from "@/lib/cryptoService"
import { captureError } from "@/lib/monitoring/sentry"
import { applySuperFreteShipmentStatus } from "@/lib/services/shipping/superfrete-status-sync"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

const SUPERFRETE_PROVIDER = "superfrete"

export async function POST(req: Request) {
  const rateLimitResult = await checkRateLimitForAPI(
    RateLimitCategory.WEBHOOK,
    "superfrete-webhook",
  )
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  const signature = req.headers.get("X-ME-Signature") || ""
  if (!signature) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.text()

  let parsed: any
  try {
    parsed = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const event = parsed.event
  const data = parsed.data || {}
  const { id: superfreteOrderId, tracking, tracking_url } = data

  if (!event || !superfreteOrderId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const supabase = getAdminClient()

    const { data: shipments } = await supabase
      .from("order_shipments")
      .select(
        "id, order_id, partner_id, integration_id, provider_slug, kind, return_request_id, status, tracking_number, tracking_url, payload",
      )
      .eq("provider_slug", SUPERFRETE_PROVIDER)
      .eq("external_label_id", superfreteOrderId)

    if (!shipments || shipments.length === 0) {
      return NextResponse.json({ received: true }, { status: 200 })
    }

    for (const shipment of shipments) {
      const { data: integration } = await supabase
        .from("partner_integrations")
        .select("webhook_secret_encrypted")
        .eq("partner_id", shipment.partner_id)
        .eq("provider_slug", SUPERFRETE_PROVIDER)
        .maybeSingle()

      let signatureValid = false
      if (integration?.webhook_secret_encrypted) {
        try {
          const secret = decrypt(integration.webhook_secret_encrypted, SUPERFRETE_PROVIDER)
          signatureValid = verifySuperFreteWebhookSignature(body, signature, secret)
        } catch (err) {
          console.warn("[SuperFrete Webhook] Failed to verify signature:", err)
        }
      }

      if (!signatureValid) {
        captureError(new Error("SuperFrete webhook signature verification failed"), {
          module: "shipping",
          action: "webhook_signature_invalid",
          partnerId: shipment.partner_id,
        })
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      await applySuperFreteShipmentStatus({
        supabase,
        shipment,
        data: {
          status: data.status,
          event,
          tracking,
          trackingUrl: tracking_url,
          paidAt: data.paid_at,
          createdAt: data.created_at,
          generatedAt: data.generated_at,
          postedAt: data.posted_at,
          deliveredAt: data.delivered_at,
          canceledAt: data.canceled_at,
        },
        source: "webhook",
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "webhook_process",
    })
    console.error("[SuperFrete Webhook] Error processing webhook:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: err?.status && err.status >= 400 && err.status < 500 ? err.status : 500 },
    )
  }
}
