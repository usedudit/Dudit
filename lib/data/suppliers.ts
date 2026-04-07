import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all suppliers for a partner.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 */
export const getPartnerSuppliersCached = cache(async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data } = await supabase
                .from("suppliers")
                .select("*")
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })

            return data
        },
        [TAGS.suppliers(partnerId)],
        {
            tags: [TAGS.suppliers(partnerId)]
        }
    )()
})
