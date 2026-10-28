import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser, requirePartnerAccess } from "@/lib/auth/authorization"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"
import { SecureLogger } from "@/lib/secure-logger"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const rateLimitResult = await checkRateLimitForAPI(RateLimitCategory.PAYMENT)
    if (rateLimitResult.limited) {
      return NextResponse.json(rateLimitResult.body, { status: rateLimitResult.status })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { paymentId } = await params

    if (!/^\d+$/.test(paymentId)) {
      return NextResponse.json({ error: "ID de pagamento inválido" }, { status: 400 })
    }

    const accessToken = await getMpPlatformAccessToken()

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      SecureLogger.error("MP get subscription payment failed", {
        paymentId,
        status: response.status,
      })
      return NextResponse.json({ error: "Falha ao consultar pagamento no Mercado Pago" }, { status: 400 })
    }

    const paymentData = await response.json()

    // ── Locate target subscription in local database ──
    const { getAdminClient } = await import("@/lib/supabase/admin")
    const adminClient = getAdminClient()

    const subscriptionId = paymentData.external_reference || paymentData.metadata?.subscription_id

    let targetSub = null
    if (subscriptionId) {
      const { data: sub } = await adminClient
        .from("subscriptions")
        .select("id, partner_id, status, plan_id, current_period_end, mercado_pago_subscription_id")
        .eq("id", subscriptionId)
        .maybeSingle()
      targetSub = sub
    }

    if (!targetSub && paymentData.preapproval_id) {
      const { data: sub } = await adminClient
        .from("subscriptions")
        .select("id, partner_id, status, plan_id, current_period_end, mercado_pago_subscription_id")
        .eq("mercado_pago_subscription_id", paymentData.preapproval_id.toString())
        .maybeSingle()
      targetSub = sub
    }

    if (!targetSub) {
      return NextResponse.json({ error: "Assinatura correspondente não encontrada" }, { status: 404 })
    }

    // ── SECURITY: Strictly verify that the calling user has partner access to this subscription ──
    try {
      await requirePartnerAccess(targetSub.partner_id, user)
    } catch {
      return NextResponse.json({ error: "Acesso negado a esta assinatura" }, { status: 403 })
    }

    // ── Synchronize subscription when the payment settles ──
    // The next cycle comes from the subscription anchor (calendar months), never
    // from a hardcoded +30 days on the payment date.
    let reactivated = false
    if (["approved", "processed", "rejected", "cancelled", "refunded", "charged_back"].includes(paymentData.status)) {
      try {
        const { chargeFromMpPayment } = await import("@/lib/billing/record-charge")
        const { syncSubscriptionToBilling } = await import("@/lib/billing/sync-subscription")
        const charge = chargeFromMpPayment(paymentData, paymentId)

        const chargeDateRaw = paymentData.date_approved || paymentData.date_created
        const chargeDate = chargeDateRaw ? new Date(chargeDateRaw) : null
        const validChargeDate = chargeDate && !isNaN(chargeDate.getTime()) ? chargeDate : null

        // A late payment of an already cancelled subscription is recorded but
        // never restores access.
        if (targetSub.status === "cancelled") {
          await syncSubscriptionToBilling(targetSub.id, "webhook", {
            status: "cancelled",
            charge,
            chargeCycleStart: validChargeDate,
            notify: false,
          }).catch((err) => console.error("[SUBSCRIPTION_PAYMENT_SYNC] Billing sync error:", err))
        } else {
          const targetStatus =
            charge.status === "approved"
              ? "active"
              : ["rejected", "refunded", "chargeback"].includes(charge.status)
                ? "past_due"
                : targetSub.status

          await syncSubscriptionToBilling(targetSub.id, "manual", {
            status: targetStatus,
            cycleStart: charge.status === "approved" ? validChargeDate : undefined,
            charge,
            chargeCycleStart: validChargeDate,
          }).catch((err) => {
            console.error("[SUBSCRIPTION_PAYMENT_SYNC] Billing sync error:", err)
          })

          reactivated = charge.status === "approved" && targetSub.status !== "active"
        }

        try {
          const minuteBucket = Math.floor(Date.now() / 60000)
          const idempotencyKey = `subscription_payment:${targetSub.partner_id}:${paymentId}:${minuteBucket}`

          await adminClient.from("billing_events").insert({
            partner_id: targetSub.partner_id,
            event_type:
              charge.status === "approved" ? "subscription_reactivated" : "subscription_payment_updated",
            amount: Number(paymentData.transaction_amount || 0),
            provider: "mercado_pago",
            metadata: {
              mp_subscription_id: targetSub.mercado_pago_subscription_id,
              mp_payment_id: paymentId.toString(),
              payment_method: paymentData.payment_method_id || "pix",
              payment_status: paymentData.status,
              sync_source: "status_poll",
            },
            idempotency_key: idempotencyKey,
          })
        } catch {}
      } catch (syncErr: any) {
        SecureLogger.error("Failed to sync subscription on payment check", {
          paymentId,
          error: syncErr.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      status: paymentData.status,
      statusDetail: paymentData.status_detail,
      transactionAmount: paymentData.transaction_amount,
      dateApproved: paymentData.date_approved,
      preapprovalId: paymentData.preapproval_id,
      externalReference: paymentData.external_reference,
      reactivated,
    })

  } catch (error: any) {
    SecureLogger.error("Get subscription payment status error", {
      error: error.message,
    })
    return NextResponse.json({ error: "Erro interno ao consultar pagamento" }, { status: 500 })
  }
}