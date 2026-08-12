import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/authorization"
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

    return NextResponse.json({
      success: true,
      status: paymentData.status,
      statusDetail: paymentData.status_detail,
      transactionAmount: paymentData.transaction_amount,
      dateApproved: paymentData.date_approved,
      preapprovalId: paymentData.preapproval_id,
      externalReference: paymentData.external_reference,
    })

  } catch (error: any) {
    SecureLogger.error("Get subscription payment status error", {
      error: error.message,
    })
    return NextResponse.json({ error: "Erro interno ao consultar pagamento" }, { status: 500 })
  }
}