/**
 * Record a real subscription charge (one row per billing cycle).
 *
 * This is the ONLY place allowed to create `billing_purchases`,
 * `billing_payments` and invoices for platform subscriptions. Creating a
 * preapproval checkout is not a charge: nothing is written until Mercado Pago
 * actually attempts/settles a payment for a cycle.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { logBillingAudit } from "./audit"
import { generateInvoiceForPurchase, refreshInvoiceForPurchase } from "./invoice-generation"
import { cycleKey, resolveBillingCycle, resolveChargeCycle } from "./subscription-period"
import type { PaymentMethodType, PaymentStatus, PurchaseStatus } from "./types"

export type SyncContext = "webhook" | "manual" | "migration" | "dev_test" | "reconciliation"

export interface SubscriptionCharge {
  status: PaymentStatus
  gatewayPaymentId?: string | null
  gatewayStatus?: string | null
  method?: PaymentMethodType | null
  amount?: number | null
  paidAt?: string | null
  expiresAt?: string | null
  details?: Record<string, any> | null
  gatewayResponse?: Record<string, any> | null
  qrCode?: string | null
  qrCodeBase64?: string | null
  checkoutUrl?: string | null
}

export interface RecordChargeInput {
  subscriptionId: string
  context: SyncContext
  charge: SubscriptionCharge
  /** Explicit cycle start (Mercado Pago `debit_date`). */
  cycleStart?: Date | null
  /** Skip the "late charge" guard when the caller already validated it. */
  allowLateCharge?: boolean
}

export interface RecordChargeResult {
  purchaseId: string | null
  paymentId: string | null
  createdPurchase: boolean
  cycleStart: Date | null
  cycleKey: string | null
}

const MP_PAYMENT_STATUS_MAP: Record<string, PaymentStatus> = {
  approved: "approved",
  processed: "approved",
  authorized: "approved",
  pending: "pending",
  in_process: "processing",
  waiting_for_gateway: "processing",
  recycling: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "chargeback",
  chargeback: "chargeback",
}

export function mapMpPaymentStatus(status: string | null | undefined): PaymentStatus {
  if (!status) return "pending"
  return MP_PAYMENT_STATUS_MAP[String(status).toLowerCase()] || "pending"
}

export function mapPurchaseStatus(status: PaymentStatus, previous?: PurchaseStatus | null): PurchaseStatus {
  switch (status) {
    case "approved":
      return "completed"
    case "refunded":
      return "refunded"
    case "chargeback":
      return "refunded"
    case "cancelled":
      return "cancelled"
    case "pending":
    case "processing":
    case "rejected":
      // A paid cycle never regresses because a later event of the same cycle
      // is still pending/rejected (e.g. a duplicate authorized payment).
      return previous === "completed" ? "completed" : "pending"
    default:
      return "pending"
  }
}

function normalizeMethod(paymentInfo: any): PaymentMethodType | null {
  const methodId = String(paymentInfo?.payment_method_id || "").toLowerCase()
  const typeId = String(paymentInfo?.payment_type_id || "").toLowerCase()

  if (methodId === "pix") return "pix"
  if (typeId === "credit_card") return "credit_card"
  if (typeId === "debit_card") return "debit_card"
  if (typeId === "ticket") return "boleto"
  if (typeId === "account_money") return "account_money"
  if (typeId === "bank_transfer") return "pix"
  return null
}

/** Map a Mercado Pago `/v1/payments/{id}` payload into a local charge. */
export function chargeFromMpPayment(paymentInfo: any, paymentId: string | number): SubscriptionCharge {
  return {
    status: mapMpPaymentStatus(paymentInfo?.status),
    gatewayPaymentId: String(paymentId),
    gatewayStatus: paymentInfo?.status || null,
    method: normalizeMethod(paymentInfo),
    amount:
      paymentInfo?.transaction_amount != null ? Number(paymentInfo.transaction_amount) : null,
    paidAt: paymentInfo?.date_approved || null,
    expiresAt: paymentInfo?.date_of_expiration || null,
    details: {
      installments: paymentInfo?.installments ?? null,
      last_four_digits: paymentInfo?.card?.last_four_digits ?? null,
      status_detail: paymentInfo?.status_detail ?? null,
    },
    gatewayResponse: paymentInfo || null,
  }
}

