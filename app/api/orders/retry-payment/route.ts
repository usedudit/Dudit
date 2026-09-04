import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { captureError } from "@/lib/monitoring/sentry"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimitForAPI(RateLimitCategory.PAYMENT)
    if (rateLimit.limited) {
      return NextResponse.json(
        rateLimit.body || { error: "Muitas tentativas. Tente novamente em breve." },
        { status: rateLimit.status || 429 }
      )
    }

    const body = await request.json()
    const { orderId } = body

    // SECURITY: Require authentication
    const user = await requireUser()
    // Buscar o pedido scoped to authenticated user
    const adminClient = await createAdminClient()
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select(`
        *,
        stores!inner(name),
        order_items (
          *,
          products (
            name,
            images
          ),
          product_variants (
            variant_name,
            variant_type,
            variant_options
          )
        )
      `)
      .eq("id", orderId)
      .eq("buyer_id", user.id)
      .single()

    if (orderError || !order) {
      SecureLogger.error("Order not found in retry-payment", { error: orderError })
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    if (order.payment_provider !== "Mercado Pago") {
      return NextResponse.json({ error: "This order does not use Mercado Pago" }, { status: 400 })
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
    } catch (err: any) {
      captureError(err, {
        module: "payments",
        action: "retry_payment_token",
        route: "/api/orders/retry-payment",
        partnerId: order.partner_id,
        entityId: order.id,
      })
      SecureLogger.error("Partner has no valid MP access token in retry-payment", { error: err.message })
      return NextResponse.json({ error: "Seller has not configured Mercado Pago" }, { status: 400 })
    }

    // Verificar se o pedido está com pagamento pendente
    if (order.situation !== "pending") {
      return NextResponse.json(
        { error: "This order is not pending payment" },
        { status: 400 },
      )
    }

    // Verificar se tem ID do pagamento no Mercado Pago
    if (!order.mp_payment_id) {
      return NextResponse.json(
        { error: "No payment ID found for this order" },
        { status: 400 },
      )
    }



    // Buscar dados do pagamento do Mercado Pago usando token do vendedor
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`,
      {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          "X-Idempotency-Key": `get-payment-${order.mp_payment_id}`,
        },
      },
    )

    if (!mpResponse.ok) {
      SecureLogger.error("MP get payment error in retry-payment")
      return NextResponse.json(
        { error: "Failed to get payment from Mercado Pago" },
        { status: mpResponse.status },
      )
    }

    const paymentData = await mpResponse.json()



    // Extrai dados relevantes
    const qrCode = paymentData.point_of_interaction?.transaction_data?.qr_code || null
    const qrCodeBase64 = paymentData.point_of_interaction?.transaction_data?.qr_code_base64 || null
    const ticketUrl = paymentData.point_of_interaction?.transaction_data?.ticket_url || paymentData.transaction_details?.external_resource_url || null
    const barcode = paymentData.barcode?.content || paymentData.point_of_interaction?.transaction_data?.barcode || null

    let boletoData = null
    if (paymentData.payment_method_id === "bolbradesco" || paymentData.payment_method_id === "boleto" || paymentData.payment_type_id === "ticket") {
      if (ticketUrl || barcode) {
        boletoData = {
          ticketUrl: ticketUrl,
          barcode: barcode,
        }
      }
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentId: paymentData.id,
      paymentStatus: paymentData.status,
      paymentMethod: paymentData.payment_method_id || paymentData.payment_method?.type,
      pixData: {
        qrCode,
        qrCodeBase64,
        ticketUrl,
      },
      boletoData,
      ticketUrl,
      orderDetails: {
        orderNumber: order.order_number,
        sellerName: order.stores?.name,
        deliveryType: order.delivery_type,
        deliveryAddress: order.delivery_address,
        items: order.order_items?.map((item: any) => {
          const opts = item.product_variants && typeof item.product_variants.variant_options === "string"
            ? JSON.parse(item.product_variants.variant_options)
            : item.product_variants?.variant_options;
          const image = opts?.image || item.products?.images?.[0] || null;

          return {
            id: item.variant_id || item.product_id,
            name: `${item.products?.name} ${item.product_variants?.variant_name || ""}`,
            price: Number(item.price_at_time),
            quantity: item.quantity,
            image: image,
          }
        }) || []
      }
    })
  } catch (error: any) {
    captureError(error, {
      module: "payments",
      action: "retry_payment",
      route: "/api/orders/retry-payment",
      metadata: { errorCode: error?.code },
    })
    SecureLogger.error("Error in retry-payment")
    return NextResponse.json({ error: "Failed to retrieve payment" }, { status: 500 })
  }
}
