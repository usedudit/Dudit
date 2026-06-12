import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
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

    const supabase = await getSupabaseServerClient()
    const supabaseAdmin = await createAdminClient()

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, situation, total_amount, mp_payment_id, payment_method, payment_provider, buyer_id, partner_id, payment_expires_at")
      .eq("id", orderId)
      .eq("buyer_id", user.id)
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
      const paidAmount = Number(paymentData.transaction_amount)
      const orderAmount = Number(order.total_amount)

      if (Math.abs(paidAmount - orderAmount) > AMOUNT_TOLERANCE) {
        SecureLogger.error("Payment amount mismatch â€” possible fraud", {
          paidAmount,
          orderAmount,
          orderId,
        })
        return NextResponse.json({ error: "Payment amount does not match order" }, { status: 400 })
      }
    }

    let newOrderStatus = "pending"

    if (paymentData.status === "approved") {
      newOrderStatus = "paid"
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

    if (newOrderStatus !== order.situation) {
      SecureLogger.info("Syncing payment status", {
        orderId,
        from: order.situation,
        to: newOrderStatus,
      })

      const updateData: any = {
        situation: newOrderStatus,
        payment_method: paymentData.payment_method?.type || order.payment_method,
        payment_provider: "Mercado Pago",
        updated_at: new Date().toISOString(),
      }

      if (paymentData.status === "approved" && paymentData.date_approved) {
        updateData.mp_date_approved = paymentData.date_approved
      }

      if (newOrderStatus === "paid") {
        updateData.amount_paid = order.total_amount
        updateData.paid_amount = order.total_amount
      }

      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .neq("situation", newOrderStatus)
        .select("situation")
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

      if (newOrderStatus === "paid") {
        try {
          const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")

          const { data: fullOrder } = await supabaseAdmin
            .from("orders")
            .select("order_number, partner_id, total_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name")
            .eq("id", orderId)
            .single()

          if (fullOrder) {
            await createTransactionFromOrder(supabaseAdmin, {
              order_number: fullOrder.order_number,
              partner_id: fullOrder.partner_id,
              total_amount: fullOrder.total_amount,
              payment_method: fullOrder.payment_method,
              payment_provider: fullOrder.payment_provider,
              payment_breakdown: fullOrder.payment_breakdown,
              payment_date: paymentData.date_approved || new Date().toISOString(),
              customer_contact_id: fullOrder.buyer_id,
              customer_name: fullOrder.customer_name,
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
