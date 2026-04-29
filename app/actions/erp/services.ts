"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import type { ActionResponse } from "@/lib/types/action-response"
import { requireCSRF } from "@/lib/security/csrf-action-wrapper"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidatePath } from "next/cache"
import { syncToExploreRedis, removeFromExploreRedis } from "@/lib/redis-sync"

const getBrasiliaTime = () => new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString()

export type ERPServiceListCursor = { createdAt: string; id: string }

function buildServicesKeysetOrFilter(cursor: ERPServiceListCursor): string {
    const ts = cursor.createdAt
    const id = cursor.id
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_SERVICES_PAGE_SIZE = 100

export async function getERPServicesPageAction(
    partnerId: string,
    options?: { cursor?: ERPServiceListCursor | null; limit?: number },
): Promise<
    | { success: true; items: any[]; nextCursor: ERPServiceListCursor | null; hasMore: boolean }
    | { success: false; error: string }
> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "services", "view")
        const supabase = await getSupabaseServerClient()

        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_SERVICES_PAGE_SIZE))))
        const fetchLimit = limit + 1

        let q = supabase
            .from("services")
            .select("id, name, category_id, subcategory_id, price, cost_price, is_active, sku, images, unit, duration_minutes, created_at, description, service_categories!category_id(name)")
            .eq("partner_id", partnerId)

        if (cursor) {
            q = q.or(buildServicesKeysetOrFilter(cursor))
        }

        const { data, error } = await q
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit)

        if (error) throw error

        const rows = data || []
        const hasMore = rows.length > limit
        const items = hasMore ? rows.slice(0, limit) : rows
        const last = items[items.length - 1]
        const nextCursor: ERPServiceListCursor | null =
            hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

        return { success: true, items, nextCursor, hasMore }
    } catch (e: any) {
        return { success: false, error: e?.message || "Erro ao carregar serviços" }
    }
}

