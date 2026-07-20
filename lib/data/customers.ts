import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all customers for a partner.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 */
const customersCacheMap = new Map<string, any>()

export const getPartnerCustomersCached = cache(async (partnerId: string, storeId: string) => {
    let cachedFn = customersCacheMap.get(`${partnerId}:${storeId}`)
    if (!cachedFn) {
        cachedFn = unstable_cache(
            async () => {
                const supabase = getAdminClient()
                const { data, error } = await supabase
                    .from("customers")
                    .select("*")
                    .eq("partner_id", partnerId)
                    .order("created_at", { ascending: false })

                if (error) {
                    console.error("[getPartnerCustomersCached] Error:", error)
                    return []
                }
                if (!data) return []

                const { decryptCPF } = await import("@/lib/crypto")
                const processedData = []
                for (const c of data) {
                    if (c.cpf && c.cpf.startsWith("v")) {
                        try {
                            c.cpf = await decryptCPF(c.cpf)
                        } catch (e) {
                            // Ignore if decryption fails
                        }
                    }
                    processedData.push(c)
                }
                return processedData
            },
            [TAGS.customers(partnerId), storeId],
            {
                tags: [TAGS.customers(partnerId)]
            }
        )
        customersCacheMap.set(`${partnerId}:${storeId}`, cachedFn)
    }
    return cachedFn(partnerId, storeId)
})
