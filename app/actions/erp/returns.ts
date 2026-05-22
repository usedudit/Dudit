"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"

export async function searchOrderForReturnAction(partnerId: string, orderNumber: string) {
  try {
    const user = await requireUser()
    if (!user) return { success: false, error: "Não autenticado" }

    await requirePartnerAccessWithPermission(partnerId, "orders", "view")
    const supabase = createAdminClient()

    const cleanQuery = String(orderNumber || "").trim()
    if (!cleanQuery) {
      return { success: true, data: [] }
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        total_amount,
        buyer_id,
        customer_name,
        delivery_address,
        created_at,
        situation,
        order_source,
        order_items (
          id,
          product_name,
          product_price,
          quantity,
          subtotal,
          product_id,
          products (
            sku,
            images,
            name
          )
        )
      `)
      .eq("partner_id", partnerId)
      .ilike("order_number", `%${cleanQuery}%`)
      .order("created_at", { ascending: false })
      .limit(10)

    if (error) throw error

    const hydratedOrders = await Promise.all(
      (orders || []).map(async (order: any) => {
        let customer = null
        if (order.buyer_id) {
          const { data: customerData } = await supabase
            .from("customers")
            .select("id, name, email, phone, addresses(*)")
            .eq("id", order.buyer_id)
            .maybeSingle()
          customer = customerData
        }
        return {
          ...order,
          customer
        }
      })
    )

    return { success: true, data: hydratedOrders }
  } catch (e: any) {
    console.error("[searchOrderForReturnAction] error:", e)
    return { success: false, error: e?.message || "Erro ao buscar pedido" }
  }
}
