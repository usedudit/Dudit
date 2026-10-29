"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerRouteAccess, requireMinimumPlan } from "@/lib/auth/authorization"
import { calculateOrderFinancialBreakdown } from "@/lib/payments/order-financial-breakdown"

export async function getOrderFinancialBreakdownAction(orderId: string, partnerId: string) {
  await requirePartnerRouteAccess(partnerId, "orders")
  await requireMinimumPlan(partnerId, "crescer")
  const supabase = await getSupabaseServerClient()

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)

  // Fetch order with items (cost_price as fallback for pre-snapshot orders)
  const orderQuery = supabase
    .from("orders")
    .select(`
      *,
      order_items(*,
        products(id, name, sku, images, stock_quantity, stock_available, allow_sell_without_stock, unit, cost_price),
        product_variants(id, variant_name, sku, stock_quantity, stock_available),
        services(id, name, images, cost_price)
      )
    `)
    .eq("partner_id", partnerId)

  if (isUuid) {
    orderQuery.eq("id", orderId)
  } else {
    orderQuery.eq("order_number", orderId)
  }

  const { data: order, error } = await orderQuery.maybeSingle()
  if (error || !order) {
    return { success: false as const, error: error?.message || "Pedido não encontrado" }
  }

  const breakdown = calculateOrderFinancialBreakdown(order, order.order_items)
  return {
    success: true as const,
    data: breakdown,
  }
}