export async function getServiceWithDetailsAction(serviceId: string) {
    try {
        const user = await requireUser()
        if (!user) throw new Error("Não autenticado")
        const admin = getAdminClient()
        
        const { data: service, error } = await admin
            .from("services")
            .select("*")
            .eq("id", serviceId)
            .single()

        if (error || !service) throw new Error("Serviço não encontrado")
        await requirePartnerAccessWithPermission(service.partner_id, "services", "view", user)

        return { success: true, product: service } // Returned as product to match products form logic
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function createServiceAction(data: any): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        let finalPartnerId = data.partnerId
        if (!finalPartnerId) {
            const ctx = await getCurrentPartnerContext(user)
            if (ctx?.partnerId) finalPartnerId = ctx.partnerId
            else throw new Error("Acesso negado: ID do Parceiro não pôde ser resolvido.")
        }

        await requirePartnerAccessWithPermission(finalPartnerId, "services", "create", user)

        let finalStoreId = data.storeId
        if (!finalStoreId) {
            const admin = getAdminClient()
            const { data: stores } = await admin.from("stores").select("id").eq("partner_id", finalPartnerId).limit(1)
            if (stores && stores.length > 0) finalStoreId = stores[0].id
        }

        const supabase = await getSupabaseServerClient()
        const sku = data.sku?.trim() || generateSKUBase(data.name)

        const serviceData = {
            partner_id: finalPartnerId,
            store_id: finalStoreId,
            name: data.name,
            description: data.description || null,
            sku,
            brand: data.brand || null,
            category_id: data.category_id || data.categoryId || null,
            subcategory_id: data.subcategory_id || data.subcategoryId || null,
            unit: data.unit || 'Sessão',
            cost_price: data.costPrice || data.cost_price || 0,
            price: data.price || 0,
            price_type: data.price_type || data.priceType || 'fixed',
            billing_unit: data.billing_unit || data.billingUnit || 'per_service',
            duration_minutes: data.duration_minutes || data.durationMinutes || 60,
            buffer_minutes: data.buffer_minutes || data.bufferMinutes || 0,
            service_type: data.service_type || data.serviceType || 'in_person',
            show_in_marketplace: data.show_in_marketplace || data.showInMarketplace || false,
            highlight_service: data.highlight_service || data.highlightService || false,
            tags: data.tags || [],
            notes: data.notes || null,
            video_url: data.video_url || data.videoUrl || null,
            warranty: data.warranty || null,
            technical_details: data.technical_details || data.technicalDetails || null,
            resources: data.resources || [],
            assigned_staff: data.assigned_staff || data.assignedStaff || { all: true, staff_ids: [] },
            is_active: data.isActive !== false && data.is_active !== false,
            images: data.images || [],
            created_at: getBrasiliaTime(),
            updated_at: getBrasiliaTime(),
        }

        // Retry on unique constraint violation
        let inserted: any = null
        let insertError: any = null
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                serviceData.sku = generateSKUWithSuffix(sku, attempt)
            }
            const { data: result, error } = await supabase.from("services").insert(serviceData).select().single()
            if (!error) {
                inserted = result
                insertError = null
                break
            }
            if (error.message?.includes('unique') || error.code === '23505') {
                insertError = error
                continue
            }
            return errorResponse(error.message)
        }

        if (insertError) return errorResponse(insertError.message)
        
        revalidatePath("/erp/services")
        return successResponse(inserted)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function updateServiceAction(data: any): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const serviceId = data.productId || data.id // Allow compatibility with product form
        if (!serviceId) return errorResponse("ID do serviço não fornecido")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePartnerAccessWithPermission(existing.partner_id, "services", "edit", user)

        const supabase = await getSupabaseServerClient()
        const payload: any = { updated_at: getBrasiliaTime() }

        if (data.name !== undefined) payload.name = data.name
        if (data.description !== undefined) payload.description = data.description
        if (data.sku !== undefined) payload.sku = data.sku
        if (data.brand !== undefined) payload.brand = data.brand
        if (data.category_id !== undefined) payload.category_id = data.category_id
        if (data.categoryId !== undefined) payload.category_id = data.categoryId
        if (data.subcategory_id !== undefined) payload.subcategory_id = data.subcategory_id
        if (data.subcategoryId !== undefined) payload.subcategory_id = data.subcategoryId
        if (data.unit !== undefined) payload.unit = data.unit
        if (data.costPrice !== undefined) payload.cost_price = data.costPrice
        if (data.cost_price !== undefined) payload.cost_price = data.cost_price
        if (data.price !== undefined) payload.price = data.price
        if (data.price_type !== undefined) payload.price_type = data.price_type
        if (data.priceType !== undefined) payload.price_type = data.priceType
        if (data.billing_unit !== undefined) payload.billing_unit = data.billing_unit
        if (data.billingUnit !== undefined) payload.billing_unit = data.billingUnit
        if (data.duration_minutes !== undefined) payload.duration_minutes = data.duration_minutes
        if (data.durationMinutes !== undefined) payload.duration_minutes = data.durationMinutes
        if (data.buffer_minutes !== undefined) payload.buffer_minutes = data.buffer_minutes
        if (data.bufferMinutes !== undefined) payload.buffer_minutes = data.bufferMinutes
        if (data.service_type !== undefined) payload.service_type = data.service_type
        if (data.serviceType !== undefined) payload.service_type = data.serviceType
        if (data.show_in_marketplace !== undefined) payload.show_in_marketplace = data.show_in_marketplace
        if (data.showInMarketplace !== undefined) payload.show_in_marketplace = data.showInMarketplace
        if (data.highlight_service !== undefined) payload.highlight_service = data.highlight_service
        if (data.highlightService !== undefined) payload.highlight_service = data.highlightService
        if (data.tags !== undefined) payload.tags = data.tags
        if (data.notes !== undefined) payload.notes = data.notes
        if (data.video_url !== undefined) payload.video_url = data.video_url
        if (data.videoUrl !== undefined) payload.video_url = data.videoUrl
        if (data.warranty !== undefined) payload.warranty = data.warranty
        if (data.technical_details !== undefined) payload.technical_details = data.technical_details
        if (data.technicalDetails !== undefined) payload.technical_details = data.technicalDetails
        if (data.resources !== undefined) payload.resources = data.resources
        if (data.assigned_staff !== undefined) payload.assigned_staff = data.assigned_staff
        if (data.assignedStaff !== undefined) payload.assigned_staff = data.assignedStaff
        if (data.isActive !== undefined) payload.is_active = data.isActive
        if (data.is_active !== undefined) payload.is_active = data.is_active
        if (data.images !== undefined) payload.images = data.images

        const { data: updated, error } = await supabase.from("services").update(payload).eq("id", serviceId).select().single()
        if (error) return errorResponse(error.message)

        revalidatePath("/erp/services")
        return successResponse(updated)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function deleteServiceAction(serviceId: string): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePartnerAccessWithPermission(existing.partner_id, "services", "delete", user)

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase.from("services").delete().eq("id", serviceId)
        
        if (error) return errorResponse(error.message)

        revalidatePath("/erp/services")
        return successResponse({ deleted: true })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function deleteServicesInBatchAction(serviceIds: string[]): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        if (!serviceIds || serviceIds.length === 0) return errorResponse("Nenhum serviço selecionado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("id, partner_id").in("id", serviceIds)
        if (fetchError || !existing || existing.length === 0) return errorResponse("Serviços não encontrados")

        const partnerId = existing[0].partner_id
        if (existing.some((s: any) => s.partner_id !== partnerId)) return errorResponse("Serviços de múltiplos parceiros não permitidos")

        await requirePartnerAccessWithPermission(partnerId, "services", "delete", user)

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase.from("services").delete().in("id", serviceIds)
        
        if (error) return errorResponse(error.message)

        revalidatePath("/erp/services")
        return successResponse({ deletedCount: serviceIds.length })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function toggleServicesStatusAction(serviceIds: string[], isActive: boolean): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        if (!serviceIds || serviceIds.length === 0) return errorResponse("Nenhum serviço selecionado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("id, partner_id").in("id", serviceIds)
        if (fetchError || !existing || existing.length === 0) return errorResponse("Serviços não encontrados")

        const partnerId = existing[0].partner_id
        if (existing.some((s: any) => s.partner_id !== partnerId)) return errorResponse("Serviços de múltiplos parceiros não permitidos")

        await requirePartnerAccessWithPermission(partnerId, "services", "edit", user)

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase.from("services").update({ is_active: isActive }).in("id", serviceIds)
        
        if (error) return errorResponse(error.message)

        revalidatePath("/erp/services")
        return successResponse({ count: serviceIds.length })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function batchUpdateServicesAction(updates: any[]): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        if (!updates || updates.length === 0) return errorResponse("Nenhuma atualização enviada")

        const serviceIds = updates.map(u => u.id)
        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("id, partner_id").in("id", serviceIds)
        if (fetchError || !existing || existing.length === 0) return errorResponse("Serviços não encontrados")

        const partnerId = existing[0].partner_id
        if (existing.some((s: any) => s.partner_id !== partnerId)) return errorResponse("Serviços de múltiplos parceiros não permitidos")

        await requirePartnerAccessWithPermission(partnerId, "services", "edit", user)

        const supabase = await getSupabaseServerClient()

        const results = await Promise.all(updates.map(update => {
            const { id, ...data } = update
            return supabase.from("services").update(data).eq("id", id)
        }))

        const firstError = results.find(r => r.error)
        if (firstError) return errorResponse(firstError.error?.message || "Erro no batch update")

        revalidatePath("/erp/services")
        return successResponse({ count: updates.length })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function duplicateServiceAction(serviceId: string) {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const admin = getAdminClient()
        const { data: service, error: fetchError } = await admin.from("services").select("*").eq("id", serviceId).single()
        if (fetchError || !service) return errorResponse("Serviço não encontrado")

        await requirePartnerAccessWithPermission(service.partner_id, "services", "create", user)

        const supabase = await getSupabaseServerClient()

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, updated_at, service_code, ...serviceData } = service
        serviceData.name = `${service.name} (Cópia)`
        serviceData.sku = generateSKUBase(`${service.name} Copy`)

        let inserted: any = null
        let insertError: any = null
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                serviceData.sku = generateSKUWithSuffix(generateSKUBase(service.name + ' Copy'), attempt)
            }
            const { data: result, error } = await supabase.from("services").insert(serviceData).select().single()
            if (!error) {
                inserted = result
                insertError = null
                break
            }
            if (error.message?.includes('unique') || error.code === '23505') {
                insertError = error
                continue
            }
            return errorResponse(error.message)
        }

        if (insertError) return errorResponse(insertError.message)
        
        revalidatePath("/erp/services")
        return successResponse({ newServiceId: inserted.id, product: inserted })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}
