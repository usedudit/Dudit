import { after, type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { createHmac, timingSafeEqual } from "crypto"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { MERCADOPAGO_PROVIDER } from "@/lib/services/payments/mercadopago-integration"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"
import { formatPaymentMethodLabel } from "@/lib/payments/payment-method"
import { hasReceivedAmount } from "@/lib/payments/payment-ledger"
import { captureError } from "@/lib/monitoring/sentry"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { isUuid } from "@/lib/utils/short-id"

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000  // 5 minutes
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024
const MAX_RETRIES = 3
const RETRY_DELAYS = [3000, 5000, 8000]
export const maxDuration = 120

// ─── Signature Verification (MANDATORY) ─────────────────────────────────────

/**
 * Validates the webhook signature from Mercado Pago.
 * SECURITY: This is mandatory - never bypass this check.
 */
function validateWebhookSignature(
  signature: string,
  requestId: string,
  resourceId: string,
  allowExpired = false,
): boolean {
  try {
    const secrets = [
      process.env.MP_WEBHOOK_SECRET,
      process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET,
    ].filter(Boolean) as string[]

    if (secrets.length === 0) {
      SecureLogger.error("[WEBHOOK] MP_WEBHOOK_SECRET not configured - rejecting request")
      return false
    }

    const parts = signature.split(",")
    let timestamp = ""
    let receivedSignature = ""

    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed.startsWith("ts=")) {
        timestamp = trimmed.replace("ts=", "")
      } else if (trimmed.startsWith("v1=")) {
        receivedSignature = trimmed.replace("v1=", "")
      }
    }

    if (!timestamp || !receivedSignature) {
      console.warn("[WEBHOOK] Invalid signature format: missing timestamp or v1")
      return false
    }

    // Reject expired webhooks (replay attack protection)
    if (!/^\d+$/.test(timestamp)) return false
    const timestampMs = Number(timestamp) * 1000
    const now = Date.now()
    if (!Number.isSafeInteger(timestampMs) || timestampMs > now + MAX_WEBHOOK_AGE_MS || (!allowExpired && now - timestampMs > MAX_WEBHOOK_AGE_MS)) {
      console.warn(`[WEBHOOK] Webhook expired (age: ${now - timestampMs}ms, max: ${MAX_WEBHOOK_AGE_MS}ms)`)
      return false
    }

    const idStr = String(resourceId).trim()
    const idLower = idStr.toLowerCase()

    // Mercado Pago official SDK specification: id:[data.id];request-id:[x-request-id];ts:[ts];
    // We check all standard variations (lowercase/original case, with/without trailing semicolon)
    const candidateTemplates = [
      `id:${idLower};request-id:${requestId};ts:${timestamp};`,
      `id:${idStr};request-id:${requestId};ts:${timestamp};`,
      `id:${idLower};request-id:${requestId};ts:${timestamp}`,
      `id:${idStr};request-id:${requestId};ts:${timestamp}`,
    ]

    for (const secret of secrets) {
      for (const tmpl of candidateTemplates) {
        const computedHmac = createHmac("sha256", secret)
          .update(tmpl)
          .digest("hex")

        if (computedHmac.length === receivedSignature.length && timingSafeEqual(Buffer.from(computedHmac), Buffer.from(receivedSignature))) {
          return true
        }
      }
    }

    SecureLogger.warn("[WEBHOOK] Signature mismatch for resource", {
      resourceId,
      requestId,
    })
    return false
  } catch (error: any) {
    SecureLogger.error("[WEBHOOK] Signature validation error", { error: error.message })
    return false
  }
}

function isAuthorizedInternalReplay(request: Request): boolean {
  const secret = process.env.INTERNAL_CRON_SECRET
  const authorization = request.headers.get("authorization") || ""
  if (!secret || !authorization) return false

  const expected = `Bearer ${secret}`
  const actualBytes = Buffer.from(authorization)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  console.log("[WEBHOOK] ========== PAYMENT WEBHOOK RECEIVED ==========")
  console.log("[WEBHOOK] Timestamp:", new Date().toISOString())

  // Rate limit
  const rateLimitResult = await checkRateLimitForAPI(
    RateLimitCategory.WEBHOOK,
    "mercadopago-webhook",
  )
  if (rateLimitResult.limited) {
    return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
  }

  try {
    const internalReplay = isAuthorizedInternalReplay(request)
    // ── Step 1: Validate required headers (FAIL CLOSED) ──
    const signature = request.headers.get("x-signature")
    const requestId = request.headers.get("x-request-id")

    if (!signature || !requestId) {
      console.error("[WEBHOOK] Rejected: missing x-signature or x-request-id headers")
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    // ── Step 2: Parse body and search params ──
    const searchParams = request.nextUrl.searchParams
    const queryDataId = searchParams.get("data.id") || searchParams.get("id")
    const queryType = searchParams.get("type") || searchParams.get("topic")

    const declaredLength = Number(request.headers.get("content-length"))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 })
    }

    let body: any = {}
    try {
      const rawBody = await request.text()
      if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 })
      }
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      // Body may be empty on query-string only notifications
    }

    const paymentId = body?.data?.id || body?.id || queryDataId
    const eventType = body?.type || queryType
    const eventAction = body?.action || (eventType === "payment" ? "payment.updated" : undefined)

    SecureLogger.info("[WEBHOOK] Event received", {
      type: eventType,
      action: eventAction,
      paymentId: paymentId ? String(paymentId) : undefined,
    })

    if (!paymentId) {
      if (body?.action === "test" || searchParams.has("test")) {
        console.log("[WEBHOOK] Ping/test webhook acknowledged successfully")
        return NextResponse.json({ received: true }, { status: 200 })
      }
      console.error("[WEBHOOK] Rejected: missing payment ID in body and query parameters")
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // ── Step 3: Validate signature (MANDATORY - no bypass) ──
    const isValid = validateWebhookSignature(
      signature,
      requestId,
      paymentId.toString(),
      internalReplay,
    )

    if (!isValid) {
      SecureLogger.error("[WEBHOOK] Rejected: invalid signature", {
        requestId,
        paymentId: paymentId.toString(),
      })
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    console.log("[WEBHOOK] Signature validated successfully")

    // ── Step 4: ACK immediately, process async ──
    const normalizedBody = {
      ...body,
      type: eventType,
      action: eventAction,
      data: {
        ...(body?.data || {}),
        id: paymentId,
      },
    }

    if (internalReplay) {
      try {
        await processWebhookWithRetry(normalizedBody, requestId)
        return NextResponse.json({ received: true, processed: true }, { status: 200 })
      } catch (error: any) {
        captureError(error, {
          module: "payments",
          action: "mercadopago_webhook_internal_replay",
          route: "/api/mercadopago/webhook",
          entityId: String(paymentId),
        })
        SecureLogger.error("[WEBHOOK] Internal replay failed", { error: error.message })
        return NextResponse.json({ received: false, error: "Processing failed" }, { status: 503 })
      }
    }

    after(() => processWebhookWithRetry(normalizedBody, requestId).catch((error) => {
      captureError(error, {
        module: "payments",
        action: "mercadopago_webhook_async",
        route: "/api/mercadopago/webhook",
        entityId: typeof paymentId === "string" || typeof paymentId === "number" ? String(paymentId) : undefined,
      })
      SecureLogger.error("[WEBHOOK] Async processing failed", { error: error.message })
    }))

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    captureError(error, {
      module: "payments",
      action: "mercadopago_webhook",
      route: "/api/mercadopago/webhook",
    })
    SecureLogger.error("[WEBHOOK] Handler error", { error: error.message })
    return NextResponse.json({ received: false, error: "Webhook processing unavailable" }, { status: 503 })
  }
}

