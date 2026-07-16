import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { Product, StoreProductOverride, ResolvedProduct } from "@/lib/types/product"
import type { ProductService } from "@/lib/services/product.service"

type RawProduct = Record<string, unknown>

/**
 * Resolve um produto para uma store específica, aplicando overrides.
 *
 * Fluxo:
 * 1. Busca o produto base em products (inclui joins de metadados)
 * 2. Busca o store_products para (product_id, store_id)
 * 3. Se existir store_products: mescla override fields com COALESCE
 * 4. Se não existir: usa os valores base do products
 *
 * Esta é a ÚNICA função de resolução de produtos por store.
 * Marketplace, PDV, Pedidos e futuras funcionalidades DEVEM
 * usar esta função, nunca fazer COALESCE manual.
 */
export async function resolveProduct(
    productId: string,
    storeId: string
): Promise<ResolvedProduct | null> {
    const supabase = createAdminClient()

    const [productRes, spRes] = await Promise.all([
        supabase
            .from("products")
            .select(`*, category:product_categories!category_id(name), subcategory:product_categories!subcategory_id(name), brand:brands!brand_id(name), location:storage_locations!location_id(name)`)
            .eq("id", productId)
            .maybeSingle(),
        supabase
            .from("store_products")
            .select("*")
            .eq("product_id", productId)
            .eq("store_id", storeId)
            .maybeSingle(),
    ])

    if (productRes.error || !productRes.data) return null

    const product = productRes.data as unknown as Product & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
        brand?: { name: string } | null
        location?: { name: string } | null
    }

    const override = spRes.data as StoreProductOverride | null

    return buildResolvedProduct(product, override)
}

/**
 * Lista produtos resolvidos para uma store específica.
 *
 * Usa LEFT JOIN único entre products e store_products para evitar N+1.
 * Produtos sem store_products também são retornados se existirem
 * (backward compatibility com produtos legados que têm store_id).
 *
 * @param partnerId - ID do partner
 * @param storeId - ID da store (se null, retorna todos os produtos do partner)
 * @param options - Opções de filtro/paginação
 */
