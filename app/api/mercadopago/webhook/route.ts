import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { createHmac, timingSafeEqual } from "crypto"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { formatPaymentMethodLabel } from "@/lib/payments/payment-method"

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000  // 5 minutes
const AMOUNT_TOLERANCE = 0.01
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
    const webhookSecret = process.env.MP_WEBHOOK_SECRET

    if (!webhookSecret) {
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

    // Mercado Pago signature template: id:...;request-id:...;ts:...
    const requestSignature = `id:${resourceId};request-id:${requestId};ts:${timestamp}`
    const computedHmac = createHmac("sha256", webhookSecret)
      .update(requestSignature)
      .digest("hex")

    if (computedHmac.length !== receivedSignature.length) return false
    return timingSafeEqual(Buffer.from(computedHmac), Buffer.from(receivedSignature))
  } catch (error: any) {
    SecureLogger.error("[WEBHOOK] Signature validation error", { error: error.message })
    return false
  }
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  console.log("[WEBHOOK] ========== PAYMENT WEBHOOK RECEIVED ==========")
  console.log("[WEBHOOK] Timestamp:", new Date().toISOString())

  try {
    // ── Step 1: Validate required headers (FAIL CLOSED) ──
    const signature = request.headers.get("x-signature")
    const requestId = request.headers.get("x-request-id")

    if (!signature || !requestId) {
      console.error("[WEBHOOK] Rejected: missing x-signature or x-request-id headers")
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    // ── Step 2: Parse body ──
    const body = await request.json()

    console.log("[WEBHOOK] Event:", JSON.stringify({
      type: body.type,
      action: body.action,
      paymentId: body.data?.id,
    }))

    if (!body?.data?.id) {
      console.error("[WEBHOOK] Rejected: missing payment ID in body")
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // ── Step 3: Validate signature (MANDATORY - no bypass) ──
    const isValid = validateWebhookSignature(
      signature,
      requestId,
      body.data.id.toString(),
    )

    if (!isValid) {
      SecureLogger.error("[WEBHOOK] Rejected: invalid signature", {
        requestId,
        paymentId: body.data.id,
      })
      return NextResponse.json({ error: "Invalid request" }, { status: 401 })
    }

    console.log("[WEBHOOK] Signature validated successfully")

    // ── Step 4: ACK immediately, process async ──
    const response = NextResponse.json({ received: true }, { status: 200 })

    processWebhookWithRetry(body, requestId).catch((error) => {
      SecureLogger.error("[WEBHOOK] Async processing failed", { error: error.message })
    })

    return response
  } catch (error: any) {
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
    // Only handle payment events
    if (type !== "payment" || !paymentId) {
      console.log("[WEBHOOK] Not a payment event, skipping")
      return
    }

    const supabase = createAdminClient()

    // ── Idempotency check: has this payment already been processed? ──
    const { data: existingOrderData, error: checkError } = await supabase
      .from("orders")
      .select("id, situation, total_amount, paid_amount, partner_id, payment_expires_at, cancelled_at, payment_breakdown, finance_account_id, checkout_fulfillment")
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

    if (!paymentInfo || !partnerId) {
      console.error("[WEBHOOK] Could not fetch payment data or resolve partner")
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

    // ── Find order in DB ──
    let orderData = existingOrderData
    if (!orderData) {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, situation, total_amount, paid_amount, partner_id, payment_breakdown, finance_account_id, checkout_fulfillment")
        .eq("mp_payment_id", paymentId.toString())
        .limit(1)
        .single()

      if (orderError || !order) {
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
      feeAmount: totalFeeAmount ?? 0,
      fixedFeeAmount: 0,
      interestAmount: 0,
      feeBearer: "merchant",
      paymentMethodId: paymentInfo.payment_method_id ?? null,
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

    const oldBreakdown = Array.isArray(orderData.payment_breakdown) ? [...orderData.payment_breakdown] : []
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
        payment_provider: "Mercado Pago",
        mp_payment_id: paymentId.toString(),
        payment_breakdown,
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
    }

    // ── Create revenue transaction when payment approved ──
    if (paymentInfo.status === "approved") {
      try {
        const { createFinancialTransactionsForReceivedAmount } = await import("@/app/actions/erp/orders")
        const { data: fullOrder } = await supabase
          .from("orders")
          .select("order_number, partner_id, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name, customer_id, finance_account_id, order_source")
          .eq("id", orderId)
          .single()

        if (fullOrder && Number(fullOrder.paid_amount || 0) > previousPaidAmount + 0.009) {
          await createFinancialTransactionsForReceivedAmount(supabase, {
            orderId: orderId,
            orderNumber: fullOrder.order_number,
            partnerId: fullOrder.partner_id,
            totalAmount: fullOrder.total_amount,
            newBreakdown: fullOrder.payment_breakdown || [],
            oldBreakdown: orderData.payment_breakdown || [],
            customerId: fullOrder.customer_id || fullOrder.buyer_id || null,
            customerName: fullOrder.customer_name || null,
            financeAccountId: fullOrder.finance_account_id || null,
            orderSource: fullOrder.order_source || "manual",
            paymentMethod: fullOrder.payment_method || "Método não definido",
          })

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
    console.error("[WEBHOOK] Processing error:", error.message)

    if (attempt < MAX_RETRIES - 1) {
      console.log(`[WEBHOOK] Retrying in 3s (attempt ${attempt + 2}/${MAX_RETRIES})...`)
      await new Promise((resolve) => setTimeout(resolve, 3000))
      return processWebhookWithRetry(body, requestId, attempt + 1)
    }

    SecureLogger.error("[WEBHOOK] Failed after all retries", { error: error.message })
  }
}