// ──── Marketplace recurring subscriptions ────────────────────────────────────

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function mapMpStatusToRecurringStatus(
  mpStatus?: string | null,
): "active" | "paused" | "cancelled" | "past_due" | null {
  switch (mpStatus) {
    case "authorized":
    case "approved":
      return "active"
    case "paused":
      return "paused"
    case "cancelled":
    case "deactivated":
      return "cancelled"
    case "rejected":
      return "past_due"
    default:
      return null
  }
}

/**
 * Sincroniza a assinatura de marketplace (recurring_subscriptions) com o estado
 * do preapproval no Mercado Pago. Antes deste ponto o webhook so mexia na
 * tabela `subscriptions` (billing do ERP), deixando o marketplace sem evoluir.
 */
async function syncRecurringSubscriptionWithMp(
  supabase: SupabaseAdmin,
  ids: { mpPreapprovalId?: string | null; externalReference?: string | null },
  mpStatus: string | null | undefined,
) {
  try {
    const targetStatus = mapMpStatusToRecurringStatus(mpStatus)
    if (!targetStatus) return

    if (!ids.mpPreapprovalId && !(ids.externalReference && isUuid(ids.externalReference))) {
      return
    }

    let query = supabase
      .from("recurring_subscriptions")
      .select("id, status, pending_cancellation_reason")

    if (ids.mpPreapprovalId) {
      query = query.eq("mp_preapproval_id", ids.mpPreapprovalId)
    } else {
      query = query.eq("id", ids.externalReference as string)
    }

    const { data: sub, error } = await query.maybeSingle()

    if (error) {
      throw new Error(`Falha ao consultar recurring_subscriptions: ${error.message}`)
    }
    if (!sub?.id) return
    if (sub.status === targetStatus) return
    // Cancelamento local e definitivo: um webhook atrasado nao pode reativar.
    if (sub.status === "cancelled" && targetStatus !== "cancelled") return
    // Janela de consentimento expirada: cobranca congelada ate o cliente
    // responder; so um cancelamento real derruba a assinatura.
    if (sub.status === "awaiting_customer_decision" && targetStatus !== "cancelled") return
    // Recusa da mudanca de plano: o MP foi cancelado de proposito para nao
    // cobrar o proximo ciclo; a assinatura so encerra no fim do ciclo vigente.
    if (targetStatus === "cancelled" && sub.pending_cancellation_reason) return

    const { error: updateError } = await supabase
      .from("recurring_subscriptions")
      .update({ status: targetStatus, updated_at: new Date().toISOString() })
      .eq("id", sub.id)

    if (updateError) {
      throw new Error(`Falha ao sincronizar recurring_subscriptions: ${updateError.message}`)
    }

    console.log(
      `[WEBHOOK] recurring_subscriptions ${sub.id}: ${sub.status} -> ${targetStatus} (MP: ${mpStatus})`,
    )
  } catch (e) {
    console.error("[WEBHOOK] Erro ao sincronizar recurring_subscriptions:", e)
    throw e
  }
}

// ─── Async Processing with Retry ────────────────────────────────────────────

