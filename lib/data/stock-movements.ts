import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

/**
 * Fetches all stock movements for a partner, including product and order details.
 * Wrapped in React cache() for per-request deduplication.
 */
export const getStockMovementsCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("stock_movements")
        .select(`
      id,
      partner_id,
      product_id,
      order_id,
      movement_type,
      quantity,
      previous_quantity,
      new_quantity,
      reference_type,
      reference_name,
      reason,
      notes,
      created_at,
      created_by,
      products(id, name, sku, stock_quantity, images),
      orders(id, order_number, mp_payment_id, payment_method)
    `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })

    return data
})
