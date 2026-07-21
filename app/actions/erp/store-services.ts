"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireStorePermission } from "@/lib/auth/authorization"
import { resolveService, listStoreServices } from "@/lib/store-services"
import type { ResolvedService } from "@/lib/types/service"

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
