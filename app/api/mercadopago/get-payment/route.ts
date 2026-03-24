import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const paymentId = searchParams.get("id")

    if (!paymentId) {
      return NextResponse.json({ error: "Payment ID required" }, { status: 400 })
    }

    // SEGURANÇA: Validar formato do paymentId (deve ser numérico)
    if (!/^\d+$/.test(paymentId)) {
      return NextResponse.json({ error: "Invalid payment ID" }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const supabase = await getSupabaseServerClient()

    // SEGURANÇA: Buscar ordem pelo mp_payment_id e verificar que o usuário é o comprador
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, buyer_id, partner_id")
      .eq("mp_payment_id", paymentId)
      .eq("buyer_id", user.id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 })
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
    } catch (err: any) {
      SecureLogger.error("Error retrieving valid MP token for partner", { partnerId: order.partner_id, error: err.message })
      return NextResponse.json({ error: "Configuração de pagamento indisponível" }, { status: 400 })
    }

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    })

    if (!response.ok) {
      SecureLogger.error("Failed to fetch payment from MP API", { paymentId, status: response.status })
      return NextResponse.json({ error: "Falha ao consultar pagamento" }, { status: 500 })
    }

    const paymentData = await response.json()

    // Retorna apenas dados necessários (sem dados sensíveis)
    const qrCode = paymentData.point_of_interaction?.transaction_data?.qr_code || null
    const qrCodeBase64 = paymentData.point_of_interaction?.transaction_data?.qr_code_base64 || null
    const ticketUrl = paymentData.point_of_interaction?.transaction_data?.ticket_url || null

    return NextResponse.json({
      success: true,
      paymentId: paymentData.id,
      status: paymentData.status,
      paymentMethod: paymentData.payment_method?.type,
      pixData: {
        qrCode,
        qrCodeBase64,
        ticketUrl,
      },
    })
  } catch (error) {
    SecureLogger.error("Error getting payment")
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