/** Map an `authorized_payment` resource (subscription charge attempt). */
export function chargeFromAuthorizedPayment(authPay: any): SubscriptionCharge {
  const nestedPayment = authPay?.payment && typeof authPay.payment === "object" ? authPay.payment : null
  const gatewayPaymentId =
    nestedPayment?.id != null
      ? String(nestedPayment.id)
      : authPay?.payment_id != null
        ? String(authPay.payment_id)
        : authPay?.id != null
          ? `authpay_${authPay.id}`
          : null

  return {
    status: mapMpPaymentStatus(authPay?.status),
    gatewayPaymentId,
    gatewayStatus: authPay?.status || null,
    method: normalizeMethod(nestedPayment) || (nestedPayment?.payment_type_id ? normalizeMethod(nestedPayment) : null),
    amount:
      nestedPayment?.transaction_amount != null
        ? Number(nestedPayment.transaction_amount)
        : authPay?.transaction_amount != null
          ? Number(authPay.transaction_amount)
          : null,
    paidAt: nestedPayment?.date_approved || authPay?.debit_date || null,
    details: {
      retry_attempt: authPay?.retry_attempt ?? null,
      debit_date: authPay?.debit_date ?? null,
      next_retry_date: authPay?.next_retry_date ?? null,
      summarized: authPay?.summarized ?? null,
    },
    gatewayResponse: authPay || null,
  }
}

