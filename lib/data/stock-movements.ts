import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

/**
 * Fetches all stock movements for a partner, including product and order details.
 * Uses unstable_cache for cross-request caching + React cache() for per-request deduplication.
 */
export const getStockMovementsCached = cache(async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
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
              products(id, name, sku, stock_quantity, images, category),
              orders(id, order_number)
            `)
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })
                .limit(100)

            return data
        },
        [TAGS.stockMovements(partnerId)],
        {
            tags: [TAGS.stockMovements(partnerId)],
            revalidate: 5
        }
    )()
})

