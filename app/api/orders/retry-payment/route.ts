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
      return NextResponse.json({ error: "O vendedor não possui o Mercado Pago configurado para pagamentos online." }, { status: 400 })
    }

    // Verificar se o pedido está com pagamento pendente
    if (order.situation !== "pending") {
      return NextResponse.json(
        { error: "Este pedido não está com pagamento pendente" },
        { status: 400 },
      )
    }

    const totalAmount = Number(order.total_amount || 0)
    const paidAmount = Number(order.paid_amount ?? order.amount_paid ?? 0)
    const chargeAmount = Math.round((Math.max(0, totalAmount - paidAmount) + Number.EPSILON) * 100) / 100

    if (chargeAmount <= 0) {
      await adminClient
        .from("orders")
        .update({ situation: "paid", updated_at: new Date().toISOString() })
        .eq("id", order.id)
      return NextResponse.json({ success: true, alreadyPaid: true })
    }

    let paymentData: any = null

    // Se já tiver mp_payment_id, tentar buscar dados existentes
    if (order.mp_payment_id) {
      try {
        const mpResponse = await fetch(
          `https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`,
          {
            headers: {
              Authorization: `Bearer ${mpAccessToken}`,
              "X-Idempotency-Key": `get-payment-${order.mp_payment_id}`,
            },
          },
        )
        if (mpResponse.ok) {
          const fetched = await mpResponse.json()
          if (fetched.status === "pending" && fetched.point_of_interaction?.transaction_data?.qr_code) {
            paymentData = fetched
          }
        }
      } catch (err: any) {
        SecureLogger.warn("Failed to fetch existing MP payment in retry-payment, creating new", { orderId: order.id })
      }
    }

    // Se não tem pagamento ou o anterior não está pendente/válido, cria um novo Pix
    if (!paymentData) {
      const isExchange = order.order_source === "Troca" || !!order.exchange_return_request_id
      const description = isExchange
        ? `Diferença de troca - Pedido #${order.order_number || order.id.slice(0, 8)}`
        : `Pedido #${order.order_number || order.id.slice(0, 8)}`

      const payerName = (order.customer_name || user.user_metadata?.full_name || user.email || "Cliente").trim()
      const nameParts = payerName.split(/\s+/)
      const firstName = nameParts[0] || "Cliente"
      const lastName = nameParts.slice(1).join(" ") || "Comprador"

      const mpPaymentRequest: Record<string, any> = {
        transaction_amount: chargeAmount,
        payment_method_id: "pix",
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
        external_reference: order.id,
        statement_descriptor: "DUDIT",
        description: description.slice(0, 250),
        payer: {
          email: user.email,
          first_name: firstName,
          last_name: lastName,
        },
      }

      const createResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `retry-${order.id}-${Date.now()}`,
        },
        body: JSON.stringify(mpPaymentRequest),
      })

      if (!createResponse.ok) {
        let errText = ""
        try {
          errText = await createResponse.text()
        } catch (_) {}
        SecureLogger.error("Failed to create MP Pix payment in retry-payment", {
          status: createResponse.status,
          error: errText,
        })
        return NextResponse.json({ error: "Erro ao gerar cobrança Pix no Mercado Pago" }, { status: 400 })
      }

      paymentData = await createResponse.json()

      await adminClient
        .from("orders")
        .update({
          payment_provider: "Mercado Pago",
          mp_payment_id: paymentData.id.toString(),
          situation: paymentData.status === "approved" ? "paid" : (paymentData.status === "in_process" ? "in_process" : (paymentData.status === "rejected" ? "cancelled" : "pending")),
          payment_expires_at: paymentData.date_of_expiration,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
    }

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
      chargeAmount,
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
            id: item.variant_id || item.product_id || item.id,
            name: item.product_name || `${item.products?.name || "Produto"} ${item.product_variants?.variant_name || ""}`.trim(),
            price: Number(item.product_price ?? item.price_at_time ?? 0),
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
