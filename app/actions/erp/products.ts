"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { generateAvailableSKU, generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { parseDecimalInput } from "@/lib/utils/formatters"
import { sanitizeInput } from "@/lib/input-validator"
import { sanitizeRichText } from "@/lib/security/rich-text-sanitizer"
import {
    revalidateProducts,
    revalidateSuppliers,
} from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { AUTH_MESSAGES } from "@/lib/constants/messages"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import type { ActionResponse } from "@/lib/types/action-response"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptCpfIfEncrypted, generateCpfLookupHash } from "@/lib/crypto"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { syncToExploreRedis } from "@/lib/redis-sync"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { checkLimit, canUseFeature, increment_usage_counter, decrement_usage_counter, adjustItemUsageCounter } from "@/lib/services/subscription.service"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { EMPTY_VIDEO_METADATA, normalizeVideoMetadata, type VideoType } from "@/lib/video/shared"
import { ALLOWED_VIDEO_MIME_TYPES, MAX_FILE_SIZE, MAX_VIDEO_FILE_SIZE, R2_PREFIXES } from "@/lib/r2/config"
import { buildCatalogSoftDeletePayload, buildRestorePayload, buildArchivePayload, scopeActiveOnly, scopeArchivedOnly, scopeWithArchived } from "@/lib/supabase/query-helpers"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { logAuditEvent } from "@/lib/services/timeline.service"
import {
    evaluatePricing,
    getDefaultMarginPercent,
    getMarginThresholdPercent,
    roundMoney,
    sortPricingAlerts,
} from "@/lib/erp/pricing-alerts"
import { moderateProductContent } from "@/lib/moderation/product-moderation"
import { scheduleDeferredTextModeration } from "@/lib/moderation/deferred-moderation"
import { scheduleDeferredImageModeration } from "@/lib/moderation/deferred-image-moderation"
import { headers } from "next/headers"

const _deleteOwnedProductMediaFromR2 = async (url: string, userId: string) => {
    if (!url || !url.trim()) return;
    try {
        const [{ extractKeyFromR2Url, deleteFileFromR2, validateKeyOwnership }, { getR2PublicUrl }] = await Promise.all([
            import("@/lib/r2/server"),
            import("@/lib/r2/r2-server-config"),
        ])
        let key = url
        if (/^https?:\/\//i.test(url)) {
            const assetUrl = new URL(url)
            const publicUrl = new URL(getR2PublicUrl())
            if (assetUrl.origin !== publicUrl.origin) return
            key = extractKeyFromR2Url(url)
        }
        if (!validateKeyOwnership(key, userId) || !key.startsWith(`users/${userId}/products/`)) return
        await deleteFileFromR2(key)
    } catch (e) {
        console.error("Failed to delete owned product media from R2", e)
    }
};