export function authorizedPaymentCycleDate(authPay: any): Date | null {
  const raw = authPay?.debit_date || authPay?.date_created
  if (!raw) return null
  const date = new Date(raw)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Find the cycle start already attached to a gateway payment id, when this is
 * an update of an existing charge (e.g. PIX created locally then approved).
 */
export async function findChargeCycleByGatewayId(
  gatewayPaymentId: string,
): Promise<{ purchaseId: string; subscriptionId: string; cycleStart: Date } | null> {
  const admin = getAdminClient()
  const { data: payment } = await admin
    .from("billing_payments")
    .select("id, purchase_id, billing_purchases(id, subscription_id, billing_period_start)")
    .eq("gateway_payment_id", gatewayPaymentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const purchase = (payment as any)?.billing_purchases
  if (!purchase?.subscription_id || !purchase?.billing_period_start) return null

  return {
    purchaseId: purchase.id,
    subscriptionId: purchase.subscription_id,
    cycleStart: new Date(purchase.billing_period_start),
  }
}

export async function recordSubscriptionCharge(input: RecordChargeInput): Promise<RecordChargeResult> {
  const admin = getAdminClient()
  const nowIso = new Date().toISOString()

  const { data: sub, error: subError } = await admin
    .from("subscriptions")
    .select(`
      *,
      plan:plan_id (*),
      partner:partner_id (id, user_id)
    `)
    .eq("id", input.subscriptionId)
    .single()

  if (subError || !sub) {
    console.error(`[BillingCharge] Subscription ${input.subscriptionId} not found:`, subError?.message)
    return { purchaseId: null, paymentId: null, createdPurchase: false, cycleStart: null, cycleKey: null }
  }

  const plan = sub.plan
  const planPrice = Number(plan?.price || 0)
  const amount =
    input.charge.amount != null && Number.isFinite(Number(input.charge.amount))
      ? Number(input.charge.amount)
      : planPrice

  // ── 1. Resolve the billing cycle ──
  let cycle = input.cycleStart
    ? resolveBillingCycle(
      new Date(sub.created_at || nowIso),
      input.cycleStart,
      sub.billing_anchor_day ?? undefined,
    )
    : resolveChargeCycle(sub, null, new Date())

  // If the charge is an update of an existing payment, always keep its cycle.
  if (input.charge.gatewayPaymentId) {
    const existing = await findChargeCycleByGatewayId(input.charge.gatewayPaymentId)
    if (existing && existing.subscriptionId === input.subscriptionId) {
      const anchor = new Date(sub.created_at || existing.cycleStart.toISOString())
      cycle = resolveBillingCycle(
        anchor,
        existing.cycleStart,
        sub.billing_anchor_day ?? undefined,
      )
    }
  }

  const key = cycle.key

  // ── 2. Find the purchase of this cycle (never reuse another cycle) ──
  const { data: purchases } = await admin
    .from("billing_purchases")
    .select("*")
    .eq("subscription_id", input.subscriptionId)
    .eq("purchase_type", "subscription")
    .order("created_at", { ascending: false })

  let purchase =
    (purchases || []).find((p: any) => {
      if (p.metadata?.cycle_key) return p.metadata.cycle_key === key
      if (!p.billing_period_start) return false
      const start = new Date(p.billing_period_start)
      return !isNaN(start.getTime()) && cycleKey(start) === key
    }) || null

  const purchaseStatus = mapPurchaseStatus(input.charge.status, purchase?.status)
  const description = plan?.name ? `Plano ${plan.name}` : "Assinatura"

  if (!purchase) {
    const { data: newPurchase, error: createErr } = await admin
      .from("billing_purchases")
      .insert({
        partner_id: sub.partner_id,
        user_id: sub.partner?.user_id || null,
        purchase_type: "subscription",
        purchaseable_type: "plan",
        purchaseable_id: plan?.id || null,
        amount,
        total_amount: amount,
        discount_amount: 0,
        currency: "BRL",
        status: purchaseStatus,
        gateway: "mercado_pago",
        gateway_payment_id: input.charge.gatewayPaymentId || null,
        gateway_status: input.charge.gatewayStatus || null,
        subscription_id: input.subscriptionId,
        description,
        billing_period_start: cycle.start.toISOString(),
        billing_period_end: cycle.end.toISOString(),
        billing_cycle_start: key,
        metadata: {
          plan_name: plan?.name || null,
          plan_slug: plan?.slug || null,
          billing_cycle: "current",
          cycle_key: key,
          subscription_status: sub.status,
          payment_status: input.charge.status,
          payment_method: input.charge.method || null,
          synced_via: input.context,
          synced_at: nowIso,
        },
      })
      .select()
      .single()

    if (createErr || !newPurchase) {
      // Concurrent webhook/reconciliation may have inserted the same cycle
      // between our SELECT and INSERT (unique index uq_billing_purchases_subscription_cycle).
      const { data: raced } = await admin
        .from("billing_purchases")
        .select("*")
        .eq("subscription_id", input.subscriptionId)
        .eq("purchase_type", "subscription")
        .eq("billing_cycle_start", key)
        .maybeSingle()

      if (!raced) {
        console.error(`[BillingCharge] Failed to create purchase for ${input.subscriptionId}:`, createErr?.message)
        return { purchaseId: null, paymentId: null, createdPurchase: false, cycleStart: cycle.start, cycleKey: key }
      }

      purchase = raced
    } else {
      purchase = newPurchase
      await logBillingAudit("billing.purchase.created", sub.partner_id, {
        purchase_id: purchase.id,
        subscription_id: input.subscriptionId,
        plan_name: plan?.name,
        status: purchaseStatus,
        cycle_key: key,
        via: input.context,
      }, sub.partner?.user_id || undefined)
    }
  } else {
    // A past cycle is immutable except for its own payment status/invoice.
    const { error: updateErr } = await admin
      .from("billing_purchases")
      .update({
        status: purchaseStatus,
        amount,
        total_amount: amount,
        description,
        ...(purchase.billing_cycle_start ? {} : { billing_cycle_start: key }),
        gateway_payment_id: input.charge.gatewayPaymentId || purchase.gateway_payment_id,
        gateway_status: input.charge.gatewayStatus || purchase.gateway_status,
        updated_at: nowIso,
        metadata: {
          ...(purchase.metadata || {}),
          plan_name: plan?.name || null,
          plan_slug: plan?.slug || null,
          billing_cycle: "current",
          cycle_key: key,
          subscription_status: sub.status,
          payment_status: input.charge.status,
          payment_method: input.charge.method || purchase.metadata?.payment_method || null,
          synced_via: input.context,
          synced_at: nowIso,
        },
      })
      .eq("id", purchase.id)

    if (updateErr) {
      console.error(`[BillingCharge] Failed to update purchase ${purchase.id}:`, updateErr.message)
    }

    if (purchase.status !== purchaseStatus) {
      await logBillingAudit(
        purchaseStatus === "completed"
          ? "billing.purchase.completed"
          : purchaseStatus === "cancelled"
            ? "billing.purchase.cancelled"
            : purchaseStatus === "refunded"
              ? "billing.purchase.refunded"
              : "billing.purchase.pending",
        sub.partner_id,
        {
          purchase_id: purchase.id,
          subscription_id: input.subscriptionId,
          previous_status: purchase.status,
          new_status: purchaseStatus,
          cycle_key: key,
          via: input.context,
        },
        sub.partner?.user_id || undefined,
      )
    }
  }

  // ── 3. Upsert the payment of this cycle ──
  const paymentPayload = {
    purchase_id: purchase.id,
    amount,
    currency: "BRL",
    fee_amount: 0,
    net_amount: amount,
    status: input.charge.status,
    gateway: "mercado_pago" as const,
    gateway_payment_id: input.charge.gatewayPaymentId || null,
    gateway_status: input.charge.gatewayStatus || input.charge.status,
    gateway_response: input.charge.gatewayResponse || null,
    payment_method_type: input.charge.method || null,
    payment_method_details: input.charge.details || null,
    qr_code: input.charge.qrCode || null,
    qr_code_base64: input.charge.qrCodeBase64 || null,
    checkout_url: input.charge.checkoutUrl || null,
    expires_at: input.charge.expiresAt || null,
    paid_at: input.charge.status === "approved" ? input.charge.paidAt || nowIso : null,
    updated_at: nowIso,
  }

  let existingPaymentQuery = admin
    .from("billing_payments")
    .select("*")
    .eq("purchase_id", purchase.id)

  if (input.charge.gatewayPaymentId) {
    existingPaymentQuery = existingPaymentQuery.eq("gateway_payment_id", input.charge.gatewayPaymentId)
  }

  const { data: foundPayment } = await existingPaymentQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // A checkout attempt creates a placeholder payment (no gateway id yet). When
  // the real charge arrives, reuse that row instead of leaving a duplicate
  // "pending" payment next to the settled one.
  let existingPayment = foundPayment
  if (!existingPayment && input.charge.gatewayPaymentId) {
    const { data: placeholder } = await admin
      .from("billing_payments")
      .select("*")
      .eq("purchase_id", purchase.id)
      .is("gateway_payment_id", null)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    existingPayment = placeholder || null
  }

  // Never "unpay" an approved payment because an older/duplicated event arrived
  // out of order. Only refunds, chargebacks and cancellations may override it.
  const wasApproved = existingPayment?.status === "approved"
  const incomingStatus: PaymentStatus =
    wasApproved && ["pending", "processing", "rejected"].includes(input.charge.status)
      ? "approved"
      : input.charge.status

  const effectivePaidAt =
    incomingStatus === "approved"
      ? input.charge.paidAt || existingPayment?.paid_at || nowIso
      : wasApproved
        ? existingPayment?.paid_at || null
        : null

  paymentPayload.status = incomingStatus
  paymentPayload.paid_at = effectivePaidAt

  let paymentId: string | null = existingPayment?.id || null

  if (existingPayment) {
    const { error: paymentErr } = await admin
      .from("billing_payments")
      .update(paymentPayload)
      .eq("id", existingPayment.id)

    if (paymentErr) {
      console.error(`[BillingCharge] Failed to update payment ${existingPayment.id}:`, paymentErr.message)
    }
  } else {
    const { data: newPayment, error: paymentErr } = await admin
      .from("billing_payments")
      .insert(paymentPayload)
      .select("id")
      .single()

    if (paymentErr || !newPayment) {
      // Concurrent insert of the same gateway payment id (unique index).
      if (input.charge.gatewayPaymentId) {
        const { data: raced } = await admin
          .from("billing_payments")
          .select("id, status, paid_at")
          .eq("gateway_payment_id", input.charge.gatewayPaymentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (raced) {
          paymentId = raced.id
          const racedWasApproved = raced.status === "approved"
          await admin
            .from("billing_payments")
            .update({
              ...paymentPayload,
              status:
                racedWasApproved && ["pending", "processing", "rejected"].includes(incomingStatus)
                  ? "approved"
                  : incomingStatus,
              paid_at:
                racedWasApproved && incomingStatus !== "approved"
                  ? raced.paid_at
                  : effectivePaidAt,
            })
            .eq("id", raced.id)
        } else {
          console.error(`[BillingCharge] Failed to create payment for ${purchase.id}:`, paymentErr?.message)
        }
      } else {
        console.error(`[BillingCharge] Failed to create payment for ${purchase.id}:`, paymentErr?.message)
      }
    } else {
      paymentId = newPayment.id
    }
  }

  // ── 4. Invoice: create once, refresh snapshot on every payment change ──
  if (["completed", "pending"].includes(purchaseStatus)) {
    if (purchase.invoice_id) {
      await refreshInvoiceForPurchase(purchase.id, sub.partner?.user_id || undefined)
    } else {
      await generateInvoiceForPurchase(purchase.id, sub.partner?.user_id || undefined)
    }
  } else if (purchase.invoice_id) {
    await refreshInvoiceForPurchase(purchase.id, sub.partner?.user_id || undefined)
  }

  try {
    const { invalidatePartnerPlanCache } = await import("@/lib/services/subscription.service")
    invalidatePartnerPlanCache(sub.partner_id)
  } catch {
    // non-critical
  }

  console.log(
    `[BillingCharge] sub=${input.subscriptionId} cycle=${key} status=${input.charge.status} purchase=${purchase.id} source=${input.context}`,
  )

  return {
    purchaseId: purchase.id,
    paymentId,
    createdPurchase: !purchases?.some((p: any) => p.id === purchase.id),
    cycleStart: cycle.start,
    cycleKey: key,
  }
}
