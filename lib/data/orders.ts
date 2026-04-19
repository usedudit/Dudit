import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

function saleRefFromId(id: string) {
  return String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase()
}

function mapPosSaleToOrderRow(sale: any, customerNameOverride?: string | null) {
  const items = Array.isArray(sale.sale_items) ? sale.sale_items : []
  const qtySum = items.reduce((sum: number, it: any) => sum + Number(it.quantity || 0), 0)
  const customerName = customerNameOverride || "Consumidor final"
  const situation =
    sale.status === "paid" || sale.payment_status === "paid"
      ? "paid"
      : sale.payment_status === "partially_paid"
        ? "partially_paid"
        : "pending"

  return {
    ...sale,
    id: sale.id,
    mp_payment_id: null,
    order_number: saleRefFromId(sale.id),
    customer_name: customerName,
    buyer_id: sale.customer_id,
    total_amount: Number(sale.final_amount ?? 0),
    paid_amount: Number(sale.paid_amount ?? 0),
    situation,
    delivery_status: "delivered",
    order_source: "Presencial",
    order_date: sale.created_at,
    created_at: sale.created_at,
    order_items: items.map((it: any) => ({
      id: it.id,
      product_name: it.product_name,
      product_price: Number(it.unit_price || 0),
      quantity: Number(it.quantity || 0),
      subtotal: Number(it.subtotal ?? Number(it.quantity) * Number(it.unit_price)),
      sku: "-",
      image: null,
      product_id: it.product_id,
      variant_id: it.variant_id,
    })),
    quantity: qtySum,
    stores: null,
    is_pos_sale: true,
  }
}

/**
 * Fetches orders + vendas PDV (tabela sales) para a lista de pedidos.
 */
export const getPartnerOrdersCached = cache(async (partnerId: string) => {
  return unstable_cache(
    async () => {
      const supabase = getAdminClient()
      const [ordersRes, salesRes] = await Promise.all([
        supabase
          .from("orders")
          .select(`
                    *,
                    order_items(*),
                    stores(name)
                `)
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("sales")
          .select(`
            id, partner_id, customer_id, final_amount, paid_amount, discount_amount, payment_status, status, created_at, pre_sale_id, notes,
            sale_items(id, product_id, variant_id, product_name, variant_name, unit_price, quantity, subtotal, total_price)
          `)
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false }),
      ])

      if (ordersRes.error) {
        console.error("[getPartnerOrdersCached] orders error:", ordersRes.error)
      }
      if (salesRes.error) {
        console.error("[getPartnerOrdersCached] sales error:", salesRes.error)
      }

      const orderRows = (ordersRes.data || []).map((o: any) => ({ ...o, is_pos_sale: false }))
      const rawSales = salesRes.data || []
      const saleCustomerIds = [...new Set(rawSales.map((s: any) => s.customer_id).filter(Boolean))]
      const customerNameById = new Map<string, string>()
      if (saleCustomerIds.length > 0) {
        const { data: custRows } = await supabase
          .from("customers")
          .select("id, name")
          .eq("partner_id", partnerId)
          .in("id", saleCustomerIds)
        for (const c of custRows || []) customerNameById.set(c.id, c.name || "Consumidor final")
      }
      const saleRows = rawSales.map((s: any) =>
        mapPosSaleToOrderRow(s, s.customer_id ? customerNameById.get(s.customer_id) ?? null : null),
      )

      const merged = [...orderRows, ...saleRows].sort(
        (a, b) => new Date(b.created_at || b.order_date).getTime() - new Date(a.created_at || a.order_date).getTime(),
      )

      if (merged.length === 0) {
        console.log(`[getPartnerOrdersCached] No orders/sales for partner ${partnerId}`)
      }
      return merged
    },
    [TAGS.orders(partnerId)],
    {
      tags: [TAGS.orders(partnerId)],
    },
  )()
})
