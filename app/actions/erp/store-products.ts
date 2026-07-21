"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireStorePermission } from "@/lib/auth/authorization"
import { resolveProduct, listStoreProducts } from "@/lib/store-products"
import type { ResolvedProduct } from "@/lib/types/product"

const verifyAuth = async () => {
    const user = await requireUser()
    if (!user) throw new Error("Usuário não autenticado")
    return user
}

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
