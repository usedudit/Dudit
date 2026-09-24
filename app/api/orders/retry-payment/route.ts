import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser, requirePartnerAccess } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { getOrderDepositSummary, shouldShowSinal } from "@/lib/payments/order-financial-state"
import { getSalesSettingsAction } from "@/app/actions/erp/sales-settings"
import { captureError } from "@/lib/monitoring/sentry"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getExpectedMpChargeAmount, getOrderPaidAmount } from "@/lib/payments/order-financial-state"

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
    const adminClient = await createAdminClient()
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select(`
        *,
        stores(name),
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
      .single()

    if (orderError || !order) {
      SecureLogger.error("Order not found in retry-payment", { error: orderError })
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const isBuyer = order.buyer_id === user.id
    let isPartnerStaff = false
    if (!isBuyer && order.partner_id) {
      try {
        await requirePartnerAccess(order.partner_id, user)
        isPartnerStaff = true
      } catch (_) {
        isPartnerStaff = false
      }
    }

    if (!isBuyer && !isPartnerStaff) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
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

    // Allow both "pending" and "partially_paid" (deposit-only flow): a partially_paid
    // order still has a remaining balance that can be charged via retry-payment.
    // Also allow "payment_failed" (card rejection recovery — can only recover via PIX).
    if (order.situation !== "pending" && order.situation !== "partially_paid" && order.situation !== "payment_failed") {
      return NextResponse.json(
        { error: "Este pedido não está com pagamento pendente" },
        { status: 400 },
      )
    }

    // Check if deposit is expired and auto-cancel is enabled
    const depositSummary = getOrderDepositSummary(order)
    if (depositSummary.usesDeposit && depositSummary.depositStatus === "expired" && depositSummary.paidAmount <= 0.009) {
        let shouldCancel = false
        try {
            const settingsResult = await getSalesSettingsAction(order.partner_id || "")
            if (settingsResult.success && settingsResult.data?.cancelExpiredDepositOrders) {
                shouldCancel = true
            }
        } catch (_) {
            // If settings check fails, proceed normally
        }

        if (shouldCancel) {
            await adminClient
                .from("orders")
            .update({
                    situation: "cancelled",
                    cancelled_at: new Date().toISOString(),
                    notes: "Pedido cancelado automaticamente: sinal de entrada expirado sem pagamento.",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", orderId)

            return NextResponse.json({
                success: false,
                error: "Este pedido foi cancelado automaticamente porque o sinal expirou sem pagamento. Entre em contato com a loja.",
                cancelled: true,
            }, { status: 410 })
        }
    }

    const totalAmount = Number(order.total_amount || 0)
    const paidAmount = getOrderPaidAmount(order)
    // Use getExpectedMpChargeAmount which correctly accounts for deposits:
    // - If nothing paid yet: returns initialChargeAmount (deposit amount) or full total
    // - If deposit paid: returns remaining balance
    const chargeAmount = Math.round((Math.max(0, getExpectedMpChargeAmount(order)) + Number.EPSILON) * 100) / 100

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
          if (fetched.status === "approved") {
            // The existing MP payment is approved. Determine if the order is
            // FULLY paid (not just the deposit) — when the deposit was already
            // synced (paidAmount > 0) the mp_payment_id is the deposit payment,
            // so we must NOT treat it as fully paid. Only mark paid when either:
            //  1. Nothing is paid yet and the MP payment covers the full total,
            //  2. OR paidAmount already covers the full total (shouldn't reach here,
            //     but defensive).
            const mpTransactionAmount = Number(fetched.transaction_amount || 0)
            if (paidAmount <= 0.009) {
              // No payments recorded yet on the order — the MP payment should
              // be the full amount. Sync it to "paid".
              await adminClient
                .from("orders")
                .update({ situation: "paid", updated_at: new Date().toISOString() })
                .eq("id", order.id)
              return NextResponse.json({ success: true, alreadyPaid: true })
            }
            // paidAmount > 0 (e.g. deposit already synced) — the existing MP
            // payment was the deposit. Fall through to create a NEW Pix for the
            // remaining balance (computed as chargeAmount above).
            SecureLogger.info("Order partially paid via approved MP payment, generating remaining balance charge", {
              orderId: order.id,
              mpPaymentId: order.mp_payment_id,
              paidAmount,
              mpTransactionAmount,
              totalAmount,
            })
          }

          const hasPixQr = Boolean(fetched.point_of_interaction?.transaction_data?.qr_code)
          const hasBoletoData = Boolean(
            fetched.barcode?.content ||
            fetched.point_of_interaction?.transaction_data?.barcode ||
            fetched.transaction_details?.external_resource_url ||
            fetched.point_of_interaction?.transaction_data?.ticket_url
          )
          const isTicket = fetched.payment_method_id === "bolbradesco" || fetched.payment_method_id === "boleto" || fetched.payment_type_id === "ticket"
          const isPix = fetched.payment_method_id === "pix" || hasPixQr

          if (fetched.status === "pending" && ((isPix && hasPixQr) || (isTicket && hasBoletoData))) {
            // Only reuse an existing pending payment if its amount matches the
            // expected charge amount. When the order is partially paid (deposit
            // flow), the existing mp_payment_id may be the deposit Pix whose
            // amount differs from the remaining balance.
            const fetchedAmount = Number(fetched.transaction_amount || fetched.transaction_details?.amount || 0)
            if (Math.abs(fetchedAmount - chargeAmount) <= 0.01) {
              paymentData = fetched
            }
          }
        }
      } catch (err: any) {
        SecureLogger.warn("Failed to fetch existing MP payment in retry-payment", { orderId: order.id })
      }
    }

    // Se não encontrou dados e for staff do ERP, não gera novo pagamento.
    // Exception: when the existing MP payment was approved (e.g. a paid deposit)
    // and there's still a remaining balance (paidAmount > 0), we should still
    // allow generating a new Pix for the remaining balance.
    if (!paymentData && isPartnerStaff && !(order.mp_payment_id && paidAmount > 0.009)) {
      return NextResponse.json({
        error: "Cobrança não encontrada ou expirada no Mercado Pago.",
      }, { status: 404 })
    }

    // Se for comprador e o pedido original era Boleto, não gerar um Pix indevido
    const orderMethodLower = String(order.payment_method || "").toLowerCase()
    const isOriginalBoleto = orderMethodLower.includes("boleto") || orderMethodLower.includes("bolbradesco") || orderMethodLower === "ticket"
    if (!paymentData && isOriginalBoleto) {
      return NextResponse.json({
        error: "O boleto deste pedido expirou ou não está mais disponível.",
      }, { status: 400 })
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
           situation: paymentData.status === "approved" ? "paid" : (paymentData.status === "in_process" ? "in_process" : (paymentData.status === "rejected" ? "payment_failed" : "pending")),
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

    const isTicket = paymentData.payment_method_id === "bolbradesco" || paymentData.payment_method_id === "boleto" || paymentData.payment_type_id === "ticket"
    const isPix = paymentData.payment_method_id === "pix" || Boolean(qrCode)

    let boletoData = null
    if (isTicket && (ticketUrl || barcode)) {
      boletoData = {
        ticketUrl: ticketUrl,
        barcode: barcode,
      }
    }

    let pixData = null
    if (isPix && (qrCode || qrCodeBase64)) {
      pixData = {
        qrCode,
        qrCodeBase64,
        ticketUrl,
      }
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentId: paymentData.id,
      paymentStatus: paymentData.status,
      paymentMethod: paymentData.payment_method_id || paymentData.payment_method?.type,
      chargeAmount,
      pixData,
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
