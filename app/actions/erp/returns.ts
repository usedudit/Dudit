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

export async function fetchReturnOrderBucketAction(partnerId: string) {
  try {
    const user = await requireUser()
    if (!user) return []

    await requirePartnerAccessWithPermission(partnerId, "orders", "view")
    const supabase = createAdminClient()

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
        delivery_status,
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
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) throw error

    const buyerIds = Array.from(
      new Set((orders || []).map((o: any) => o.buyer_id).filter(Boolean))
    )

    let customersMap = new Map<string, any>()
    if (buyerIds.length > 0) {
      const { data: customersData, error: custError } = await supabase
        .from("customers")
        .select("id, name, email, phone, addresses(*)")
        .in("id", buyerIds)

      if (!custError && customersData) {
        customersData.forEach((c: any) => {
          customersMap.set(c.id, c)
        });
      }
    }

    const formatted = (orders || []).map((order: any) => {
      const customer = order.buyer_id ? customersMap.get(order.buyer_id) : null
      return {
        id: order.id,
        displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
        order_number: order.order_number || null,
        status: order.situation || "pending",
        deliveryStatus: order.delivery_status || "not_sent",
        totalAmount: Number(order.total_amount || 0),
        total_amount: Number(order.total_amount || 0),
        buyer_id: order.buyer_id,
        customer_name: order.customer_name || customer?.name || "Cliente",
        delivery_address: order.delivery_address,
        created_at: order.created_at,
        situation: order.situation,
        order_source: order.order_source,
        order_items: order.order_items || [],
        customer: customer || null,
        orderDate: order.created_at || null,
      }
    })

    return formatted
  } catch (e: any) {
    console.error("[fetchReturnOrderBucketAction] error:", e)
    return []
  }
}

