"use server"

import { revalidateTag } from "next/cache"
import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { filterMarketplaceVisibleProducts, filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"
import { traceServerAction } from "@/lib/observability/request-trace"

// ─── Types ──────────────────────────────────────────────────────────────────

export type FavoriteItemType = "produto" | "servico" | "parceiro" | "loja"

interface ToggleFavoriteResult {
    success: boolean
    isFavorited: boolean
    error?: string
}

interface FavoriteItem {
    id: string
    item_id: string
    item_type: FavoriteItemType
    created_at: string
}

// ─── Toggle Favorite (Add or Remove) ────────────────────────────────────────

export async function toggleFavoriteAction(
    itemId: string,
    itemType: FavoriteItemType,
    storeId?: string
): Promise<ToggleFavoriteResult> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { success: false, isFavorited: false, error: "not_authenticated" }
        }

        // Validate item_type
        if (!["produto", "servico", "parceiro", "loja"].includes(itemType)) {
            return { success: false, isFavorited: false, error: "Tipo de item inválido" }
        }

        // Validate item existence
        const admin = getAdminClient()
        const tableName = itemType === "produto" ? "products" : itemType === "servico" ? "services" : "partners"
        let existenceQuery = admin
            .from(tableName)
            .select("id")
            .eq("id", itemId)
        if (storeId && (itemType === "produto" || itemType === "servico")) {
            existenceQuery = existenceQuery.eq("store_id", storeId)
        }
        const { data: itemExists } = await existenceQuery.maybeSingle()

        if (!itemExists) {
            return { success: false, isFavorited: false, error: "Item não encontrado" }
        }

        // Check if already favorited
        const { data: existing } = await admin
            .from("favorites")
            .select("id")
            .eq("user_id", user.id)
            .eq("item_id", itemId)
            .eq("item_type", itemType)
            .maybeSingle()

        const itemTag = itemType === "produto" ? `product-${itemId}` : itemType === "servico" ? `service-${itemId}` : `partner-${itemId}`

        if (existing) {
            // Remove favorite
            await admin
                .from("favorites")
                .delete()
                .eq("id", existing.id)

            revalidateTag(itemTag, "max")
            revalidateTag("marketplace-search", "max")
            revalidateTag("home-products", "max")

            return { success: true, isFavorited: false }
        } else {
            // Add favorite
            const { error: insertError } = await admin
                .from("favorites")
                .insert({
                    user_id: user.id,
                    item_id: itemId,
                    item_type: itemType,
                })

            if (insertError) {
                // Handle unique constraint violation (race condition)
                if (insertError.code === "23505") {
                    return { success: true, isFavorited: true }
                }
                console.error("[Favorites] Insert error:", insertError.message)
                return { success: false, isFavorited: false, error: "Erro ao adicionar favorito" }
            }

            revalidateTag(itemTag, "max")
            revalidateTag("marketplace-search", "max")
            revalidateTag("home-products", "max")

            return { success: true, isFavorited: true }
        }
    } catch (error) {
        console.error("[Favorites] Toggle error:", error)
        return { success: false, isFavorited: false, error: "Erro interno" }
    }
}

// ─── Get User Favorite IDs (for hydration) ──────────────────────────────────

export async function getUserFavoriteIdsAction(): Promise<{
    success: boolean
    favorites: { item_id: string; item_type: FavoriteItemType }[]
}> {
    try {
        await traceServerAction("favorites.getUserFavoriteIds")
        const user = await getCurrentUser()
        if (!user) {
            return { success: true, favorites: [] }
        }

        const admin = getAdminClient()
        const { data, error } = await admin
            .from("favorites")
            .select("item_id, item_type")
            .eq("user_id", user.id)

        if (error) {
            console.error("[Favorites] Fetch IDs error:", error.message)
            return { success: false, favorites: [] }
        }

        return {
            success: true,
            favorites: (data || []).map((f: any) => ({
                item_id: f.item_id,
                item_type: f.item_type as FavoriteItemType,
            })),
        }
    } catch (error) {
        console.error("[Favorites] Get IDs error:", error)
        return { success: false, favorites: [] }
    }
}

// ─── Get User Favorites with Item Data (for favorites page) ─────────────────

