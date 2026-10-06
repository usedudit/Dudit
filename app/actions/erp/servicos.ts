"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import type { ActionResponse } from "@/lib/types/action-response"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { revalidatePath } from "next/cache"
import { revalidateServices } from "@/lib/utils/revalidation"
import { syncToExploreRedis, removeFromExploreRedis } from "@/lib/redis-sync"
import { incrementCacheVersion } from "@/lib/cache/invalidation"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import { EMPTY_VIDEO_METADATA, normalizeVideoMetadata } from "@/lib/video/shared"
import { ALLOWED_VIDEO_MIME_TYPES, MAX_FILE_SIZE, MAX_VIDEO_FILE_SIZE, R2_PREFIXES } from "@/lib/r2/config"
import { buildSoftDeletePayload, buildRestorePayload, buildArchivePayload, scopeActiveOnly, scopeArchivedOnly, scopeWithArchived } from "@/lib/supabase/query-helpers"
import { checkLimit } from "@/lib/services/subscription.service"
import { logAuditEvent } from "@/lib/services/timeline.service"

import { headers } from "next/headers"

const getBrasiliaTime = () => new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString()

const assertUploadVideoOwnership = async (video: any, userId: string, itemId: string) => {
    if (video.video_type !== "upload") return
    const getKey = (url: string) => {
        try {
            return url.startsWith("http") ? new URL(url).pathname.replace(/^\/+/, "") : url
        } catch {
            throw new Error("URL de vídeo inválida")
        }
    }
    const expectedPrefix = `users/${userId}/services/${itemId}`
    const videoKey = getKey(video.video_url || "")
    const thumbnailKey = getKey(video.video_thumbnail || "")
    if (!videoKey.startsWith(`${expectedPrefix}.`) || thumbnailKey !== `${expectedPrefix}-thumbnail.jpg`) {
        throw new Error("URL de vídeo não pertence a este serviço")
    }
    const { getFileMetadataFromR2 } = await import("@/lib/r2/server")
    const [videoObject, thumbnailObject] = await Promise.all([
        getFileMetadataFromR2(videoKey),
        getFileMetadataFromR2(thumbnailKey),
    ])
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(videoObject.contentType as any) || videoObject.contentLength > MAX_VIDEO_FILE_SIZE) {
        throw new Error("Vídeo excede limite")
    }
    if (thumbnailObject.contentType !== "image/jpeg" || thumbnailObject.contentLength > MAX_FILE_SIZE) {
        throw new Error("Miniatura do vídeo inválida")
    }
}

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
    options?: { cursor?: ERPServiceListCursor | null; limit?: number; filters?: any; storeId?: string },
): Promise<
    | { success: true; items: any[]; nextCursor: ERPServiceListCursor | null; hasMore: boolean }
    | { success: false; error: string }
