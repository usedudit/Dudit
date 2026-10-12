import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

const CUSTOMER_CACHE_SELECT = "id, partner_id, name, email, phone, created_at, updated_at, person_type, status, is_active, store_credit, deleted_at"

/**
 * Fetches recent customers for a partner with limit and tenant scoping.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 */
export const getPartnerCustomersCached = cache(async (partnerId: string, storeId: string = "") => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            let query = supabase
                .from("customers")
                .select(CUSTOMER_CACHE_SELECT)
                .eq("partner_id", partnerId)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .limit(100)

            const { data, error } = await query

            if (error) {
                console.error("[getPartnerCustomersCached] Error:", error)
                return []
            }
            return data || []
        },
        [TAGS.customers(partnerId), storeId || "all-stores"],
        {
            tags: [TAGS.customers(partnerId)],
            revalidate: 60,
        }
    )()
})
