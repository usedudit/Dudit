import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError } from "@/lib/monitoring/sentry"
import { getOrderPaidAmount, getOrderTotalAmount } from "@/lib/payments/order-financial-state"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import {
  findMercadoPagoIntegration,
  mapToMpPartnerFields,
} from "@/lib/services/payments/mercadopago-integration"

interface RecoverPaymentRequest {
  orderId: string
  method: "pix" | "boleto"
}

async function handler(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimitForAPI(RateLimitCategory.PAYMENT)
    if (rateLimit.limited) {
      return NextResponse.json(
        rateLimit.body || { error: "Muitas tentativas. Tente novamente em breve." },
        { status: rateLimit.status || 429 }
      )
    }

    const body: RecoverPaymentRequest = await request.json()
    const { orderId, method } = body

    if (!orderId) {
      return NextResponse.json({ error: "orderId é obrigatório" }, { status: 400 })
    }

    if (!["pix", "boleto"].includes(method)) {
      return NextResponse.json(
        { error: "Método de pagamento inválido. Use 'pix' ou 'boleto'." },
        { status: 400 }
      )
    }

    const user = await requireUser()
    const adminClient = await createAdminClient()

    // Buscar ordem com itens para validação de estoque
    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select(`
        *,
        stores(name),
        order_items(
          id,
          product_id,
          variant_id,
          quantity,
          service_id,
          recurring_plan_id,
          line_type,
          product_name
        )
      `)
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      SecureLogger.error("Order not found in recover-payment", { error: orderError, orderId })
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 })
    }

    // Validar que o usuário é o comprador
    const isBuyer = order.buyer_id === user.id
    if (!isBuyer) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
    }

    // Verificar que a ordem está em estado recuperável (payment_failed)
    if (order.situation !== "payment_failed") {
      return NextResponse.json(
        { error: "Este pedido não está disponível para recuperação de pagamento" },
        { status: 400 }
      )
    }

    // Assinaturas recorrentes só podem ser pagas com cartão de crédito (nunca Pix ou Boleto)
    const hasSubscriptionItem =
      Boolean((order as any).recurring_subscription_id) ||
      (order.order_items || []).some(
        (item: any) => item.line_type === "subscription" || Boolean(item.recurring_plan_id)
      )

    if (hasSubscriptionItem) {
      return NextResponse.json(
        { error: "Assinaturas aceitam apenas pagamento com cartão de crédito. Tente outro cartão." },
        { status: 400 }
      )
    }

    // Sinal / entrada não aceita boleto
    const isDepositCheckout = Boolean((order.checkout_fulfillment as any)?.depositCheckout?.payDepositOnly)
    if (method === "boleto" && isDepositCheckout) {
      return NextResponse.json(
        { error: "Pagamento via Boleto não está disponível para pagamento de sinal." },
        { status: 400 }
      )
    }

    // Validar que o vendedor aceita Pix / Boleto via Mercado Pago
    const partnerIntegration = await findMercadoPagoIntegration(adminClient, order.partner_id)
    const accepted =
      mapToMpPartnerFields(partnerIntegration).mp_accepted_payment_methods ||
      ({} as Record<string, boolean>)
    const methodAllowed =
      method === "pix"
        ? accepted.pix !== false
        : method === "boleto"
          ? accepted.boleto !== false
          : false

    if (!methodAllowed) {
      return NextResponse.json(
        {
          error: `O vendedor não aceita pagamento via ${method === "pix" ? "Pix" : "Boleto"} pelo Mercado Pago.`,
        },
        { status: 400 }
      )
    }

    // Re-validar estoque de cada item antes de criar novo pagamento
    const validationErrors: string[] = []
    for (const item of (order.order_items || [])) {
      if (item.line_type === "service_booking" || item.service_id) {
        // Serviços: validar disponibilidade (slot já foi reservado no momento original)
        // Se a reserva foi liberada (order cancelada), não podemos recuperar
        // Por enquanto, apenas log; a reserva de estoque de serviços é feita no momento do pedido
        SecureLogger.info("Service item in payment_failed order, verifying availability", {
          orderId: order.id,
          serviceId: item.service_id,
          itemId: item.id,
        })
        continue
      }

      const productId = item.product_id || item.variant_id
      if (!productId) continue

      if (item.variant_id) {
        const { data: variant, error: vError } = await adminClient
          .from("product_variants")
          .select("stock_available, products!inner(allow_sell_without_stock)")
          .eq("id", item.variant_id)
          .maybeSingle()

        if (vError || !variant) {
          validationErrors.push(`Variante "${item.product_name}" não encontrada`)
          continue
        }

        const allowSellWithoutStock = Boolean(variant.products?.allow_sell_without_stock)
        const stock = Number(variant.stock_available ?? 0)
        if (!allowSellWithoutStock && stock < item.quantity) {
          validationErrors.push(
            `"${item.product_name}" não tem estoque suficiente (tem ${stock}, precisa de ${item.quantity})`
          )
        }
      } else if (item.product_id) {
        const { data: product, error: pError } = await adminClient
          .from("products")
          .select("stock_available, allow_sell_without_stock")
          .eq("id", item.product_id)
          .maybeSingle()

        if (pError || !product) {
          validationErrors.push(`Produto "${item.product_name}" não encontrado`)
          continue
        }

        const allowSellWithoutStock = Boolean(product?.allow_sell_without_stock)
        const stock = Number(product.stock_available ?? 0)
        if (!allowSellWithoutStock && stock < item.quantity) {
          validationErrors.push(
            `"${item.product_name}" não tem estoque suficiente (tem ${stock}, precisa de ${item.quantity})`
          )
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "Não é possível recuperar este pedido. Alguns itens não estão mais disponíveis.",
          recoveryBlocked: true,
          validationErrors,
        },
        { status: 410 }
      )
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
    } catch (err: any) {
      captureError(err, {
        module: "payments",
        action: "recover_payment_token",
        route: "/api/checkout/recover-payment",
        partnerId: order.partner_id,
        entityId: order.id,
      })
      SecureLogger.error("Partner has no valid MP access token in recover-payment", {
        error: err.message,
        partnerId: order.partner_id,
      })
      return NextResponse.json(
        { error: "O vendedor não possui o Mercado Pago configurado para pagamentos online." },
        { status: 400 }
      )
    }

    const chargeAmount = Math.round((getOrderTotalAmount(order) - getOrderPaidAmount(order) + Number.EPSILON) * 100) / 100

    if (chargeAmount <= 0) {
      return NextResponse.json({ error: "Não há valor a cobrar" }, { status: 400 })
    }

    const isExchange = order.order_source === "Troca" || !!order.exchange_return_request_id
    const description = isExchange
      ? `Diferença de troca - Pedido #${order.order_number || order.id.slice(0, 8)}`
      : `Pedido #${order.order_number || order.id.slice(0, 8)}`

    const payerName =
      (order.customer_name || user.user_metadata?.full_name || user.email || "Cliente").trim()
    const nameParts = payerName.split(/\s+/)
    const firstName = nameParts[0] || "Cliente"
    const lastName = nameParts.slice(1).join(" ") || "Comprador"

    const paymentMethodId = method === "pix" ? "pix" : "bolbradesco"

    const mpPaymentRequest: Record<string, any> = {
      transaction_amount: chargeAmount,
      payment_method_id: paymentMethodId,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
      external_reference: order.id,
      statement_descriptor: "DUDIT",
      description: description.slice(0, 250),
      payer: {
        email: order.customer_email || user.email,
        first_name: firstName,
        last_name: lastName,
      },
    }

    if (method === "boleto") {
      const rawPayerAddr = order.delivery_address
      if (typeof rawPayerAddr === "object" && rawPayerAddr) {
        const addr = rawPayerAddr as Record<string, any>
        const stateNameToAbbr = new Map<string, string>([
          ["acre", "AC"], ["alagoas", "AL"], ["amapá", "AP"], ["amazonas", "AM"],
          ["bahia", "BA"], ["ceará", "CE"], ["distrito federal", "DF"], ["espírito santo", "ES"],
          ["goiás", "GO"], ["maranhão", "MA"], ["mato grosso", "MT"], ["mato grosso do sul", "MS"],
          ["minas gerais", "MG"], ["pará", "PA"], ["paraíba", "PB"], ["paraná", "PR"],
          ["pernambuco", "PE"], ["piauí", "PI"], ["rio de janeiro", "RJ"],
          ["rio grande do norte", "RN"], ["rio grande do sul", "RS"], ["rondônia", "RO"],
          ["roraima", "RR"], ["santa catarina", "SC"], ["são paulo", "SP"],
          ["sergipe", "SE"], ["tocantins", "TO"],
        ])

        const rawFederalUnit = addr.federal_unit || addr.federalUnit || ""
        const federalUnitAbbr =
          rawFederalUnit.length === 2
            ? rawFederalUnit.toUpperCase()
            : (stateNameToAbbr.get(rawFederalUnit.toLowerCase()) || rawFederalUnit)

        mpPaymentRequest.additional_info = {
          payer: {
            first_name: firstName,
            last_name: lastName,
            address: {
              zip_code: String(addr.zip_code || addr.zipCode || "").replace(/\D/g, ""),
              street_name: String(addr.street_name || addr.streetName || "").trim() || undefined,
              street_number: String(addr.street_number || addr.streetNumber || "").trim() || undefined,
            },
          },
        }
      }
    }

    if (method === "pix") {
      mpPaymentRequest.additional_info = {
        ...((mpPaymentRequest.additional_info as object) || {}),
        items: [{
          id: String(order.id).slice(0, 32),
          title: `Pedido #${order.order_number || order.id.slice(0, 8)}`.slice(0, 256),
          description: `Recuperação de pagamento - ${payerName}`.slice(0, 256),
          category_id: "others",
          quantity: 1,
          unit_price: chargeAmount,
        }],
      }
    }

    const idempotencyKey = `recover-${order.id}-${method}-${Date.now()}`

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mpPaymentRequest),
    })

    if (!mpResponse.ok) {
      let errText = ""
      try {
        errText = await mpResponse.text()
      } catch (_) {
        // ignore
      }
      SecureLogger.error("Failed to create MP payment in recover-payment", {
        method,
        status: mpResponse.status,
        error: errText,
      })
      return NextResponse.json(
        { error: `Erro ao gerar cobrança ${method === "pix" ? "Pix" : "Boleto"} no Mercado Pago.` },
        { status: 400 }
      )
    }

    const paymentData = await mpResponse.json()

    const qrCode = paymentData.point_of_interaction?.transaction_data?.qr_code || null
    const qrCodeBase64 = paymentData.point_of_interaction?.transaction_data?.qr_code_base64 || null
    const ticketUrl =
      paymentData.point_of_interaction?.transaction_data?.ticket_url ||
      paymentData.transaction_details?.external_resource_url ||
      null
    const barcode =
      paymentData.barcode?.content ||
      paymentData.point_of_interaction?.transaction_data?.barcode ||
      null

    const paymentStatus = paymentData.status || "pending"

    // Atualizar ordem com o novo payment
    const newSituation =
      paymentStatus === "approved"
        ? "paid"
        : paymentStatus === "in_process"
        ? "in_process"
        : paymentStatus === "rejected"
        ? "payment_failed"
        : "pending"

    const { computePaymentExpiresAt } = await import("@/lib/services/order-expiration")
    const newExpiry =
      paymentStatus === "approved"
        ? null
        : computePaymentExpiresAt(method).toISOString()

    const existingBreakdown = Array.isArray(order.payment_breakdown) ? [...order.payment_breakdown] : []

    const newBreakdownEntry = {
      method: method === "pix" ? "Pix" : "Boleto",
      amount: chargeAmount,
      effectiveAmount: chargeAmount,
      amountReceived: paymentStatus === "approved" ? chargeAmount : 0,
      provider: "Mercado Pago",
      adjustmentType: "none",
      interestAmount: 0,
      feeAmount: 0,
      fixedFeeAmount: 0,
      feeBearer: "merchant",
      mpPaymentStatus: paymentStatus,
      mpPaymentStatusDetail: paymentData.status_detail ?? null,
      mpPaymentId: paymentData.id?.toString() ?? null,
      createdAt: new Date().toISOString(),
    }

    const updatedBreakdown = [...existingBreakdown, newBreakdownEntry]

    const { error: updateError } = await adminClient
      .from("orders")
      .update({
        mp_payment_id: paymentData.id?.toString() ?? order.mp_payment_id,
        situation: newSituation,
        payment_method: method === "pix" ? "Pix" : "Boleto",
        payment_expires_at: newExpiry,
        payment_breakdown: updatedBreakdown,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)

    if (updateError) {
      SecureLogger.error("Failed to update order in recover-payment", {
        error: updateError.message,
        orderId: order.id,
      })
      captureError(updateError, {
        module: "payments",
        action: "recover_payment_update_order",
        route: "/api/checkout/recover-payment",
        partnerId: order.partner_id,
        entityId: order.id,
      })
    }

    // Disparar notificação se o status mudou
    if (newSituation !== order.situation) {
      try {
        const { onOrderStatusChanged } = await import("@/lib/services/notification-automation.service")
        await onOrderStatusChanged(
          {
            id: order.id,
            order_number: order.order_number,
            partner_id: order.partner_id,
            buyer_id: order.buyer_id,
            customer_name: order.customer_name,
          },
          newSituation,
          undefined,
          "system"
        )
      } catch (notifyErr: any) {
        SecureLogger.warn("Failed to send recovery notification", {
          error: notifyErr.message,
          orderId: order.id,
        })
      }
    }

    let pixData = null
    if (method === "pix" && qrCode) {
      pixData = {
        qrCode: qrCode,
        qrCodeBase64: qrCodeBase64,
        ticketUrl: ticketUrl,
      }
    }

    let boletoData = null
    if (method === "boleto" && (barcode || ticketUrl)) {
      boletoData = {
        barcode: barcode,
        ticketUrl: ticketUrl,
      }
    }

    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: user.id,
      entityType: "order",
      entityId: order.id,
      actionType: "payment_recovered",
      changeLines: [
        `Tentativa de recuperação de pagamento após recusa.`,
        `Novo método: ${method === "pix" ? "Pix" : "Boleto"}.`,
        `Status MP: ${paymentStatus}${paymentData.status_detail ? `. Detalhe: ${paymentData.status_detail}` : ""}`,
      ],
      source: "system",
      metadata: {
        recoveryMethod: method,
        mpPaymentId: paymentData.id?.toString() ?? null,
        mpPaymentStatus: paymentStatus,
        mpPaymentStatusDetail: paymentData.status_detail ?? null,
        chargeAmount,
      },
    })

    return NextResponse.json({
      success: true,
      orderId: order.id,
      paymentId: paymentData.id,
      paymentStatus,
      paymentMethod: method,
      statusDetail: paymentData.status_detail ?? null,
      chargeAmount,
      pixData,
      boletoData,
    })
  } catch (error: any) {
    captureError(error, {
      module: "payments",
      action: "recover_payment",
      route: "/api/checkout/recover-payment",
    })
    SecureLogger.error("Error in recover-payment endpoint", {
      errorMessage: error?.message,
      errorCode: error?.code,
    })
    return NextResponse.json({ error: "Erro ao recuperar pagamento. Tente novamente." }, { status: 500 })
  }
}

export const POST = withCSRFProtection(handler)