const assertUploadVideoOwnership = async (video: any, userId: string, folder: "products" | "services", itemId: string) => {
    if (video.video_type !== "upload") return
    const getKey = (url: string) => {
        try {
            return url.startsWith("http") ? new URL(url).pathname.replace(/^\/+/, "") : url
        } catch {
            throw new Error("URL de vídeo inválida")
        }
    }
    const expectedPrefix = `users/${userId}/${folder}/${itemId}`
    const videoKey = getKey(video.video_url || "")
    const thumbnailKey = getKey(video.video_thumbnail || "")
    if (!videoKey.startsWith(`${expectedPrefix}.`) || thumbnailKey !== `${expectedPrefix}-thumbnail.jpg`) {
        throw new Error("URL de vídeo não pertence a este item")
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

// ============================================================================
// HELPERS & SEGURANÃ‡A
// ============================================================================

const getBrasiliaTime = () => new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString()

const validateCSRF = async (data: Record<string, unknown>) => {
    const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
    const token = extractCSRFTokenFromObject(data)
    return requireCSRF(token)
}

const verifyAuth = async () => {
    const user = await requireUser()
    if (!user) throw new Error(AUTH_MESSAGES.NOT_AUTHENTICATED)
    return user
}

const fetchProductAndVerifyOwnership = async (productId: string, requiredAction?: "view" | "create" | "edit" | "delete", selectColumns = "id, partner_id, images, sku, name", resolvedUser?: any) => {
    const admin = getAdminClient()
    const columns = selectColumns.split(",").map((column) => column.trim())
    if (!columns.includes("store_id")) columns.push("store_id")

    const [productRes, user] = await Promise.all([
        admin.from("products").select(columns.join(", ")).eq("id", productId).single(),
        resolvedUser ? Promise.resolve(resolvedUser) : verifyAuth()
    ])

    const { data: product, error } = productRes

    if (error || !product) throw new Error("Produto não encontrado")

    if (requiredAction) {
        await requirePermission(product.partner_id, "products", requiredAction, user)
    } else {
        await requirePermission(product.partner_id, "products", "view", user)
    }
    if (product.store_id) {
        await requireStorePermission(product.store_id, product.partner_id, "products", requiredAction || "view")
    }

    return product
}

const requireProductReadContext = async (partnerId: string, requestedStoreId?: string | null) => {
    const user = await requireUser()
    const context = await getCurrentPartnerContext(user)
    if (!context?.partnerId || context.partnerId !== partnerId) {
        throw new Error("O parceiro informado não corresponde ao contexto ativo")
    }
    await requirePermission(partnerId, "products", "view", user)
    const storeId = requestedStoreId || context.activeStoreId || null
    if (storeId) await requireStorePermission(storeId, partnerId, "products", "view")
    return { user, partnerId, storeId }
}

const verifyBatchOwnership = async (productIds: string[], resolvedUser?: any) => {
    const { sanitizeUUID } = await import("@/lib/security/input-sanitizer")
    const sanitized = productIds.map(sanitizeUUID).filter((id): id is string => id !== null)

    if (!sanitized.length) throw new Error("Nenhum ID válido")
    if (sanitized.length > 100) throw new Error("Máximo: 100 produtos")

    const admin = getAdminClient()

    const [dataRes, user] = await Promise.all([
        admin.from("products").select("id, partner_id, store_id").in("id", sanitized),
        resolvedUser ? Promise.resolve(resolvedUser) : verifyAuth()
    ])

    const { data } = dataRes

    if (!data || data.length !== sanitized.length) throw new Error("Produtos não encontrados")

    // All products must belong to the same partner
    const partnerId = data[0]?.partner_id
    if (!partnerId || data.some((p: any) => p.partner_id !== partnerId)) throw new Error("Produtos de parceiros diferentes")

    // await requireMinimumPlan(partnerId, "crescer")
    await requirePermission(partnerId, "products", "view", user)

    return { sanitized, partnerId, user, products: data }
}

const requireBatchProductStorePermission = async (
    products: Array<{ store_id?: string | null }>,
    partnerId: string,
    resource: "products" | "stock_movements",
    action: "view" | "create" | "edit" | "delete",
) => {
    const storeIds = Array.from(new Set(products.map((product) => product.store_id).filter(Boolean))) as string[]
    await Promise.all(storeIds.map((storeId) => requireStorePermission(storeId, partnerId, resource, action)))
}

const requireSuppliersBelongToPartner = async (supplierIds: string[], partnerId: string) => {
    const ids = Array.from(new Set(supplierIds.map((id) => String(id || "").trim())))
    if (!ids.length || ids.length > 100 || ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        throw new Error("Fornecedor inválido")
    }
    const { data, error } = await getAdminClient()
        .from("suppliers")
        .select("id, partner_id")
        .in("id", ids)
    if (error || !data || data.length !== ids.length || data.some((supplier: any) => supplier.partner_id !== partnerId)) {
        throw new Error("Fornecedor não encontrado neste parceiro")
    }
}

/**
 * Authorizes a batch of already-fetched product variants.
 *
 * SECURITY: Prevents cross-tenant BOLA/IDOR on batch variant mutations. It rejects
 * batches that span more than one partner and requires the caller to hold the
 * `products.edit` permission on that single partner (honoring partner_users, not
 * just the legacy owner). Callers MUST also verify that every requested id was
 * resolved before calling this (to avoid silent partial operations).
 *
 * @returns the single partner_id all variants belong to.
 * @throws ForbiddenError via requirePermission if the caller lacks access.
 */
const verifyVariantBatchOwnership = async (
    variants: Array<any>,
    user: any,
): Promise<string> => {
    const partnerIds = Array.from(
        new Set(
            variants
                .map((v) => {
                    const prod = Array.isArray(v?.products) ? v.products[0] : v?.products
                    return prod?.partner_id
                })
                .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
    )

    if (partnerIds.length !== 1) {
        // Zero partners resolved OR variants span multiple stores -> deny.
        throw new Error("Variantes de parceiros diferentes")
    }

    const partnerId = partnerIds[0]
    await requirePermission(partnerId, "products", "edit", user)
    const storeIds = Array.from(new Set(variants
        .map((variant) => {
            const product = Array.isArray(variant?.products) ? variant.products[0] : variant?.products
            return product?.store_id
        })
        .filter((id): id is string => typeof id === "string" && id.length > 0)))
    await Promise.all(storeIds.map((storeId) => requireStorePermission(storeId, partnerId, "products", "edit")))
    return partnerId
}



// ============================================================================
// ACTIONS BÃ SICAS (Mantidas por compatibilidade)
// ============================================================================

/**
 * @deprecated Use updateProductComprehensiveAction instead.
 * This wrapper exists only for backward compatibility and delegates
 * to the secure comprehensive action with CSRF + rate limiting.
 */
export async function updateProductAction(data: {
    productId: string
    [key: string]: any
}) {
    const { productId, ...rest } = data
    return updateProductComprehensiveAction(productId, rest)
}

export async function deleteProductAction(productId: string, reason?: string | null) {
    const actionStart = performance.now()
    await requireRateLimit(RateLimitCategory.PRODUCT_DELETE)
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "delete", "id, partner_id, sku, name, status, deleted_at")

        const user = await requireUser()
        const admin = getAdminClient()

        // 1. Soft delete update payload
        const payload = buildCatalogSoftDeletePayload(user.id, reason)
        const deleteResult = await admin.from("products").update(payload).eq("id", productId)
        if (deleteResult.error) return { error: deleteResult.error.message }

        if (product.status !== "deleted" && !product.deleted_at && product.status !== "arquivado") {
            await adjustItemUsageCounter(product.partner_id, "products_count", -1)
        }

        // 2. Fetch IP and write to audit logs (logAuditEvent)
        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: product.partner_id,
            actorUserId: user.id,
            entityType: "product",
            entityId: productId,
            actionType: "deleted",
            changeLines: [`Deletou o produto: ${product.name} (SKU: ${product.sku || 'N/A'})`],
            metadata: {
                ip_address: ip,
                deleted_reason: reason || "Nenhum motivo informado",
                name: product.name,
                sku: product.sku
            },
            source: "manual"
        })

        // 3. Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(productId, product.partner_id, 'delete')

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function restoreProductAction(productId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, sku, name, status, deleted_at")
        const user = await requireUser()
        const admin = getAdminClient()

        const wasCounted = Boolean(product.deleted_at) || product.status === "deleted" || product.status === "arquivado"
        if (wasCounted) {
            const limitCheck = await checkLimit(product.partner_id, "items")
            if (!limitCheck.allowed) {
                return { error: limitCheck.message || "Limite de produtos do seu plano atingido. Faça upgrade para restaurar este item." }
            }
        }

        // 1. Explicit restore update
        const payload = buildRestorePayload("ativo")
        const restoreResult = await admin.from("products").update(payload).eq("id", productId)
        if (restoreResult.error) return { error: restoreResult.error.message }

        if (wasCounted) {
            await adjustItemUsageCounter(product.partner_id, "products_count", 1)
        }

        // 2. Fetch IP and write to audit logs
        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: product.partner_id,
            actorUserId: user.id,
            entityType: "product",
            entityId: productId,
            actionType: "restored",
            changeLines: [`Restaurou o produto: ${product.name} (SKU: ${product.sku || 'N/A'})`],
            metadata: {
                ip_address: ip,
                name: product.name,
                sku: product.sku
            },
            source: "manual"
        })

        // 3. Synchronous revalidation and Redis sync
        await invalidateProductCache(productId, product.partner_id, 'update')

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function archiveProductAction(productId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, sku, name, status, deleted_at")
        const user = await requireUser()
        const admin = getAdminClient()

        const payload = buildArchivePayload("arquivado")
        const { error } = await admin.from("products").update(payload).eq("id", productId)
        if (error) return { error: error.message }

        if (product.status !== "arquivado" && product.status !== "deleted" && !product.deleted_at) {
            await adjustItemUsageCounter(product.partner_id, "products_count", -1)
        }

        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: product.partner_id,
            actorUserId: user.id,
            entityType: "product",
            entityId: productId,
            actionType: "updated",
            changeLines: [`Arquivou o produto: ${product.name} (SKU: ${product.sku || 'N/A'})`],
            metadata: { ip_address: ip, name: product.name, sku: product.sku },
            source: "manual"
        })

        await invalidateProductCache(productId, product.partner_id, 'delete')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function unarchiveProductAction(productId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, sku, name, status, deleted_at")
        const user = await requireUser()
        const admin = getAdminClient()

        const wasArchived = product.status === "arquivado" || product.status === "archived"
        if (wasArchived) {
            const limitCheck = await checkLimit(product.partner_id, "items")
            if (!limitCheck.allowed) {
                return { error: limitCheck.message || "Limite de produtos do seu plano atingido. Faça upgrade para reativar este item." }
            }
        }

        const payload = buildRestorePayload("ativo")
        const { error } = await admin.from("products").update(payload).eq("id", productId)
        if (error) return { error: error.message }

        if (wasArchived) {
            await adjustItemUsageCounter(product.partner_id, "products_count", 1)
        }

        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        await logAuditEvent({
            partnerId: product.partner_id,
            actorUserId: user.id,
            entityType: "product",
            entityId: productId,
            actionType: "updated",
            changeLines: [`Desarquivou/Reativou o produto: ${product.name} (SKU: ${product.sku || 'N/A'})`],
            metadata: { ip_address: ip, name: product.name, sku: product.sku },
            source: "manual"
        })

        await invalidateProductCache(productId, product.partner_id, 'update')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ============================================================================
// COMPREHENSIVE ACTIONS (Otimizadas com novos campos)
// ============================================================================

export async function createProductComprehensiveAction(data: {
    id?: string
    partnerId: string
    storeId: string
    name: string
    description?: string
    sku?: string
    gtin?: string
    brand?: string
    category?: string
    categoryId?: string | null
    subcategory?: string
    subcategory_id?: string | null
    subcategoryId?: string | null
    condition?: string
    unit?: string | null
    productType?: string
    location?: string
    locationId?: string | null
    costPrice?: number
    price: number
    promotionalPrice?: number | null
    minStock?: number
    maxStock?: number
    stockQuantity: number
    isActive?: boolean
    isOnPromotion?: boolean
    showPriceInStore?: boolean
    images?: string[]
    primaryImageIndex?: number
    processedImages?: Array<{ array: number[]; width: number; height: number }>
    // Fiscal
    ncm?: string | null
    cest?: string | null
    origin?: number
    item_type?: string
    cfop_internal?: string
    cfop_external?: string
    csosn?: string
    cst_ibs_cbs?: string | null
    c_class_trib?: string | null
    tax_percentage?: number | null
    pis_cst?: string
    pis_rate?: number
    cofins_cst?: string
    cofins_rate?: number
    ipi_cst?: string
    ipi_code?: string | null
    product_situation?: string
    c_benef?: string | null
    inf_ad_prod?: string | null
    weight_gross?: number
    weight_net?: number
    width?: number
    height?: number
    length?: number
    fciCode?: string | null
    packagingType?: string | null
    preparationDays?: number | null
    allow_sell_without_stock?: boolean
    tags?: string[]
    // Marketplace & Novos Campos
    featured?: boolean
    availability_value?: number
    availability_unit?: string
    warranty?: string | null
    videoUrl?: string | null
    videoType?: VideoType | null
    videoThumbnail?: string | null
    videoDuration?: number | null
    videoProviderId?: string | null
    technicalSpecs?: any
    deliveryFormat?: string | null
    showInMarketplace?: boolean
    requiresManualModeration?: boolean
    csrf_token?: string
    marketplace_category_id?: string | null
    marketplaceCategoryId?: string | null
    variants?: Array<any>
    pending_variants?: Array<any>
    suppliers?: Array<any>
    pending_suppliers?: Array<any>
    /** Marca que este create é uma duplicata: clona imagens/vídeos para arquivos independentes */
    isDuplicate?: boolean
}): Promise<ActionResponse<any>> {
    const actionStart = performance.now()
    try {
        // 1. GATEKEEPER - isolado (bloqueia abuso sem consumir recursos)
        await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)

        // 2. CSRF + Auth em paralelo (independentes entre si)
        const [csrf, _user] = await Promise.all([
            validateCSRF(data as Record<string, unknown>),
            verifyAuth(),
        ])
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")

        // ── SERVER-SIDE CONTEXT FALLBACK ──
        let finalPartnerId = data.partnerId
        if (!finalPartnerId || finalPartnerId.trim() === "") {
            const { getCurrentPartnerContext } = await import("@/lib/auth/partner-context")
            const ctx = await getCurrentPartnerContext(_user)
            if (ctx?.partnerId) finalPartnerId = ctx.partnerId
            else throw new Error("Acesso negado: ID do Parceiro não pôde ser resolvido.")
        }

        // 3. Normalização e validação em memória de variantes e fornecedores (zero DB cost)
        let rawVariants = data.pending_variants || data.variants || []
        const hasVariants = Array.isArray(rawVariants) && rawVariants.length > 0

        // Duplicata: clona imagens das variantes para arquivos independentes no R2
        if (data.isDuplicate && hasVariants) {
            const { cloneMediaForDuplicate } = await import("@/lib/r2/server")
            rawVariants = await Promise.all(
                rawVariants.map(async (v: any) => {
                    const variantImage = v.image || v.image_url || v.variant_options?.image || null
                    if (!variantImage) return v
                    const clonedVariant = await cloneMediaForDuplicate(
                        { images: [variantImage] },
                        _user.id,
                        R2_PREFIXES.products
                    )
                    const newImage = clonedVariant.images?.[0] || null
                    return { ...v, image: newImage, image_url: newImage, variant_options: { ...(v.variant_options || {}), image: newImage } }
                })
            )
        }

        if (hasVariants) {
            if (rawVariants.length > 50) {
                return errorResponse("Limite máximo de 50 variações por produto excedido.")
            }
            const uniqueValuesPerType: Record<string, Set<string>> = {}
            for (const v of rawVariants) {
                const vType = (v.variantType || v.variant_type || v.type || "").trim()
                const vVal = (v.variantValue || v.variant_value || v.value || "").trim()
                if (vType && vVal) {
                    const types = vType.split(" / ").map((t: string) => t.trim())
                    const values = vVal.split(" / ").map((val: string) => val.trim())
                    for (let idx = 0; idx < types.length; idx++) {
                        const type = types[idx]
                        const val = values[idx]
                        if (!type || !val) continue
                        if (type.length > 30) return errorResponse(`O tipo de variante "${type}" excede o limite máximo de 30 caracteres.`)
                        if (val.length > 30) return errorResponse(`O valor de variação "${val}" excede o limite máximo de 30 caracteres.`)
                        if (!uniqueValuesPerType[type]) uniqueValuesPerType[type] = new Set()
                        uniqueValuesPerType[type].add(val)
                    }
                }
            }
            for (const [type, uniqueSet] of Object.entries(uniqueValuesPerType)) {
                if (uniqueSet.size > 30) {
                    return errorResponse(`O tipo de variante "${type}" excede o limite máximo de 30 valores permitidos (possui ${uniqueSet.size}).`)
                }
            }
        }

        const variantImagesCount = hasVariants
            ? rawVariants.filter((v: any) => v.image || v.image_url || v.variant_options?.image).length
            : 0
        const totalImagesCount = (data.images?.length || 0) + variantImagesCount

        // 4. PARALELIZAÇÃO TOTAL DE VALIDAÇÕES & INFRAESTRUTURA (Reduz latência drasticamente)
        const [
            _access,
            finalStoreId,
            limitCheck,
            imagesLimitCheck,
            partnerDataRes,
            variantsFeatureAllowed
        ] = await Promise.all([
            requirePermission(finalPartnerId, "products", "create", _user),
            (async () => {
                if (data.storeId && data.storeId.trim() !== "") return data.storeId
                const admin = getAdminClient()
                const { data: stores } = await admin.from("stores").select("id").eq("partner_id", finalPartnerId).limit(1)
                if (stores && stores.length > 0) return stores[0].id
                throw new Error("Erro de infraestrutura: Nenhuma loja associada a este parceiro.")
            })(),
            checkLimit(finalPartnerId, "items"),
            checkLimit(finalPartnerId, "images_per_item", totalImagesCount),
            getAdminClient().from('partners').select('business_info').eq('id', finalPartnerId).single(),
            hasVariants ? canUseFeature(finalPartnerId, "product_variants") : Promise.resolve(true)
        ])

        if (!limitCheck.allowed) {
            return errorResponse(limitCheck.message || "Limite de produtos atingido.")
        }
        if (!imagesLimitCheck.allowed) {
            return errorResponse(imagesLimitCheck.message || "Limite de imagens atingido.")
        }
        await requireStorePermission(finalStoreId, finalPartnerId, "products", "create")
        if (Number(data.stockQuantity || 0) !== 0) {
            await requirePermission(finalPartnerId, "stock_movements", "create", _user)
            await requireStorePermission(finalStoreId, finalPartnerId, "stock_movements", "create")
        }
        if (hasVariants && !variantsFeatureAllowed) {
            return errorResponse("Seu plano não permite o uso de variantes. Faça upgrade para desbloquear.")
        }

        const businessInfo = normalizeBusinessInfo(partnerDataRes.data?.business_info)
        const isQuick = businessInfo.mode === "quick"

        if (isQuick) {
            if (data.showInMarketplace === undefined) data.showInMarketplace = true
            data.subcategoryId = null
            data.featured = false
        }

        // 5. MODERAÇÃO DE TEXTO (nome + descrição) antes de tocar no banco.
        // Dispara junto da normalização de vídeo para não somar latência.
        const moderationPromise = data.isDuplicate
            ? null
            : moderateProductContent({
                name: data.name,
                description: data.description,
                userId: finalPartnerId,
            })

        // SKU: sanitização e geração automática caso venha vazio ou 'Gerar automaticamente'
        const rawSku = data.sku?.trim()
        const isAutoSku = !rawSku || rawSku.toLowerCase() === "gerar automaticamente" || rawSku.toLowerCase() === "gerar" || rawSku.toLowerCase() === "sem sku"
        let sku = isAutoSku ? generateSKUBase(data.name) : rawSku
        // Resolve colisões antes do INSERT (o gerador semântico é determinístico
        // para nomes com 2+ palavras, então duplicatas tendem a repetir o SKU).
        if (sku && (isAutoSku || data.isDuplicate)) {
            sku = await generateAvailableSKU(getAdminClient(), finalPartnerId, sku)
        }

        const videoMetadata = await normalizeVideoMetadata({
            video_type: data.videoType || (data.videoUrl ? "youtube" : null),
            video_url: data.videoUrl || null,
            video_thumbnail: data.videoThumbnail || null,
            video_duration: data.videoDuration || null,
            video_provider_id: data.videoProviderId || null,
        })

        // Timeout/queda da IA não bloqueia o cadastro: marca como adiado e
        // agenda uma re-checagem em background depois do INSERT.
        let moderationDeferred = false
        if (moderationPromise) {
            const moderation = await moderationPromise
            if (!moderation.valid) {
                return errorResponse(moderation.error || "Conteúdo não aprovado pela moderação")
            }
            moderationDeferred = !!moderation.infraFailure
        }

        // Duplicata: clona imagens e vídeos para arquivos independentes no R2,
        // para que excluir a mídia do produto original não afete as cópias.
        if (data.isDuplicate) {
            const { cloneMediaForDuplicate } = await import("@/lib/r2/server")
            const cloned = await cloneMediaForDuplicate(
                {
                    images: data.images,
                    video_type: videoMetadata.video_type,
                    video_url: videoMetadata.video_url,
                    video_thumbnail: videoMetadata.video_thumbnail,
                },
                _user.id,
                R2_PREFIXES.products,
                { itemId: data.id }
            )
            data.images = cloned.images || []
            videoMetadata.video_url = cloned.video_url
            videoMetadata.video_thumbnail = cloned.video_thumbnail
        }

        const admin = getAdminClient()

        let finalPrice = data.price
        const numCost = Number(data.costPrice || 0)
        if ((finalPrice === undefined || finalPrice === null || Number(finalPrice) === 0) && numCost > 0) {
            try {
                const { data: partnerRec } = await admin.from("partners").select("business_info").eq("id", finalPartnerId).single()
                const defaultMargin = partnerRec?.business_info?.salesSettings?.defaultMarginPercent
                if (typeof defaultMargin === "number" && defaultMargin > 0) {
                    finalPrice = Math.round(numCost * (1 + defaultMargin / 100) * 100) / 100
                }
            } catch {
                // ignore
            }
        }

        const productData = {
            id: data.id || undefined,
            partner_id: finalPartnerId,
            store_id: finalStoreId,
            name: sanitizeInput(data.name, 150),
            description: data.description ? sanitizeRichText(data.description) : null,
            sku,
            gtin: data.gtin || null,
            brand: data.brand || null,
            category: data.category || null,
            category_id: (data as any).category_id || data.categoryId || null,
            subcategory: data.subcategory || null,
            subcategory_id: data.subcategoryId || data.subcategory_id || null,
            marketplace_category_id: (data as any).marketplace_category_id || data.marketplaceCategoryId || null,
            condition: data.condition || "Novo",
            unit: data.unit || null,
            brand_id: (data as any).brand_id || (data as any).brandId || null,
            product_type: data.productType || "Físico",
            fulfillment_modes: Array.isArray((data as any).fulfillment_modes)
                ? (data as any).fulfillment_modes
                : (data as any).fulfillmentModes || undefined,
            location: data.location || null,
            location_id: (data as any).location_id || data.locationId || null,
            cost_price: data.costPrice || 0,
            price: finalPrice ?? 0,
            promotional_price: data.promotionalPrice || null,
            min_stock: data.minStock || 0,
            max_stock: data.maxStock || 0,
            stock_quantity: data.stockQuantity || 0,
            status: data.isActive !== false ? "ativo" : "inativo",
            is_on_promotion: data.isOnPromotion || false,
            show_price_in_store: data.showPriceInStore !== false,
            images: data.images || [],
            availability_value: data.availability_value || 0,
            availability_unit: data.availability_unit || "Dias",
            warranty: data.warranty || null,
            video_url: videoMetadata.video_url,
            technical_specs: data.technicalSpecs || {},
            delivery_format: data.deliveryFormat || null,
            show_in_marketplace: data.showInMarketplace !== false,
            moderation_status: data.requiresManualModeration ? 'flagged' : 'approved',
            tags: data.tags || [],
            allow_sell_without_stock: data.allow_sell_without_stock || false,
            created_at: getBrasiliaTime(),
            updated_at: getBrasiliaTime(),
        }

        const fiscalData = {
            ncm: data.ncm || null,
            cest: data.cest || null,
            origin: data.origin ?? 0,
            item_type: data.item_type || "00",
            cfop_internal: data.cfop_internal || "5102",
            cfop_external: data.cfop_external || "6102",
            csosn: data.csosn || "102",
            tax_percentage: data.tax_percentage,
            pis_cst: data.pis_cst || "99",
            pis_rate: data.pis_rate ?? 0.0,
            cofins_cst: data.cofins_cst || "99",
            cofins_rate: data.cofins_rate ?? 0.0,
            ipi_cst: data.ipi_cst || "99",
            ipi_code: data.ipi_code || null,
            product_situation: data.product_situation || "revenda",
            c_benef: data.c_benef || null,
            inf_ad_prod: data.inf_ad_prod || null,
            fci_code: data.fciCode || null,
        }

        const logisticsData = {
            weight_gross: parseDecimalInput(data.weight_gross),
            weight_net: parseDecimalInput(data.weight_net),
            width: parseDecimalInput(data.width),
            height: parseDecimalInput(data.height),
            length: parseDecimalInput(data.length),
            packaging_type: data.packagingType || "package",
            preparation_days: Math.max(0, Math.round(parseDecimalInput(data.preparationDays))),
        }

        const supabase = await getSupabaseServerClient()
        // 5. INSERT DO PRODUTO com retry em caso de SKU collision
        let insertedProduct: any = null
        let transactionError: any = null
        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
                productData.sku = generateSKUWithSuffix(sku, attempt)
            }

            const productPayload = {
                ...productData,
                ...fiscalData,
                ...logisticsData,
            }

            const result = await supabase.rpc(
                "create_product_transaction",
                {
                    p_product: productPayload,
                    p_variants: [],
                    p_suppliers: []
                }
            )

            if (!result.error && result.data?.id) {
                insertedProduct = result.data
                transactionError = null
                break
            }

            if (result.error?.message?.includes('unique') || result.error?.code === '23505') {
                transactionError = result.error
                continue
            }

            return errorResponse(result.error?.message || "Erro ao criar produto", result.error)
        }

        if (transactionError || !insertedProduct?.id) {
            return errorResponse(transactionError?.message || "Falha ao registrar produto", transactionError)
        }

        const createdProductId = insertedProduct.id

        if (moderationDeferred) {
            await scheduleDeferredTextModeration({
                entityType: "product",
                entityId: createdProductId,
                partnerId: finalPartnerId,
                autoApprove: !data.requiresManualModeration,
                texts: [data.name, data.description],
            })
        }

        // Agenda checagem assíncrona das imagens no Sightengine
        await scheduleDeferredImageModeration({
            entityType: "product",
            entityId: createdProductId,
            partnerId: finalPartnerId,
            images: data.images || [],
        })

        // IBS/CBS (2027) ainda não fazem parte da RPC de criação: grava direto.
        // Defaults da operação padrão de 2027 (CST 000 / cClassTrib 000001).
        // Upsert porque a RPC só cria a linha fiscal quando há dados fiscais.
        await admin
            .from("product_fiscal_profiles")
            .upsert(
                {
                    product_id: createdProductId,
                    cst_ibs_cbs: data.cst_ibs_cbs || "000",
                    c_class_trib: data.c_class_trib || "000001",
                },
                { onConflict: "product_id" },
            )

        // 6. INSERÇÃO ATÔMICA DE VARIANTES (Se houver)
        let insertedVariants: any[] = []
        if (hasVariants) {
            const usedSkus = new Set<string>()
            const variantsPayload = rawVariants.map((v: any, index: number) => {
                const variantName = v.variantName || v.variant_name || v.name || `Variante ${index + 1}`
                const variantType = v.variantType || v.variant_type || v.type || null
                const variantValue = v.variantValue || v.variant_value || v.value || null
                let variantSku = (v.sku && String(v.sku).trim()) ? String(v.sku).trim() : `${productData.sku}-${index + 1}`
                let counter = 2
                while (usedSkus.has(variantSku.toLowerCase())) {
                    variantSku = `${variantSku}-${counter}`
                    counter++
                }
                usedSkus.add(variantSku.toLowerCase())

                const priceAdjustment = Number(v.price !== undefined ? v.price : (v.price_adjustment !== undefined ? v.price_adjustment : 0)) || 0
                const stockQuantity = Number(v.stockQuantity !== undefined ? v.stockQuantity : (v.stock_quantity !== undefined ? v.stock_quantity : (v.stock !== undefined ? v.stock : 0))) || 0
                const image = v.image || v.image_url || v.variant_options?.image || null
                const isActive = v.isActive !== undefined ? v.isActive : (v.is_active !== undefined ? v.is_active : (v.status !== undefined ? v.status : true))

                return {
                    product_id: createdProductId,
                    variant_name: sanitizeInput(variantName, 150),
                    variant_type: variantType ? sanitizeInput(variantType, 100) : null,
                    variant_value: variantValue ? sanitizeInput(variantValue, 100) : null,
                    sku: variantSku,
                    price_adjustment: priceAdjustment,
                    stock_quantity: stockQuantity,
                    variant_options: image ? { image } : null,
                    is_active: isActive !== false,
                }
            })

            const { data: variantsData, error: variantsError } = await admin
                .from("product_variants")
                .upsert(variantsPayload, { onConflict: 'sku' })
                .select()

            if (variantsError) {
                console.error("Erro ao salvar variantes durante criação do produto:", variantsError)
            } else {
                insertedVariants = variantsData || []
            }
        }

        // 7. INSERÇÃO ATÔMICA DE FORNECEDORES (Se houver)
        const rawSuppliers = data.pending_suppliers || data.suppliers || []
        let insertedSuppliers: any[] = []
        if (Array.isArray(rawSuppliers) && rawSuppliers.length > 0) {
            const suppliersPayload = rawSuppliers
                .filter((s: any) => s && (s.supplier_id || s.id))
                .map((s: any) => ({
                    product_id: createdProductId,
                    supplier_id: s.supplier_id || s.id,
                    supplier_sku: s.supplier_sku || s.supplierSku || s.supplier_product_code || null,
                    cost_price: s.cost_price !== undefined ? Number(s.cost_price) : (s.costPrice !== undefined ? Number(s.costPrice) : null),
                    lead_time_days: s.lead_time_days !== undefined ? Number(s.lead_time_days) : (s.leadTimeDays !== undefined ? Number(s.leadTimeDays) : null),
                }))

            if (suppliersPayload.length > 0) {
                const { data: suppliersData, error: suppliersError } = await admin
                    .from("product_suppliers")
                    .upsert(suppliersPayload, { onConflict: 'product_id,supplier_id' })
                    .select()

                if (suppliersError) {
                    console.error("Erro ao salvar fornecedores durante criação do produto:", suppliersError)
                } else {
                    insertedSuppliers = suppliersData || []
                }
            }
        }

        // 8. Video e campos diretos (brand/location) update garantido
        const directCreatePatch: any = {}
        if (productData.brand !== undefined) directCreatePatch.brand = productData.brand
        if (productData.brand_id !== undefined) directCreatePatch.brand_id = productData.brand_id
        if (productData.location !== undefined) directCreatePatch.location = productData.location
        if (productData.location_id !== undefined) directCreatePatch.location_id = productData.location_id
        if (videoMetadata.video_url || videoMetadata.video_thumbnail) {
            directCreatePatch.video_type = videoMetadata.video_type
            directCreatePatch.video_url = videoMetadata.video_url
            directCreatePatch.video_thumbnail = videoMetadata.video_thumbnail
            directCreatePatch.video_duration = videoMetadata.video_duration
            directCreatePatch.video_provider_id = videoMetadata.video_provider_id
        }
        if (Object.keys(directCreatePatch).length > 0) {
            await admin.from("products").update(directCreatePatch).eq("id", createdProductId)
        }

        // 9. Revalidação síncrona de Cache e Redis em uma única passagem
        await invalidateProductCache(createdProductId, finalPartnerId, 'create')

        // 10. Atualização de contadores de imagens (produto + variantes)
        if (totalImagesCount > 0) {
            await increment_usage_counter(finalPartnerId, "images_count", totalImagesCount)
        }

        return successResponse({
            ...insertedProduct,
            ...fiscalData,
            ...logisticsData,
            variants: insertedVariants,
            suppliers: insertedSuppliers,
        })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

