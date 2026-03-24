import { cache } from "react"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

/**
 * Fetches all orders for a partner, including profiles and order items.
 * Wrapped in React cache() for per-request deduplication.
 */
export const getPartnerOrdersCached = cache(async (partnerId: string) => {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
        .from("orders")
        .select(`
      *,
      profiles(full_name, email),
      order_items(quantity, product_name)
    `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })

    return data
})
