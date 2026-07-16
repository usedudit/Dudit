"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireStorePermission } from "@/lib/auth/authorization"
import {
    resolveService,
    listStoreServices,
    linkServiceToStore,
    updateStoreServiceOverride,
    unlinkServiceFromStore,
    getServiceStoreLinks,
} from "@/lib/store-services"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import type { ResolvedService, StoreServiceOverride } from "@/lib/types/service"

const verifyAuth = async () => {
    const user = await requireUser()
    if (!user) throw new Error("Usuário não autenticado")
    return user
}

export async function getStoreServiceAction(
    serviceId: string,
    storeId: string,
    partnerId: string
): Promise<{ service: ResolvedService | null; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "view")

        const service = await resolveService(serviceId, storeId)
        return { service }
    } catch (error: any) {
        return { service: null, error: error.message }
    }
}

export async function listStoreServicesAction(
    partnerId: string,
    storeId: string,
    options?: {
        isActive?: boolean
        search?: string
        categoryId?: string
        limit?: number
        offset?: number
    }
): Promise<{ services: ResolvedService[]; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "view")

        const services = await listStoreServices(partnerId, storeId, options)
        return { services }
    } catch (error: any) {
        return { services: [], error: error.message }
    }
}

export async function listAllPartnerServicesAction(
    partnerId: string,
    options?: {
        isActive?: boolean
        search?: string
        limit?: number
        offset?: number
    }
): Promise<{ services: ResolvedService[]; error?: string }> {
    try {
        await verifyAuth()
        const { requirePermission } = await import("@/lib/permissions/access")
        await requirePermission(partnerId, "services", "view")

        const services = await listStoreServices(partnerId, null, options)
        return { services }
    } catch (error: any) {
        return { services: [], error: error.message }
    }
}

export async function linkServiceToStoreAction(
    serviceId: string,
    storeId: string,
    partnerId: string,
    overrides?: {
        override_price?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<{ success: boolean; override?: StoreServiceOverride; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "create")

        const override = await linkServiceToStore(serviceId, storeId, overrides)
        await invalidateProductCache(serviceId, partnerId, "update")

        return { success: true, override }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function updateStoreServiceOverrideAction(
    serviceId: string,
    storeId: string,
    partnerId: string,
    overrides: {
        override_price?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<{ success: boolean; override?: StoreServiceOverride; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "edit")

        const override = await updateStoreServiceOverride(serviceId, storeId, overrides)
        await invalidateProductCache(serviceId, partnerId, "update")

        return { success: true, override }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function unlinkServiceFromStoreAction(
    serviceId: string,
    storeId: string,
    partnerId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "delete")

        await unlinkServiceFromStore(serviceId, storeId)
        await invalidateProductCache(serviceId, partnerId, "delete")

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function getServiceStoreLinksAction(
    serviceId: string,
    partnerId: string
): Promise<{ links: StoreServiceOverride[]; error?: string }> {
    try {
        await verifyAuth()
        const { requirePermission } = await import("@/lib/permissions/access")
        await requirePermission(partnerId, "services", "view")

        const links = await getServiceStoreLinks(serviceId)
        return { links }
    } catch (error: any) {
        return { links: [], error: error.message }
    }
}

export async function batchLinkServicesToStoreAction(
    serviceIds: string[],
    storeId: string,
    partnerId: string,
    overrides?: {
        override_price?: number | null
        override_sku?: string | null
        is_active?: boolean | null
    }
): Promise<{ success: boolean; linked: number; errors: string[]; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "create")

        let linked = 0
        const errors: string[] = []

        for (const serviceId of serviceIds) {
            try {
                await linkServiceToStore(serviceId, storeId, overrides)
                await invalidateProductCache(serviceId, partnerId, "update")
                linked++
            } catch (e: any) {
                errors.push(`Serviço ${serviceId}: ${e.message}`)
            }
        }

        return { success: true, linked, errors }
    } catch (error: any) {
        return { success: false, linked: 0, errors: [], error: error.message }
    }
}

export async function batchUnlinkServicesFromStoreAction(
    serviceIds: string[],
    storeId: string,
    partnerId: string
): Promise<{ success: boolean; unlinked: number; errors: string[]; error?: string }> {
    try {
        await verifyAuth()
        await requireStorePermission(storeId, partnerId, "services", "delete")

        let unlinked = 0
        const errors: string[] = []

        for (const serviceId of serviceIds) {
            try {
                await unlinkServiceFromStore(serviceId, storeId)
                await invalidateProductCache(serviceId, partnerId, "delete")
                unlinked++
            } catch (e: any) {
                errors.push(`Serviço ${serviceId}: ${e.message}`)
            }
        }

        return { success: true, unlinked, errors }
    } catch (error: any) {
        return { success: false, unlinked: 0, errors: [], error: error.message }
    }
}