export async function getUserFavoritesAction(params?: {
    type?: "todos" | "produtos" | "servicos"
    page?: number
    pageSize?: number
    storeId?: string
}): Promise<{
    success: boolean
    items: any[]
    total: number
    error?: string
    counts?: { total: number; produtos: number; servicos: number }
}> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { success: false, items: [], total: 0, error: "not_authenticated" }
        }

        const admin = getAdminClient()
        const type = params?.type || "todos"

        // Build query for favorites
        let query = admin
            .from("favorites")
            .select("*", { count: "exact" })
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })

        if (type === "produtos") {
            query = query.eq("item_type", "produto")
        } else if (type === "servicos") {
            query = query.eq("item_type", "servico")
        }

        // Only apply range when explicit pagination params are provided
        if (params?.page && params?.pageSize) {
            const page = params.page
            const pageSize = params.pageSize
            const offset = (page - 1) * pageSize
            query = query.range(offset, offset + pageSize - 1)
        }

        const { data: favorites, error, count } = await query

        if (error) {
            console.error("[Favorites] Fetch error:", error.message)
            return { success: false, items: [], total: 0, error: "Erro ao carregar favoritos" }
        }

        if (!favorites || favorites.length === 0) {
            return { success: true, items: [], total: count || 0, counts: { total: 0, produtos: 0, servicos: 0 } }
        }

        // Batch fetch item data
        const productIds = favorites.filter((f: any) => f.item_type === "produto").map((f: any) => f.item_id)
        const serviceIds = favorites.filter((f: any) => f.item_type === "servico").map((f: any) => f.item_id)

        const storeId = params?.storeId

        const [productsRes, servicesRes] = await Promise.all([
            productIds.length > 0
                ? (() => {
                    let q = admin
                        .from("products")
                        .select(`
                            id, short_id, name, price, promotional_price, images, rating, is_active, show_in_marketplace,
                            stock_available, stock_quantity,
                            category_id, category:product_categories!category_id(name),
                            partners(id),
                            stores!inner(id, short_id, name, slug, description, logo_url, banner_url, phone, is_showcase_active, addresses!store_id!left(city, state, neighborhood)),
                            product_variants(variant_options, price_adjustment, is_active),
                            show_price_in_store
                        `)
                        .in("id", productIds)
                    if (storeId) q = q.eq("store_id", storeId)
                    return q
                  })()
                : Promise.resolve({ data: [] }),
            serviceIds.length > 0
                ? (() => {
                    let q = admin
                        .from("services")
                        .select(`
                            id, short_id, name, price, images, rating, is_active, billing_unit, price_type,
                            partners(id),
                            stores!inner(id, short_id, name, slug, description, logo_url, banner_url, phone, is_showcase_active, addresses!store_id!left(city, state, neighborhood)),
                            show_price_in_store
                        `)
                        .in("id", serviceIds)
                    if (storeId) q = q.eq("store_id", storeId)
                    return q
                  })()
                : Promise.resolve({ data: [] }),
        ])

        if (productsRes.data && productsRes.data.length > 0) {
          const visibleProductIds = await filterMarketplaceVisibleProducts(productsRes.data.map((p: any) => p.id))
          productsRes.data = productsRes.data.filter((p: any) => visibleProductIds.has(p.id))
        }
        if (servicesRes.data && servicesRes.data.length > 0) {
          const visibleServiceIds = await filterMarketplaceVisibleServices(servicesRes.data.map((s: any) => s.id))
          servicesRes.data = servicesRes.data.filter((s: any) => visibleServiceIds.has(s.id))
        }

        // Build lookup maps
        const productsMap = new Map<string, any>()
        const servicesMap = new Map<string, any>()

        if (productsRes.data) {
            for (const p of productsRes.data as any[]) {
                const rawPartner = Array.isArray(p.partners) ? p.partners[0] : p.partners
                const rawStore = Array.isArray(p.stores) ? p.stores[0] : p.stores
                const storeId = rawStore?.id || rawPartner?.id
                const storeName = rawStore?.name || "Vendedor"
                const storeImage = rawStore?.logo_url || rawPartner?.store_image_url
                const storeCity = rawStore?.addresses?.[0]?.city || rawPartner?.addresses?.[0]?.city || null
                const storeState = rawStore?.addresses?.[0]?.state || rawPartner?.addresses?.[0]?.state || null
                const storeNeighborhood = rawStore?.addresses?.[0]?.neighborhood || rawPartner?.addresses?.[0]?.neighborhood || null
                const partner = rawPartner
                    ? {
                        ...rawPartner,
                        store_id: storeId,
                        short_id: rawStore?.short_id || null,
                        slug: rawStore?.slug || null,
                        store_name: storeName,
                        store_image_url: storeImage,
                        store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                        city: storeCity,
                        state: storeState,
                        neighborhood: storeNeighborhood,
                    }
                    : null

                // Extract variant fallback
                const variants = p.product_variants || []
                const activeVariants = variants.filter((v: any) => v.is_active !== false)
                const withImage = activeVariants.find((v: any) => v.variant_options?.image) || variants.find((v: any) => v.variant_options?.image)
                const fallbackImage = withImage?.variant_options?.image || null
                const prices = (activeVariants.length > 0 ? activeVariants : variants)
                    .map((v: any) => Number(v.price_adjustment || 0))
                    .filter((pr: number) => pr > 0)
                const fallbackPrice = prices.length > 0 ? Math.min(...prices) : null

                const { product_variants, ...rest } = p
                const basePrice = Number(p.promotional_price || p.price || 0)
                const price = (!p.promotional_price && fallbackPrice)
                    ? Number(fallbackPrice)
                    : (basePrice > 0 ? basePrice : Number(fallbackPrice || 0))
                const originalPrice = p.promotional_price
                    ? (Number(p.price) > 0 ? Number(p.price) : (fallbackPrice ? Number(fallbackPrice) : undefined))
                    : undefined

                productsMap.set(p.id, {
                    ...rest,
                    short_id: p.short_id || null,
                    category: (p.category as any)?.name || null,
                    itemType: "produto",
                    partners: partner,
                    fallback_variant_price: fallbackPrice,
                    fallback_variant_image: fallbackImage,
                    originalPrice,
                    price,
                })
            }
        }

        if (servicesRes.data) {
            for (const s of servicesRes.data as any[]) {
                const rawPartner = Array.isArray(s.partners) ? s.partners[0] : s.partners
                const rawStore = Array.isArray(s.stores) ? s.stores[0] : s.stores
                const storeId = rawStore?.id || rawPartner?.id
                const storeName = rawStore?.name || "Vendedor"
                const storeImage = rawStore?.logo_url || rawPartner?.store_image_url
                const storeCity = rawStore?.addresses?.[0]?.city || rawPartner?.addresses?.[0]?.city || null
                const storeState = rawStore?.addresses?.[0]?.state || rawPartner?.addresses?.[0]?.state || null
                const storeNeighborhood = rawStore?.addresses?.[0]?.neighborhood || rawPartner?.addresses?.[0]?.neighborhood || null
                const partner = rawPartner
                    ? {
                        ...rawPartner,
                        store_id: storeId,
                        short_id: rawStore?.short_id || null,
                        slug: rawStore?.slug || null,
                        store_name: storeName,
                        store_image_url: storeImage,
                        store_avatar: storeImage || "https://img.dudit.com.br/static/Placeholder.png",
                        city: storeCity,
                        state: storeState,
                        neighborhood: storeNeighborhood,
                    }
                    : null

                servicesMap.set(s.id, {
                    ...s,
                    short_id: s.short_id || null,
                    itemType: "servico",
                    partners: partner,
                    price: Number(s.price),
                })
            }
        }

        // Merge favorites with item data, preserving order
        const items = favorites
            .map((fav: any) => {
                const itemData =
                    fav.item_type === "produto"
                        ? productsMap.get(fav.item_id)
                        : servicesMap.get(fav.item_id)

                if (!itemData) return null // Item was deleted

                return {
                    ...itemData,
                    favorited_at: fav.created_at,
                    favorite_id: fav.id,
                }
            })
            .filter(Boolean)

        // Compute accurate counts from items that actually exist
        const existingProdutos = items.filter((i: any) => i.itemType === "produto").length
        const existingServicos = items.filter((i: any) => i.itemType === "servico").length

        return {
            success: true,
            items,
            total: items.length,
            counts: {
                total: existingProdutos + existingServicos,
                produtos: existingProdutos,
                servicos: existingServicos,
            },
        }
    } catch (error) {
        console.error("[Favorites] Get favorites error:", error)
        return { success: false, items: [], total: 0, error: "Erro interno" }
    }
}

