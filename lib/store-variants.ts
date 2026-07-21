import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { ProductVariant, ResolvedVariant } from "@/lib/types/product"

export async function listStoreProductVariants(
    productId: string,
    _storeId?: string | null,
    options?: { isActive?: boolean }
): Promise<ResolvedVariant[]> {
    const supabase = createAdminClient()

    let query = supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("variant_name", { ascending: true })

    if (options?.isActive !== undefined) {
        query = query.eq("is_active", options.isActive)
    }

    const { data, error } = await query
    if (error || !data) return []

    return (data as ProductVariant[]).map((v) => ({
        ...v,
        resolved_stock_quantity: v.stock_quantity,
        store_is_active: v.is_active,
        store_variant_id: null,
        has_store_override: false,
    }))
}

export async function listStoreProductVariantsBatch(
    productIds: string[],
    _storeId?: string | null,
    options?: { isActive?: boolean }
): Promise<Map<string, ResolvedVariant[]>> {
    if (productIds.length === 0) return new Map()

    const supabase = createAdminClient()

    let query = supabase
        .from("product_variants")
        .select("*")
        .in("product_id", productIds)
        .order("variant_name", { ascending: true })

    if (options?.isActive !== undefined) {
        query = query.eq("is_active", options.isActive)
    }

    const { data, error } = await query

    const result = new Map<string, ResolvedVariant[]>()
    if (error || !data) return result

    for (const row of data as ProductVariant[]) {
        const resolved: ResolvedVariant = {
            ...row,
            resolved_stock_quantity: row.stock_quantity,
            store_is_active: row.is_active,
            store_variant_id: null,
            has_store_override: false,
        }
        const pid = row.product_id
        if (!result.has(pid)) result.set(pid, [])
        result.get(pid)!.push(resolved)
    }

    return result
}
