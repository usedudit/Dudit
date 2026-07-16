"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireStorePermission } from "@/lib/auth/authorization"
import {
    resolveProduct,
    listStoreProducts,
    linkProductToStore,
    updateStoreProductOverride,
    unlinkProductFromStore,
    getProductStoreLinks,
} from "@/lib/store-products"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import type { ResolvedProduct, StoreProductOverride } from "@/lib/types/product"

const verifyAuth = async () => {
    const user = await requireUser()
    if (!user) throw new Error("Usuário não autenticado")
    return user
}

/**
 * Retorna um produto resolvido para uma store específica.
 * Aplica overrides de store_products com COALESCE.
 */
export async function getStoreProductAction(
    productId: string,
    storeId: string,
    partnerId: string
): Promise<{ product: ResolvedProduct | null; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "view")

        const product = await resolveProduct(productId, storeId)
        return { product }
    } catch (error: any) {
        return { product: null, error: error.message }
    }
}

/**
 * Lista produtos resolvidos para uma store.
 * Usa LEFT JOIN único para evitar N+1.
 */
export async function listStoreProductsAction(
    partnerId: string,
    storeId: string,
    options?: {
        isActive?: boolean
        search?: string
        categoryId?: string
        limit?: number
        offset?: number
    }
): Promise<{ products: ResolvedProduct[]; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "view")

        const products = await listStoreProducts(partnerId, storeId, options)
        return { products }
    } catch (error: any) {
        return { products: [], error: error.message }
    }
}

/**
 * Lista todos os produtos do partner (sem filtro de store).
 * Usado para o catálogo global de produtos.
 */
export async function listAllPartnerProductsAction(
    partnerId: string,
    options?: {
        isActive?: boolean
        search?: string
        limit?: number
        offset?: number
    }
): Promise<{ products: ResolvedProduct[]; error?: string }> {
    try {
        await verifyAuth()
        const { requirePermission } = await import("@/lib/permissions/access")
        await requirePermission(partnerId, "products", "view")

        const products = await listStoreProducts(partnerId, null, options)
        return { products }
    } catch (error: any) {
        return { products: [], error: error.message }
    }
}

/**
 * Vincula um produto a uma store (cria store_products).
 * Se já existir, atualiza os overrides (idempotente).
 */
export async function linkProductToStoreAction(
    productId: string,
    storeId: string,
    partnerId: string,
    overrides?: {
        override_price?: number | null
        override_stock_quantity?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<{ success: boolean; override?: StoreProductOverride; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "create")

        const override = await linkProductToStore(productId, storeId, overrides)
        await invalidateProductCache(productId, partnerId, "update")

        return { success: true, override }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Atualiza os overrides de um produto em uma store.
 * Requer que o vínculo já exista.
 */
export async function updateStoreProductOverrideAction(
    productId: string,
    storeId: string,
    partnerId: string,
    overrides: {
        override_price?: number | null
        override_stock_quantity?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<{ success: boolean; override?: StoreProductOverride; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "edit")

        const override = await updateStoreProductOverride(productId, storeId, overrides)
        await invalidateProductCache(productId, partnerId, "update")

        return { success: true, override }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Remove o vínculo de um produto a uma store.
 * O produto base permanece inalterado.
 */
export async function unlinkProductFromStoreAction(
    productId: string,
    storeId: string,
    partnerId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "delete")

        await unlinkProductFromStore(productId, storeId)
        await invalidateProductCache(productId, partnerId, "delete")

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Retorna todas as stores às quais um produto está vinculado.
 */
export async function getProductStoreLinksAction(
    productId: string,
    partnerId: string
): Promise<{ links: StoreProductOverride[]; error?: string }> {
    try {
        await verifyAuth()
        const { requirePermission } = await import("@/lib/permissions/access")
        await requirePermission(partnerId, "products", "view")

        const links = await getProductStoreLinks(productId)
        return { links }
    } catch (error: any) {
        return { links: [], error: error.message }
    }
}

/**
 * Vincula múltiplos produtos a uma store em lote.
 */
export async function batchLinkProductsToStoreAction(
    productIds: string[],
    storeId: string,
    partnerId: string,
    overrides?: {
        override_price?: number | null
        override_stock_quantity?: number | null
        is_active?: boolean | null
    }
): Promise<{ success: boolean; linked: number; errors: string[]; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "create")

        let linked = 0
        const errors: string[] = []

        for (const productId of productIds) {
            try {
                await linkProductToStore(productId, storeId, overrides)
                await invalidateProductCache(productId, partnerId, "update")
                linked++
            } catch (e: any) {
                errors.push(`Produto ${productId}: ${e.message}`)
            }
        }

        return { success: true, linked, errors }
    } catch (error: any) {
        return { success: false, linked: 0, errors: [], error: error.message }
    }
}

/**
 * Remove o vínculo de múltiplos produtos de uma store em lote.
 */
export async function batchUnlinkProductsFromStoreAction(
    productIds: string[],
    storeId: string,
    partnerId: string
): Promise<{ success: boolean; unlinked: number; errors: string[]; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "products", "delete")

        let unlinked = 0
        const errors: string[] = []

        for (const productId of productIds) {
            try {
                await unlinkProductFromStore(productId, storeId)
                await invalidateProductCache(productId, partnerId, "delete")
                unlinked++
            } catch (e: any) {
                errors.push(`Produto ${productId}: ${e.message}`)
            }
        }

        return { success: true, unlinked, errors }
    } catch (error: any) {
        return { success: false, unlinked: 0, errors: [], error: error.message }
    }
}
