import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { revalidateProducts, revalidateMarketplace } from "@/lib/utils/revalidation"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"

const AMOUNT_TOLERANCE = 0.01
const MAX_BATCH_SIZE = 20

// Helper to chunk an array
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderIds } = body

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "Invalid orderIds array" }, { status: 400 })
    }

    if (orderIds.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Batch size exceeds limit of ${MAX_BATCH_SIZE}` }, { status: 400 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const supabaseAdmin = await createAdminClient()

    // 1. Fetch all orders matching the IDs and user
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, situation, total_amount, mp_payment_id, payment_method, payment_provider, buyer_id, partner_id")
      .in("id", orderIds)
      .eq("buyer_id", user.id)

    if (ordersError || !orders || orders.length === 0) {
      SecureLogger.error("No orders found for payment sync batch", { orderIds })
      return NextResponse.json({ error: "No orders found" }, { status: 404 })
    }

    // Filter to only pending Mercado Pago orders with a payment ID
    const candidateOrders: any[] = (orders as any[]).filter(
      (order: any) =>
        order.situation === "pending" &&
        order.payment_provider === "Mercado Pago" &&
        order.mp_payment_id
    )

    if (candidateOrders.length === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        results: (orders as any[]).map((o: any) => ({
          orderId: o.id,
          orderNumber: o.order_number,
          previousStatus: o.situation,
          newStatus: o.situation,
          updated: false,
          skipped: true,
          reason: "not_pending_or_non_mp",
        })),
      })
    }

    const results: any[] = []
    let updatedCount = 0

    // Group candidates by partner_id to fetch access tokens efficiently
    const candidatesByPartner = candidateOrders.reduce((acc: Record<string, any[]>, order: any) => {
      if (!acc[order.partner_id]) {
        acc[order.partner_id] = []
      }
      acc[order.partner_id].push(order)
      return acc
    }, {} as Record<string, any[]>)

    // Process partners sequentially, but orders for the same partner in small parallel batches
    for (const [partnerId, partnerOrders] of Object.entries(candidatesByPartner)) {
      let mpAccessToken: string
      try {
        mpAccessToken = await getValidMercadoPagoAccessToken(partnerId)
      } catch (error: any) {
        SecureLogger.error("Failed to get valid MP token in batch sync", {
          partnerId,
          error: error.message,
        })
        for (const order of partnerOrders) {
          results.push({
            orderId: order.id,
            orderNumber: order.order_number,
            updated: false,
            error: "Payment configuration unavailable for partner",
          })
        }
        continue
      }

      // Chunk requests to Mercado Pago for this partner (e.g., 5 at a time) to prevent Rate Limiting
      const orderChunks = chunkArray(partnerOrders, 5)
      for (const chunk of orderChunks) {
        const promises = chunk.map(async (order: any) => {
          try {
            const mpResponse = await fetch(
              `https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`,
              {
                headers: {
                  Authorization: `Bearer ${mpAccessToken}`,
                },
              }
            )

            if (!mpResponse.ok) {
              SecureLogger.error("Failed to fetch payment status from MP in batch", {
                orderId: order.id,
                status: mpResponse.status,
              })
              return {
                orderId: order.id,
                orderNumber: order.order_number,
                updated: false,
                error: `Failed to fetch payment status: ${mpResponse.statusText}`,
              }
            }

            const paymentData = await mpResponse.json()

            // Validate amount mismatch to prevent fraud
            if (paymentData.status === "approved" && paymentData.transaction_amount != null) {
              const paidAmount = Number(paymentData.transaction_amount)
              const orderAmount = Number(order.total_amount)

              if (Math.abs(paidAmount - orderAmount) > AMOUNT_TOLERANCE) {
                SecureLogger.error("Payment amount mismatch in batch sync", {
                  paidAmount,
                  orderAmount,
                  orderId: order.id,
                })
                return {
                  orderId: order.id,
                  orderNumber: order.order_number,
                  updated: false,
                  error: "Payment amount does not match order",
                }
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

            // If the status has not changed, skip update
            if (newOrderStatus === order.situation) {
              return {
                orderId: order.id,
                orderNumber: order.order_number,
                previousStatus: order.situation,
                newStatus: order.situation,
                paymentStatus: paymentData.status,
                updated: false,
                skipped: true,
              }
            }

            // Sync database
            const updateData: any = {
              situation: newOrderStatus,
              payment_method: paymentData.payment_method?.type || order.payment_method,
              payment_provider: "Mercado Pago",
              updated_at: new Date().toISOString(),
            }

            if (paymentData.status === "approved" && paymentData.date_approved) {
              updateData.mp_date_approved = paymentData.date_approved
            }

            const { data: updatedOrder, error: updateError } = await supabaseAdmin
              .from("orders")
              .update(updateData)
              .eq("id", order.id)
              .neq("situation", newOrderStatus)
              .select("situation")
              .maybeSingle()

            if (updateError) {
              SecureLogger.error("Error updating order in batch sync", {
                orderId: order.id,
                error: updateError.message,
              })
              return {
                orderId: order.id,
                orderNumber: order.order_number,
                updated: false,
                error: "Failed to update order in database",
              }
            }

            if (!updatedOrder) {
              return {
                orderId: order.id,
                orderNumber: order.order_number,
                previousStatus: order.situation,
                newStatus: order.situation,
                paymentStatus: paymentData.status,
                updated: false,
                skipped: true,
              }
            }

            SecureLogger.info("Order status updated in batch sync", { orderId: order.id, newStatus: newOrderStatus })

            // Handle post-payment hooks for paid status
            if (newOrderStatus === "paid") {
              try {
                const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
                const { data: fullOrder } = await supabaseAdmin
                  .from("orders")
                  .select("order_number, partner_id, total_amount, payment_method, payment_provider, payment_breakdown, buyer_id, customer_name")
                  .eq("id", order.id)
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
                  await fulfillMarketplaceOrder(supabaseAdmin, order.id)
                }

                // Invalidate products cache
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
              } catch (txErr: any) {
                SecureLogger.error("Error creating transaction in batch sync", {
                  orderId: order.id,
                  error: txErr.message,
                })
              }
            }

            updatedCount++
            return {
              orderId: order.id,
              orderNumber: order.order_number,
              previousStatus: order.situation,
              newStatus: newOrderStatus,
              paymentStatus: paymentData.status,
              updated: true,
            }
          } catch (err: any) {
            SecureLogger.error("Unexpected error in single order batch sync", {
              orderId: order.id,
              error: err.message,
            })
            return {
              orderId: order.id,
              orderNumber: order.order_number,
              updated: false,
              error: err.message,
            }
          }
        })

        const chunkResults = await Promise.allSettled(promises)
        for (const res of chunkResults) {
          if (res.status === "fulfilled") {
            results.push(res.value)
          } else {
            results.push({
              updated: false,
              error: res.reason?.message || "Unknown chunk execution error",
            })
          }
        }
      }
    }

    if (updatedCount > 0) {
      try {
        revalidateMarketplace()
      } catch (err) {
        console.error("Revalidation error:", err)
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      results,
    })
  } catch (error: any) {
    SecureLogger.error("Unexpected error in batch sync payment route", {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
