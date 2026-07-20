import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches a page of financial transactions for a partner.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 * 
 * Cache key structure is designed to allow future extension with filters/sort
 * without refactoring - simply append additional segments to the key array.
 * 
 * @param partnerId - The partner's UUID
 * @param page - 1-indexed page number (server page, 50 rows each)
 */
const transactionsCacheMap = new Map<string, any>()

export const getTransactionsCached = cache(async (partnerId: string, page: number = 1) => {
    const pageSize = 50
    const offset = (Math.max(1, page) - 1) * pageSize
    const mapKey = `${partnerId}:${page}`

    let cachedFn = transactionsCacheMap.get(mapKey)
    if (!cachedFn) {
        cachedFn = unstable_cache(
            async () => {
                const supabase = getAdminClient()

                // Count query - isolated so it can be easily removed or switched to 'estimated'
                const countResult = await supabase
                    .from("transactions")
                    .select("id", { count: "exact", head: true })
                    .eq("partner_id", partnerId)

                const totalCount = countResult.count ?? 0

                // Data query - explicit field selection (no select("*"))
                const { data, error } = await supabase
                    .from("transactions")
                    .select(`
                        id, description, category, amount, due_date, payment_date, created_at, status, notes, payment_type, transaction_type, contact_id, customer_id, contact_type,
                        transfer_group_id, refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id, payment_method_id, installment_group_id, installment_number,
                        transaction_contacts(name, type)
                    `)
                    .eq("partner_id", partnerId)
                    .order("created_at", { ascending: false })
                    .range(offset, offset + pageSize - 1)

                if (error) {
                    console.error("[getTransactionsCached] Error:", error)
                    return { data: [], totalCount: 0 }
                }

                return { data: data || [], totalCount }
            },
            // Cache key: partnerId + page. Structure allows future extension (e.g. filters, sort)
            [TAGS.transactions(partnerId), `page-${page}`],
            {
                tags: [TAGS.transactions(partnerId)]
            }
        )
        transactionsCacheMap.set(mapKey, cachedFn)
    }
    return cachedFn()
})
