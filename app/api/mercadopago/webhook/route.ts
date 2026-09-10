import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { createHmac, timingSafeEqual } from "crypto"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"
import { formatPaymentMethodLabel } from "@/lib/payments/payment-method"
import { captureError } from "@/lib/monitoring/sentry"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { isUuid } from "@/lib/utils/short-id"

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000  // 5 minutes
const MAX_RETRIES = 3
const RETRY_DELAYS = [3000, 5000, 8000]

// ─── Signature Verification (MANDATORY) ─────────────────────────────────────

/**
 * Validates the webhook signature from Mercado Pago.
 * SECURITY: This is mandatory - never bypass this check.
 */
function validateWebhookSignature(
  signature: string,
  requestId: string,
  resourceId: string,
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
    const timestampMs = parseInt(timestamp, 10) * 1000
    const now = Date.now()
    if (now - timestampMs > MAX_WEBHOOK_AGE_MS) {
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

    let body: any = {}
    try {
      body = await request.json()
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
    const response = NextResponse.json({ received: true }, { status: 200 })

    const normalizedBody = {
      ...body,
      type: eventType,
      action: eventAction,
      data: {
        ...(body?.data || {}),
        id: paymentId,
      },
    }

    processWebhookWithRetry(normalizedBody, requestId).catch((error) => {
      captureError(error, {
        module: "payments",
        action: "mercadopago_webhook_async",
        route: "/api/mercadopago/webhook",
        entityId: typeof paymentId === "string" || typeof paymentId === "number" ? String(paymentId) : undefined,
      })
      SecureLogger.error("[WEBHOOK] Async processing failed", { error: error.message })
    })

    return response
  } catch (error: any) {
    captureError(error, {
      module: "payments",
      action: "mercadopago_webhook",
      route: "/api/mercadopago/webhook",
    })
    SecureLogger.error("[WEBHOOK] Handler error", { error: error.message })
    // Return 200 to prevent MP from retrying on our parsing errors
    return NextResponse.json({ received: true }, { status: 200 })
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
      const accessToken = await getMpPlatformAccessToken()

      if (type === "subscription_preapproval") {
        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${paymentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (mpRes.ok) {
          const preapprovalData = await mpRes.json()
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

            await syncSubscriptionToBilling(sub.id, "webhook", targetStatus)
            console.log(`[WEBHOOK] ✅ Subscription ${sub.id} synced via preapproval event (${preapprovalData.status})`)
            return
          }
        }
      } else if (type === "subscription_authorized_payment") {
        const mpRes = await fetch(`https://api.mercadopago.com/authorized_payments/${paymentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (mpRes.ok) {
          const authPayData = await mpRes.json()
          const preapprovalId = authPayData.preapproval_id
          if (preapprovalId) {
            const { data: sub } = await supabase
              .from("subscriptions")
              .select("id, status")
              .eq("mercado_pago_subscription_id", preapprovalId.toString())
              .maybeSingle()

            if (sub) {
              const targetStatus = authPayData.status === "approved" ? "active" : "past_due"
              await syncSubscriptionToBilling(sub.id, "webhook", targetStatus)
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
      .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_expires_at, cancelled_at, payment_breakdown, finance_account_id, checkout_fulfillment")
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
      const { data: partners } = await supabase
        .from("partners")
        .select("id")
        .not("mp_access_token_encrypted", "is", null)

      for (const partner of partners || []) {
        try {
          const partnerToken = await getValidMercadoPagoAccessToken(partner.id)
          const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${partnerToken}` },
          })

          if (mpResponse.ok) {
            paymentInfo = await mpResponse.json()
            partnerId = partner.id
            console.log(`[WEBHOOK] Payment data fetched via partner ${partnerId}, MP status: ${paymentInfo.status}`)
            break
          }
        } catch (err: any) {
          console.warn(`[WEBHOOK] Failed to fetch via partner ${partner.id}:`, err.message)
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
      return
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
    if (saasPreapprovalId || saasExternalRef) {
      console.log(`[WEBHOOK] Checking for SaaS subscription payment (preapproval: ${saasPreapprovalId}, ext_ref: ${saasExternalRef})`)

      let saasSubscription = null

      if (saasPreapprovalId) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, partner_id, status, plan_id, mercado_pago_subscription_id, current_period_end, billing_email")
          .eq("mercado_pago_subscription_id", saasPreapprovalId)
          .maybeSingle()
        saasSubscription = sub
      } else if (saasExternalRef) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id, partner_id, status, plan_id, mercado_pago_subscription_id, current_period_end, billing_email")
          .eq("id", saasExternalRef)
          .maybeSingle()
        saasSubscription = sub
      }

      if (saasSubscription) {
        console.log(`[WEBHOOK] Found SaaS subscription ${saasSubscription.id} for payment ${paymentId}`)

        if (paymentInfo.status === "approved" && ["past_due", "failed", "unpaid", "pending"].includes(saasSubscription.status)) {
          // Reactivate subscription
          console.log(`[WEBHOOK] Reactivating SaaS subscription ${saasSubscription.id} from ${saasSubscription.status} to active`)

          const now = new Date()
          const currentEnd = saasSubscription.current_period_end ? new Date(saasSubscription.current_period_end) : null
          const nextEnd = currentEnd && currentEnd.getTime() > now.getTime()
            ? new Date(currentEnd.getTime() + 30 * 24 * 60 * 60 * 1000)
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

          const { error: updateError } = await supabase
            .from("subscriptions")
            .update({
              status: "active",
              past_due_at: null,
              current_period_start: now.toISOString(),
              current_period_end: nextEnd.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", saasSubscription.id)

          if (!updateError) {
            // Invalidate cache and sync billing
            const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
            invalidatePartnerPlanCache(saasSubscription.partner_id)

            const { syncSubscriptionToBilling } = await import("@/lib/billing/sync-subscription")
            await syncSubscriptionToBilling(saasSubscription.id, "webhook", "active", now, nextEnd).catch(console.error)

            // Log billing event
            try {
              await supabase.from("billing_events").insert({
                partner_id: saasSubscription.partner_id,
                event_type: "subscription_reactivated",
                amount: Number(paymentInfo.transaction_amount || 0),
                provider: "mercado_pago",
                metadata: {
                  mp_subscription_id: saasSubscription.mercado_pago_subscription_id,
                  mp_payment_id: paymentId.toString(),
                  previous_status: "past_due",
                  payment_method: "pix",
                },
              })
            } catch (billErr: any) {
              console.error("[WEBHOOK] Failed to log billing event:", billErr.message)
            }

            // Notify partner owner
            const { data: partner } = await supabase
              .from("partners")
              .select("user_id")
              .eq("id", saasSubscription.partner_id)
              .single()

            if (partner?.user_id) {
              const { sendBillingNotification } = await import("@/lib/billing/notifications")
              await sendBillingNotification(
                "billing.payment_received",
                partner.user_id,
                saasSubscription.partner_id,
                {
                  message: `Pagamento manual da assinatura aprovado! A assinatura foi reativada e o próximo vencimento foi estendido.`,
                  subscription_id: saasSubscription.id,
                  mp_payment_id: paymentId.toString(),
                  amount: paymentInfo.transaction_amount,
                }
              )
            }

            console.log(`[WEBHOOK] SaaS subscription ${saasSubscription.id} reactivated successfully`)
          }
        }
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
      return
    }

    // ── Find order in DB ──
    let orderData = existingOrderData
    if (!orderData) {
      let { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_breakdown, finance_account_id, checkout_fulfillment")
        .eq("mp_payment_id", paymentId.toString())
        .limit(1)
        .maybeSingle()

      // Fallback seguro: se não encontrou por mp_payment_id, busca por external_reference (ID do pedido)
      if (!order && paymentInfo?.external_reference) {
        const { data: orderExt } = await supabase
          .from("orders")
          .select("id, situation, total_amount, paid_amount, partner_id, store_id, payment_breakdown, finance_account_id, checkout_fulfillment")
          .eq("id", paymentInfo.external_reference)
          .limit(1)
          .maybeSingle()

        if (orderExt) {
          order = orderExt
          console.log(`[WEBHOOK] Order ${order.id} found via external_reference fallback`)
        }
      }

      if (!order) {
        console.error("[WEBHOOK] Order not found in database:", orderError?.message)
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return processWebhookWithRetry(body, requestId, attempt + 1)
        }
        return
      }
      orderData = order
    }

    const orderId = orderData.id
    console.log(`[WEBHOOK] Order found: ${orderId}, current situation: ${orderData.situation}`)

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
      amountReceived: paymentInfo.transaction_details?.net_received_amount ?? Number(paymentInfo.transaction_amount || 0),
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
    const mpLegIndex = oldBreakdown.findIndex(
      (entry: any) =>
        String(entry?.provider || "").toLowerCase().includes("mercado pago") ||
        String(entry?.method || "").toLowerCase().includes("mercado pago"),
    )
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
      orderStatus = "cancelled"
    }

    console.log(`[WEBHOOK] Status mapping: MP "${paymentInfo.status}" → order "${orderStatus}"`)

    // ── Status regression guard ──
    const finalStatuses = ["paid", "shipped", "delivered"]
    if (finalStatuses.includes(orderData.situation) && !finalStatuses.includes(orderStatus)) {
      if (orderStatus !== "cancelled") {
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

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId)

    if (updateError) {
      console.error("[WEBHOOK] Error updating order:", updateError.message)
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        return processWebhookWithRetry(body, requestId, attempt + 1)
      }
      SecureLogger.error("[WEBHOOK] Failed to update order after retries", {
        error: updateError.message,
        orderId,
      })
      return
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
        } catch (auditErr: any) {
          console.error("[WEBHOOK] Error logging payment audit event:", auditErr.message)
        }
      }
    }

    // ── Create revenue transaction when payment approved ──
    if (paymentInfo.status === "approved") {
      try {
        const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
        const { data: fullOrder } = await supabase
          .from("orders")
          .select("order_number, partner_id, store_id, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name, customer_id, finance_account_id, order_source")
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
        }

        if (fullOrder && Number(fullOrder.paid_amount || 0) > previousPaidAmount + 0.009) {
          const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
          await fulfillMarketplaceOrder(supabase, orderId)
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
  }
}
