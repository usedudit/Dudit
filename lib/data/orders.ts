import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all orders for a partner, including profiles and order items.
 * Uses getAdminClient to bypass RLS (filtered by partner_id) and
 * implements cross-request caching (unstable_cache) + per-request deduplication (cache).
 */
export const getPartnerOrdersCached = cache(async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data, error } = await supabase
                .from("orders")
                .select(`
                    *,
                    order_items(quantity, product_name),
                    stores(name)
                `)
                .eq("partner_id", partnerId)
                .order("order_date", { ascending: false }) // Use order_date instead of created_at as primary sort

            if (error) {
                console.error("[getPartnerOrdersCached] Error:", error)
                return []
            }
            if (!data || data.length === 0) {
                console.log(`[getPartnerOrdersCached] No orders found for partner ${partnerId}`)
            }
            return data || []
        },
        [TAGS.orders(partnerId)],
        {
            tags: [TAGS.orders(partnerId)],
            revalidate: 5
        }
    )()
})