export async function listStoreProducts(
    partnerId: string,
    storeId: string | null,
    options?: {
        isActive?: boolean
        search?: string
        categoryId?: string
        limit?: number
        offset?: number
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
            location:storage_locations!location_id(name),
            store_overrides:store_products!left(*)
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

    if (options?.isActive !== undefined) {
        query = query.eq("is_active", options.isActive)
    }

    if (options?.search) {
        query = query.ilike("name", `%${options.search}%`)
    }

    if (options?.categoryId) {
        query = query.eq("category_id", options.categoryId)
    }

    if (storeId) {
        query = query.filter("store_overrides.store_id", "eq", storeId)
    }

    const { data, error } = await query

    if (error || !data) return []

    return (data as RawProduct[]).map((row) => {
        const overrides = (row.store_overrides as RawProduct[] | null) || []
        const storeOverride = overrides[0] ? (overrides[0] as unknown as StoreProductOverride) : undefined

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
        delete (product as any).store_overrides

        return buildResolvedProduct(product, storeOverride || null)
    })
}

/**
 * Cria (ou atualiza) um vínculo de produto a uma store com overrides.
 * Idempotente: se já existir store_products para (product_id, store_id),
 * faz UPDATE dos overrides.
 */
export async function linkProductToStore(
    productId: string,
    storeId: string,
    overrides?: {
        override_price?: number | null
        override_stock_quantity?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<StoreProductOverride> {
    const supabase = createAdminClient()

    const payload: Record<string, unknown> = {
        product_id: productId,
        store_id: storeId,
        updated_at: new Date().toISOString(),
    }

    if (overrides?.override_price !== undefined) payload.override_price = overrides.override_price
    if (overrides?.override_stock_quantity !== undefined) payload.override_stock_quantity = overrides.override_stock_quantity
    if (overrides?.override_sku !== undefined) payload.override_sku = overrides.override_sku
    if (overrides?.is_active !== undefined) payload.is_active = overrides.is_active

    const { data, error } = await supabase
        .from("store_products")
        .upsert(payload, { onConflict: "product_id, store_id" })
        .select()
        .single()

    if (error || !data) {
        throw new Error(error?.message || "Erro ao vincular produto à loja")
    }

    return data as StoreProductOverride
}

/**
 * Atualiza os override fields de um store_products existente.
 * Lança erro se o vínculo não existir.
 */
export async function updateStoreProductOverride(
    productId: string,
    storeId: string,
    overrides: {
        override_price?: number | null
        override_stock_quantity?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<StoreProductOverride> {
    const supabase = createAdminClient()

    const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    }

    if (overrides.override_price !== undefined) payload.override_price = overrides.override_price
    if (overrides.override_stock_quantity !== undefined) payload.override_stock_quantity = overrides.override_stock_quantity
    if (overrides.override_sku !== undefined) payload.override_sku = overrides.override_sku
    if (overrides.is_active !== undefined) payload.is_active = overrides.is_active

    const { data, error } = await supabase
        .from("store_products")
        .update(payload)
        .eq("product_id", productId)
        .eq("store_id", storeId)
        .select()
        .single()

    if (error || !data) {
        throw new Error(error?.message || "Erro ao atualizar override do produto na loja")
    }

    return data as StoreProductOverride
}

/**
 * Remove o vínculo de um produto a uma store.
 * O produto base permanece inalterado.
 */
export async function unlinkProductFromStore(
    productId: string,
    storeId: string
): Promise<void> {
    const supabase = createAdminClient()

    const { error } = await supabase
        .from("store_products")
        .delete()
        .eq("product_id", productId)
        .eq("store_id", storeId)

    if (error) {
        throw new Error(error?.message || "Erro ao desvincular produto da loja")
    }
}

/**
 * Retorna todos os store_products para um produto (em todas as stores).
 */
export async function getProductStoreLinks(
    productId: string
): Promise<StoreProductOverride[]> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .eq("product_id", productId)

    if (error) return []
    return (data || []) as StoreProductOverride[]
}

/**
 * Verifica se um produto está vinculado a uma store específica.
 */
export async function isProductLinkedToStore(
    productId: string,
    storeId: string
): Promise<boolean> {
    const supabase = createAdminClient()

    const { data } = await supabase
        .from("store_products")
        .select("id")
        .eq("product_id", productId)
        .eq("store_id", storeId)
        .maybeSingle()

    return data !== null
}

/**
 * Constrói um ResolvedProduct a partir do produto base e do override (opcional).
 * Centraliza toda a lógica de COALESCE para evitar espalhamento pelo código.
 */
function buildResolvedProduct(
    product: Product & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
        brand?: { name: string } | null
        location?: { name: string } | null
    },
    override: StoreProductOverride | null
): ResolvedProduct {
    const hasOverride = override !== null

    return {
        ...product,
        category: (product.category as any)?.name ?? product.category ?? null,
        subcategory: (product.subcategory as any)?.name ?? product.subcategory ?? null,
        brand: (product.brand as any)?.name ?? product.brand ?? null,
        location: (product.location as any)?.name ?? product.location ?? null,
        resolved_price: hasOverride && override!.override_price !== null
            ? Number(override!.override_price)
            : Number(product.price),
        resolved_stock_quantity: hasOverride && override!.override_stock_quantity !== null
            ? override!.override_stock_quantity
            : product.stock_quantity,
        resolved_sku: hasOverride && override!.override_sku !== null
            ? override!.override_sku
            : product.sku,
        store_is_active: hasOverride
            ? override!.is_active !== false
            : product.is_active,
        store_product_id: hasOverride ? override!.id : null,
        has_store_override: hasOverride,
    }
}
