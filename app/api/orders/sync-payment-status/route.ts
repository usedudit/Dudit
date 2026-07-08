import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser, requireOrderAccess } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { revalidateProducts, revalidateMarketplace } from "@/lib/utils/revalidation"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"

const AMOUNT_TOLERANCE = 0.01

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId } = body

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    try {
      await requireOrderAccess(orderId)
    } catch (err) {
      SecureLogger.error("Access denied during payment sync", { orderId, userId: user.id })
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    const supabaseAdmin = await createAdminClient()

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, situation, total_amount, paid_amount, mp_payment_id, payment_method, payment_provider, buyer_id, partner_id, payment_expires_at, payment_breakdown, finance_account_id, checkout_fulfillment")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      SecureLogger.error("Order not found during payment sync", { orderId })
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    if (order.payment_provider !== "Mercado Pago") {
      return NextResponse.json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        previousStatus: order.situation,
        newStatus: order.situation,
        updated: false,
        skipped: true,
        reason: "non_mercado_pago_order",
      })
    }

    // Zombie protection: check if order is expired
    if (order.situation === "pending" && order.payment_expires_at) {
      if (new Date() > new Date(order.payment_expires_at)) {
        const { checkAndExpireOrder } = await import("@/lib/services/order-expiration")
        await checkAndExpireOrder(supabaseAdmin, orderId)
        return NextResponse.json({
          success: true,
          orderId: order.id,
          orderNumber: order.order_number,
          previousStatus: order.situation,
          newStatus: "cancelled",
          updated: true,
          reason: "expired",
        })
      }
    }

    if (!order.mp_payment_id) {
      SecureLogger.error("Missing Mercado Pago payment id during sync", { orderId })
      return NextResponse.json({ error: "No Mercado Pago payment info found" }, { status: 400 })
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(order.partner_id)
    } catch (error: any) {
      SecureLogger.error("Failed to get valid MP token in sync", {
        partnerId: order.partner_id,
        error: error.message,
      })
      return NextResponse.json({ error: "Payment configuration unavailable" }, { status: 500 })
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`,
      {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
        },
      },
    )

    if (!mpResponse.ok) {
      SecureLogger.error("Failed to fetch payment status from MP", {
        orderId,
        status: mpResponse.status,
      })
      return NextResponse.json({ error: "Failed to fetch payment status" }, { status: 500 })
    }

    const paymentData = await mpResponse.json()

    if (paymentData.status === "approved" && paymentData.transaction_amount != null) {
      const { validateMpTransactionAmount } = await import("@/lib/payments/mp-order-payment-update")
      const validation = validateMpTransactionAmount(order, Number(paymentData.transaction_amount))
      if (!validation.ok) {
        SecureLogger.error("Payment amount mismatch - possible fraud", {
          paidAmount: paymentData.transaction_amount,
          orderAmount: validation.expectedAmount,
          orderId,
        })
        return NextResponse.json({ error: "Payment amount does not match order" }, { status: 400 })
      }
    }

    let newOrderStatus = "pending"

    const previousPaidAmount = Number(order.paid_amount || 0)
    let approvedUpdate: Record<string, unknown> | null = null

    const totalFeeAmount = paymentData.transaction_amount != null && paymentData.transaction_details?.net_received_amount != null
      ? Number(paymentData.transaction_amount) - Number(paymentData.transaction_details.net_received_amount)
      : null;

    const paymentMethodName =
      String(paymentData.payment_method_id || "").toLowerCase() === "pix"
        ? "Pix"
        : paymentData.payment_method?.type || order.payment_method || "Mercado Pago"

    const mpLeg = {
      method: paymentMethodName,
      amount: Number(paymentData.transaction_amount || 0),
      effectiveAmount: Number(paymentData.transaction_amount || 0),
      amountReceived: paymentData.transaction_details?.net_received_amount ?? Number(paymentData.transaction_amount || 0),
      provider: "Mercado Pago",
      adjustmentType: "none",
      adjustmentPercent: 0,
      adjustmentAmount: 0,
      installmentNumber: paymentData.installments ?? 1,
      feeAmount: totalFeeAmount ?? 0,
      paymentMethodId: paymentData.payment_method_id ?? null,
      paymentTypeId: paymentData.payment_type_id ?? null,
      paymentStatus: paymentData.status ?? null,
      paymentStatusDetail: paymentData.status_detail ?? null,
    }

    const oldBreakdown = Array.isArray(order.payment_breakdown) ? [...order.payment_breakdown] : []
    const mpLegIndex = oldBreakdown.findIndex(
      (entry: any) =>
        String(entry?.provider || "").toLowerCase().includes("mercado pago") ||
        String(entry?.method || "").toLowerCase().includes("mercado pago"),
    )
    const payment_breakdown =
      mpLegIndex >= 0
        ? oldBreakdown.map((entry: any, i: number) => (i === mpLegIndex ? { ...entry, ...mpLeg } : entry))
        : [...oldBreakdown, mpLeg]

    if (paymentData.status === "approved") {
      const { buildMpApprovedPaymentUpdate } = await import("@/lib/payments/mp-order-payment-update")
      approvedUpdate = buildMpApprovedPaymentUpdate({
        order,
        transactionAmount: Number(paymentData.transaction_amount || 0),
        paymentMethodName: String(paymentMethodName),
        mpPaymentId: String(order.mp_payment_id),
        mpDateApproved: paymentData.date_approved,
        existingBreakdown: order.payment_breakdown,
        mpInstallments: paymentData.installments ?? null,
        mpNetReceivedAmount: paymentData.transaction_details?.net_received_amount ?? null,
        mpTotalFeeAmount: totalFeeAmount,
        mpPaymentMethodId: paymentData.payment_method_id ?? null,
        mpPaymentTypeId: paymentData.payment_type_id ?? null,
        mpPaymentStatus: paymentData.status ?? null,
        mpPaymentStatusDetail: paymentData.status_detail ?? null,
      })
      newOrderStatus = approvedUpdate.situation as string
    } else if (paymentData.status === "in_process") {
      newOrderStatus = "in_process"
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentData.status)) {
      newOrderStatus = "cancelled"
    }

    const finalStatuses = ["paid", "shipped", "delivered"]

    if (finalStatuses.includes(order.situation) && !finalStatuses.includes(newOrderStatus)) {
      if (newOrderStatus !== "cancelled") {
        return NextResponse.json({
          success: true,
          orderId: order.id,
          orderNumber: order.order_number,
          previousStatus: order.situation,
          newStatus: order.situation,
          paymentStatus: paymentData.status,
          updated: false,
        })
      }
    }

    const nextPaidAmount = approvedUpdate ? Number(approvedUpdate.paid_amount || 0) : previousPaidAmount
    const shouldUpdate =
      newOrderStatus !== order.situation ||
      (paymentData.status === "approved" && nextPaidAmount > previousPaidAmount + 0.009)

    if (shouldUpdate) {
      SecureLogger.info("Syncing payment status", {
        orderId,
        from: order.situation,
        to: newOrderStatus,
      })

      const updateData: Record<string, unknown> = approvedUpdate
        ? { ...approvedUpdate, updated_at: new Date().toISOString() }
        : {
          situation: newOrderStatus,
          payment_method: paymentData.payment_method?.type || order.payment_method,
          payment_provider: "Mercado Pago",
          updated_at: new Date().toISOString(),
          payment_breakdown,
        }

      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .select("situation, paid_amount")
        .maybeSingle()

      if (updateError) {
        SecureLogger.error("Error updating order in sync", {
          orderId,
          error: updateError.message,
        })
        return NextResponse.json({ error: "Failed to update order" }, { status: 500 })
      }

      if (!updatedOrder) {
        return NextResponse.json({
          success: true,
          orderId: order.id,
          orderNumber: order.order_number,
          previousStatus: order.situation,
          newStatus: newOrderStatus,
          paymentStatus: paymentData.status,
          updated: false,
        })
      }

      SecureLogger.info("Order status updated", { orderId, newStatus: newOrderStatus })

      if (paymentData.status === "approved" && nextPaidAmount > previousPaidAmount + 0.009) {
        try {
          const { createFinancialTransactionsForReceivedAmount } = await import("@/app/actions/erp/orders")

          const { data: fullOrder } = await supabaseAdmin
            .from("orders")
            .select("order_number, partner_id, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name, customer_id, finance_account_id, order_source")
            .eq("id", orderId)
            .single()

          if (fullOrder) {
            await createFinancialTransactionsForReceivedAmount(supabaseAdmin, {
              orderId: orderId,
              orderNumber: fullOrder.order_number,
              partnerId: fullOrder.partner_id,
              totalAmount: fullOrder.total_amount,
              newBreakdown: fullOrder.payment_breakdown || [],
              oldBreakdown: order.payment_breakdown || [],
              customerId: fullOrder.customer_id || fullOrder.buyer_id || null,
              customerName: fullOrder.customer_name || null,
              financeAccountId: fullOrder.finance_account_id || null,
              orderSource: fullOrder.order_source || "manual",
              paymentMethod: fullOrder.payment_method || "Método não definido",
            })

            const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
            await fulfillMarketplaceOrder(supabaseAdmin, orderId)
          }
        } catch (txErr: any) {
          SecureLogger.error("Error creating transaction from order", {
            orderId,
            error: txErr.message,
          })
        }
      }

      if (newOrderStatus === "paid") {
        const { data: orderItems } = await supabaseAdmin
          .from("order_items")
          .select("product_id")
          .eq("order_id", order.id)

        if (orderItems?.length) {
          const uniqueProductIds = [...new Set(orderItems.map((i: any) => i.product_id))]
          for (const pid of uniqueProductIds) {
            revalidateProducts(order.partner_id, String(pid))
          }
        }

        revalidateMarketplace()
      }

      return NextResponse.json({
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        previousStatus: order.situation,
        newStatus: newOrderStatus,
        paymentStatus: paymentData.status,
        updated: true,
      })
    }

    if (newOrderStatus === "paid") {
      const { data: orderItems } = await supabaseAdmin
        .from("order_items")
        .select("product_id")
        .eq("order_id", order.id)

      if (orderItems?.length) {
        const uniqueProductIds = [...new Set(orderItems.map((i: any) => i.product_id))]
        for (const pid of uniqueProductIds) {
          revalidateProducts(order.partner_id, String(pid))
        }
      }

      revalidateMarketplace()
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      previousStatus: order.situation,
      newStatus: newOrderStatus,
      paymentStatus: paymentData.status,
      updated: false,
    })
  } catch (error: any) {
    SecureLogger.error("Error syncing payment status", {
      error: error.message,
      stack: error.stack,
    })

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