async function processWebhookWithRetry(
  body: any,
  requestId: string,
  attempt: number = 0,
) {
  const { type, data } = body
  const paymentId = data?.id

  console.log(`[WEBHOOK] Processing payment ${paymentId} (attempt ${attempt + 1}/${MAX_RETRIES})`)

  try {
    const supabase = createAdminClient()

    // ── 0. Handle Subscription / Billing Preapproval Events ──
    if (["subscription_preapproval", "subscription_authorized_payment"].includes(type)) {
      console.log(`[WEBHOOK] Handling subscription event "${type}" for resource ${paymentId}`)
      const { getMpPlatformAccessToken } = await import("@/lib/services/mercadopago/subscriptions")
      const { syncSubscriptionToBilling } = await import("@/lib/billing/sync-subscription")
      const {
        chargeFromAuthorizedPayment,
        authorizedPaymentCycleDate,
      } = await import("@/lib/billing/record-charge")
      const accessToken = await getMpPlatformAccessToken()

      if (type === "subscription_preapproval") {
        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${paymentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!mpRes.ok) {
          throw new Error(`Mercado Pago preapproval lookup failed (${mpRes.status})`)
        }
        if (mpRes.ok) {
          const preapprovalData = await mpRes.json()

          await syncRecurringSubscriptionWithMp(
            supabase,
            {
              mpPreapprovalId: paymentId?.toString(),
              externalReference: preapprovalData?.external_reference,
            },
            preapprovalData?.status,
          )

          const { data: sub } = await supabase
            .from("subscriptions")
            .select("id, status")
            .eq("mercado_pago_subscription_id", paymentId.toString())
            .maybeSingle()

          if (sub) {
            let targetStatus = sub.status
            if (preapprovalData.status === "authorized") targetStatus = "active"
            else if (preapprovalData.status === "cancelled") targetStatus = "cancelled"
            else if (preapprovalData.status === "paused") targetStatus = "paused"
            else if (preapprovalData.status === "pending") targetStatus = "pending"

            // A locally cancelled subscription never comes back through a
            // preapproval event — a new subscription has a new preapproval.
            if (sub.status === "cancelled" && targetStatus !== "cancelled") {
              console.log(`[WEBHOOK] Subscription ${sub.id} is cancelled, ignoring "${targetStatus}"`)
              return
            }

            await syncSubscriptionToBilling(sub.id, "webhook", {
              status: targetStatus,
              cancellationReason: targetStatus === "cancelled" ? "user" : undefined,
            })
            console.log(`[WEBHOOK] ✅ Subscription ${sub.id} synced via preapproval event (${preapprovalData.status})`)
            return
          }
        }
      } else if (type === "subscription_authorized_payment") {
        const mpRes = await fetch(`https://api.mercadopago.com/authorized_payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!mpRes.ok) {
          throw new Error(`Mercado Pago authorized payment lookup failed (${mpRes.status})`)
        }
        if (mpRes.ok) {
          const authPayData = await mpRes.json()
          const preapprovalId = authPayData.preapproval_id
          if (preapprovalId) {
            await syncRecurringSubscriptionWithMp(
              supabase,
              { mpPreapprovalId: preapprovalId.toString() },
              authPayData?.status,
            )

            const { data: sub } = await supabase
              .from("subscriptions")
              .select("id, status, partner_id, plan_id")
              .eq("mercado_pago_subscription_id", preapprovalId.toString())
              .maybeSingle()

            if (sub) {
              // Mercado Pago uses `processed` / `waiting_for_gateway` / `recycling`
              // for authorized payments — not `approved`.
              const charge = chargeFromAuthorizedPayment(authPayData)
              const cycleDate = authorizedPaymentCycleDate(authPayData)

              // Late charge of a cancelled subscription: never resurrect it.
              // The charge is still recorded (money moved) but access stays off.
              if (sub.status === "cancelled") {
                console.log(`[WEBHOOK] Late authorized payment for cancelled subscription ${sub.id}; recording charge only`)
                if (charge.gatewayPaymentId) {
                  await syncSubscriptionToBilling(sub.id, "webhook", {
                    status: "cancelled",
                    charge,
                    chargeCycleStart: cycleDate,
                    notify: false,
                  })
                }
                return
              }

              const targetStatus =
                charge.status === "approved"
                  ? "active"
                  : ["rejected", "refunded", "chargeback"].includes(charge.status)
                    ? "past_due"
                    : sub.status
              await syncSubscriptionToBilling(sub.id, "webhook", {
                status: targetStatus,
                cycleStart: cycleDate,
                charge,
                chargeCycleStart: cycleDate,
              })
              console.log(`[WEBHOOK] ✅ Subscription ${sub.id} synced via authorized payment (${authPayData.status})`)
              return
            }
          }
        }
      }
    }

    // Only handle payment events for remaining flows
    if (type !== "payment" || !paymentId) {
      console.log("[WEBHOOK] Not a payment event, skipping")
      return
    }

    // ── Idempotency check: has this payment already been processed? ──
    const { data: existingOrderData, error: checkError } = await supabase
      .from("orders")
      .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_expires_at, cancelled_at, payment_breakdown, finance_account_id, checkout_fulfillment, updated_at")
      .eq("mp_payment_id", paymentId.toString())
      .limit(1)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.log("[WEBHOOK] Error looking up order (may not exist yet):", checkError.message)
    }

    // Idempotency: already processed as paid → skip
    if (existingOrderData?.situation === "paid") {
      console.log(`[WEBHOOK] Order ${existingOrderData.id} already marked as paid, skipping (idempotent)`)
      return
    }

    // Zombie protection: if order is already cancelled, do not reactivate
    if (existingOrderData?.cancelled_at || existingOrderData?.situation === "cancelled") {
      console.log(`[WEBHOOK] Order ${existingOrderData.id} is cancelled, skipping payment approval`)
      return
    }

    // Zombie protection: if order is pending and expired, cancel it
    if (existingOrderData?.situation === "pending" && existingOrderData?.payment_expires_at) {
      if (new Date() > new Date(existingOrderData.payment_expires_at)) {
        console.log(`[WEBHOOK] Order ${existingOrderData.id} payment expired, cancelling`)
        const { checkAndExpireOrder } = await import("@/lib/services/order-expiration")
        await checkAndExpireOrder(supabase, existingOrderData.id)
        return
      }
    }

    // Wait before processing to avoid race conditions with sync-payment-status
    const index = Math.min(Math.max(0, attempt), RETRY_DELAYS.length - 1)
    const delay = index === 0 ? RETRY_DELAYS[0] : index === 1 ? RETRY_DELAYS[1] : RETRY_DELAYS[2]
    await new Promise((resolve) => setTimeout(resolve, delay))

    // ── Fetch payment details from Mercado Pago API (TRUST NOTHING FROM WEBHOOK BODY) ──
    let partnerId = existingOrderData?.partner_id || null
    let paymentInfo = null

    if (!partnerId) {
      console.log("[WEBHOOK] Partner ID not found in order, searching partners...")
      const { data: mpConnections } = await supabase
        .from("partner_integrations")
        .select("partner_id")
        .eq("provider_slug", MERCADOPAGO_PROVIDER)
        .not("access_token_encrypted", "is", null)

      for (const connection of mpConnections || []) {
        try {
          const partnerToken = await getValidMercadoPagoAccessToken(connection.partner_id)
          const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${partnerToken}` },
          })

          if (mpResponse.ok) {
            paymentInfo = await mpResponse.json()
            partnerId = connection.partner_id
            console.log(`[WEBHOOK] Payment data fetched via partner ${partnerId}, MP status: ${paymentInfo.status}`)
            break
          }
        } catch (err: any) {
          console.warn(`[WEBHOOK] Failed to fetch via partner ${connection.partner_id}:`, err.message)
          continue
        }
      }
    } else {
      try {
        const partnerToken = await getValidMercadoPagoAccessToken(partnerId)
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${partnerToken}` },
        })

        if (mpResponse.ok) {
          paymentInfo = await mpResponse.json()
          console.log(`[WEBHOOK] Payment data fetched, MP status: ${paymentInfo.status}`)
        } else {
          console.error(`[WEBHOOK] MP API returned ${mpResponse.status} for payment ${paymentId}`)
        }
      } catch (err: any) {
        console.error("[WEBHOOK] Error fetching payment from MP:", err.message)
      }
    }

    // Fallback: SaaS subscription manual payments (PIX) are created with the
    // PLATFORM token, so no partner token can fetch them. Try the platform token
    // so the SaaS subscription reactivation path below can match by external_reference.
    if (!paymentInfo) {
      try {
        const platformToken = await getMpPlatformAccessToken()
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${platformToken}` },
        })

        if (mpResponse.ok) {
          paymentInfo = await mpResponse.json()
          console.log(`[WEBHOOK] Payment data fetched via platform token, MP status: ${paymentInfo.status}`)
        } else {
          console.warn(`[WEBHOOK] Platform token fetch returned ${mpResponse.status} for payment ${paymentId}`)
        }
      } catch (err: any) {
        console.warn("[WEBHOOK] Failed to fetch payment via platform token:", err.message)
      }
    }

    if (!paymentInfo) {
      console.error("[WEBHOOK] Could not fetch payment data from Mercado Pago")
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      SecureLogger.error("[WEBHOOK] Failed after all retries to fetch payment data", {
        paymentId: paymentId.toString(),
      })
      throw new Error(`Não foi possível consultar o pagamento ${paymentId} no Mercado Pago.`)
    }

    // Check if partner is undergoing account deletion
    if (partnerId) {
      const { data: deletion } = await supabase
        .from("account_deletions")
        .select("status")
        .eq("partner_id", partnerId)
        .not("status", "eq", "completed")
        .maybeSingle()

      if (deletion) {
        console.log(`[WEBHOOK] Partner ${partnerId} is in deletion phase (${deletion.status}) - ignoring webhook payment processing`)
        return
      }
    }

    // Intercept subscription preapproval payments
    const preapprovalId = paymentInfo.preapproval_id || paymentInfo.metadata?.preapproval_id
    if (preapprovalId) {
      console.log(`[WEBHOOK] Detected subscription preapproval payment (${preapprovalId}) for payment ${paymentId}`)

      const { data: sub } = await supabase
        .from("recurring_subscriptions")
        .select("id")
        .or(`mp_preapproval_id.eq.${preapprovalId},id.eq.${paymentInfo.external_reference || ""}`)
        .maybeSingle()

      if (sub?.id) {
        const { processPreapprovalPaymentWebhook, processPreapprovalPaymentFailed } = await import(
          "@/lib/services/recurring-execution.service"
        )

        if (paymentInfo.status === "approved") {
          const res = await processPreapprovalPaymentWebhook({
            subscriptionId: sub.id,
            paymentId: paymentId.toString(),
            paymentInfo,
            partnerId,
          })
          console.log(`[WEBHOOK] Preapproval payment processed:`, res)
        } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentInfo.status)) {
          const res = await processPreapprovalPaymentFailed({
            subscriptionId: sub.id,
            paymentId: paymentId.toString(),
            paymentInfo,
            partnerId,
          })
          console.log(`[WEBHOOK] Preapproval payment failure processed:`, res)
        }
        return
      }
    }

    // ── Check if this is a SaaS subscription manual payment (preapproval linked to subscriptions table) ──
    const saasPreapprovalId = paymentInfo.preapproval_id || paymentInfo.metadata?.preapproval_id
    const saasExternalRef = paymentInfo.external_reference
    const saasMetadataSubscriptionId = paymentInfo.metadata?.subscription_id
    if (saasPreapprovalId || saasExternalRef || saasMetadataSubscriptionId) {
      console.log(`[WEBHOOK] Checking for SaaS subscription payment (preapproval: ${saasPreapprovalId}, ext_ref: ${saasExternalRef})`)

      let saasSubscription: any = null

      const subColumns = "id, partner_id, status, plan_id, mercado_pago_subscription_id, created_at, current_period_start, current_period_end, billing_email, billing_anchor_day"

      if (saasPreapprovalId) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select(subColumns)
          .eq("mercado_pago_subscription_id", saasPreapprovalId)
          .maybeSingle()
        saasSubscription = sub
      }

      // Manual PIX uses the subscription id as external_reference / metadata.
      if (!saasSubscription && (saasMetadataSubscriptionId || saasExternalRef)) {
        const candidate = saasMetadataSubscriptionId || saasExternalRef
        if (typeof candidate === "string" && isUuid(candidate)) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select(subColumns)
            .eq("id", candidate)
            .maybeSingle()
          saasSubscription = sub
        }
      }

      // A charge created locally may reference an already existing purchase.
      if (!saasSubscription) {
        const { findChargeCycleByGatewayId } = await import("@/lib/billing/record-charge")
        const local = await findChargeCycleByGatewayId(paymentId.toString())
        if (local) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select(subColumns)
            .eq("id", local.subscriptionId)
            .maybeSingle()
          saasSubscription = sub
        }
      }

      if (saasSubscription) {
        console.log(`[WEBHOOK] Found SaaS subscription ${saasSubscription.id} for payment ${paymentId}`)

        const { chargeFromMpPayment } = await import("@/lib/billing/record-charge")
        const { syncSubscriptionToBilling } = await import("@/lib/billing/sync-subscription")
        const charge = chargeFromMpPayment(paymentInfo, paymentId)

        // The charge belongs to the cycle of the payment's real date (PIX is
        // generated at the start of the cycle it pays).
        const chargeDateRaw = paymentInfo.date_approved || paymentInfo.date_created
        const chargeDate = chargeDateRaw ? new Date(chargeDateRaw) : null
        const validChargeDate = chargeDate && !isNaN(chargeDate.getTime()) ? chargeDate : null

        // Late charge of a cancelled subscription: record the money, never
        // restore access (the plan is already downgraded).
        if (saasSubscription.status === "cancelled") {
          console.log(`[WEBHOOK] Late payment for cancelled subscription ${saasSubscription.id}; recording charge only`)
          await syncSubscriptionToBilling(saasSubscription.id, "webhook", {
            status: "cancelled",
            charge,
            chargeCycleStart: validChargeDate,
            notify: false,
          }).catch(console.error)
          return
        }

        const isApproved = charge.status === "approved"
        const isRejected = charge.status === "rejected" || charge.status === "cancelled"

        // Approved settles the open cycle; rejected/refunded puts the plan past
        // due; pending/processing keeps the current access state untouched.
        let targetStatus = saasSubscription.status
        if (isApproved) targetStatus = "active"
        else if (isRejected) targetStatus = "past_due"
        else if (["past_due", "pending"].includes(saasSubscription.status) && charge.status === "pending") {
          targetStatus = saasSubscription.status
        }

        await syncSubscriptionToBilling(saasSubscription.id, "webhook", {
          status: targetStatus,
          cycleStart: isApproved ? validChargeDate : undefined,
          charge,
          chargeCycleStart: validChargeDate,
        })

        try {
          const minuteBucket = Math.floor(Date.now() / 60000)
          const idempotencyKey = `subscription_payment:${saasSubscription.partner_id}:${paymentId}:${minuteBucket}`

          await supabase.from("billing_events").insert({
            partner_id: saasSubscription.partner_id,
            event_type: isApproved ? "subscription_reactivated" : "subscription_payment_updated",
            amount: Number(paymentInfo.transaction_amount || 0),
            provider: "mercado_pago",
            metadata: {
              mp_subscription_id: saasSubscription.mercado_pago_subscription_id,
              mp_payment_id: paymentId.toString(),
              previous_status: saasSubscription.status,
              payment_status: paymentInfo.status,
            },
            idempotency_key: idempotencyKey,
          })
        } catch (billErr: any) {
          console.error("[WEBHOOK] Failed to log billing event:", billErr.message)
        }

        console.log(`[WEBHOOK] SaaS subscription ${saasSubscription.id} payment ${paymentInfo.status} recorded`)
        return
      }
    }

    // Not a SaaS subscription payment: the order flow requires a resolved partner.
    if (!partnerId) {
      console.error("[WEBHOOK] Could not resolve partner for payment")
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      SecureLogger.error("[WEBHOOK] Failed to resolve partner after all retries", {
        paymentId: paymentId.toString(),
      })
      throw new Error(`Não foi possível resolver o parceiro do pagamento ${paymentId}.`)
    }

    // ── Find order in DB ──
    let orderData = existingOrderData
    if (!orderData) {
      let { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_breakdown, finance_account_id, checkout_fulfillment, updated_at")
        .eq("mp_payment_id", paymentId.toString())
        .limit(1)
        .maybeSingle()

      // Fallback seguro: se não encontrou por mp_payment_id, busca por external_reference (ID do pedido)
      if (!order && paymentInfo?.external_reference) {
        const { data: orderExt } = await supabase
          .from("orders")
          .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_breakdown, finance_account_id, checkout_fulfillment, updated_at")
          .eq("id", paymentInfo.external_reference)
          .limit(1)
          .maybeSingle()

        if (orderExt) {
          order = orderExt
          console.log(`[WEBHOOK] Order ${order.id} found via external_reference fallback`)
        }
      }

      // Fallback por metadata: dudit_order_id
      if (!order && paymentInfo?.metadata?.dudit_order_id && isUuid(paymentInfo.metadata.dudit_order_id)) {
        const { data: orderMeta } = await supabase
          .from("orders")
          .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_breakdown, finance_account_id, checkout_fulfillment, updated_at")
          .eq("id", paymentInfo.metadata.dudit_order_id)
          .limit(1)
          .maybeSingle()

        if (orderMeta) {
          order = orderMeta
          console.log(`[WEBHOOK] Order ${order.id} found via metadata.dudit_order_id fallback`)
        }
      }

      if (!order) {
        // Se o pagamento no Mercado Pago ainda está pendente ou em processo (ex: QR Code Pix recém-gerado no ERP):
        // É esperado que o pedido ainda esteja sendo finalizado na tela do vendedor ou aguardando o comprador escanear.
        // NÃO lançar erro fatal aqui para não poluir os logs de erro nem quebrar retentativas.
        if (paymentInfo.status === "pending" || paymentInfo.status === "in_process") {
          console.log(`[WEBHOOK] Pagamento ${paymentId} está ${paymentInfo.status} e o pedido ${paymentInfo?.external_reference || ""} ainda não foi encontrado no banco. Retornando 200 (sem erro).`)
          return
        }

        console.error("[WEBHOOK] Order not found in database:", orderError?.message)
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return processWebhookWithRetry(body, requestId, attempt + 1)
        }
        throw new Error(`Pedido do pagamento ${paymentId} não foi encontrado.`)
      }
      orderData = order
    }

    const orderId = orderData.id
    console.log(`[WEBHOOK] Order found: ${orderId}, current situation: ${orderData.situation}`)

    // ── Idempotência por pagamento: já registrado manualmente? ──
    // Ex.: sinal confirmado manualmente pelo vendedor. Eventos posteriores
    // (aprovação tardia, cancelamento ou expiração do Pix) não devem alterar
    // o pedido nem somar o valor novamente. Pagamentos registrados pelo fluxo
    // normal continuam sendo processados (ex.: estorno/cancelamento).
    {
      const { isMpPaymentManuallyRecorded } = await import("@/lib/payments/mp-order-payment-update")
      if (isMpPaymentManuallyRecorded(orderData, paymentId.toString())) {
        console.log(`[WEBHOOK] Payment ${paymentId} already recorded on order ${orderId}, skipping`)
        return
      }
    }

    // Cancelling a pending deposit payment in Mercado Pago also emits a
    // cancelled-payment webhook. That event must not cancel the whole order.
    // The intent covers the remote request window; history covers later retries.
    const checkoutFulfillment = orderData.checkout_fulfillment as Record<string, any> | null
    const depositCancelPaymentId = String(
      checkoutFulfillment?.depositCancelRequest?.paymentId || "",
    )
    const cancelledDepositHistory = Array.isArray(checkoutFulfillment?.depositCheckoutHistory)
      ? checkoutFulfillment.depositCheckoutHistory
      : []
    const isCancelledDepositPayment =
      depositCancelPaymentId === String(paymentId) ||
      cancelledDepositHistory.some((entry: any) =>
        String(entry?.cancelledMpPaymentId || "") === String(paymentId),
      )
    if (isCancelledDepositPayment && ["cancelled", "rejected", "expired"].includes(String(paymentInfo.status))) {
      console.log(`[WEBHOOK] Payment ${paymentId} is a cancelled deposit; preserving order ${orderId}`)
      return
    }

    // ── Validate payment amount (fraud detection) ──
    if (paymentInfo.status === "approved" && paymentInfo.transaction_amount != null) {
      const { validateMpTransactionAmount } = await import("@/lib/payments/mp-order-payment-update")
      const validation = validateMpTransactionAmount(orderData, Number(paymentInfo.transaction_amount))
      if (!validation.ok) {
        SecureLogger.error("[WEBHOOK] FRAUD ALERT: Payment amount mismatch", {
          paidAmount: paymentInfo.transaction_amount,
          orderAmount: validation.expectedAmount,
          paymentId: paymentId.toString(),
          orderId,
          partnerId,
        })
        return
      }
      console.log("[WEBHOOK] Payment amount validated:", {
        paidAmount: paymentInfo.transaction_amount,
        expectedAmount: validation.expectedAmount,
      })
    }

    // ── Determine new order status from MP payment status ──
    let orderStatus = "pending"
    let paymentMethodName = "Desconhecido"
    const mpPaymentMethodId = String(paymentInfo.payment_method_id || "").toLowerCase()
    const mpPaymentTypeId = String(paymentInfo.payment_type_id || paymentInfo.payment_method?.type || "").toLowerCase()

    if (mpPaymentMethodId === "pix") {
      paymentMethodName = "Pix"
    } else if (mpPaymentTypeId === "credit_card") {
      paymentMethodName = "Cartão de Crédito"
    } else if (mpPaymentTypeId === "debit_card") {
      paymentMethodName = "Cartão de Débito"
    } else if (mpPaymentTypeId === "ticket") {
      paymentMethodName = "Boleto"
    } else if (mpPaymentTypeId === "account_money") {
      paymentMethodName = "Saldo Mercado Pago"
    } else if (mpPaymentTypeId === "digital_currency" || mpPaymentMethodId === "mercado_credito") {
      paymentMethodName = "Mercado Crédito"
    } else {
      paymentMethodName = formatPaymentMethodLabel(paymentInfo.payment_method?.type || paymentInfo.payment_method_id)
    }

    let updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    const totalFeeAmount = paymentInfo.transaction_amount != null && paymentInfo.transaction_details?.net_received_amount != null
      ? Number(paymentInfo.transaction_amount) - Number(paymentInfo.transaction_details.net_received_amount)
      : null;

    const feeDetailsRaw = Array.isArray(paymentInfo.fee_details) ? paymentInfo.fee_details : []
    const mpFeeDetails = feeDetailsRaw.map((fd: any) => ({
      type: String(fd.type || ""),
      amount: Number(fd.amount || 0),
      fee_payer: String(fd.fee_payer || ""),
    }))

    const cardData = paymentInfo.card || null
    const mpCardLastDigits = cardData?.last_four_digits ? String(cardData.last_four_digits) : null
    const mpCardFirstDigits = cardData?.first_six_digits ? String(cardData.first_six_digits) : null
    const mpCardholderName = cardData?.cardholder?.name ? String(cardData.cardholder.name) : null
    const mpInstallmentAmount = paymentInfo.transaction_details?.installment_amount != null
      ? Number(paymentInfo.transaction_details.installment_amount)
      : null

    // Split fee_details into feeAmount (mercadopago_fee) and interestAmount (installment_fee)
    let mpLegFeeAmount = 0
    let mpLegInterestAmount = 0
    if (mpFeeDetails.length > 0) {
      for (const fd of mpFeeDetails) {
        const amt = Number(fd.amount) || 0
        if (fd.type === "installment_fee") {
          mpLegInterestAmount += amt
        } else {
          mpLegFeeAmount += amt
        }
      }
    } else {
      mpLegFeeAmount = totalFeeAmount ?? 0
    }

    const mpLeg: Record<string, unknown> = {
      method: paymentMethodName,
      amount: Number(paymentInfo.transaction_amount || 0),
      effectiveAmount: Number(paymentInfo.transaction_amount || 0),
      amountReceived: Number(paymentInfo.transaction_amount || 0),
      netReceivedAmount: paymentInfo.transaction_details?.net_received_amount ?? Number(paymentInfo.transaction_amount || 0),
      paymentKind: Number(orderData.paid_amount || 0) > 0.009 ? "balance" : (Number(paymentInfo.transaction_amount || 0) >= Number(orderData.total_amount || 0) - 0.009 ? "full" : "deposit"),
      provider: "Mercado Pago",
      adjustmentType: "none",
      adjustmentPercent: 0,
      adjustmentAmount: 0,
      installmentNumber: paymentInfo.installments ?? 1,
      feeAmount: mpLegFeeAmount,
      fixedFeeAmount: 0,
      interestAmount: mpLegInterestAmount,
      feeBearer: "merchant",
      paymentMethodId: paymentInfo.payment_method_id && isUuid(paymentInfo.payment_method_id) ? paymentInfo.payment_method_id : null,
      mpPaymentMethodId: paymentInfo.payment_method_id ?? null,
      paymentTypeId: paymentInfo.payment_type_id ?? null,
      paymentStatus: paymentInfo.status ?? null,
      paymentStatusDetail: paymentInfo.status_detail ?? null,
    }

    if (mpFeeDetails.length > 0) {
      mpLeg.feeDetails = mpFeeDetails
    }
    if (mpInstallmentAmount != null) {
      mpLeg.installmentAmount = mpInstallmentAmount
    }
    if (mpCardLastDigits) {
      mpLeg.cardLastDigits = mpCardLastDigits
      mpLeg.cardFirstDigits = mpCardFirstDigits
      mpLeg.cardholderName = mpCardholderName
    }

    const rawBreakdown = Array.isArray(orderData.payment_breakdown) ? [...orderData.payment_breakdown] : []
    const oldBreakdown = rawBreakdown.map((entry: any) => {
      if (entry?.paymentMethodId && !isUuid(entry.paymentMethodId)) {
        return { ...entry, paymentMethodId: null, mpPaymentMethodId: entry.paymentMethodId }
      }
      return entry
    })
    const mpLegIndex = (() => {
      const exactPaymentIndex = oldBreakdown.findIndex(
        (entry: any) =>
          entry?.mpPaymentId &&
          String(entry.mpPaymentId) === String(paymentId),
      )
      if (exactPaymentIndex >= 0) return exactPaymentIndex

      return oldBreakdown.findIndex(
        (entry: any) =>
          !hasReceivedAmount(entry) &&
          (String(entry?.provider || "").toLowerCase().includes("mercado pago") ||
            String(entry?.method || "").toLowerCase().includes("mercado pago")),
      )
    })()
    const payment_breakdown =
      mpLegIndex >= 0
        ? oldBreakdown.map((entry: any, i: number) => (i === mpLegIndex ? { ...entry, ...mpLeg } : entry))
        : [...oldBreakdown, mpLeg]

    if (paymentInfo.status === "approved") {
      const { buildMpApprovedPaymentUpdate } = await import("@/lib/payments/mp-order-payment-update")
      const approvedUpdate = buildMpApprovedPaymentUpdate({
        order: orderData,
        transactionAmount: Number(paymentInfo.transaction_amount || 0),
        paymentMethodName,
        mpPaymentId: paymentId.toString(),
        mpDateApproved: paymentInfo.date_approved,
        existingBreakdown: orderData.payment_breakdown,
        mpInstallments: paymentInfo.installments ?? null,
        mpNetReceivedAmount: paymentInfo.transaction_details?.net_received_amount ?? null,
        mpTotalFeeAmount: totalFeeAmount,
        mpPaymentMethodId: paymentInfo.payment_method_id ?? null,
        mpPaymentTypeId: paymentInfo.payment_type_id ?? null,
        mpPaymentStatus: paymentInfo.status ?? null,
        mpPaymentStatusDetail: paymentInfo.status_detail ?? null,
        mpFeeDetails: mpFeeDetails.length > 0 ? mpFeeDetails : null,
        mpCardLastDigits: mpCardLastDigits,
        mpCardFirstDigits: mpCardFirstDigits,
        mpCardholderName: mpCardholderName,
        mpInstallmentAmount: mpInstallmentAmount,
      })
      orderStatus = approvedUpdate.situation
      updateData = { ...updateData, ...approvedUpdate }
    } else if (paymentInfo.status === "in_process") {
      orderStatus = "in_process"
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentInfo.status)) {
      // If order is already in payment_failed (card rejection during checkout),
      // keep it in payment_failed to allow recovery - only move to cancelled
      // for refunded/charged_back or when the rejection comes from a different context.
      if (paymentInfo.status === "rejected" && orderData.situation === "payment_failed") {
        orderStatus = "payment_failed"
      } else {
        orderStatus = "cancelled"
      }
    }

    console.log(`[WEBHOOK] Status mapping: MP "${paymentInfo.status}" → order "${orderStatus}"`)

    // ── Status regression guard ──
    const finalStatuses = ["paid", "shipped", "delivered"]
    if (finalStatuses.includes(orderData.situation) && !finalStatuses.includes(orderStatus)) {
      if (orderStatus !== "cancelled" && orderStatus !== "payment_failed") {
        console.log(`[WEBHOOK] Skipping: order already in final status "${orderData.situation}"`)
        return
      }
    }

    const previousSituation = orderData.situation
    const previousPaidAmount = Number(orderData.paid_amount || 0)

    if (paymentInfo.status === "in_process") {
      updateData = {
        ...updateData,
        situation: orderStatus,
        payment_method: paymentMethodName,
        payment_provider: "Mercado Pago",
        mp_payment_id: paymentId.toString(),
        payment_breakdown,
      }
    } else if (orderStatus === "cancelled") {
      updateData = {
        ...updateData,
        situation: orderStatus,
        cancelled_at: new Date().toISOString(),
        payment_method: paymentMethodName,
        payment_provider: "Mercado Pago",
        mp_payment_id: paymentId.toString(),
        payment_breakdown,
      }
    } else if (orderStatus === "payment_failed") {
      updateData = {
        ...updateData,
        situation: orderStatus,
        cancelled_at: null,
        payment_method: paymentMethodName,
        payment_provider: "Mercado Pago",
        mp_payment_id: paymentId.toString(),
        payment_breakdown,
      }
    }

    let resolvedStoreId = orderData.store_id
    if (!resolvedStoreId) {
      const { data: defaultStore } = await supabase
        .from("stores")
        .select("id")
        .eq("partner_id", orderData.partner_id)
        .order("is_headquarters", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (defaultStore?.id) {
        resolvedStoreId = defaultStore.id
        updateData.store_id = defaultStore.id
      }
    }

    console.log(`[WEBHOOK] Updating order ${orderId}: "${previousSituation}" → "${orderStatus}"`)

    // Re-read immediately before mutation. In particular, cancellation intent
    // may have been written after this webhook loaded the order snapshot.
    const { data: latestOrder, error: latestOrderError } = await supabase
      .from("orders")
      .select("updated_at, checkout_fulfillment")
      .eq("id", orderId)
      .maybeSingle()

    if (latestOrderError || !latestOrder) {
      const message = latestOrderError?.message || "Pedido desapareceu antes da gravação do webhook."
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      throw new Error(message)
    }

    const latestFulfillment = latestOrder.checkout_fulfillment as Record<string, any> | null
    const latestCancelRequestPaymentId = String(latestFulfillment?.depositCancelRequest?.paymentId || "")
    const latestCancelledDepositHistory = Array.isArray(latestFulfillment?.depositCheckoutHistory)
      ? latestFulfillment.depositCheckoutHistory
      : []
    const latestIsCancelledDepositPayment =
      latestCancelRequestPaymentId === String(paymentId) ||
      latestCancelledDepositHistory.some((entry: any) => String(entry?.cancelledMpPaymentId || "") === String(paymentId))
    if (latestIsCancelledDepositPayment && ["cancelled", "rejected", "expired"].includes(String(paymentInfo.status))) {
      console.log(`[WEBHOOK] Payment ${paymentId} is a cancelled deposit; preserving order ${orderId}`)
      return
    }

    // If any write landed since the initial read, recompute from that snapshot
    // instead of overwriting its financial state with stale totals.
    if (String(latestOrder.updated_at || "") !== String(orderData.updated_at || "")) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      throw new Error(`Pedido ${orderId} mudou durante o processamento do pagamento.`)
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId)
      .eq("updated_at", latestOrder.updated_at)
      .select("id")
      .maybeSingle()

    if (updateError || !updatedOrder) {
      const updateMessage = updateError?.message || "O pedido mudou antes do compare-and-swap do webhook."
      console.error("[WEBHOOK] Error updating order:", updateMessage)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      SecureLogger.error("[WEBHOOK] Failed to update order after retries", {
        error: updateMessage,
        orderId,
      })
      throw new Error(`Falha ao atualizar o pedido ${orderId}: ${updateMessage}`)
    }

    console.log(`[WEBHOOK] Order ${orderId} updated to "${orderStatus}"`)

    if (previousSituation !== orderStatus) {
      const { data: notifyOrder } = await supabase
        .from("orders")
        .select("id, order_number, partner_id, buyer_id, customer_name, total_amount, delivery_status, situation")
        .eq("id", orderId)
        .maybeSingle()

      if (notifyOrder) {
        import("@/lib/services/notification-automation.service")
          .then(({ onOrderStatusChanged }) =>
            onOrderStatusChanged(notifyOrder, orderStatus, undefined),
          )
          .catch(console.error)
      }

      // Log audit event for timeline/history when order is cancelled via webhook
      if (orderStatus === "cancelled" && previousSituation !== "cancelled") {
        try {
          const { logAuditEvent } = await import("@/lib/services/timeline.service")
          const statusDetail = paymentInfo.status_detail || paymentInfo.status || "cancelado"
          const statusLabels: Record<string, string> = {
            cancelled: "cancelado",
            rejected: "rejeitado",
            refunded: "reembolsado",
            charged_back: "estornado",
          }
          const statusLabel = statusLabels[paymentInfo.status] || statusDetail
          await logAuditEvent({
            partnerId,
            actorUserId: null,
            entityType: "order",
            entityId: orderId,
            actionType: "cancelled",
            changeLines: [
              `Pedido cancelado por: Sistema via Mercado Pago.`,
              `Motivo: Pagamento ${statusLabel} no Mercado Pago.`,
            ],
            source: "system",
            metadata: {
              oldStatus: previousSituation,
              newStatus: "Cancelado",
              mpPaymentStatus: paymentInfo.status,
              mpPaymentStatusDetail: paymentInfo.status_detail,
            },
          })
        } catch (auditErr: any) {
          console.error("[WEBHOOK] Error logging cancellation audit event:", auditErr.message)
        }
      }

      // Log audit event for payment_failed (card rejection) via webhook
      if (orderStatus === "payment_failed" && previousSituation !== "payment_failed") {
        try {
          const { logAuditEvent } = await import("@/lib/services/timeline.service")
          const statusDetail = paymentInfo.status_detail || paymentInfo.status || "recusado"
          await logAuditEvent({
            partnerId,
            actorUserId: null,
            entityType: "order",
            entityId: orderId,
            actionType: "payment_failed",
            changeLines: [
              `Pagamento recusado via Mercado Pago.`,
              `Motivo: ${statusDetail}.`,
            ],
            source: "system",
            metadata: {
              oldStatus: previousSituation,
              newStatus: "Recuperável",
              mpPaymentStatus: paymentInfo.status,
              mpPaymentStatusDetail: paymentInfo.status_detail,
            },
          })
        } catch (auditErr: any) {
          console.error("[WEBHOOK] Error logging payment_failed audit event:", auditErr.message)
        }
      }

      // Log audit event for deposit approved via webhook (partially_paid)
      if (orderStatus === "partially_paid" && previousSituation !== "partially_paid") {
        try {
          const { logAuditEvent } = await import("@/lib/services/timeline.service")
          await logAuditEvent({
            partnerId,
            actorUserId: null,
            entityType: "order",
            entityId: orderId,
            actionType: "deposit_paid",
            changeLines: [
              "confirmou o recebimento do sinal via Mercado Pago.",
              `Sinal: R$ ${Number(paymentInfo.transaction_amount || 0).toFixed(2)}`,
            ],
            source: "system",
            metadata: {
              oldStatus: previousSituation,
              newStatus: "Parcialmente Pago",
              mpPaymentStatus: paymentInfo.status,
            },
          })
          const { revalidateOrderHistory } = await import("@/lib/utils/revalidation")
          await revalidateOrderHistory(orderId)
        } catch (auditErr: any) {
          console.error("[WEBHOOK] Error logging deposit_paid audit event:", auditErr.message)
        }
      }

      // Log audit event for payment approved via webhook
      if (orderStatus === "paid" && previousSituation !== "paid") {
        try {
          const { logAuditEvent } = await import("@/lib/services/timeline.service")
          await logAuditEvent({
            partnerId,
            actorUserId: null,
            entityType: "order",
            entityId: orderId,
            actionType: "paid",
            changeLines: [
              `Pagamento aprovado via Mercado Pago.`,
              `Método: ${paymentMethodName}.`,
            ],
            source: "system",
            metadata: {
              oldStatus: previousSituation,
              newStatus: "Pago",
              mpPaymentStatus: paymentInfo.status,
            },
          })
          const { revalidateOrderHistory } = await import("@/lib/utils/revalidation")
          await revalidateOrderHistory(orderId)
        } catch (auditErr: any) {
          console.error("[WEBHOOK] Error logging payment audit event:", auditErr.message)
        }
      }
    }

    // ── Create revenue transaction when payment approved ──
    if (paymentInfo.status === "approved") {
      try {
        const { createTransactionFromOrder, syncReceivableForOrder } = await import("@/lib/services/transaction.service")
        const { data: fullOrder } = await supabase
          .from("orders")
          .select("order_number, situation, partner_id, store_id, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name, customer_id, finance_account_id, order_source")
          .eq("id", orderId)
          .single()

        if (fullOrder) {
          await createTransactionFromOrder(supabase, {
            order_id: orderId,
            order_number: fullOrder.order_number,
            partner_id: fullOrder.partner_id,
            store_id: fullOrder.store_id || null,
            total_amount: fullOrder.total_amount,
            payment_method: fullOrder.payment_method || null,
            payment_provider: fullOrder.payment_provider || null,
            payment_breakdown: fullOrder.payment_breakdown || null,
            payment_date: paymentInfo.date_approved || new Date().toISOString(),
            customer_id: fullOrder.customer_id || fullOrder.buyer_id || null,
            customer_name: fullOrder.customer_name || null,
            finance_account_id: fullOrder.finance_account_id || null,
            order_source: fullOrder.order_source || "manual",
            mp_payment_id: paymentId.toString(),
          })

          // Recebível pendente criado na abertura do pedido (ex.: cobrança de
          // assinatura manual): sem isto, a transação "A receber" ficaria órfã
          // depois que o pagamento entra pelo webhook.
          await syncReceivableForOrder(supabase, {
            order_number: fullOrder.order_number,
            partner_id: fullOrder.partner_id,
            store_id: fullOrder.store_id || null,
            total_amount: Number(fullOrder.total_amount || 0),
            paid_amount: Number(fullOrder.paid_amount || 0),
            situation: fullOrder.situation,
            payment_method: fullOrder.payment_method || null,
            customer_id: fullOrder.customer_id || fullOrder.buyer_id || null,
            customer_name: fullOrder.customer_name || null,
            finance_account_id: fullOrder.finance_account_id || null,
            order_source: fullOrder.order_source || "manual",
          })

          if (fullOrder && Number(fullOrder.paid_amount || 0) > previousPaidAmount + 0.009) {
            const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
            const fulfillmentResult = await fulfillMarketplaceOrder(supabase, orderId, { force: true })
            if (!fulfillmentResult.success) {
              SecureLogger.error("[WEBHOOK] Marketplace order fulfillment failed", {
                orderId,
                fulfillmentError: fulfillmentResult.error,
                fulfillmentSkipped: fulfillmentResult.skipped,
              })
              captureError(new Error(fulfillmentResult.error || "Falha no fulfillment"), {
                module: "orders",
                action: "marketplace_fulfillment_webhook",
                entityId: orderId,
              })
            }
          }
        }
      } catch (txErr: any) {
        console.error("[WEBHOOK] Error creating transaction:", txErr.message)
      }
    }

    // NOTE: Stock decrement is handled by sync-payment-status to avoid duplication

    // ── Cache revalidation ──
    if (orderStatus === "paid") {
      try {
        const { revalidateProducts, revalidateMarketplace } = await import("@/lib/utils/revalidation")

        const { data: orderItems } = await supabase
          .from("order_items")
          .select("product_id")
          .eq("order_id", orderId)

        if (orderItems && orderItems.length > 0) {
          const uniqueProductIds = [...new Set(orderItems.map((i: any) => i.product_id))]
          for (const pid of uniqueProductIds) {
            await revalidateProducts(orderData.partner_id, String(pid))
          }
        }
        await revalidateMarketplace()
      } catch (cacheError: any) {
        console.error("[WEBHOOK] Cache revalidation error:", cacheError.message)
      }
    }

    console.log(`[WEBHOOK] ✅ PAYMENT WEBHOOK PROCESSED SUCCESSFULLY - Order ${orderId} → "${orderStatus}"`)
    console.log("[WEBHOOK] ==========================================================\n")
  } catch (error: any) {
    captureError(error, {
      module: "payments",
      action: "mercadopago_webhook_processing",
      route: "/api/mercadopago/webhook",
      entityId: typeof paymentId === "string" || typeof paymentId === "number" ? String(paymentId) : undefined,
      metadata: { attempt },
    })
    console.error("[WEBHOOK] Processing error:", error.message)

    if (attempt < MAX_RETRIES - 1) {
      console.log(`[WEBHOOK] Retrying in 3s (attempt ${attempt + 2}/${MAX_RETRIES})...`)
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return processWebhookWithRetry(body, requestId, attempt + 1)
    }

    SecureLogger.error("[WEBHOOK] Failed after all retries", { error: error.message })
    throw error
  }
}