// SECURITY FIX (HIGH-04): Typed interface prevents mass assignment
// Known fields documented; index signature allows dynamic field mapping
interface UpdateProductData {
    csrf_token?: string
    name?: string
    description?: string
    category?: string
    categoryId?: string
    brand?: string
    brandId?: string
    sku?: string
    gtin?: string
    condition?: string
    price?: number
    promotional_price?: number | null
    promotionalPrice?: number | null
    images?: string[]
    availability_value?: number
    availability_unit?: string
    warranty?: string
    unit?: string
    stock_quantity?: number
    stockQuantity?: number
    is_active?: boolean
    isActive?: boolean
    showInMarketplace?: boolean
    showPriceInStore?: boolean
    subcategoryId?: string
    subcategory_id?: string
    marketplace_category_id?: string | null
    marketplaceCategoryId?: string | null
    location?: string
    locationId?: string
    featured?: boolean
    productType?: string
    packagingType?: string
    preparationDays?: number
    costPrice?: number
    isOnPromotion?: boolean
    deliveryFormat?: string
    tags?: string[]
    videoUrl?: string | null
    videoType?: VideoType | null
    videoThumbnail?: string | null
    videoDuration?: number | null
    videoProviderId?: string | null
    technicalSpecs?: any
    minStock?: number
    maxStock?: number
    allow_sell_without_stock?: boolean
    fciCode?: string
    requiresManualModeration?: boolean
    ncm?: string
    cest?: string
    origin?: string
    csosn?: string
    cst_ibs_cbs?: string
    c_class_trib?: string
    pis_cst?: string
    cofins_cst?: string
    ipi_cst?: string
    item_type?: string
    cfop_internal?: string
    cfop_external?: string
    tax_percentage?: number
    pis_rate?: number
    cofins_rate?: number
    ipi_code?: string
    product_situation?: string
    c_benef?: string
    inf_ad_prod?: string
    weight_gross?: number
    weight_net?: number
    width?: number
    height?: number
    length?: number
    variants?: any[]
    storeId?: string
}

