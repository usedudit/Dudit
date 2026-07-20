import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all stock movements for a partner, including product and order details.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 */
const stockMovementsCacheMap = new Map<string, any>()

export const getStockMovementsCached = cache(async (partnerId: string, storeId: string, limit = 50) => {
    let cachedFn = stockMovementsCacheMap.get(`${partnerId}:${storeId}`)
    if (!cachedFn) {
        cachedFn = unstable_cache(
            async () => {
                const supabase = getAdminClient()
                const { data } = await supabase
                    .from("stock_movements")
                    .select(`
                  id,
                  partner_id,
                  order_id,
                  movement_type,
                  reference_type,
                  reference_name,
                  reason,
                  notes,
                  created_at,
                  created_by,
                  orders(id, order_number),
                  stock_movement_items(id, product_id, quantity, previous_quantity, new_quantity, products(name, sku))
                `)
                    .eq("partner_id", partnerId)
                    .order("created_at", { ascending: false })
                    .limit(100)

                return data
            },
            [TAGS.stockMovements(partnerId), storeId, String(limit)],
            {
                tags: [TAGS.stockMovements(partnerId)]
            }
        )
        stockMovementsCacheMap.set(`${partnerId}:${storeId}`, cachedFn)
    }
    return cachedFn(partnerId, storeId, limit)
})