// ─── Get Favorites Count ────────────────────────────────────────────────────

export async function getFavoritesCountAction(storeId?: string): Promise<{
    total: number
    produtos: number
    servicos: number
}> {
    try {
        const user = await getCurrentUser()
        if (!user) return { total: 0, produtos: 0, servicos: 0 }

        const admin = getAdminClient()
        const { data, error } = await admin
            .from("favorites")
            .select("item_id, item_type")
            .eq("user_id", user.id)

        if (error || !data) return { total: 0, produtos: 0, servicos: 0 }

        // Only count items that still exist in their respective tables
        const produtoIds = data.filter((f: any) => f.item_type === "produto").map((f: any) => f.item_id)
        const servicoIds = data.filter((f: any) => f.item_type === "servico").map((f: any) => f.item_id)

        const [existingProducts, existingServices] = await Promise.all([
            produtoIds.length > 0
                ? (() => {
                    let q = admin.from("products").select("id").in("id", produtoIds)
                    if (storeId) q = q.eq("store_id", storeId)
                    return q
                  })()
                : Promise.resolve({ data: [] }),
            servicoIds.length > 0
                ? (() => {
                    let q = admin.from("services").select("id").in("id", servicoIds)
                    if (storeId) q = q.eq("store_id", storeId)
                    return q
                  })()
                : Promise.resolve({ data: [] }),
        ])

        const existingProdutoIds = new Set((existingProducts.data || []).map((p: any) => p.id))
        const existingServicoIds = new Set((existingServices.data || []).map((s: any) => s.id))

        const produtos = data.filter(
            (f: any) => f.item_type === "produto" && existingProdutoIds.has(f.item_id)
        ).length
        const servicos = data.filter(
            (f: any) => f.item_type === "servico" && existingServicoIds.has(f.item_id)
        ).length

        return { total: produtos + servicos, produtos, servicos }
    } catch {
        return { total: 0, produtos: 0, servicos: 0 }
    }
}
