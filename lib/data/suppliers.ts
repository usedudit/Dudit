import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all suppliers for a partner.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 */
const suppliersCacheMap = new Map<string, any>()

export const getPartnerSuppliersCached = cache(async (partnerId: string, storeId: string) => {
    let cachedFn = suppliersCacheMap.get(`${partnerId}:${storeId}`)
    if (!cachedFn) {
        cachedFn = unstable_cache(
            async () => {
                const supabase = getAdminClient()
                const { data } = await supabase
                    .from("suppliers")
                    .select("*")
                    .eq("partner_id", partnerId)
                    .order("created_at", { ascending: false })

                return data
            },
            [TAGS.suppliers(partnerId), storeId],
            {
                tags: [TAGS.suppliers(partnerId)]
            }
        )
        suppliersCacheMap.set(`${partnerId}:${storeId}`, cachedFn)
    }
    return cachedFn(partnerId, storeId)
})