export async function updateProductComprehensiveAction(productId: string, data: UpdateProductData): Promise<ActionResponse<any>> {
    const actionStart = performance.now()
    // 1. GATEKEEPER â€” isolado
    await requireRateLimit(RateLimitCategory.PRODUCT_UPDATE)
    try {
        // 2. CSRF + ownership em paralelo (independentes)
        const [csrf, product] = await Promise.all([
            validateCSRF(data as Record<string, unknown>),
            fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, store_id, stock_quantity, images, sku, name, description, moderation_status, video_type, video_url, video_thumbnail"),
        ])
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")
        const cleanupUser = await requireUser()

        for (const field of ["price", "costPrice", "minStock", "maxStock", "stockQuantity"] as const) {
            const value = data[field]
            if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
                return errorResponse(`Valor inválido para ${field}`)
            }
        }
        if (data.promotionalPrice != null && (!Number.isFinite(Number(data.promotionalPrice)) || Number(data.promotionalPrice) < 0)) {
            return errorResponse("Preço promocional inválido")
        }
        if (data.images !== undefined && (!Array.isArray(data.images) || data.images.length > 50 || data.images.some((image) => typeof image !== "string" || image.length > 2048))) {
            return errorResponse("Lista de imagens inválida")
        }

        if (data.stockQuantity !== undefined && Number(data.stockQuantity) !== Number(product.stock_quantity || 0)) {
            if (!Number.isFinite(Number(data.stockQuantity))) return errorResponse("Estoque inválido")
            const user = await requireUser()
            await requirePermission(product.partner_id, "stock_movements", "create", user)
            if (product.store_id) await requireStorePermission(product.store_id, product.partner_id, "stock_movements", "create")
        }

        // Moderação apenas dos campos de texto que realmente mudaram.
        // O formulário envia nome/descrição em toda edição, então comparar com o
        // valor atual evita uma chamada de IA a cada "salvar preço".
        const currentName = typeof product.name === "string" ? product.name.trim() : ""
        const currentDescription = typeof product.description === "string" ? product.description.trim() : ""
        const nameChanged = data.name !== undefined && String(data.name ?? "").trim() !== currentName
        const descriptionChanged =
            data.description !== undefined && String(data.description ?? "").trim() !== currentDescription

        let moderationDeferred = false
        if (nameChanged || descriptionChanged) {
            const moderation = await moderateProductContent({
                name: nameChanged ? data.name : undefined,
                description: descriptionChanged ? data.description : undefined,
                userId: product.partner_id,
            })
            if (!moderation.valid) {
                return errorResponse(moderation.error || "Conteúdo não aprovado pela moderação")
            }
            moderationDeferred = !!moderation.infraFailure
        }

        const supabase = await getSupabaseServerClient()
        const payload: any = { updated_at: getBrasiliaTime() }
        const fiscalPayload: any = {}
        const logisticsPayload: any = {}

        // Cast for dynamic field mapping â€” safe because we only iterate over known allowlisted keys
        const dataRecord = data as Record<string, unknown>

        // Campos diretos
        const directMapFields = [
            'name', 'description', 'category', 'brand', 'location', 'sku', 'gtin', 'condition',
            'price', 'images',
            'availability_value', 'availability_unit', 'warranty', 'unit',
            'category_id', 'brand_id', 'location_id', 'subcategory_id', 'marketplace_category_id'
        ]

        const fiscalMapFields = [
            'ncm', 'cest', 'origin', 'csosn', 'pis_cst', 'cofins_cst', 'ipi_cst',
            'cst_ibs_cbs', 'c_class_trib',
            'item_type', 'cfop_internal', 'cfop_external', 'tax_percentage',
            'pis_rate', 'cofins_rate', 'ipi_code', 'product_situation',
            'c_benef', 'inf_ad_prod'
        ]

        const logisticsMapFields = [
            'weight_gross', 'weight_net', 'width', 'height', 'length'
        ]

        directMapFields.forEach(field => {
            if (dataRecord[field] !== undefined) payload[field] = dataRecord[field]
        })

        if (payload.name !== undefined) payload.name = sanitizeInput(payload.name, 150)
        if (payload.description !== undefined) {
            payload.description = typeof payload.description === "string" ? sanitizeRichText(payload.description) : null
        }

        if (payload.sku !== undefined && payload.sku !== null) {
            const rawSku = String(payload.sku).trim()
            const isAutoSku = !rawSku || rawSku.toLowerCase() === "gerar automaticamente" || rawSku.toLowerCase() === "gerar" || rawSku.toLowerCase() === "sem sku"
            payload.sku = isAutoSku ? generateSKUBase(payload.name || product.name) : rawSku
        }

        fiscalMapFields.forEach(field => {
            if (dataRecord[field] !== undefined) fiscalPayload[field] = dataRecord[field]
        })

        logisticsMapFields.forEach(field => {
            if (dataRecord[field] !== undefined) logisticsPayload[field] = parseDecimalInput(dataRecord[field])
        })

        // Only fetch business_info when marketplace-related fields are being updated
        const hasMarketplaceFields = data.showInMarketplace !== undefined || data.subcategoryId !== undefined || data.featured !== undefined
        if (hasMarketplaceFields) {
            const adminForBusinessInfo = getAdminClient()
            const { data: partnerData } = await adminForBusinessInfo.from('partners').select('business_info').eq('id', product.partner_id).single()
            const businessInfo = normalizeBusinessInfo(partnerData?.business_info)
            const isQuick = businessInfo.mode === "quick"

            if (isQuick) {
                if (data.showInMarketplace === undefined) data.showInMarketplace = true
                data.subcategoryId = undefined
                data.featured = false
            }
        }

        // Mapeamento CamelCase â†’ SnakeCase
        if (data.stockQuantity !== undefined) payload.stock_quantity = data.stockQuantity
        if (data.minStock !== undefined) payload.min_stock = data.minStock
        if (data.maxStock !== undefined) payload.max_stock = data.maxStock
        if (data.isActive !== undefined) { payload.status = data.isActive ? "ativo" : "inativo" }
        if (data.productType !== undefined) payload.product_type = data.productType
        if ((data as any).fulfillment_modes !== undefined) payload.fulfillment_modes = (data as any).fulfillment_modes
        if ((data as any).fulfillmentModes !== undefined) payload.fulfillment_modes = (data as any).fulfillmentModes

        if (data.packagingType !== undefined) logisticsPayload.packaging_type = data.packagingType || "package"
        if (data.preparationDays !== undefined) logisticsPayload.preparation_days = Math.max(0, Math.round(parseDecimalInput(data.preparationDays)))

        if (data.fciCode !== undefined) fiscalPayload.fci_code = data.fciCode
        if (data.allow_sell_without_stock !== undefined) payload.allow_sell_without_stock = data.allow_sell_without_stock

        // Campos promocionais e de preço
        if (data.costPrice !== undefined) payload.cost_price = data.costPrice
        if (data.promotionalPrice !== undefined) payload.promotional_price = data.promotionalPrice
        if (data.isOnPromotion !== undefined) payload.is_on_promotion = data.isOnPromotion
        if (data.showPriceInStore !== undefined) payload.show_price_in_store = data.showPriceInStore

        // Novos campos (Marketplace/Outros)
        if (data.subcategoryId !== undefined) payload.subcategory_id = data.subcategoryId
        if (data.subcategory_id !== undefined) payload.subcategory_id = data.subcategory_id
        if (data.marketplaceCategoryId !== undefined) payload.marketplace_category_id = data.marketplaceCategoryId
        if (data.marketplace_category_id !== undefined) payload.marketplace_category_id = data.marketplace_category_id
        if (data.categoryId !== undefined) payload.category_id = data.categoryId
        if (data.brandId !== undefined) payload.brand_id = data.brandId
        if (data.locationId !== undefined) payload.location_id = data.locationId
        if (
            data.videoType !== undefined ||
            data.videoUrl !== undefined ||
            data.videoThumbnail !== undefined ||
            data.videoDuration !== undefined ||
            data.videoProviderId !== undefined
        ) {
            const videoMetadata = data.videoType
                ? await normalizeVideoMetadata({
                    video_type: data.videoType,
                    video_url: data.videoUrl || null,
                    video_thumbnail: data.videoThumbnail || null,
                    video_duration: data.videoDuration || null,
                    video_provider_id: data.videoProviderId || null,
                })
                : EMPTY_VIDEO_METADATA
            if (videoMetadata.video_type === "upload") {
                const currentUser = await verifyAuth()
                await assertUploadVideoOwnership(videoMetadata, currentUser.id, "products", productId)
            }

            payload.video_type = videoMetadata.video_type
            payload.video_url = videoMetadata.video_url
            payload.video_thumbnail = videoMetadata.video_thumbnail
            payload.video_duration = videoMetadata.video_duration
            payload.video_provider_id = videoMetadata.video_provider_id
        }
        if (data.technicalSpecs !== undefined) payload.technical_specs = data.technicalSpecs
        if (data.deliveryFormat !== undefined) payload.delivery_format = data.deliveryFormat
        if (data.tags !== undefined) payload.tags = data.tags
        if (data.showInMarketplace !== undefined) payload.show_in_marketplace = data.showInMarketplace

        payload.moderation_status = data.requiresManualModeration
            ? 'flagged'
            : (product.moderation_status || 'approved')

        const adminRpc = getAdminClient()
        const { data: updatedProduct, error: transactionError } = await adminRpc.rpc(
            "update_product_transaction_server",
            {
                p_actor_user_id: cleanupUser.id,
                p_product_id: productId,
                p_product_data: payload,
                p_fiscal_data: fiscalPayload,
                p_logistics_data: logisticsPayload
            }
        )

        if (transactionError) return errorResponse(transactionError.message, transactionError)

        // FIX: Garantir persistência direta de moderation_status, vídeo e colunas diretas de brand/location
        const adminUpdate = getAdminClient()
        const directProductPatch: any = { moderation_status: payload.moderation_status }
            ;["video_type", "video_url", "video_thumbnail", "video_duration", "video_provider_id", "brand", "brand_id", "location", "location_id"].forEach((field) => {
                if (payload[field] !== undefined) directProductPatch[field] = payload[field]
            })
        await adminUpdate.from('products').update(directProductPatch).eq('id', productId)

        // IBS/CBS (2027) ainda não fazem parte da RPC de update: grava direto.
        // Upsert porque produtos antigos podem não ter linha fiscal.
        const fiscalExtra: Record<string, unknown> = {}
        if (fiscalPayload.cst_ibs_cbs !== undefined) fiscalExtra.cst_ibs_cbs = fiscalPayload.cst_ibs_cbs
        if (fiscalPayload.c_class_trib !== undefined) fiscalExtra.c_class_trib = fiscalPayload.c_class_trib
        if (Object.keys(fiscalExtra).length > 0) {
            await adminUpdate
                .from('product_fiscal_profiles')
                .upsert(
                    { product_id: productId, ...fiscalExtra },
                    { onConflict: 'product_id' },
                )
        }

        // Fire-and-forget: R2 image cleanup para imagens removidas
        if (payload.images !== undefined && product.images && Array.isArray(product.images)) {
            const oldImages = product.images.filter((img: any) => typeof img === 'string' && img.trim());
            const newImages = payload.images;
            const deletedImages = oldImages.filter((img: string) => !newImages.includes(img));
            const addedImages = newImages.filter((img: string) => !oldImages.includes(img));

            if (deletedImages.length > 0) {
                Promise.all(deletedImages.map((img: string) => _deleteOwnedProductMediaFromR2(img, cleanupUser.id))).catch(console.error)
                await decrement_usage_counter(product.partner_id, "images_count", deletedImages.length)
            }
            if (addedImages.length > 0) {
                await increment_usage_counter(product.partner_id, "images_count", addedImages.length)
            }
        } else if (payload.images && Array.isArray(payload.images) && payload.images.length > 0) {
            await increment_usage_counter(product.partner_id, "images_count", payload.images.length)
        }

        if (
            product.video_type === "upload" &&
            payload.video_url !== undefined &&
            product.video_url &&
            product.video_url !== payload.video_url
        ) {
            Promise.all([
                _deleteOwnedProductMediaFromR2(product.video_url, cleanupUser.id),
                product.video_thumbnail ? _deleteOwnedProductMediaFromR2(product.video_thumbnail, cleanupUser.id) : Promise.resolve(),
            ]).catch(console.error)
        }

        // Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(productId, product.partner_id, 'update')

        if (moderationDeferred) {
            await scheduleDeferredTextModeration({
                entityType: "product",
                entityId: productId,
                partnerId: product.partner_id,
                autoApprove: product.moderation_status === "approved" && !data.requiresManualModeration,
                texts: [data.name, data.description],
            })
        }

        // Agenda checagem assíncrona das imagens no Sightengine
        if (data.images !== undefined) {
            await scheduleDeferredImageModeration({
                entityType: "product",
                entityId: productId,
                partnerId: product.partner_id,
                images: data.images || [],
            })
        }

        // Fire-and-forget: low stock notification
        if (data.stockQuantity !== undefined || data.minStock !== undefined) {
            const { notifyLowStockAction } = await import("./notifications")
            notifyLowStockAction(productId).catch((err: Error) =>
                console.error("[notifications] low stock notification failed", err.message)
            )
        }

        // Sincroniza estoque manual alterado no cadastro do produto com ERPs conectados (Tiny / Bling)
        if (
            data.stockQuantity !== undefined &&
            Number(data.stockQuantity) !== Number(product.stock_quantity || 0)
        ) {
            import("@/lib/services/integrations/erp-sync")
                .then(({ syncStockToConnectedErps }) =>
                    syncStockToConnectedErps({
                        partnerId: product.partner_id,
                        productId,
                        sku: data.sku || product.sku || undefined,
                        newStock: Number(data.stockQuantity),
                        reason: "Edição de estoque no cadastro do produto (Dudit)",
                    })
                )
                .catch(() => {})
        }

        return successResponse({ ...updatedProduct, ...fiscalPayload, ...logisticsPayload })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

// ============================================================================
// VARIANTS
// ============================================================================

export async function createProductVariantAction(data: {
    productId: string
    variantType: string
    variantName: string
    sku: string | null
    priceAdjustment: number
    stockQuantity: number
}) {
    // SECURITY FIX (MED-02): Add rate limiting
    await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)
    try {
        if (!Number.isFinite(Number(data.priceAdjustment)) || !Number.isFinite(Number(data.stockQuantity))) {
            return { error: "Preço ou estoque de variante inválido" }
        }
        if (String(data.variantType || "").length > 100 || String(data.variantName || "").length > 100) {
            return { error: "Dados da variante excedem o limite permitido" }
        }
        const product = await fetchProductAndVerifyOwnership(data.productId, "edit")
        if (Number(data.stockQuantity || 0) !== 0) {
            const user = await requireUser()
            await requirePermission(product.partner_id, "stock_movements", "create", user)
            if (product.store_id) await requireStorePermission(product.store_id, product.partner_id, "stock_movements", "create")
        }

        // Check subscription feature
        if (!await canUseFeature(product.partner_id, "product_variants")) {
            return { error: "Seu plano não permite o uso de variações. Faça upgrade para desbloquear." }
        }

        const supabase = await getSupabaseServerClient()

        const variantSku = data.sku || `${product.sku}${data.variantName.substring(0, 3).toUpperCase()}`

        const { error } = await supabase.from("product_variants").insert({
            product_id: data.productId,
            variant_type: data.variantType,
            variant_name: data.variantName,
            sku: variantSku,
            price_adjustment: data.priceAdjustment,
            stock_quantity: data.stockQuantity,
            status: "ativo",
        })

        if (error) return { error: error.message }

        await invalidateProductCache(data.productId, product.partner_id, 'update')

        if (data.stockQuantity !== undefined) {
            import("@/lib/services/integrations/erp-sync")
                .then(({ syncStockToConnectedErps }) =>
                    syncStockToConnectedErps({
                        partnerId: product.partner_id,
                        productId: data.productId,
                        sku: variantSku,
                        newStock: Number(data.stockQuantity),
                        reason: "Criação/atualização de estoque da variação (Dudit)",
                    })
                )
                .catch(() => {})
        }

        return { success: true, variantSku }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function createProductVariantsBatchAction(data: {
    productId: string
    variants: Array<{
        variantName: string
        variantType: string
        variantValue: string
        sku: string
        price: number
        stockQuantity: number
        image?: string | null
        isActive: boolean
    }>
    csrf_token?: string
    deletedImages?: string[]
}): Promise<ActionResponse<any>> {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    if (data.variants && data.variants.length > 50) {
        return errorResponse("Limite máximo de 50 variações por vez excedido.")
    }

    // Validar limite máximo de 30 valores únicos por tipo de variante e limite de 30 caracteres
    if (data.variants && Array.isArray(data.variants)) {
        const uniqueValuesPerType: Record<string, Set<string>> = {}

        for (const v of data.variants) {
            if (!v.variantType || !v.variantValue) continue
            const types = v.variantType.split(" / ").map((t: string) => t.trim())
            const values = v.variantValue.split(" / ").map((val: string) => val.trim())

            for (let idx = 0; idx < types.length; idx++) {
                const type = types[idx]
                const val = values[idx]
                if (!type || !val) continue

                if (type.length > 30) {
                    return errorResponse(`O tipo de variante "${type}" excede o limite máximo de 30 caracteres.`)
                }
                if (val.length > 30) {
                    return errorResponse(`O valor de variação "${val}" excede o limite máximo de 30 caracteres.`)
                }

                if (!uniqueValuesPerType[type]) {
                    uniqueValuesPerType[type] = new Set()
                }
                uniqueValuesPerType[type].add(val)
            }
        }

        for (const [type, uniqueSet] of Object.entries(uniqueValuesPerType)) {
            if (uniqueSet.size > 30) {
                return errorResponse(`O tipo de variante "${type}" excede o limite máximo de 30 valores permitidos (possui ${uniqueSet.size}).`)
            }
        }
    }

    try {
        const [csrf, product] = await Promise.all([
            validateCSRF(data as Record<string, unknown>),
            fetchProductAndVerifyOwnership(data.productId, "edit", "id, partner_id, images, sku, name, promotional_price")
        ])
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")
        const cleanupUser = await requireUser()

        if (data.variants.some((variant) => Number(variant.stockQuantity || 0) !== 0)) {
            const user = await requireUser()
            await requirePermission(product.partner_id, "stock_movements", "create", user)
            if (product.store_id) await requireStorePermission(product.store_id, product.partner_id, "stock_movements", "create")
        }

        const requestedSkus = data.variants.map((variant) => String(variant.sku || "").trim()).filter(Boolean)
        if (new Set(requestedSkus).size !== requestedSkus.length) {
            return errorResponse("Cada variante precisa ter um SKU exclusivo.")
        }

        const supabase = await getSupabaseServerClient()

        // 1. Validar plano e buscar variantes existentes em paralelo
        const [isVariantsAllowed, existingVariantsRes] = await Promise.all([
            canUseFeature(product.partner_id, "product_variants"),
            supabase.from("product_variants").select("*").eq("product_id", data.productId)
        ])

        if (!isVariantsAllowed) {
            return errorResponse("Seu plano não permite o uso de variantes. Faça upgrade para desbloquear.")
        }

        const existingVariants = existingVariantsRes.data

        // 2. Preparar dados para upsert
        const variantsToUpsert = data.variants.map(v => ({
            product_id: data.productId,
            variant_name: v.variantName,
            variant_type: v.variantType,
            variant_value: v.variantValue,
            sku: v.sku,
            price_adjustment: v.price,
            stock_quantity: v.stockQuantity,
            variant_options: v.image ? { image: v.image } : null,
            is_active: v.isActive,
            updated_at: new Date().toISOString(),
        }))

        // Se houver variantes antigas deste produto removidas na edição, apaga do banco
        if (existingVariants && existingVariants.length > 0) {
            const incomingSkus = new Set(data.variants.map(v => String(v.sku || "").trim().toLowerCase()).filter(Boolean))
            const idsToDelete = existingVariants
                .filter(ev => ev.sku && !incomingSkus.has(String(ev.sku).trim().toLowerCase()))
                .map(ev => ev.id)

            if (idsToDelete.length > 0) {
                await supabase.from("product_variants").delete().in("id", idsToDelete)
            }
        }

        // 3. Fazer upsert em lote com base no SKU (evita duplicate key value violates unique constraint "product_variants_sku_key")
        const { data: inserted, error } = await supabase
            .from("product_variants")
            .upsert(variantsToUpsert, { onConflict: 'sku' })
            .select()

        if (error) return errorResponse(error.message)

        if (product.promotional_price && Number(product.promotional_price) !== 0) {
            await supabase.from("products").update({
                promotional_price: null,
                is_on_promotion: false
            }).eq("id", data.productId)
        }

        // 4+5. Deletar imagens removidas com segurança máxima (NUNCA deletar imagens que ainda estejam em uso)
        const currentInUseImages = new Set<string>()
        data.variants.forEach(v => {
            if (v.image && typeof v.image === 'string' && v.image.trim()) {
                currentInUseImages.add(v.image.trim())
            }
        })
        if (Array.isArray(product.images)) {
            product.images.forEach((img: string) => {
                if (img && typeof img === 'string' && img.trim()) {
                    currentInUseImages.add(img.trim())
                }
            })
        }

        const imagesToCleanup = new Set<string>()
        if (existingVariants && Array.isArray(existingVariants)) {
            for (const v of existingVariants) {
                const img = v.variant_options?.image
                if (img && typeof img === 'string' && img.trim() && !currentInUseImages.has(img.trim())) {
                    imagesToCleanup.add(img.trim())
                }
            }
        }
        if (data.deletedImages?.length) {
            for (const img of data.deletedImages) {
                if (img && typeof img === 'string' && img.trim() && !currentInUseImages.has(img.trim())) {
                    imagesToCleanup.add(img.trim())
                }
            }
        }

        const uniqueNewImages = new Set<string>()
        data.variants.forEach(v => {
            if (v.image && (!existingVariants?.some((ev: any) => ev.variant_options?.image === v.image))) {
                uniqueNewImages.add(v.image)
            }
        })
        const newImagesCount = uniqueNewImages.size

        if (imagesToCleanup.size > 0) {
            Promise.all(Array.from(imagesToCleanup).map(img => _deleteOwnedProductMediaFromR2(img, cleanupUser.id))).catch(console.error)
            await decrement_usage_counter(product.partner_id, "images_count", imagesToCleanup.size)
        }

        if (newImagesCount > 0) {
            await increment_usage_counter(product.partner_id, "images_count", newImagesCount)
        }

        await invalidateProductCache(data.productId, product.partner_id, 'update')

        // Sincroniza estoque das variações alteradas/criadas com ERPs conectados (Tiny / Bling)
        if (Array.isArray(inserted) && inserted.length > 0) {
            const prevBySku = new Map<string, number>(
                (existingVariants || [])
                    .filter((ev: any) => ev?.sku)
                    .map((ev: any) => [String(ev.sku).trim().toLowerCase(), Number(ev.stock_quantity || 0)])
            )
            const changedVariants = inserted.filter((v: any) => {
                const k = String(v?.sku || "").trim().toLowerCase()
                if (!prevBySku.has(k)) return true
                return Number(v.stock_quantity || 0) !== prevBySku.get(k)
            })
            if (changedVariants.length > 0) {
                import("@/lib/services/integrations/erp-sync")
                    .then(({ syncItemsStockToConnectedErps }) =>
                        syncItemsStockToConnectedErps({
                            partnerId: product.partner_id,
                            items: changedVariants.map((v: any) => ({
                                productId: data.productId,
                                variantId: v.id,
                                sku: v.sku || null,
                                newStock: Number(v.stock_quantity || 0),
                            })),
                            reason: "Edição de estoque em variações (Dudit)",
                        })
                    )
                    .catch(() => {})
            }
        }

        return successResponse(inserted)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function getProductVariantsAction(productId: string): Promise<ActionResponse<any>> {
    try {
        await verifyAuth()
        // LOW-02: Ensure ownership logic restricts who can list variants
        await fetchProductAndVerifyOwnership(productId, "view")

        const getCachedVariants = unstable_cache(
            async () => {
                const supabase = getAdminClient()
                const { data, error } = await supabase
                    .from("product_variants")
                    .select("*")
                    .eq("product_id", productId)
                    .order("created_at", { ascending: true })
                if (error) throw error
                return data || []
            },
            [`product-variants-${productId}`],
            { tags: [TAGS.product(productId)], revalidate: 3600 },
        )
        const data = await getCachedVariants()
        const transformed = data.map((v: any) => ({
            id: v.id,
            name: v.variant_name,
            type: v.variant_type,
            value: v.variant_value,
            sku: v.sku,
            price: v.price_adjustment,
            stock: v.stock_quantity,
            stock_reserved: Math.max(0, Number(v.stock_reserved) || 0),
            stock_available: Number(v.stock_available ?? ((Number(v.stock_quantity) || 0) - (Math.max(0, Number(v.stock_reserved) || 0)))),
            image: v.variant_options?.image || null,
            status: v.is_active,
            color: v.variant_type === "Cor" ? v.variant_value : null,
            size: v.variant_type === "Tamanho" ? v.variant_value : null,
        }))
        return successResponse(transformed)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function deleteProductVariantAction(variantId: string): Promise<ActionResponse<any>> {
    try {
        const user = await verifyAuth()
        const supabase = await getSupabaseServerClient()
        const { data: variant } = await supabase.from("product_variants").select("product_id, variant_options").eq("id", variantId).single()
        if (!variant) return errorResponse("Variante não encontrada")

        const product = await fetchProductAndVerifyOwnership(variant.product_id, "edit")
        const { error } = await supabase.from("product_variants").delete().eq("id", variantId).eq("product_id", variant.product_id)
        if (error) return errorResponse(error.message)

        const variantImage = variant.variant_options?.image
        if (variantImage) {
            // Verificar se outras variantes do mesmo produto ou o produto ainda usam esta imagem antes de apagar
            const { data: siblingVariants } = await supabase
                .from("product_variants")
                .select("variant_options")
                .eq("product_id", variant.product_id)

            const isImageStillInUse = siblingVariants?.some(sv => sv.variant_options?.image === variantImage) ||
                (Array.isArray(product.images) && product.images.includes(variantImage))

            if (!isImageStillInUse) {
                Promise.resolve().then(() => _deleteOwnedProductMediaFromR2(variantImage, user.id)).catch(console.error)
            }
        }

        Promise.resolve().then(() => {
            revalidateProducts(product.partner_id, variant.product_id)
            syncToExploreRedis({ id: variant.product_id, type: "produto", data: {} })
        }).catch(console.error)
        return successResponse({ deleted: true })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function updateProductVariantAction(variantId: string, data: {
    variantName?: string; sku?: string; price?: number; stockQuantity?: number; isActive?: boolean; image?: string | null
}): Promise<ActionResponse<any>> {
    try {
        const user = await verifyAuth()
        if (data.price !== undefined && (!Number.isFinite(Number(data.price)) || Number(data.price) < 0)) return errorResponse("Preço de variante inválido")
        if (data.stockQuantity !== undefined && !Number.isFinite(Number(data.stockQuantity))) return errorResponse("Estoque de variante inválido")
        if (data.variantName !== undefined && (typeof data.variantName !== "string" || data.variantName.length > 100)) return errorResponse("Nome de variante inválido")
        if (data.sku !== undefined && (typeof data.sku !== "string" || data.sku.length > 100)) return errorResponse("SKU de variante inválido")
        if (data.isActive !== undefined && typeof data.isActive !== "boolean") return errorResponse("Status de variante inválido")
        if (data.image !== undefined && data.image !== null && (typeof data.image !== "string" || data.image.length > 2048)) return errorResponse("Imagem de variante inválida")
        const supabase = await getSupabaseServerClient()

        const { data: variant } = await supabase.from("product_variants").select("product_id, variant_options").eq("id", variantId).single()
        if (!variant) return errorResponse("Variante não encontrada")

        const product = await fetchProductAndVerifyOwnership(variant.product_id, "edit")
        if (data.stockQuantity !== undefined) {
            const user = await requireUser()
            await requirePermission(product.partner_id, "stock_movements", "create", user)
            if (product.store_id) await requireStorePermission(product.store_id, product.partner_id, "stock_movements", "create")
        }

        const payload: any = { updated_at: new Date().toISOString() }
        if (data.variantName !== undefined) payload.variant_name = data.variantName
        if (data.sku !== undefined) payload.sku = data.sku
        if (data.price !== undefined) payload.price_adjustment = data.price
        if (data.stockQuantity !== undefined) payload.stock_quantity = data.stockQuantity
        if (data.isActive !== undefined) payload.is_active = data.isActive
        if (data.image !== undefined) {
            if (data.image !== null && variant.variant_options?.image && variant.variant_options.image !== data.image) {
                const oldImage = variant.variant_options.image
                const { data: siblingVariants } = await supabase
                    .from("product_variants")
                    .select("variant_options")
                    .eq("product_id", variant.product_id)
                    .neq("id", variantId)

                const isOldImageStillInUse = siblingVariants?.some(sv => sv.variant_options?.image === oldImage) ||
                    (Array.isArray(product.images) && product.images.includes(oldImage))

                if (!isOldImageStillInUse) {
                    await _deleteOwnedProductMediaFromR2(oldImage, user.id).catch(console.error)
                }
            }
            payload.variant_options = { ...(variant.variant_options || {}), image: data.image }
        }

        const { data: updated, error } = await supabase.from("product_variants").update(payload).eq("id", variantId).eq("product_id", variant.product_id).select().single()
        if (error) return errorResponse(error.message)

        Promise.resolve().then(() => revalidateProducts(product.partner_id, variant.product_id)).catch(console.error)

        if (data.stockQuantity !== undefined) {
            import("@/lib/services/integrations/erp-sync")
                .then(({ syncStockToConnectedErps }) =>
                    syncStockToConnectedErps({
                        partnerId: product.partner_id,
                        productId: variant.product_id,
                        variantId,
                        sku: updated?.sku || data.sku || undefined,
                        newStock: Number(data.stockQuantity),
                        reason: "Edição de estoque da variação (Dudit)",
                    })
                )
                .catch(() => {})
        }

        return successResponse(updated)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function batchDeleteVariantsAction(variantIds: string[]): Promise<ActionResponse<any>> {
    try {
        const user = await verifyAuth()
        if (!variantIds?.length) return successResponse({ deletedCount: 0 })
        if (variantIds.length > 100) return errorResponse("Máximo: 100 variantes por operação.")
        if (new Set(variantIds).size !== variantIds.length) return errorResponse("A lista contém variantes repetidas.")

        const supabase = await getSupabaseServerClient()

        const { data: variants } = await supabase
            .from("product_variants")
            .select("id, product_id, variant_options, products!inner(partner_id, store_id, partners!inner(user_id))")
            .in("id", variantIds)

        if (!variants || variants.length === 0) return errorResponse("Variantes não encontradas")

        // SECURITY (BOLA/IDOR fix): authorize EVERY requested variant, not just variants[0].
        // 1) Every requested id must have been resolved (no silent partial sets).
        const uniqueRequestedIds = Array.from(new Set(variantIds))
        if (variants.length !== uniqueRequestedIds.length) {
            return errorResponse("Uma ou mais variantes não foram encontradas")
        }
        // 2) All variants must belong to a single partner (reject cross-tenant batches).
        const productPartnerId = await verifyVariantBatchOwnership(variants, user)

        const candidateImages = variants.filter((v: any) => v.variant_options?.image).map((v: any) => v.variant_options.image)

        const { error } = await supabase.from("product_variants").delete().in("id", variantIds)
        if (error) return errorResponse(error.message)

        if (candidateImages.length > 0) {
            const productIds = Array.from(new Set(variants.map(v => v.product_id)))
            const { data: remainingVariants } = await supabase
                .from("product_variants")
                .select("variant_options")
                .in("product_id", productIds)

            const remainingImages = new Set<string>()
            remainingVariants?.forEach(rv => {
                if (rv.variant_options?.image) remainingImages.add(rv.variant_options.image)
            })

            const imagesToDelete = Array.from(new Set(candidateImages)).filter(img => !remainingImages.has(img))
            if (imagesToDelete.length > 0) {
                Promise.all(imagesToDelete.map((img: string) => _deleteOwnedProductMediaFromR2(img, user.id))).catch(() => null)
            }
        }

        const firstProd = Array.isArray(variants[0]?.products) ? variants[0].products[0] : variants[0]?.products
        if (firstProd?.partner_id) {
            await invalidateProductCache(variants[0].product_id, firstProd.partner_id, 'update')
        }
        return successResponse({ deletedCount: variantIds.length })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function batchUpdateVariantsAction(updates: Array<{ id: string; price?: number; stock?: number; active?: boolean; image?: string }>): Promise<ActionResponse<any>> {
    try {
        const user = await verifyAuth()
        if (!updates?.length) return successResponse({ updatedCount: 0 })
        if (updates.length > 100) return errorResponse("Máximo: 100 variantes por operação.")
        const allowedFields = new Set(["id", "price", "stock", "active", "image"])
        for (const update of updates) {
            if (!update || Object.keys(update).some((key) => !allowedFields.has(key))) return errorResponse("Campo inválido na atualização de variantes.")
            if (update.price !== undefined && (!Number.isFinite(Number(update.price)) || Number(update.price) < 0)) return errorResponse("Preço de variante inválido.")
            if (update.stock !== undefined && !Number.isFinite(Number(update.stock))) return errorResponse("Estoque de variante inválido.")
            if (update.active !== undefined && typeof update.active !== "boolean") return errorResponse("Status de variante inválido.")
            if (update.image !== undefined && (typeof update.image !== "string" || update.image.length > 2048)) return errorResponse("Imagem de variante inválida.")
        }

        const supabase = await getSupabaseServerClient()
        const variantIds = updates.map(u => u.id)
        if (new Set(variantIds).size !== variantIds.length) return errorResponse("A lista contém variantes repetidas.")

        const { data: variants } = await supabase
            .from("product_variants")
            .select("id, product_id, variant_options, products!inner(partner_id, store_id, partners!inner(user_id))")
            .in("id", variantIds)

        if (!variants || variants.length === 0) return errorResponse("Variantes não encontradas")

        // SECURITY (BOLA/IDOR fix): authorize EVERY requested variant, not just variants[0].
        const uniqueRequestedIds = Array.from(new Set(variantIds))
        if (variants.length !== uniqueRequestedIds.length) {
            return errorResponse("Uma ou mais variantes não foram encontradas")
        }
        const productPartnerId = await verifyVariantBatchOwnership(variants, user)

        if (updates.some((update) => update.stock !== undefined)) {
            await requirePermission(productPartnerId, "stock_movements", "create", user)
            const storeIds = Array.from(new Set(variants
                .map((variant: any) => (Array.isArray(variant.products) ? variant.products[0] : variant.products)?.store_id)
                .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)))
            await Promise.all(storeIds.map((storeId) => requireStorePermission(storeId, productPartnerId, "stock_movements", "create")))
        }

        const results = await Promise.all(updates.map(update => {
            const current = variants.find((v: any) => v.id === update.id)
            if (!current) return Promise.resolve({ error: { message: "Variante não encontrada" } })

            const payload: any = { updated_at: new Date().toISOString() }
            if (update.price !== undefined) payload.price_adjustment = update.price
            if (update.stock !== undefined) payload.stock_quantity = update.stock
            if (update.active !== undefined) payload.is_active = update.active
            if (update.image !== undefined) {
                payload.variant_options = { ...(current.variant_options || {}), image: update.image }
            }
            return supabase.from("product_variants").update(payload).eq("id", update.id).eq("product_id", current.product_id)
        }))
        const firstError = results.find((result: any) => result?.error)
        if (firstError) return errorResponse(firstError.error?.message || "Falha ao atualizar variantes.")

        const firstProd = Array.isArray(variants[0]?.products) ? variants[0].products[0] : variants[0]?.products
        if (firstProd?.partner_id) {
            await invalidateProductCache(variants[0].product_id, firstProd.partner_id, 'update')

            const stockUpdates = updates.filter((u) => u.stock !== undefined)
            if (stockUpdates.length > 0) {
                import("@/lib/services/integrations/erp-sync")
                    .then(({ syncItemsStockToConnectedErps }) =>
                        syncItemsStockToConnectedErps({
                            partnerId: firstProd.partner_id,
                            items: stockUpdates.map((u) => {
                                const current = variants.find((v: any) => v.id === u.id)
                                return {
                                    productId: current?.product_id || variants[0].product_id,
                                    variantId: u.id,
                                    newStock: Number(u.stock),
                                }
                            }),
                            reason: "Edição em lote de estoque de variações (Dudit)",
                        })
                    )
                    .catch(() => {})
            }
        }
        return successResponse({ updatedCount: updates.length })
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

// ============================================================================
// FORNECEDORES
// ============================================================================

export async function linkProductSupplierAction(productId: string, supplierId: string, supplierData?: { costPrice?: number; supplierSku?: string; leadTimeDays?: number }) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit")
        await requirePermission(product.partner_id, "suppliers", "create")
        await requireSuppliersBelongToPartner([supplierId], product.partner_id)
        if (supplierData?.costPrice !== undefined && (!Number.isFinite(Number(supplierData.costPrice)) || Number(supplierData.costPrice) < 0)) return { error: "Custo inválido" }
        if (supplierData?.leadTimeDays !== undefined && (!Number.isInteger(Number(supplierData.leadTimeDays)) || Number(supplierData.leadTimeDays) < 0)) return { error: "Prazo inválido" }
        const admin = getAdminClient()

        const { error } = await admin.from("product_suppliers").insert({
            product_id: productId,
            supplier_id: supplierId,
            cost_price: supplierData?.costPrice || null,
            supplier_sku: supplierData?.supplierSku || null,
            lead_time_days: supplierData?.leadTimeDays || null,
        })
        if (error && !error.message.includes("duplicate")) return { error: error.message }

        await Promise.all([
            revalidateSuppliers(product.partner_id),
            revalidateProducts(product.partner_id, productId),
        ])
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function linkProductSuppliersBatchAction(productId: string, supplierIds: string[]) {
    try {
        if (!supplierIds || supplierIds.length === 0) return { success: true }
        const product = await fetchProductAndVerifyOwnership(productId, "edit")
        await requirePermission(product.partner_id, "suppliers", "create")
        await requireSuppliersBelongToPartner(supplierIds, product.partner_id)
        const admin = getAdminClient()

        const payload = supplierIds.map((supplierId) => ({
            product_id: productId,
            supplier_id: supplierId,
        }))

        const { error } = await admin
            .from("product_suppliers")
            .upsert(payload, { onConflict: "product_id,supplier_id", ignoreDuplicates: true })

        if (error) return { error: error.message }

        await Promise.all([
            revalidateSuppliers(product.partner_id),
            revalidateProducts(product.partner_id, productId),
        ])
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function unlinkProductSupplierAction(productId: string, supplierId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit")
        await requirePermission(product.partner_id, "suppliers", "delete")
        await requireSuppliersBelongToPartner([supplierId], product.partner_id)
        const admin = getAdminClient()
        const { error } = await admin.from("product_suppliers").delete().eq("product_id", productId).eq("supplier_id", supplierId)
        if (error) return { error: error.message }

        await Promise.all([
            revalidateSuppliers(product.partner_id),
            revalidateProducts(product.partner_id, productId),
        ])
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateProductSupplierAction(productId: string, supplierId: string, data: { costPrice?: number | null; supplierSku?: string | null; leadTimeDays?: number | null }) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit")
        await requirePermission(product.partner_id, "suppliers", "edit")
        await requireSuppliersBelongToPartner([supplierId], product.partner_id)
        if (data.costPrice != null && (!Number.isFinite(Number(data.costPrice)) || Number(data.costPrice) < 0)) return { error: "Custo inválido" }
        if (data.leadTimeDays != null && (!Number.isInteger(Number(data.leadTimeDays)) || Number(data.leadTimeDays) < 0)) return { error: "Prazo inválido" }
        if (data.supplierSku != null && data.supplierSku.length > 100) return { error: "SKU do fornecedor muito longo" }
        const admin = getAdminClient()
        const updates: any = {}
        if (data.costPrice !== undefined) updates.cost_price = data.costPrice
        if (data.supplierSku !== undefined) updates.supplier_sku = data.supplierSku
        if (data.leadTimeDays !== undefined) updates.lead_time_days = data.leadTimeDays
        const { error } = await admin.from("product_suppliers").update(updates).eq("product_id", productId).eq("supplier_id", supplierId)
        if (error) return { error: error.message }
        await Promise.all([
            revalidateSuppliers(product.partner_id),
            revalidateProducts(product.partner_id, productId),
        ])
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export const getCachedSuppliers = async (partnerId: string) => {
    const user = await requireUser()
    const context = await getCurrentPartnerContext(user)
    if (!context?.partnerId || context.partnerId !== partnerId) throw new Error("O parceiro informado não corresponde ao contexto ativo")
    await requirePermission(partnerId, "suppliers", "view", user)
    const rows = await unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data } = await supabase.from("suppliers").select("id, name, email, phone, cnpj, cpf, status").eq("partner_id", partnerId).order("name")
            return data || []
        },
        [`suppliers-list-${partnerId}`],
        { tags: [TAGS.suppliers(partnerId)], revalidate: 60 }
    )()
    return Promise.all((rows || []).map(async (supplier: any) => ({
        ...supplier,
        cpf: await decryptCpfIfEncrypted(supplier.cpf),
    })))
}

export async function getProductSuppliersAction(productId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "view")
        await requirePermission(product.partner_id, "suppliers", "view")
        const admin = getAdminClient()
        const { data, error } = await admin
            .from("product_suppliers")
            .select(`
                id, product_id, supplier_id, cost_price, supplier_sku, lead_time_days,
                last_purchase_price, last_purchase_date, last_invoice_key,
                supplier:suppliers(id, partner_id, name, email, phone, cnpj, cpf, image_url)
            `)
            .eq("product_id", productId)
        if (error) return { error: error.message }
        const suppliers = await Promise.all((data || []).filter((ps: any) => ps.supplier?.partner_id === product.partner_id).map(async (ps: any) => ({
            id: ps.id,
            product_id: ps.product_id,
            supplier_id: ps.supplier_id,
            cost_price: ps.cost_price,
            supplier_sku: ps.supplier_sku,
            lead_time_days: ps.lead_time_days,
            last_purchase_price: ps.last_purchase_price,
            last_purchase_date: ps.last_purchase_date,
            last_invoice_key: ps.last_invoice_key,
            supplier_name: ps.supplier?.name || "",
            supplier_email: ps.supplier?.email || null,
            supplier_phone: ps.supplier?.phone || null,
            supplier_document: ps.supplier?.cnpj || await decryptCpfIfEncrypted(ps.supplier?.cpf) || null,
            supplier_image_url: ps.supplier?.image_url || null,
        })))

        // Cidade/UF vêm da tabela de endereços (mesma abordagem da listagem de fornecedores)
        const supplierIds = suppliers.map((s: any) => s.supplier_id).filter(Boolean)
        if (supplierIds.length > 0) {
            const { data: addrRows } = await admin
                .from("addresses")
                .select("supplier_id, city, state")
                .in("supplier_id", supplierIds)

            if (addrRows && addrRows.length > 0) {
                const addrMap = new Map<string, { city: string | null; state: string | null }>()
                for (const a of addrRows) {
                    if (!addrMap.has(a.supplier_id)) {
                        addrMap.set(a.supplier_id, { city: a.city, state: a.state })
                    }
                }
                suppliers.forEach((s: any) => {
                    const addr = addrMap.get(s.supplier_id)
                    s.supplier_city = addr?.city || null
                    s.supplier_state = addr?.state || null
                })
            }
        }

        return { suppliers, partnerId: product.partner_id }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getProductSuppliersOverviewAction(
    productId: string,
    options?: { selectedSupplierId?: string | null; purchasesPage?: number; purchasesLimit?: number }
) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "view")
        await requirePermission(product.partner_id, "suppliers", "view")
        const admin = getAdminClient()
        const purchasesPage = options?.purchasesPage || 1
        const purchasesLimit = options?.purchasesLimit || 5
        const offset = (purchasesPage - 1) * purchasesLimit
        const selectedSupplierId = options?.selectedSupplierId || null
        if (selectedSupplierId) await requireSuppliersBelongToPartner([selectedSupplierId], product.partner_id)

        let purchasesQuery = admin
            .from("xml_import_items")
            .select(`
                id, raw_quantity, raw_unit_cost, raw_total_cost, raw_name, created_at,
                xml_import_id,
                xml_import:xml_imports(id, invoice_number, invoice_date, supplier_id)
            `, { count: "exact" })
            .not("match_status", "eq", "skipped")
            .or(`matched_product_id.eq.${productId},created_product_id.eq.${productId}`)
            .order("created_at", { ascending: false })
            .range(offset, offset + purchasesLimit - 1)

        if (selectedSupplierId) {
            purchasesQuery = purchasesQuery.eq("xml_import.supplier_id", selectedSupplierId)
        }

        const [suppliersRes, purchasesRes, costHistoryRes] = await Promise.all([
            admin.from("product_suppliers").select(`
                id, product_id, supplier_id, cost_price, supplier_sku, lead_time_days,
                last_purchase_price, last_purchase_date, last_invoice_key,
                supplier:suppliers(id, partner_id, name, email, phone, cnpj, cpf, image_url)
            `).eq("product_id", productId),
            purchasesQuery,
            admin.from("purchase_cost_history").select(
                `id, previous_cost, new_cost, unit_cost_from_xml, changed_at, invoice_key, supplier_id`
            ).eq("product_id", productId).order("changed_at", { ascending: false }).limit(10)
        ])

        if (suppliersRes.error) return { error: suppliersRes.error.message }

        const suppliers = await Promise.all((suppliersRes.data || []).filter((ps: any) => ps.supplier?.partner_id === product.partner_id).map(async (ps: any) => ({
            id: ps.id,
            product_id: ps.product_id,
            supplier_id: ps.supplier_id,
            cost_price: ps.cost_price,
            supplier_sku: ps.supplier_sku,
            lead_time_days: ps.lead_time_days,
            last_purchase_price: ps.last_purchase_price,
            last_purchase_date: ps.last_purchase_date,
            last_invoice_key: ps.last_invoice_key,
            supplier_name: ps.supplier?.name || "",
            supplier_email: ps.supplier?.email || null,
            supplier_phone: ps.supplier?.phone || null,
            supplier_document: ps.supplier?.cnpj || await decryptCpfIfEncrypted(ps.supplier?.cpf) || null,
            supplier_image_url: ps.supplier?.image_url || null,
        })))

        const supplierNameMap: Record<string, string> = {}
        suppliers.forEach((s: any) => {
            if (s.supplier_id) supplierNameMap[s.supplier_id] = s.supplier_name
        })

        const missingSupplierIds = new Set<string>()
        purchasesRes.data?.forEach((i: any) => {
            const sid = i.xml_import?.supplier_id
            if (sid && !supplierNameMap[sid]) missingSupplierIds.add(sid)
        })
        costHistoryRes.data?.forEach((h: any) => {
            const sid = h.supplier_id
            if (sid && !supplierNameMap[sid]) missingSupplierIds.add(sid)
        })

        if (missingSupplierIds.size > 0) {
            const { data: extraSuppliers } = await admin.from("suppliers").select("id, name").in("id", Array.from(missingSupplierIds))
            extraSuppliers?.forEach((s: any) => {
                supplierNameMap[s.id] = s.name
            })
        }

        const purchases = (purchasesRes.data || []).map((item: any) => ({
            id: item.id,
            quantity: item.raw_quantity,
            unit_cost: item.raw_unit_cost,
            total_cost: item.raw_total_cost,
            product_name: item.raw_name,
            date: item.xml_import?.invoice_date || item.created_at,
            invoice_number: item.xml_import?.invoice_number || null,
            supplier_id: item.xml_import?.supplier_id,
            supplier_name: supplierNameMap[item.xml_import?.supplier_id] || "",
            created_at: item.created_at,
        }))

        const allCostHistory = (costHistoryRes.data || []).map((h: any) => ({
            id: h.id,
            previous_cost: h.previous_cost,
            new_cost: h.new_cost,
            unit_cost_from_xml: h.unit_cost_from_xml,
            changed_at: h.changed_at,
            invoice_key: h.invoice_key,
            supplier_id: h.supplier_id,
            supplier_name: supplierNameMap[h.supplier_id] || "",
        }))

        const costHistory = selectedSupplierId
            ? allCostHistory.filter((h: any) => h.supplier_id === selectedSupplierId)
            : allCostHistory

        return {
            suppliers,
            purchases,
            purchasesTotal: purchasesRes.count || 0,
            costHistory,
            partnerId: product.partner_id
        }
    } catch (error: any) {
        return { error: error.message }
    }
}

/**
 * Detalhes leves de um fornecedor vinculado ao produto (aba Fornecedores).
 * Usado pela sheet de detalhes: só compras + histórico de custos daquele
 * fornecedor específico, sem recarregar a lista de fornecedores.
 */
export async function getProductSupplierDetailsAction(
    productId: string,
    supplierId: string,
    options?: {
        purchasesPage?: number
        purchasesLimit?: number
        costHistoryPage?: number
        costHistoryLimit?: number
    }
) {
    try {
        if (!productId || !supplierId) return { error: "Produto ou fornecedor inválido" }

        const product = await fetchProductAndVerifyOwnership(productId, "view")
        await requirePermission(product.partner_id, "suppliers", "view")
        await requireSuppliersBelongToPartner([supplierId], product.partner_id)
        const admin = getAdminClient()

        const purchasesLimit = options?.purchasesLimit || 5
        const purchasesPage = options?.purchasesPage || 1
        const purchasesOffset = (purchasesPage - 1) * purchasesLimit

        const costHistoryLimit = options?.costHistoryLimit || 3
        const costHistoryPage = options?.costHistoryPage || 1
        const costHistoryOffset = (costHistoryPage - 1) * costHistoryLimit

        const [purchasesRes, costHistoryRes] = await Promise.all([
            admin
                .from("xml_import_items")
                .select(`
                    id, raw_quantity, raw_unit_cost, raw_total_cost, raw_name, created_at,
                    xml_import:xml_imports!inner(id, invoice_number, invoice_date, supplier_id)
                `, { count: "exact" })
                .not("match_status", "eq", "skipped")
                .or(`matched_product_id.eq.${productId},created_product_id.eq.${productId}`)
                .eq("xml_import.supplier_id", supplierId)
                .order("created_at", { ascending: false })
                .range(purchasesOffset, purchasesOffset + purchasesLimit - 1),
            admin
                .from("purchase_cost_history")
                .select(`id, previous_cost, new_cost, unit_cost_from_xml, changed_at, invoice_key, supplier_id`, { count: "exact" })
                .eq("product_id", productId)
                .eq("supplier_id", supplierId)
                .order("changed_at", { ascending: false })
                .range(costHistoryOffset, costHistoryOffset + costHistoryLimit - 1)
        ])

        if (purchasesRes.error) return { error: purchasesRes.error.message }
        if (costHistoryRes.error) return { error: costHistoryRes.error.message }

        const purchases = (purchasesRes.data || []).map((item: any) => ({
            id: item.id,
            quantity: item.raw_quantity,
            unit_cost: item.raw_unit_cost,
            total_cost: item.raw_total_cost,
            product_name: item.raw_name,
            date: item.xml_import?.invoice_date || item.created_at,
            invoice_number: item.xml_import?.invoice_number || null,
            supplier_id: item.xml_import?.supplier_id,
            created_at: item.created_at,
        }))

        const costHistory = (costHistoryRes.data || []).map((h: any) => ({
            id: h.id,
            previous_cost: h.previous_cost,
            new_cost: h.new_cost,
            unit_cost_from_xml: h.unit_cost_from_xml,
            changed_at: h.changed_at,
            invoice_key: h.invoice_key,
            supplier_id: h.supplier_id,
        }))

        return {
            purchases,
            purchasesTotal: purchasesRes.count || 0,
            costHistory,
            costHistoryTotal: costHistoryRes.count || 0,
        }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function searchSuppliersAction(partnerId: string, search: string) {
    try {
        const user = await requireUser()
        const context = await getCurrentPartnerContext(user)
        if (!context?.partnerId || context.partnerId !== partnerId) return { error: "O parceiro informado não corresponde ao contexto ativo" }
        await requirePermission(partnerId, "suppliers", "view", user)
        const supabase = await getSupabaseServerClient()
        const sanitized = search.replace(/[%_]/g, "")
        if (!sanitized.trim()) {
            const { data } = await supabase.from("suppliers").select("id, name, email, phone, cnpj, cpf, image_url").eq("partner_id", partnerId).order("name").limit(20)
            return { suppliers: await Promise.all((data || []).map(async (supplier: any) => ({ ...supplier, cpf: await decryptCpfIfEncrypted(supplier.cpf) }))) }
        }
        const term = `%${sanitized}%`
        const { data, error } = await supabase
            .from("suppliers")
            .select("id, name, email, phone, cnpj, cpf, image_url")
            .eq("partner_id", partnerId)
            .or(`name.ilike.${term},email.ilike.${term},cnpj.ilike.${term},phone.ilike.${term}`)
            .order("name")
            .limit(20)
        if (error) return { error: error.message }
        const digits = sanitized.replace(/\D/g, "")
        const cpfHash = digits.length === 11 ? await generateCpfLookupHash(digits) : null
        let cpfMatches: any[] = []
        if (cpfHash) {
            const { data: matches, error: cpfError } = await supabase.from("suppliers")
                .select("id, name, email, phone, cnpj, cpf, image_url")
                .eq("partner_id", partnerId).eq("cpf_lookup_hash", cpfHash).limit(20)
            if (cpfError) return { error: cpfError.message }
            cpfMatches = matches || []
        }
        const unique = new Map<string, any>()
        for (const supplier of [...(data || []), ...cpfMatches]) unique.set(supplier.id, supplier)
        const suppliers = await Promise.all([...unique.values()].map(async (supplier: any) => ({
            ...supplier,
            cpf: await decryptCpfIfEncrypted(supplier.cpf),
        })))
        return { suppliers }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ============================================================================
// HISTÓRICO DE COMPRA
// ============================================================================

export async function getProductPurchaseHistoryAction(
    productId: string,
    options?: { limit?: number; offset?: number; supplierId?: string }
) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "view")
        await requirePermission(product.partner_id, "suppliers", "view")
        const supabase = await getSupabaseServerClient()
        const limit = options?.limit || 20
        const offset = options?.offset || 0

        // Get xml_import_ids and supplier_ids in one pass
        let query = supabase
            .from("xml_import_items")
            .select(`
                id, raw_quantity, raw_unit_cost, raw_total_cost, raw_name, created_at,
                xml_import_id,
                xml_import:xml_imports!inner(id, invoice_number, invoice_date, supplier_id)
            `, { count: "exact" })
            .not("match_status", "eq", "skipped")
            .or(`matched_product_id.eq.${productId},created_product_id.eq.${productId}`)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1)

        if (options?.supplierId) {
            query = query.eq("xml_import.supplier_id", options.supplierId)
        }

        const { data, error, count } = await query
        if (error) return { error: error.message }

        // Batch resolve supplier names
        const supplierIds = [...new Set((data || []).map((i: any) => i.xml_import?.supplier_id).filter(Boolean))]
        const supplierNameMap: Record<string, string> = {}
        if (supplierIds.length > 0) {
            const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds)
            if (suppliers) for (const s of suppliers) supplierNameMap[s.id] = s.name
        }

        const items = (data || []).map((item: any) => ({
            id: item.id,
            quantity: item.raw_quantity,
            unit_cost: item.raw_unit_cost,
            total_cost: item.raw_total_cost,
            product_name: item.raw_name,
            date: item.xml_import?.invoice_date || item.created_at,
            invoice_number: item.xml_import?.invoice_number || null,
            supplier_id: item.xml_import?.supplier_id,
            supplier_name: supplierNameMap[item.xml_import?.supplier_id] || "",
            created_at: item.created_at,
        }))

        return { items, total: count || 0 }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getProductCostHistoryAction(productId: string, limit = 10) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "view")
        await requirePermission(product.partner_id, "suppliers", "view")
        const supabase = await getSupabaseServerClient()
        const { data, error } = await supabase
            .from("purchase_cost_history")
            .select(`id, previous_cost, new_cost, unit_cost_from_xml, changed_at, invoice_key, supplier_id`)
            .eq("product_id", productId)
            .order("changed_at", { ascending: false })
            .limit(limit)
        if (error) return { error: error.message }

        const supplierIds = [...new Set((data || []).map((h: any) => h.supplier_id).filter(Boolean))]
        const supplierNameMap: Record<string, string> = {}
        if (supplierIds.length > 0) {
            const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds)
            if (suppliers) for (const s of suppliers) supplierNameMap[s.id] = s.name
        }

        const items = (data || []).map((h: any) => ({
            id: h.id,
            previous_cost: h.previous_cost,
            new_cost: h.new_cost,
            unit_cost_from_xml: h.unit_cost_from_xml,
            changed_at: h.changed_at,
            invoice_key: h.invoice_key,
            supplier_id: h.supplier_id,
            supplier_name: supplierNameMap[h.supplier_id] || "",
        }))
        return { items }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ============================================================================
// REPOSIÇÃO
// ============================================================================

export async function getReplenishmentSuggestionsAction(partnerId: string, storeId?: string) {
    try {
        const context = await requireProductReadContext(partnerId, storeId)
        await requirePermission(partnerId, "suppliers", "view", context.user)
        const admin = getAdminClient()

        let query = admin
            .from("products")
            .select(`
                id, name, sku, gtin, stock_quantity, min_stock, cost_price, unit, images,
                variants:product_variants(count),
                product_suppliers(supplier_id, cost_price)
            `)
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .gt("min_stock", 0)
            .order("name")
            .limit(200)

        if (context.storeId) query = query.or(`store_id.eq.${context.storeId},store_id.is.null`)

        const { data, error } = await query

        if (error) return { error: error.message }

        // Filter in-memory: stock_quantity <= min_stock
        const lowStockProducts = (data || []).filter((p: any) =>
            (Number(p.stock_quantity) || 0) <= (Number(p.min_stock) || 0)
        )

        // Batch resolve supplier names
        const supplierIds = [...new Set(lowStockProducts.flatMap((p: any) =>
            (p.product_suppliers || []).map((ps: any) => ps.supplier_id).filter(Boolean)
        ))]
        const supplierNameMap: Record<string, string> = {}
        if (supplierIds.length > 0) {
            const { data: suppliers } = await admin.from("suppliers").select("id, name").in("id", supplierIds)
            if (suppliers) for (const s of suppliers) supplierNameMap[s.id] = s.name
        }

        // Batch resolve variant aggregates for products that have variants
        const variantProductIds = lowStockProducts
            .filter((p: any) => {
                const count = Array.isArray(p.variants) ? p.variants[0]?.count ?? p.variants.length : 0
                return count > 0
            })
            .map((p: any) => p.id)
        const variantAggregates = await fetchVariantAggregates(variantProductIds)

        const suggestions = lowStockProducts.map((p: any) => {
            const stock = Number(p.stock_quantity) || 0
            const min = Number(p.min_stock) || 0
            const suggestion = Math.max(0, min - stock)
            const primarySupplier = p.product_suppliers?.[0]
            const agg = variantAggregates[p.id]
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                gtin: p.gtin,
                stock_quantity: stock,
                min_stock: min,
                suggestion,
                unit: p.unit || "un",
                cost_price: p.cost_price,
                images: Array.isArray(p.images) ? p.images : null,
                supplier_name: primarySupplier ? (supplierNameMap[primarySupplier.supplier_id] || null) : null,
                supplier_cost: primarySupplier?.cost_price || null,
                variant_min_price: agg?.variant_min_price ?? null,
                variant_max_price: agg?.variant_max_price ?? null,
            }
        })

        return { suggestions, total: suggestions.length }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getStagnantProductsAction(partnerId: string, days: number = 90, storeId?: string) {
    try {
        const context = await requireProductReadContext(partnerId, storeId)
        const admin = getAdminClient()

        const safeDays = Math.max(1, Math.min(3650, Math.floor(Number(days) || 90)))
        const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString()

        let query = admin
            .from("products")
            .select("id, name, sku, gtin, stock_quantity, price, cost_price, promotional_price, unit, images, variants:product_variants(count), created_at, updated_at")
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .gt("stock_quantity", 0)
            .lte("created_at", cutoff)
            .order("created_at", { ascending: true })
            .limit(200)

        if (context.storeId) query = query.or(`store_id.eq.${context.storeId},store_id.is.null`)

        const { data, error } = await query

        if (error) return { error: error.message }

        // Batch resolve variant aggregates for products that have variants
        const variantProductIds = (data || []).filter((p: any) => {
            const count = Array.isArray(p.variants) ? p.variants[0]?.count ?? p.variants.length : 0
            return count > 0
        }).map((p: any) => p.id)
        const variantAggregates = await fetchVariantAggregates(variantProductIds)

        const now = Date.now()
        const products = (data || []).map((p: any) => {
            const createdAtTime = new Date(p.created_at).getTime()
            const daysStagnant = Math.max(safeDays, Math.floor((now - createdAtTime) / (1000 * 60 * 60 * 24)))
            const agg = variantAggregates[p.id]
            return {
                id: p.id,
                name: p.name,
                sku: p.sku,
                gtin: p.gtin,
                stock_quantity: Number(p.stock_quantity) || 0,
                price: Number(p.price) || 0,
                cost_price: p.cost_price != null ? Number(p.cost_price) : null,
                promotional_price: p.promotional_price != null ? Number(p.promotional_price) : null,
                unit: p.unit || "un",
                images: Array.isArray(p.images) ? p.images : null,
                days_stagnant: daysStagnant,
                created_at: p.created_at,
                variant_min_price: agg?.variant_min_price ?? null,
                variant_max_price: agg?.variant_max_price ?? null,
            }
        })

        return { products, total: products.length }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateProductPromotionalPriceAction(params: {
    productId: string
    partnerId: string
    promotionalPrice: number | null
}) {
    try {
        if (params.promotionalPrice !== null && (!Number.isFinite(Number(params.promotionalPrice)) || Number(params.promotionalPrice) < 0)) {
            return { error: "Preço promocional inválido" }
        }
        const product = await fetchProductAndVerifyOwnership(params.productId, "edit", "id, partner_id, store_id")
        if (product.partner_id !== params.partnerId) return { error: "Produto não encontrado" }
        await requirePermission(params.partnerId, "products", "edit")
        const admin = getAdminClient()

        const { error } = await admin
            .from("products")
            .update({
                promotional_price: params.promotionalPrice,
                updated_at: new Date().toISOString(),
            })
            .eq("id", params.productId)
            .eq("partner_id", params.partnerId)

        if (error) return { error: error.message }

        await invalidateProductCache(params.productId, params.partnerId, "update").catch(() => { })

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export interface PricingAlert {
    id: string
    name: string
    sku: string | null
    gtin: string | null
    stock_quantity: number
    price: number
    cost_price: number
    promotional_price: number | null
    unit: string
    images: string[] | null
    has_variants: boolean
    status: "loss" | "thin"
    cause: "price" | "promo"
    base_price: number
    effective_price: number
    margin_percent: number | null
    suggested_price: number
    loss_per_unit: number
    potential_gain_per_unit: number
    impact: number
}

export interface PricingAlertsResult {
    alerts: PricingAlert[]
    total: number
    counts: { loss: number; thin: number }
    thresholdPercent: number
    defaultMarginPercent: number
}

export async function getPricingAlertsAction(
    partnerId: string,
    storeId?: string
): Promise<{ error: string } | PricingAlertsResult> {
    try {
        const context = await requireProductReadContext(partnerId, storeId)
        const admin = getAdminClient()

        let query = admin
            .from("products")
            .select(
                "id, name, sku, gtin, stock_quantity, price, cost_price, promotional_price, unit, images, variants:product_variants(count)"
            )
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .gt("cost_price", 0)
            .order("name")
            .limit(200)

        if (context.storeId) query = query.or(`store_id.eq.${context.storeId},store_id.is.null`)

        const [{ data, error }, { data: partnerData }] = await Promise.all([
            query,
            admin.from("partners").select("business_info").eq("id", partnerId).single(),
        ])

        if (error) return { error: error.message }

        const defaultMarginPercent = getDefaultMarginPercent(partnerData?.business_info)
        const thresholdPercent = getMarginThresholdPercent(defaultMarginPercent)

        const hasVariantsCount = (p: any) =>
            Array.isArray(p.variants) ? p.variants[0]?.count ?? p.variants.length : 0

        const variantProductIds = (data || []).filter((p: any) => hasVariantsCount(p) > 0).map((p: any) => p.id)
        const variantAggregates = await fetchVariantAggregates(variantProductIds)

        const alerts: PricingAlert[] = []

        for (const p of data || []) {
            const hasVariants = hasVariantsCount(p) > 0
            const agg = hasVariants ? variantAggregates[p.id] : undefined
            const evaluation = evaluatePricing(
                {
                    price: Number(p.price) || 0,
                    costPrice: Number(p.cost_price) || 0,
                    promotionalPrice: p.promotional_price != null ? Number(p.promotional_price) : null,
                    variantMinPrice: agg?.variant_min_price ?? null,
                    hasVariants,
                },
                defaultMarginPercent,
                thresholdPercent
            )

            if (evaluation.status === "ok") continue

            const stock = Number(p.stock_quantity) || 0
            const perUnit =
                evaluation.status === "loss" ? evaluation.lossPerUnit : evaluation.potentialGainPerUnit

            alerts.push({
                id: p.id,
                name: p.name,
                sku: p.sku,
                gtin: p.gtin,
                stock_quantity: stock,
                price: Number(p.price) || 0,
                cost_price: Number(p.cost_price) || 0,
                promotional_price: p.promotional_price != null ? Number(p.promotional_price) : null,
                unit: p.unit || "un",
                images: Array.isArray(p.images) ? p.images : null,
                has_variants: hasVariants,
                status: evaluation.status,
                cause: evaluation.cause,
                base_price: evaluation.basePrice,
                effective_price: evaluation.effectivePrice,
                margin_percent: evaluation.marginPercent,
                suggested_price: evaluation.suggestedPrice,
                loss_per_unit: evaluation.lossPerUnit,
                potential_gain_per_unit: evaluation.potentialGainPerUnit,
                impact: roundMoney(perUnit * Math.max(stock, 0)),
            })
        }

        const sorted = sortPricingAlerts(alerts)

        return {
            alerts: sorted,
            total: sorted.length,
            counts: {
                loss: sorted.filter((a) => a.status === "loss").length,
                thin: sorted.filter((a) => a.status === "thin").length,
            },
            thresholdPercent,
            defaultMarginPercent,
        }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateProductSalePriceAction(params: {
    productId: string
    partnerId: string
    price?: number
    clearPromotion?: boolean
}) {
    try {
        if (params.price !== undefined && (!Number.isFinite(Number(params.price)) || Number(params.price) < 0)) {
            return { error: "Preço de venda inválido" }
        }
        const product = await fetchProductAndVerifyOwnership(params.productId, "edit", "id, partner_id, store_id")
        if (product.partner_id !== params.partnerId) return { error: "Produto não encontrado" }
        await requirePermission(params.partnerId, "products", "edit")
        const admin = getAdminClient()

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (params.price !== undefined) updates.price = params.price
        if (params.clearPromotion) {
            updates.promotional_price = null
            updates.is_on_promotion = false
        }

        const { error } = await admin
            .from("products")
            .update(updates)
            .eq("id", params.productId)
            .eq("partner_id", params.partnerId)

        if (error) return { error: error.message }

        await invalidateProductCache(params.productId, params.partnerId, "update").catch(() => { })

        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ============================================================================
// OPERAÇÕES EM LOTE E UTILS
// ============================================================================

export async function toggleProductStatusAction(productIds: string[], isActive: boolean) {
    try {
        await verifyAuth()
        const { sanitized, partnerId, user, products } = await verifyBatchOwnership(productIds)
        await requirePermission(partnerId, "products", "edit", user)
        await requireBatchProductStorePermission(products, partnerId, "products", "edit")
        const admin = getAdminClient()

        const { error } = await admin.from("products").update({ status: isActive ? "ativo" : "inativo" }).in("id", sanitized).eq("partner_id", partnerId)
        if (error) return { error: error.message }

        if (partnerId) {
            // Revalidate each product to ensure Redis marketplace index is updated
            await Promise.all(sanitized.map(id =>
                invalidateProductCache(id, partnerId, 'update')
            ))
        }
        return { success: true, count: sanitized.length }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteProductsInBatchAction(productIds: string[], reason?: string | null) {
    try {
        await verifyAuth()
        const user = await requireUser()
        const { sanitized, partnerId, products: ownershipRows } = await verifyBatchOwnership(productIds)
        await requirePermission(partnerId, "products", "delete")
        await requireBatchProductStorePermission(ownershipRows, partnerId, "products", "delete")
        const admin = getAdminClient()

        // Fetch products details first for audit logging
        const { data: products } = await admin.from("products").select("id, name, sku, status, deleted_at").in("id", sanitized)

        // 1. Explicit batch update (soft delete)
        const payload = buildCatalogSoftDeletePayload(user.id, reason)
        const { error } = await admin.from("products").update(payload).in("id", sanitized).eq("partner_id", partnerId)
        if (error) return { error: error.message }

        const countableProducts = (products || []).filter(
            (p: any) => p.status !== "deleted" && p.status !== "arquivado" && !p.deleted_at,
        ).length
        if (countableProducts > 0) {
            await adjustItemUsageCounter(partnerId, "products_count", -countableProducts)
        }

        // 2. Log audit event for each product in batch
        const reqHeaders = await headers()
        const ip = getTrustedClientIP(reqHeaders)

        if (products?.length) {
            for (const p of products) {
                await logAuditEvent({
                    partnerId: partnerId,
                    actorUserId: user.id,
                    entityType: "product",
                    entityId: p.id,
                    actionType: "deleted",
                    changeLines: [`Arquivou o produto em lote: ${p.name} (SKU: ${p.sku || 'N/A'})`],
                    metadata: {
                        ip_address: ip,
                        deleted_reason: reason || "Exclusão em lote",
                        name: p.name,
                        sku: p.sku
                    },
                    source: "manual"
                })
            }
        }

        if (partnerId) {
            // Revalidate each product to ensure Redis marketplace index is updated
            await Promise.all(sanitized.map(id =>
                invalidateProductCache(id, partnerId, 'delete')
            ))
        }
        return { success: true, deletedCount: sanitized.length }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function batchUpdateProductsAction(updates: Array<{ id: string;[key: string]: any }>) {
    try {
        await verifyAuth()
        const productIds = updates.map(u => u.id)
        const { sanitized, partnerId, user, products } = await verifyBatchOwnership(productIds)
        await requirePermission(partnerId, "products", "edit", user)
        await requireBatchProductStorePermission(products, partnerId, "products", "edit")

        const allowedFields = new Set(["price", "stock_quantity", "status", "is_active", "isActive", "images", "show_in_marketplace"])
        const normalizedUpdates: Array<{ id: string; data: Record<string, unknown> }> = []
        for (const update of updates) {
            if (!update || typeof update !== "object" || !sanitized.includes(update.id)) {
                return { error: "Produto inválido na atualização em lote" }
            }
            const keys = Object.keys(update).filter((key) => key !== "id")
            if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) {
                return { error: "Campo inválido na atualização em lote" }
            }

            const updateData: Record<string, unknown> = {}
            if (update.price !== undefined) {
                const price = Number(update.price)
                if (!Number.isFinite(price) || price < 0) return { error: "Preço inválido" }
                updateData.price = price
            }
            if (update.stock_quantity !== undefined) {
                const stock = Number(update.stock_quantity)
                if (!Number.isFinite(stock)) return { error: "Estoque inválido" }
                updateData.stock_quantity = stock
            }
            const activeValue = update.is_active ?? update.isActive
            if (activeValue !== undefined) {
                if (typeof activeValue !== "boolean") return { error: "Status inválido" }
                updateData.status = activeValue ? "ativo" : "inativo"
            } else if (update.status !== undefined) {
                if (update.status !== "ativo" && update.status !== "inativo") return { error: "Status inválido" }
                updateData.status = update.status
            }
            if (update.show_in_marketplace !== undefined) {
                if (typeof update.show_in_marketplace !== "boolean") return { error: "Visibilidade inválida" }
                updateData.show_in_marketplace = update.show_in_marketplace
            }
            if (update.images !== undefined) {
                if (!Array.isArray(update.images) || update.images.length > 50 || update.images.some((image: unknown) => typeof image !== "string" || image.length > 2048)) {
                    return { error: "Imagens inválidas" }
                }
                updateData.images = update.images
            }
            normalizedUpdates.push({ id: update.id, data: updateData })
        }

        if (normalizedUpdates.some(({ data }) => "stock_quantity" in data)) {
            await requirePermission(partnerId, "stock_movements", "create", user)
            await requireBatchProductStorePermission(products, partnerId, "stock_movements", "create")
        }

        const admin = getAdminClient()

        // Use RPC to handle batch updates safely if possible, or iterate
        // Given Supabase limitations, a series of updates or a specific RPC is best.
        // For now, let's use a Promise.all for simplicity, but strictly validated.

        const results = await Promise.all(normalizedUpdates.map(({ id, data }) => {
            return admin.from("products").update(data).eq("id", id).eq("partner_id", partnerId)
        }))

        const firstError = results.find(r => r.error)
        if (firstError) return { error: firstError.error?.message }

        if (partnerId) {
            // Revalidate each product to ensure Redis marketplace index is updated
            await Promise.all(sanitized.map(id =>
                invalidateProductCache(id, partnerId, 'update')
            ))

            const stockUpdates = normalizedUpdates.filter(({ data }) => "stock_quantity" in data)
            if (stockUpdates.length > 0) {
                import("@/lib/services/integrations/erp-sync")
                    .then(({ syncItemsStockToConnectedErps }) =>
                        syncItemsStockToConnectedErps({
                            partnerId,
                            items: stockUpdates.map(({ id, data }) => ({
                                productId: id,
                                newStock: Number(data.stock_quantity),
                            })),
                            reason: "Edição em lote de estoque de produtos (Dudit)",
                        })
                    )
                    .catch(() => {})
            }
        }
        return { success: true, count: normalizedUpdates.length }
    } catch (error: any) {
        return { error: error.message }
    }
}

// Aliases para compatibilidade
export const markProductsAsInactiveAction = async (productIds: string[]) => toggleProductStatusAction(productIds, false)
export const toggleProductsStatusAction = async (productIds: string[], isActive: boolean) => toggleProductStatusAction(productIds, isActive)

export async function duplicateProductsAction(productIds: string[]) {
    const actionStart = performance.now()
    try {
        const user = await verifyAuth()
        const supabase = await getSupabaseServerClient()
        const { sanitized, partnerId, products: ownershipRows } = await verifyBatchOwnership(productIds, user)
        await requirePermission(partnerId, "products", "create", user)
        await requireBatchProductStorePermission(ownershipRows, partnerId, "products", "view")
        await requireBatchProductStorePermission(ownershipRows, partnerId, "products", "create")
        const { data: products } = await supabase.from("products").select("*").in("id", sanitized).eq("partner_id", partnerId)

        if (!products?.length || products.length !== sanitized.length) return { success: false, error: "Produtos não encontrados" }

        const limitCheck = await checkLimit(partnerId, "items", products.length)
        if (!limitCheck.allowed) {
            return { success: false, error: limitCheck.message || "Limite de itens do catálogo atingido para o seu plano." }
        }

        // SKU puro (zero queries no caminho feliz) - unicidade pelo banco.
        // Para duplicatas, confere a base antes do INSERT porque o gerador é
        // determinístico para nomes com 2+ palavras e repetir a duplicação
        // geraria o mesmo SKU (23505) até o retry aplicar um sufixo.
        const { cloneMediaForDuplicate } = await import("@/lib/r2/server")
        const admin = getAdminClient()
        const duplicated = await Promise.all(products.map(async (p: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, created_at, updated_at, ...data } = p
            const cloned = await cloneMediaForDuplicate(
                {
                    images: data.images,
                },
                user.id,
                R2_PREFIXES.products
            )
            const sku = await generateAvailableSKU(
                admin,
                partnerId,
                generateSKUBase(`${data.name} Copy`)
            )
            return {
                ...data,
                images: cloned.images || [],
                name: `${data.name} (Cópia)`,
                sku,
            }
        }))

        // INSERT com retry em caso de SKU collision
        let inserted: any[] | null = null
        let insertError: any = null
        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
                // Regenerar SKUs com sufixo para evitar collision
                duplicated.forEach((d: any) => {
                    d.sku = generateSKUWithSuffix(generateSKUBase(d.name.replace(' (Cópia)', '') + ' Copy'), attempt)
                })
            }

            const result = await supabase.from("products").insert(
                duplicated.map((d: any) => { const { is_active, ...rest } = d; return rest })
            ).select()

            if (!result.error) {
                inserted = result.data
                insertError = null
                break
            }

            if (result.error.message?.includes('unique') || result.error.code === '23505') {
                insertError = result.error
                continue
            }

            return { success: false, error: result.error.message }
        }

        if (insertError) return { success: false, error: insertError.message }

        // Vídeos enviados (upload) são clonados após o insert, usando a key
        // item-scoped (users/{user}/products/{newId}.*) esperada pelas validações.
        if (inserted?.length) {
            const { cloneMediaForDuplicate } = await import("@/lib/r2/server")
            await Promise.all(inserted.map(async (newRow: any, index: number) => {
                const original = products[index]
                if (original?.video_type !== "upload") return
                const cloned = await cloneMediaForDuplicate(
                    {
                        video_url: original.video_url,
                        video_thumbnail: original.video_thumbnail,
                    },
                    user.id,
                    R2_PREFIXES.products,
                    { itemId: newRow.id }
                )
                if (!cloned.video_url && !cloned.video_thumbnail) return
                await supabase.from("products").update({
                    video_url: cloned.video_url,
                    video_thumbnail: cloned.video_thumbnail,
                }).eq("id", newRow.id)
            }))
        }

        Promise.resolve().then(() => revalidateProducts(products[0].partner_id)).catch(console.error)
        return { success: true, count: inserted?.length || 0, products: inserted }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

export async function duplicateProductAction(productId: string) {
    const result = await duplicateProductsAction([productId])
    // @ts-ignore
    return result.success ? { success: true, product: result.products?.[0], newSku: result.products?.[0]?.sku } : result
}

// ============================================================================
// GETTERS & MARKETPLACE
// ============================================================================

export async function checkProductInOrdersAction(productId: string) {
    try {
        await fetchProductAndVerifyOwnership(productId, "view")
        const supabase = await getSupabaseServerClient()
        const { data: count } = await getAdminClient().rpc('get_product_pending_orders_count', { p_product_id: productId })
        return { count: count || 0 }
    } catch (error: any) {
        return { count: 0, error: error.message }
    }
}

const fetchVariantAggregates = async (productIds: string[]) => {
    if (productIds.length === 0) return {}
    const supabase = getAdminClient()
    const { data } = await supabase
        .from("product_variants")
        .select("product_id, price_adjustment, stock_quantity, stock_reserved, is_active, variant_name, sku")
        .in("product_id", productIds)
    if (!data) return {}
    const map: Record<string, {
        variant_min_price: number
        variant_max_price: number
        variant_total_stock: number
        variant_total_reserved: number
        variant_total_available: number
        variant_names: string[]
        variant_skus: string[]
    }> = {}
    for (const v of data) {
        if (!v.is_active) continue
        if (!map[v.product_id]) map[v.product_id] = {
            variant_min_price: Infinity,
            variant_max_price: -Infinity,
            variant_total_stock: 0,
            variant_total_reserved: 0,
            variant_total_available: 0,
            variant_names: [],
            variant_skus: []
        }
        const m = map[v.product_id]
        const price = Number(v.price_adjustment) || 0
        if (price < m.variant_min_price) m.variant_min_price = price
        if (price > m.variant_max_price) m.variant_max_price = price
        m.variant_total_stock += Number(v.stock_quantity) || 0
        m.variant_total_reserved += Math.max(0, Number(v.stock_reserved) || 0)
        if (v.variant_name && !m.variant_names.includes(v.variant_name)) {
            m.variant_names.push(v.variant_name)
        }
        if (v.sku && !m.variant_skus.includes(v.sku)) {
            m.variant_skus.push(v.sku)
        }
    }
    for (const pid of productIds) {
        if (map[pid]) {
            if (map[pid].variant_min_price === Infinity) map[pid].variant_min_price = 0
            if (map[pid].variant_max_price === -Infinity) map[pid].variant_max_price = 0
            map[pid].variant_total_available = map[pid].variant_total_stock - map[pid].variant_total_reserved
        }
    }
    return map
}

const fetchProductsStatic = unstable_cache(
    async (partnerId: string, storeId: string) => {
        const supabase = getAdminClient()
        let query = supabase
            .from("products")
            .select("id, short_id, store_id, name, stock_quantity, stock_reserved, stock_available, price, promotional_price, min_stock, is_active, sku, images, unit, location, brand, created_at, variants:product_variants(count), show_in_marketplace, moderation_status, moderation_reason, category_id, category:product_categories!category_id(name), subcategory_id, subcategory:product_categories!subcategory_id(name), brand_id, brand_rel:brands!brand_id(name), location_id, location_rel:storage_locations!location_id(name), tags, technical_specs")
            .eq("partner_id", partnerId)
            .limit(100)
            .order("created_at", { ascending: false })
        if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`)
        const { data, error } = await query
        if (error) throw error
        const rows = (data || []).map((p: any) => {
            const specsKeywords: string[] = []
            if (p.technical_specs && typeof p.technical_specs === "object") {
                const attrs = Array.isArray(p.technical_specs.attributes)
                    ? p.technical_specs.attributes
                    : Array.isArray(p.technical_specs)
                        ? p.technical_specs
                        : []
                for (const attr of attrs) {
                    if (attr?.name) specsKeywords.push(String(attr.name))
                    if (attr?.value) specsKeywords.push(String(attr.value))
                }
                const addons = p.technical_specs.addon_groups || p.addon_groups
                if (Array.isArray(addons)) {
                    for (const grp of addons) {
                        if (grp?.name) specsKeywords.push(String(grp.name))
                        if (Array.isArray(grp?.options)) {
                            for (const opt of grp.options) {
                                if (opt?.name) specsKeywords.push(String(opt.name))
                            }
                        }
                    }
                }
            }
            return {
                ...p,
                category: p.category?.name || null,
                subcategory: p.subcategory?.name || null,
                brand: p.brand_rel?.name || p.brand || null,
                location: p.location_rel?.name || p.location || null,
                specs_keywords: specsKeywords,
                tags: Array.isArray(p.tags) ? p.tags : [],
            }
        })
        const withVariants = rows.filter((p: any) => {
            const count = Array.isArray(p.variants) ? p.variants[0]?.count ?? p.variants.length : 0
            return count > 0
        })
        if (withVariants.length > 0) {
            const aggregates = await fetchVariantAggregates(withVariants.map((p: any) => p.id))
            for (const p of rows) {
                const agg = aggregates[p.id]
                if (agg) {
                    p.variant_min_price = agg.variant_min_price
                    p.variant_max_price = agg.variant_max_price
                    p.variant_total_stock = agg.variant_total_stock
                    p.variant_total_reserved = agg.variant_total_reserved
                    p.variant_total_available = agg.variant_total_available
                    p.variant_names = agg.variant_names || []
                    p.variant_skus = agg.variant_skus || []
                }
            }
        }
        return rows
    },
    ["cached-products-static"],
    { tags: ["products"], revalidate: 300 }
)

export const getCachedProducts = async (partnerId: string) => {
    const { storeId } = await requireProductReadContext(partnerId)
    return fetchProductsStatic(partnerId, storeId || "")
}

const fetchProductByIdStatic = unstable_cache(
    async (productId: string) => {
        const supabase = getAdminClient()
        const { data: product, error } = await supabase
            .from("products")
            .select("*, category:product_categories!category_id(name), subcategory:product_categories!subcategory_id(name), brand_rel:brands!brand_id(name), location_rel:storage_locations!location_id(name), variants:product_variants(*), product_fiscal_profiles(*), product_logistics(*)")
            .eq("id", productId)
            .single()
        if (error) throw error
        if (product) {
            const fiscal = Array.isArray((product as any).product_fiscal_profiles)
                ? (product as any).product_fiscal_profiles[0]
                : (product as any).product_fiscal_profiles
            const logistics = Array.isArray((product as any).product_logistics)
                ? (product as any).product_logistics[0]
                : (product as any).product_logistics

            const mapped: any = {
                ...product,
                category: product.category?.name || null,
                subcategory: product.subcategory?.name || null,
                brand: product.brand_rel?.name || (product as any).brand || null,
                location: product.location_rel?.name || (product as any).location || null
            }

            if (fiscal) Object.assign(mapped, fiscal)
            if (logistics) {
                Object.assign(mapped, logistics)
                for (const field of ["weight_gross", "weight_net", "width", "height", "length"] as const) {
                    if (mapped[field] !== null && mapped[field] !== undefined) mapped[field] = Number(mapped[field])
                }
                if (mapped.preparation_days !== null && mapped.preparation_days !== undefined) {
                    mapped.preparation_days = Number(mapped.preparation_days)
                }
            }

            delete mapped.product_fiscal_profiles
            delete mapped.product_logistics
            return mapped
        }
        return product
    },
    ["cached-product-by-id-static"],
    { tags: ["products"], revalidate: 300 }
)

export const getCachedProductById = async (productId: string) => {
    await fetchProductAndVerifyOwnership(productId, "view")
    return fetchProductByIdStatic(productId)
}


export async function getProductWithDetailsAction(productId: string) {
    try {
        await fetchProductAndVerifyOwnership(productId, "view")
        const product = await getCachedProductById(productId)
        return { success: true, product }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getProducts(partnerId: string, storeId?: string) {
    try {
        const context = await requireProductReadContext(partnerId, storeId)
        const supabase = await getSupabaseServerClient()

        let q = supabase.from("products").select("*").eq("partner_id", partnerId)
        if (context.storeId) q = q.or(`store_id.eq.${context.storeId},store_id.is.null`)

        const { data } = await scopeActiveOnly(q).order("created_at", { ascending: false }).limit(100)
        return data || []
    } catch (error) {
        console.error("[getProducts] Error fetching products:", error)
        return []
    }
}

export const getMarketplaceCategoriesAction = async (parentId: string | null = null) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()

            // 1. Query Simples e Direta
            let query = supabase
                .from("marketplace_product_categories")
                .select("id, name, icon_url, parent_id")
                .order("name")

            // 2. Filtro de Pai/Filho
            if (parentId) {
                query = query.eq("parent_id", parentId)
            } else {
                query = query.is("parent_id", null)
            }

            const { data, error } = await query

            if (error) {
                console.error("Erro ao buscar categorias:", error)
                return []
            }

            return data || []
        },
        // Chave de Cache (Importante para performance)
        [`marketplace-categories-${parentId || 'root'}`],
        {
            tags: ['marketplace-categories'], // Use sua constante TAGS.categories se tiver
            revalidate: 3600 // Cache de 1 hora
        }
    )()
}

export const getCategoryPathAction = async (categoryId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const path = []
            let currentId: string | null = categoryId
            while (currentId && !currentId.startsWith('auto-')) {
                const result: any = await supabase.from("marketplace_product_categories").select("id, name, parent_id").eq("id", currentId).single()
                if (!result.data) break
                path.unshift(result.data.name)
                currentId = result.data.parent_id
            }
            return path.join(" > ")
        },
        [`category-path-${categoryId}`],
        { tags: [TAGS.categories], revalidate: 86400 }
    )()
}

export const getERPProductsPageData = cache(async () => {
    const context = await getCurrentPartnerContext()
    if (!context) return null

    const partnerId = context.partnerId

    // Use cached products with explicit column selection (12 cols vs 40+ from SELECT *)
    // Variant count is fetched inline - no second query needed
    const products = await getCachedProducts(partnerId)

    return {
        products: products || [],
        partnerId: partnerId,
        variants: [] // Variants are loaded on-demand when editing a specific product
    }
})

export type ERPProductListCursor = { createdAt: string; id: string }

function buildProductsKeysetOrFilter(cursor: ERPProductListCursor): string {
    const ts = cursor.createdAt
    const id = cursor.id
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    // Page after (created_at DESC, id DESC)
    return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_PRODUCTS_PAGE_SIZE = 100

export async function getERPProductsPageAction(
    partnerId: string,
    options?: { cursor?: ERPProductListCursor | null; limit?: number; filters?: any; storeId?: string },
): Promise<
    | { success: true; items: any[]; nextCursor: ERPProductListCursor | null; hasMore: boolean }
    | { success: false; error: string }
> {
    try {
        // await requireMinimumPlan(partnerId, "crescer")
        const user = await requireUser()
        const context = await getCurrentPartnerContext(user)
        if (!context?.partnerId || context.partnerId !== partnerId) {
            return { success: false, error: "O parceiro informado não corresponde ao contexto ativo" }
        }
        await requirePermission(context.partnerId, "products", "view", user)
        const storeId = options?.storeId || context.activeStoreId || null
        if (storeId) {
            await requireStorePermission(storeId, partnerId, "products", "view")
        }

        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_PRODUCTS_PAGE_SIZE))))
        const fetchLimit = limit + 1

        const filterKey = options?.filters?.status || options?.filters?.tab || (options?.filters?.includeArchived ? "all" : "active")
        const rows = await getCachedErpPage(
            [
                "erp-products-page",
                partnerId,
                storeId || "all-stores",
                cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
                String(limit),
                String(filterKey),
            ],
            [TAGS.products(partnerId)],
            async () => {
                const supabase = getAdminClient()
                let q = supabase
                    .from("products")
                    .select("id, short_id, store_id, name, stock_quantity, stock_reserved, stock_available, price, promotional_price, min_stock, is_active, status, sku, images, unit, location, brand, created_at, variants:product_variants(count), show_in_marketplace, moderation_status, moderation_reason, category_id, category:product_categories!category_id(name), subcategory_id, subcategory:product_categories!subcategory_id(name), brand_id, brand_rel:brands!brand_id(name), location_id, location_rel:storage_locations!location_id(name), tags, technical_specs")
                    .eq("partner_id", partnerId)

                if (storeId) q = q.or(`store_id.eq.${storeId},store_id.is.null`)

                if (options?.filters?.status === "archived" || options?.filters?.tab === "archived" || options?.filters?.status === "arquivado") {
                    q = scopeArchivedOnly(q)
                } else if (!options?.filters?.includeArchived) {
                    q = scopeActiveOnly(q)
                } else {
                    q = scopeWithArchived(q)
                }

                if (cursor) q = q.or(buildProductsKeysetOrFilter(cursor))

                const { data, error } = await q
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .limit(fetchLimit)

                if (error) throw error

                const mappedRows = (data || []).map((p: any) => {
                    const specsKeywords: string[] = []
                    if (p.technical_specs && typeof p.technical_specs === "object") {
                        const attrs = Array.isArray(p.technical_specs.attributes)
                            ? p.technical_specs.attributes
                            : Array.isArray(p.technical_specs)
                                ? p.technical_specs
                                : []
                        for (const attr of attrs) {
                            if (attr?.name) specsKeywords.push(String(attr.name))
                            if (attr?.value) specsKeywords.push(String(attr.value))
                        }
                        const addons = p.technical_specs.addon_groups || p.addon_groups
                        if (Array.isArray(addons)) {
                            for (const grp of addons) {
                                if (grp?.name) specsKeywords.push(String(grp.name))
                                if (Array.isArray(grp?.options)) {
                                    for (const opt of grp.options) {
                                        if (opt?.name) specsKeywords.push(String(opt.name))
                                    }
                                }
                            }
                        }
                    }
                    return {
                        ...p,
                        category: p.category?.name || null,
                        subcategory: p.subcategory?.name || null,
                        brand: p.brand_rel?.name || p.brand || null,
                        location: p.location_rel?.name || p.location || null,
                        specs_keywords: specsKeywords,
                        tags: Array.isArray(p.tags) ? p.tags : [],
                    }
                })

                const withVariants = mappedRows.filter((p: any) => {
                    const count = Array.isArray(p.variants) ? p.variants[0]?.count ?? p.variants.length : 0
                    return count > 0
                })
                if (withVariants.length > 0) {
                    const aggregates = await fetchVariantAggregates(withVariants.map((p: any) => p.id))
                    for (const p of mappedRows) {
                        const agg = aggregates[p.id]
                        if (agg) {
                            p.variant_min_price = agg.variant_min_price
                            p.variant_max_price = agg.variant_max_price
                            p.variant_total_stock = agg.variant_total_stock
                            p.variant_total_reserved = agg.variant_total_reserved
                            p.variant_total_available = agg.variant_total_available
                            p.variant_names = agg.variant_names || []
                            p.variant_skus = agg.variant_skus || []
                        }
                    }
                }

                return mappedRows
            },
        )

        const hasMore = rows.length > limit
        const items = hasMore ? rows.slice(0, limit) : rows
        const last = items[items.length - 1]
        const nextCursor: ERPProductListCursor | null =
            hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

        return { success: true, items, nextCursor, hasMore }
    } catch (e: any) {
        return { success: false, error: e?.message || "Erro ao carregar produtos" }
    }
}

export async function searchProductByBarcodeAction(
    partnerId: string | undefined | null,
    code: string
): Promise<ActionResponse<any>> {
    try {
        await requireUser()

        let resolvedPartnerId = partnerId
        let resolvedStoreId: string | null = null
        if (!resolvedPartnerId) {
            const context = await getCurrentPartnerContext()
            if (!context) return { success: false, error: "Contexto do parceiro não encontrado" }
            resolvedPartnerId = context.partnerId
            resolvedStoreId = context.activeStoreId
        } else {
            const context = await getCurrentPartnerContext()
            if (!context || context.partnerId !== resolvedPartnerId) {
                return errorResponse("O parceiro informado não corresponde ao contexto ativo")
            }
            resolvedStoreId = context.activeStoreId
        }

        await requireProductReadContext(resolvedPartnerId, resolvedStoreId)
        const supabase = getAdminClient()

        const cleanCode = code.trim()
        if (!cleanCode) return { success: false, error: "Código inválido" }

        const applyStoreFilter = (q: any) => {
            if (resolvedStoreId) return q.eq("store_id", resolvedStoreId)
            return q
        }

        const strippedCode = cleanCode.replace(/^0+/, "")
        const padded13Code = cleanCode.padStart(13, "0")
        const candidateCodes = Array.from(new Set([cleanCode, strippedCode, padded13Code].filter(Boolean)))

        // 1 & 2. Parallel exact match on products (GTIN or SKU) and product variants (SKU)
        const productExactPromise = scopeActiveOnly(applyStoreFilter(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("is_active", true)
            .or(`gtin.in.(${candidateCodes.map(c => `"${c}"`).join(",")}),sku.in.(${candidateCodes.map(c => `"${c}"`).join(",")})`)))
            .limit(1)
            .maybeSingle()

        let variantBaseQuery = supabase
            .from("product_variants")
            .select("*, products!inner(*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options))")
            .in("sku", candidateCodes)
            .eq("is_active", true)
            .is("products.deleted_at", null)

        if (resolvedStoreId) {
            variantBaseQuery = variantBaseQuery.eq("products.store_id", resolvedStoreId)
        }

        const variantExactPromise = variantBaseQuery.limit(1).maybeSingle()

        const [productExactRes, variantExactRes] = await Promise.all([productExactPromise, variantExactPromise])

        if (productExactRes.data) {
            return { success: true, data: productExactRes.data }
        }

        if (variantExactRes.data?.products && variantExactRes.data.products.partner_id === resolvedPartnerId) {
            const product = {
                ...variantExactRes.data.products,
                matchedVariantId: variantExactRes.data.id
            }
            return { success: true, data: product }
        }

        // 3. Fallback: Partial SKU match
        const { data: partialSkuMatch } = await scopeActiveOnly(applyStoreFilter(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("is_active", true)
            .ilike("sku", `%${cleanCode}%`)))
            .limit(1)

        if (partialSkuMatch && partialSkuMatch.length > 0) {
            return { success: true, data: partialSkuMatch[0] }
        }

        // 4. Fallback: Product name match
        const { data: nameMatch } = await scopeActiveOnly(applyStoreFilter(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("is_active", true)
            .ilike("name", `%${cleanCode}%`)))
            .limit(1)

        if (nameMatch && nameMatch.length > 0) {
            return { success: true, data: nameMatch[0] }
        }

        return { success: false, error: "Produto não encontrado" }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Wrapper functions to avoid "Only async functions are allowed to be exported in a 'use server' file" error
// when re-exporting from another "use server" file

import { getProductStockStatusAction as getProductStockStatusActionImpl } from "./stock-movements"
import { releaseReservedStockAction as releaseReservedStockActionImpl } from "./stock-movements"

export async function getProductStockStatusAction(productId: string, variantId?: string | null) {
  return getProductStockStatusActionImpl(productId, variantId)
}

export async function releaseReservedStockAction(data: {
  productId: string
  variantId?: string | null
  quantity?: number
  reason: string
  notes?: string
}) {
  return releaseReservedStockActionImpl(data)
}