> {
    try {
        // await requireMinimumPlan(partnerId, "crescer")
        await requirePermission(partnerId, "services", "view")
        if (options?.storeId) {
            await requireStorePermission(options.storeId, partnerId, "services", "view")
        }

        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_SERVICES_PAGE_SIZE))))
        const fetchLimit = limit + 1

        const filterKey = options?.filters?.status || options?.filters?.tab || (options?.filters?.includeArchived ? "all" : "active")
        const rows = await getCachedErpPage(
            ["erp-services-page", partnerId, options?.storeId || "all-stores", cursor ? `${cursor.createdAt}:${cursor.id}` : "first", String(limit), String(filterKey)],
            [TAGS.services(partnerId)],
            async () => {
                const supabase = getAdminClient()
                let q = supabase
                    .from("services")
                    .select("id, short_id, store_id, name, category_id, subcategory_id, price, cost_price, is_active, status, sku, images, unit, duration_minutes, created_at, description, service_categories!category_id(name)")
                    .eq("partner_id", partnerId)
                if (options?.storeId) q = q.or(`store_id.eq.${options.storeId},store_id.is.null`)
                if (options?.filters?.status === "archived" || options?.filters?.tab === "archived" || options?.filters?.status === "arquivado") {
                    q = scopeArchivedOnly(q)
                } else if (!options?.filters?.includeArchived) {
                    q = scopeActiveOnly(q)
                } else {
                    q = scopeWithArchived(q)
                }
                if (cursor) q = q.or(buildServicesKeysetOrFilter(cursor))
                const { data, error } = await q
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .limit(fetchLimit)
                if (error) throw error
                return data || []
            },
            30,
        )
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
        // await requireMinimumPlan(service.partner_id, "crescer")
        await requirePermission(service.partner_id, "services", "view", user)

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
        const ctx = await getCurrentPartnerContext(user)
        if (!finalPartnerId) {
            if (ctx?.partnerId) finalPartnerId = ctx.partnerId
            else throw new Error("Acesso negado: ID do Parceiro não pôde ser resolvido.")
        }

        await requirePermission(finalPartnerId, "services", "create", user)

        const servicesLimitCheck = await checkLimit(finalPartnerId, "services")
        if (!servicesLimitCheck.allowed) {
            return errorResponse(servicesLimitCheck.message || "Seu plano não permite criar mais serviços.")
        }

        let finalStoreId = data.storeId
        if (!finalStoreId) {
            const admin = getAdminClient()
            const { data: stores } = await admin.from("stores").select("id").eq("partner_id", finalPartnerId).limit(1)
            if (stores && stores.length > 0) finalStoreId = stores[0].id
        }

        const supabase = await getSupabaseServerClient()
        const sku = data.sku?.trim() || generateSKUBase(data.name)
        const businessInfo = normalizeBusinessInfo(ctx?.businessInfo)
        const isQuick = businessInfo.mode === "quick"

        const videoMetadata = await normalizeVideoMetadata({
            video_type: data.video_type || data.videoType || (data.video_url || data.videoUrl ? "youtube" : null),
            video_url: data.video_url || data.videoUrl || null,
            video_thumbnail: data.video_thumbnail || data.videoThumbnail || null,
            video_duration: data.video_duration || data.videoDuration || null,
            video_provider_id: data.video_provider_id || data.videoProviderId || null,
        })

        // Duplicata: clona imagens e vídeos para arquivos independentes no R2,
        // para que excluir a mídia do serviço original não afete as cópias.
        if (data.isDuplicate) {
            const { cloneMediaForDuplicate } = await import("@/lib/r2/server")
            const cloned = await cloneMediaForDuplicate(
                {
                    images: data.images,
                    video_type: videoMetadata.video_type,
                    video_url: videoMetadata.video_url,
                    video_thumbnail: videoMetadata.video_thumbnail,
                },
                user.id,
                R2_PREFIXES.services,
                { itemId: data.id }
            )
            data.images = cloned.images || []
            videoMetadata.video_url = cloned.video_url
            videoMetadata.video_thumbnail = cloned.video_thumbnail
        }

        if (videoMetadata.video_type === "upload" && !data.id) throw new Error("ID do serviço é obrigatório para upload de vídeo")
        if (data.id) await assertUploadVideoOwnership(videoMetadata, user.id, data.id)

        const admin = getAdminClient()

        let finalServicePrice = data.price
        const numServiceCost = Number(data.costPrice || data.cost_price || 0)
        if ((finalServicePrice === undefined || finalServicePrice === null || Number(finalServicePrice) === 0) && numServiceCost > 0) {
            try {
                const { data: partnerRec } = await admin.from("partners").select("business_info").eq("id", finalPartnerId).single()
                const defaultMargin = partnerRec?.business_info?.salesSettings?.defaultProfitMarginPercent
                if (typeof defaultMargin === "number" && defaultMargin > 0) {
                    finalServicePrice = Math.round(numServiceCost * (1 + defaultMargin / 100) * 100) / 100
                }
            } catch {
                // ignore
            }
        }

        const serviceData: any = {
            ...(data.id ? { id: data.id } : {}),
            partner_id: finalPartnerId,
            store_id: finalStoreId,
            name: sanitizeInput(data.name, 150),
            description: data.description || null,
            sku,
            brand: data.brand || null,
            category_id: data.category_id || data.categoryId || null,
            subcategory_id: data.subcategory_id || data.subcategoryId || null,
            unit: data.unit || 'Sessão',
            cost_price: data.costPrice || data.cost_price || 0,
            price: finalServicePrice || 0,
            promotional_price: data.promotional_price ?? data.promotionalPrice ?? null,
            price_type: data.price_type || data.priceType || 'fixed',
            billing_unit: data.billing_unit || data.billingUnit || 'per_service',
            duration_minutes: (() => {
                const dur = Math.max(1, Number(data.duration_minutes || data.durationMinutes || 60));
                if (dur > 525600) {
                    throw new Error("A duração do serviço não pode exceder 1 ano (525.600 minutos).");
                }
                return dur;
            })(),
            buffer_minutes: data.buffer_minutes || data.bufferMinutes || 0,
            service_type: data.service_type || data.serviceType || 'in_person',
            show_in_marketplace: isQuick
                ? (data.show_in_marketplace !== undefined ? data.show_in_marketplace : (data.showInMarketplace !== undefined ? data.showInMarketplace : true))
                : (data.show_in_marketplace ?? data.showInMarketplace ?? true),
            show_price_in_store: data.show_price_in_store !== false && data.showPriceInStore !== false,
            marketplace_category_id: data.marketplace_category_id || data.marketplaceCategoryId || null,
            tags: data.tags || [],
            notes: sanitizeNotes(data.notes),
            video_type: videoMetadata.video_type,
            video_url: videoMetadata.video_url,
            video_thumbnail: videoMetadata.video_thumbnail,
            video_duration: videoMetadata.video_duration,
            video_provider_id: videoMetadata.video_provider_id,
            warranty: data.warranty || null,
            technical_details: data.technical_details || data.technicalDetails || null,
            resources: data.resources || [],
            assigned_staff: data.assigned_staff || { all: true, staff_ids: [] },
            status: (data.isActive !== false && data.is_active !== false) ? "ativo" : "inativo",
            fulfillment_modes: Array.isArray(data.fulfillment_modes)
                ? data.fulfillment_modes
                : data.fulfillmentModes || ["on_site"],
            payment_requirement: data.payment_requirement || data.paymentRequirement || "full_payment",
            images: data.images || [],
            is_unavailable_type: data.isUnavailableType || data.is_unavailable_type || false,
            moderation_status: data.requiresManualModeration || data.requires_manual_moderation ? 'pending_moderation' : 'approved',
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

        if (inserted?.id) await syncToExploreRedis({ id: inserted.id, type: "servico", data: {}, silent: true })
        await revalidateServices(finalPartnerId, inserted?.id)
        revalidatePath("/erp/servicos")
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
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id, video_type, video_url, video_thumbnail").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePermission(existing.partner_id, "services", "edit", user)

        const supabase = await getSupabaseServerClient()
        const payload: any = { updated_at: getBrasiliaTime() }

        if (data.name !== undefined) payload.name = sanitizeInput(data.name, 150)
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
        if (data.promotional_price !== undefined) payload.promotional_price = data.promotional_price
        if (data.promotionalPrice !== undefined) payload.promotional_price = data.promotionalPrice
        if (data.price_type !== undefined) payload.price_type = data.price_type
        if (data.priceType !== undefined) payload.price_type = data.priceType
        if (data.billing_unit !== undefined) payload.billing_unit = data.billing_unit
        if (data.billingUnit !== undefined) payload.billing_unit = data.billingUnit
        if (data.duration_minutes !== undefined || data.durationMinutes !== undefined) {
            const dur = Math.max(1, Number(data.duration_minutes !== undefined ? data.duration_minutes : data.durationMinutes));
            if (dur > 525600) {
                return errorResponse("A duração do serviço não pode exceder 1 ano (525.600 minutos).");
            }
            payload.duration_minutes = dur;
        }
        if (data.buffer_minutes !== undefined) payload.buffer_minutes = data.buffer_minutes
        if (data.bufferMinutes !== undefined) payload.buffer_minutes = data.bufferMinutes
        if (data.service_type !== undefined) payload.service_type = data.service_type
        if (data.serviceType !== undefined) payload.service_type = data.serviceType
        if (data.show_in_marketplace !== undefined) payload.show_in_marketplace = data.show_in_marketplace
        if (data.showInMarketplace !== undefined) payload.show_in_marketplace = data.showInMarketplace
        if (data.tags !== undefined) payload.tags = data.tags
        if (data.notes !== undefined) payload.notes = sanitizeNotes(data.notes)
        if (
            data.video_type !== undefined ||
            data.videoType !== undefined ||
            data.video_url !== undefined ||
            data.videoUrl !== undefined ||
            data.video_thumbnail !== undefined ||
            data.videoThumbnail !== undefined ||
            data.video_duration !== undefined ||
            data.videoDuration !== undefined ||
            data.video_provider_id !== undefined ||
            data.videoProviderId !== undefined
        ) {
            const videoMetadata = (data.video_type || data.videoType)
                ? await normalizeVideoMetadata({
                    video_type: data.video_type || data.videoType,
                    video_url: data.video_url || data.videoUrl || null,
                    video_thumbnail: data.video_thumbnail || data.videoThumbnail || null,
                    video_duration: data.video_duration || data.videoDuration || null,
                    video_provider_id: data.video_provider_id || data.videoProviderId || null,
                })
                : EMPTY_VIDEO_METADATA
            if (videoMetadata.video_type === "upload") {
                await assertUploadVideoOwnership(videoMetadata, user.id, serviceId)
            }
            payload.video_type = videoMetadata.video_type
            payload.video_url = videoMetadata.video_url
            payload.video_thumbnail = videoMetadata.video_thumbnail
            payload.video_duration = videoMetadata.video_duration
            payload.video_provider_id = videoMetadata.video_provider_id
        }
        if (data.warranty !== undefined) payload.warranty = data.warranty
        if (data.technical_details !== undefined) payload.technical_details = data.technical_details
        if (data.technicalDetails !== undefined) payload.technical_details = data.technicalDetails
        if (data.resources !== undefined) payload.resources = data.resources
        if (data.assigned_staff !== undefined) payload.assigned_staff = data.assigned_staff
        if (data.isActive !== undefined) {
            payload.status = data.isActive ? "ativo" : "inativo"
        }
        if (data.is_active !== undefined) {
            payload.status = data.is_active ? "ativo" : "inativo"
        }
        if (data.marketplace_category_id !== undefined) payload.marketplace_category_id = data.marketplace_category_id
        if (data.marketplaceCategoryId !== undefined) payload.marketplace_category_id = data.marketplaceCategoryId
        if (data.fulfillment_modes !== undefined) payload.fulfillment_modes = data.fulfillment_modes
        if (data.fulfillmentModes !== undefined) payload.fulfillment_modes = data.fulfillmentModes
        if (data.payment_requirement !== undefined) payload.payment_requirement = data.payment_requirement
        if (data.paymentRequirement !== undefined) payload.payment_requirement = data.paymentRequirement
        if (data.show_price_in_store !== undefined) payload.show_price_in_store = data.show_price_in_store
        if (data.showPriceInStore !== undefined) payload.show_price_in_store = data.showPriceInStore
        if (data.requiresManualModeration || data.requires_manual_moderation) {
            payload.moderation_status = 'pending_moderation'
        }

        const { data: updated, error } = await supabase.from("services").update(payload).eq("id", serviceId).select().single()
        if (error) return errorResponse(error.message)

        if (
            existing.video_type === "upload" &&
            payload.video_url !== undefined &&
            existing.video_url &&
            existing.video_url !== payload.video_url
        ) {
            const { extractKeyFromR2Url, deleteFileFromR2 } = await import("@/lib/r2/server")
            const cleanup = [existing.video_url, existing.video_thumbnail].filter(Boolean).map(async (url: string) => {
                const key = url.startsWith("http") ? extractKeyFromR2Url(url) : url
                if (key) await deleteFileFromR2(key)
            })
            Promise.all(cleanup).catch(console.error)
        }

        await syncToExploreRedis({ id: serviceId, type: "servico", data: {}, silent: true })
        await incrementCacheVersion()
        await revalidateServices(existing.partner_id, serviceId)
        revalidatePath("/erp/servicos")
        return successResponse(updated)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function deleteServiceAction(serviceId: string, reason?: string | null): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id, sku, name").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePermission(existing.partner_id, "services", "delete", user)

        // 1. Soft delete update payload
        const payload = buildSoftDeletePayload(user.id, reason)
        const { error } = await admin.from("services").update(payload).eq("id", serviceId)
        if (error) return errorResponse(error.message)

        await removeFromExploreRedis(serviceId, "servico", true)

        // 2. Fetch IP and write to audit logs (logAuditEvent)
        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: existing.partner_id,
            actorUserId: user.id,
            entityType: "service",
            entityId: serviceId,
            actionType: "deleted",
            changeLines: [`Deletou o serviço: ${existing.name} (SKU: ${existing.sku || 'N/A'})`],
            metadata: {
                ip_address: ip,
                deleted_reason: reason || "Nenhum motivo informado",
                name: existing.name,
                sku: existing.sku
            },
            source: "manual"
        })

        await revalidateServices(existing.partner_id, serviceId)
        revalidatePath("/erp/servicos")
        return successResponse({ deleted: true })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function restoreServiceAction(serviceId: string): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id, sku, name").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePermission(existing.partner_id, "services", "edit", user)

        const payload = buildRestorePayload("ativo")
        const { error } = await admin.from("services").update(payload).eq("id", serviceId)
        if (error) return errorResponse(error.message)

        await syncToExploreRedis({ id: serviceId, type: "servico", data: {}, silent: true })

        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: existing.partner_id,
            actorUserId: user.id,
            entityType: "service",
            entityId: serviceId,
            actionType: "restored",
            changeLines: [`Restaurou o serviço: ${existing.name} (SKU: ${existing.sku || 'N/A'})`],
            metadata: {
                ip_address: ip,
                name: existing.name,
                sku: existing.sku
            },
            source: "manual"
        })

        await revalidateServices(existing.partner_id, serviceId)
        revalidatePath("/erp/servicos")
        return successResponse({ restored: true })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function archiveServiceAction(serviceId: string): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id, sku, name").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePermission(existing.partner_id, "services", "edit", user)

        const payload = buildArchivePayload("arquivado")
        const { error } = await admin.from("services").update(payload).eq("id", serviceId)
        if (error) return errorResponse(error.message)

        await syncToExploreRedis({ id: serviceId, type: "servico", data: {}, silent: true })

        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: existing.partner_id,
            actorUserId: user.id,
            entityType: "service",
            entityId: serviceId,
            actionType: "updated",
            changeLines: [`Arquivou o serviço: ${existing.name} (SKU: ${existing.sku || 'N/A'})`],
            metadata: { ip_address: ip, name: existing.name, sku: existing.sku },
            source: "manual"
        })

        await removeFromExploreRedis(serviceId, "servico")
        await revalidateServices(existing.partner_id, serviceId)
        revalidatePath("/erp/servicos")
        return successResponse({ archived: true })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function unarchiveServiceAction(serviceId: string): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("partner_id, sku, name").eq("id", serviceId).single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        await requirePermission(existing.partner_id, "services", "edit", user)

        const limitCheck = await checkLimit(existing.partner_id, "services")
        if (!limitCheck.allowed) {
            return errorResponse(limitCheck.message || "Limite de serviços do seu plano atingido. Faça upgrade para reativar este item.")
        }

        const payload = buildRestorePayload("ativo")
        const { error } = await admin.from("services").update(payload).eq("id", serviceId)
        if (error) return errorResponse(error.message)

        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: existing.partner_id,
            actorUserId: user.id,
            entityType: "service",
            entityId: serviceId,
            actionType: "updated",
            changeLines: [`Desarquivou/Reativou o serviço: ${existing.name} (SKU: ${existing.sku || 'N/A'})`],
            metadata: { ip_address: ip, name: existing.name, sku: existing.sku },
            source: "manual"
        })

        await revalidateServices(existing.partner_id, serviceId)
        revalidatePath("/erp/servicos")
        return successResponse({ restored: true })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function deleteServicesInBatchAction(serviceIds: string[], reason?: string | null): Promise<ActionResponse<any>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        if (!serviceIds || serviceIds.length === 0) return errorResponse("Nenhum serviço selecionado")

        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin.from("services").select("id, partner_id, name, sku").in("id", serviceIds)
        if (fetchError || !existing || existing.length === 0) return errorResponse("Serviços não encontrados")

        const partnerId = existing[0].partner_id
        if (existing.some((s: any) => s.partner_id !== partnerId)) return errorResponse("Serviços de múltiplos parceiros não permitidos")

        await requirePermission(partnerId, "services", "delete", user)

        // 1. Explicit batch update (soft delete)
        const payload = buildSoftDeletePayload(user.id, reason)
        const { error } = await admin.from("services").update(payload).in("id", serviceIds)
        if (error) return errorResponse(error.message)

        await Promise.all(serviceIds.map(id => removeFromExploreRedis(id, "servico", true)))

        // 2. Log audit event for each service in batch
        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        for (const s of existing) {
            await logAuditEvent({
                partnerId: partnerId,
                actorUserId: user.id,
                entityType: "service",
                entityId: s.id,
                actionType: "deleted",
                changeLines: [`Arquivou o serviço em lote: ${s.name} (SKU: ${s.sku || 'N/A'})`],
                metadata: {
                    ip_address: ip,
                    deleted_reason: reason || "Exclusão em lote",
                    name: s.name,
                    sku: s.sku
                },
                source: "manual"
            })
        }

        await revalidateServices(partnerId)
        revalidatePath("/erp/servicos")
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

        await requirePermission(partnerId, "services", "edit", user)

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase.from("services").update({ status: isActive ? "ativo" : "inativo" }).in("id", serviceIds)

        if (error) return errorResponse(error.message)

        await Promise.all(serviceIds.map(id => syncToExploreRedis({ id, type: "servico", data: {}, silent: true })))
        await revalidateServices(partnerId)
        revalidatePath("/erp/servicos")
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

        await requirePermission(partnerId, "services", "edit", user)

        const supabase = await getSupabaseServerClient()

        const results = await Promise.all(updates.map(update => {
            const { id, ...data } = update
            const updateData: any = { ...data }
            if (updateData.is_active !== undefined) {
                updateData.status = updateData.is_active ? "ativo" : "inativo"
                delete updateData.is_active
            }
            if (updateData.isActive !== undefined) {
                updateData.status = updateData.isActive ? "ativo" : "inativo"
                delete updateData.isActive
            }
            return supabase.from("services").update(updateData).eq("id", id)
        }))

        const firstError = results.find(r => r.error)
        if (firstError) return errorResponse(firstError.error?.message || "Erro no batch update")

        await Promise.all(serviceIds.map(id => syncToExploreRedis({ id, type: "servico", data: {}, silent: true })))
        await revalidateServices(partnerId)
        revalidatePath("/erp/servicos")
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

        await requirePermission(service.partner_id, "services", "create", user)

        const servicesLimitCheck = await checkLimit(service.partner_id, "services")
        if (!servicesLimitCheck.allowed) {
            return errorResponse(servicesLimitCheck.message || "Seu plano não permite criar mais serviços.")
        }

        const supabase = await getSupabaseServerClient()

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, updated_at, service_code, ...serviceData } = service
        serviceData.name = `${service.name} (Cópia)`
        serviceData.sku = generateSKUBase(`${service.name} Copy`)

        // Clona imagens para arquivos independentes no R2
        const { cloneMediaForDuplicate } = await import("@/lib/r2/server")
        const cloned = await cloneMediaForDuplicate(
            { images: service.images },
            user.id,
            R2_PREFIXES.services
        )
        serviceData.images = cloned.images || []

        let inserted: any = null
        let insertError: any = null
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                serviceData.sku = generateSKUWithSuffix(generateSKUBase(service.name + ' Copy'), attempt)
            }
            const { is_active, ...cleanData } = serviceData
            const { data: result, error } = await supabase.from("services").insert(cleanData).select().single()
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

        // Vídeo enviado (upload): clona após o insert com key item-scoped
        if (inserted?.id && service.video_type === "upload") {
            const clonedVideo = await cloneMediaForDuplicate(
                {
                    video_url: service.video_url,
                    video_thumbnail: service.video_thumbnail,
                },
                user.id,
                R2_PREFIXES.services,
                { itemId: inserted.id }
            )
            if (clonedVideo.video_url || clonedVideo.video_thumbnail) {
                await supabase.from("services").update({
                    video_url: clonedVideo.video_url,
                    video_thumbnail: clonedVideo.video_thumbnail,
                }).eq("id", inserted.id)
            }
        }

        if (inserted?.id) await syncToExploreRedis({ id: inserted.id, type: "servico", data: {}, silent: true })
        await revalidateServices(service.partner_id, inserted?.id)
        revalidatePath("/erp/servicos")
        return successResponse({ newServiceId: inserted.id, product: inserted })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}
