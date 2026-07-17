import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { ProductVariant, StoreVariantOverride, ResolvedVariant } from "@/lib/types/product"

/**
 * Resolve uma variante para uma store específica, aplicando overrides.
 *
 * 1. Busca a variante base em product_variants
 * 2. Busca o store_product_variants para (variant_id, store_id)
 * 3. Se existir: mescla override fields com COALESCE
 * 4. Se não existir: usa os valores base
 */
export async function resolveVariant(
    variantId: string,
    storeId: string
): Promise<ResolvedVariant | null> {
    const supabase = createAdminClient()

    const [variantRes, spvRes] = await Promise.all([
        supabase
            .from("product_variants")
            .select("*")
            .eq("id", variantId)
            .maybeSingle(),
        supabase
            .from("store_product_variants")
            .select("*")
            .eq("variant_id", variantId)
            .eq("store_id", storeId)
            .maybeSingle(),
    ])

    if (variantRes.error || !variantRes.data) return null

    const variant = variantRes.data as unknown as ProductVariant
    const override = spvRes.data as StoreVariantOverride | null

    return buildResolvedVariant(variant, override)
}

/**
 * Lista variantes de um produto, resolvidas para uma store específica.
 * Usa LEFT JOIN entre product_variants e store_product_variants.
 */
export async function listStoreProductVariants(
    productId: string,
    storeId: string | null,
    options?: {
        isActive?: boolean
    }
): Promise<ResolvedVariant[]> {
    const supabase = createAdminClient()

    let query = supabase
        .from("product_variants")
        .select(`
            *,
            store_overrides:store_product_variants!left(
                id, override_stock_quantity, is_active, stock_reserved, stock_available
            )
        `)
        .eq("product_id", productId)
        .order("variant_name", { ascending: true })

    if (options?.isActive !== undefined) {
        query = query.eq("is_active", options.isActive)
    }

    if (storeId) {
        query = query.filter("store_overrides.store_id", "eq", storeId)
    }

    const { data, error } = await query

    if (error || !data) return []

    return (data as any[]).map((row) => {
        const overrides = (row.store_overrides as any[] | null) || []
        const storeOverride = overrides[0] ? (overrides[0] as unknown as StoreVariantOverride) : undefined

        const variant = { ...row } as unknown as ProductVariant
        delete (variant as any).store_overrides

        return buildResolvedVariant(variant, storeOverride || null)
    })
}

/**
 * Constrói um ResolvedVariant a partir da variante base e do override (opcional).
 * Centraliza toda a lógica de COALESCE.
 */
function buildResolvedVariant(
    variant: ProductVariant,
    override: StoreVariantOverride | null
): ResolvedVariant {
    const hasOverride = override !== null

    return {
        ...variant,
        resolved_stock_quantity: hasOverride && override!.override_stock_quantity !== null
            ? override!.override_stock_quantity
            : variant.stock_quantity,
        store_is_active: hasOverride
            ? override!.is_active !== false
            : variant.is_active,
        store_variant_id: hasOverride ? override!.id : null,
        has_store_override: hasOverride,
    }
}
