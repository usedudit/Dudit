import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { Product, ResolvedProduct } from "@/lib/types/product"
import { listStoreProductVariantsBatch } from "@/lib/store-variants"

type RawProduct = Record<string, unknown>

function buildResolvedProduct(
    product: Product & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
        brand?: { name: string } | null
        location?: { name: string } | null
    }
): ResolvedProduct {
    return {
        ...product,
        category: (product.category as any)?.name ?? product.category ?? null,
        subcategory: (product.subcategory as any)?.name ?? product.subcategory ?? null,
        brand: (product.brand as any)?.name ?? product.brand ?? null,
        location: (product.location as any)?.name ?? product.location ?? null,
        resolved_price: Number(product.price),
        resolved_stock_quantity: product.stock_quantity,
        resolved_sku: product.sku,
        store_is_active: product.is_active,
        store_product_id: null,
        has_store_override: false,
        visibility_scope: 'exclusive' as const,
        marketplace_visible: product.show_in_marketplace ?? true,
    }
}

export async function resolveProduct(
    productId: string,
    storeId: string
): Promise<ResolvedProduct | null> {
    const supabase = createAdminClient()

    const { data: product, error } = await supabase
        .from("products")
        .select(`*, category:product_categories!category_id(name), subcategory:product_categories!subcategory_id(name), brand:brands!brand_id(name), location:storage_locations!location_id(name)`)
        .eq("id", productId)
        .eq("store_id", storeId)
        .maybeSingle()

    if (error || !product) return null

    return buildResolvedProduct(product as unknown as Product & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
        brand?: { name: string } | null
        location?: { name: string } | null
    })
}

export async function listStoreProducts(
    partnerId: string,
    storeId: string | null,
    options?: {
        isActive?: boolean
        search?: string
        categoryId?: string
        limit?: number
        offset?: number
        includeVariants?: boolean
    }
): Promise<ResolvedProduct[]> {
    const supabase = createAdminClient()

    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0

    let query = supabase
        .from("products")
        .select(`
            *,
            category:product_categories!category_id(name),
            subcategory:product_categories!subcategory_id(name),
            brand:brands!brand_id(name),
            location:storage_locations!location_id(name)
        `)
        .eq("partner_id", partnerId)
        .order("marketplace_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

    if (storeId) {
        query = query.eq("store_id", storeId)
    }

    if (options?.isActive !== undefined) {
        query = query.eq("status", options.isActive ? "ativo" : "inativo")
    }

    if (options?.search) {
        query = query.ilike("name", `%${options.search}%`)
    }

    if (options?.categoryId) {
        query = query.eq("category_id", options.categoryId)
    }

    const { data, error } = await query

    if (error || !data) return []

    const products = (data as RawProduct[]).map((row) => {
        const product = { ...row } as unknown as Product & {
            category?: { name: string } | null
            subcategory?: { name: string } | null
            brand?: { name: string } | null
            location?: { name: string } | null
        }

        if (product.category?.name) product.category = product.category.name as any
        if (product.subcategory?.name) product.subcategory = product.subcategory.name as any
        if (product.brand?.name) product.brand = product.brand.name as any
        if (product.location?.name) product.location = product.location.name as any

        return buildResolvedProduct(product)
    })

    if (options?.includeVariants && storeId && products.length > 0) {
        const productIds = products.map((p) => p.id)
        const variantsByProduct = await listStoreProductVariantsBatch(productIds, storeId, { isActive: true })

        return products.map((p) => ({
            ...p,
            variants: variantsByProduct.get(p.id) || [],
        }))
    }

    return products
}
