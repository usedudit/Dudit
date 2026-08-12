import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { getMpPlatformAccessToken } from "@/lib/services/mercadopago/subscriptions"
import { SecureLogger } from "@/lib/secure-logger"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id: subscriptionId } = await params

    const adminClient = createAdminClient()

    // Get subscription details
    const { data: subscription, error: subError } = await adminClient
      .from("subscriptions")
      .select(`
        id,
        partner_id,
        plan_id,
        status,
        mercado_pago_subscription_id,
        current_period_end,
        billing_email,
        plan:plan_id (id, name, price)
      `)
      .eq("id", subscriptionId)
      .single()

    if (subError || !subscription) {
      return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 })
    }

    // Verify user owns this partner
    const { data: partner } = await adminClient
      .from("partners")
      .select("user_id")
      .eq("id", subscription.partner_id)
      .single()

    if (!partner || partner.user_id !== user.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    // Only allow manual payment for past_due subscriptions
    if (subscription.status !== "past_due") {
      return NextResponse.json({ error: "Apenas assinaturas em atraso podem gerar pagamento manual" }, { status: 400 })
    }

    if (!subscription.mercado_pago_subscription_id) {
      return NextResponse.json({ error: "Assinatura sem ID do Mercado Pago" }, { status: 400 })
    }

    const planPrice = Number(subscription.plan?.price || 0)
    if (planPrice <= 0) {
      return NextResponse.json({ error: "Plano gratuito não requer pagamento" }, { status: 400 })
    }

    // Get platform access token for MP Subscriptions API
    const accessToken = await getMpPlatformAccessToken()

    // Create a payment linked to the preapproval (subscription)
    // This will generate a PIX QR code for the current due installment
    const paymentPayload = {
      transaction_amount: planPrice,
      currency_id: "BRL",
      payment_method_id: "pix",
      preapproval_id: subscription.mercado_pago_subscription_id,
      description: `Fatura atrasada - ${subscription.plan?.name}`,
      payer: {
        email: subscription.billing_email || user.email,
      },
      external_reference: subscriptionId,
    }

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `manual-pay-${subscriptionId}-${Date.now()}`,
      },
      body: JSON.stringify(paymentPayload),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => null)
      SecureLogger.error("MP manual payment creation failed", {
        status: mpResponse.status,
        subscriptionId,
        error: errorData,
      })
      return NextResponse.json({ error: "Erro ao gerar pagamento no Mercado Pago" }, { status: 400 })
    }

    const mpPayment = await mpResponse.json()

    const pixData = mpPayment.point_of_interaction?.transaction_data ? {
      qrCode: mpPayment.point_of_interaction.transaction_data.qr_code,
      qrCodeBase64: mpPayment.point_of_interaction.transaction_data.qr_code_base64,
      ticketUrl: mpPayment.point_of_interaction.transaction_data.ticket_url,
    } : null

    return NextResponse.json({
      success: true,
      paymentId: mpPayment.id,
      status: mpPayment.status,
      pix: pixData,
      amount: planPrice,
    })

  } catch (error: any) {
    SecureLogger.error("Manual payment generation error", {
      error: error.message,
      subscriptionId: (await params).id,
    })
    return NextResponse.json({ error: "Erro interno ao gerar pagamento" }, { status: 500 })
  }
}