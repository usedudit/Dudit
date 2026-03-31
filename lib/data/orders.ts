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
                    profiles(full_name, email),
                    order_items(quantity, product_name),
                    stores(name)
                `)
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })

            if (error) {
                console.error("[getPartnerOrdersCached] Error:", error)
                return []
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

