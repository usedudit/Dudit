"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import {
    revalidateProducts,
    revalidateSuppliers,
    revalidateExploreSearch,
} from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { AUTH_MESSAGES } from "@/lib/constants/messages"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import type { ActionResponse } from "@/lib/types/action-response"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { syncToExploreRedis, removeFromExploreRedis } from "@/lib/redis-sync"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { checkLimit, canUseFeature, increment_usage_counter, decrement_usage_counter } from "@/lib/services/subscription.service"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { EMPTY_VIDEO_METADATA, normalizeVideoMetadata, type VideoType } from "@/lib/video/shared"
import { ALLOWED_VIDEO_MIME_TYPES, MAX_FILE_SIZE, MAX_VIDEO_FILE_SIZE } from "@/lib/r2/config"
import { buildSoftDeletePayload, buildRestorePayload, scopeActiveOnly } from "@/lib/supabase/query-helpers"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { headers } from "next/headers"

const _deleteFromR2 = async (url: string) => {
    if (!url || !url.trim()) return;
    try {
        const { extractKeyFromR2Url, deleteFileFromR2 } = await import("@/lib/r2/server");
        const key = url.startsWith('http') ? extractKeyFromR2Url(url) : url;
        if (key) await deleteFileFromR2(key);
    } catch (e) {
        console.error("Failed to delete image: ", url, e);
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

    const [productRes, user] = await Promise.all([
        admin.from("products").select(selectColumns).eq("id", productId).single(),
        resolvedUser ? Promise.resolve(resolvedUser) : verifyAuth()
    ])

    const { data: product, error } = productRes

    if (error || !product) throw new Error("Produto não encontrado")

    if (requiredAction) {
        await requirePermission(product.partner_id, "products", requiredAction, user)
    } else {
        await requirePermission(product.partner_id, "products", "view", user)
    }

    return product
}

const verifyBatchOwnership = async (productIds: string[], resolvedUser?: any) => {
    const { sanitizeUUID } = await import("@/lib/security/input-sanitizer")
    const sanitized = productIds.map(sanitizeUUID).filter((id): id is string => id !== null)

    if (!sanitized.length) throw new Error("Nenhum ID válido")
    if (sanitized.length > 100) throw new Error("Máximo: 100 produtos")

    const admin = getAdminClient()

    const [dataRes, user] = await Promise.all([
        admin.from("products").select("id, partner_id").in("id", sanitized),
        resolvedUser ? Promise.resolve(resolvedUser) : verifyAuth()
    ])

    const { data } = dataRes

    if (!data || data.length !== sanitized.length) throw new Error("Produtos não encontrados")

    // All products must belong to the same partner
    const partnerId = data[0]?.partner_id
    if (!partnerId || data.some((p: any) => p.partner_id !== partnerId)) throw new Error("Produtos de parceiros diferentes")

    // await requireMinimumPlan(partnerId, "crescer")
    await requirePermission(partnerId, "products", "view", user)

    return { sanitized, partnerId, user }
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
        const product = await fetchProductAndVerifyOwnership(productId, "delete", "id, partner_id, sku, name")

        const user = await requireUser()
        const admin = getAdminClient()

        // 1. Soft delete update payload
        const payload = buildSoftDeletePayload(user.id, reason)
        const deleteResult = await admin.from("products").update(payload).eq("id", productId)
        if (deleteResult.error) return { error: deleteResult.error.message }

        // 2. Fetch IP and write to audit logs (logAuditEvent)
        const reqHeaders = await headers()
        const ip = reqHeaders.get("x-forwarded-for") || "127.0.0.1"

        await logAuditEvent({
            partnerId: product.partner_id,
            actorUserId: user.id,
            entityType: "product",
            entityId: productId,
            actionType: "deleted",
            changeLines: [`Arquivou o produto: ${product.name} (SKU: ${product.sku || 'N/A'})`],
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
        const product = await fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, sku, name")
        const user = await requireUser()
        const admin = getAdminClient()

        // 1. Explicit restore update
        const payload = buildRestorePayload()
        const restoreResult = await admin.from("products").update(payload).eq("id", productId)
        if (restoreResult.error) return { error: restoreResult.error.message }

        // 2. Fetch IP and write to audit logs
        const reqHeaders = await headers()
        const ip = reqHeaders.get("x-forwarded-for") || "127.0.0.1"

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
}): Promise<ActionResponse<any>> {
    const actionStart = performance.now()
    try {
        // 1. GATEKEEPER â€” isolado (bloqueia abuso sem consumir recursos)
        await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)

        // 2. CSRF + Auth em paralelo (independentes entre si)
        const [csrf, _user] = await Promise.all([
            validateCSRF(data as Record<string, unknown>),
            verifyAuth(),
        ])
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")

        // â”€â”€ SERVER-SIDE CONTEXT FALLBACK â”€â”€
        let finalPartnerId = data.partnerId
        if (!finalPartnerId || finalPartnerId.trim() === "") {
            const { getCurrentPartnerContext } = await import("@/lib/auth/partner-context")
            const ctx = await getCurrentPartnerContext(_user)
            if (ctx?.partnerId) finalPartnerId = ctx.partnerId
            else throw new Error("Acesso negado: ID do Parceiro não pôde ser resolvido.")
        }

        const supabase = await getSupabaseServerClient()

        // 3. Permission + Store em paralelo (moderação agora é assíncrona)
        const [_access, storeResult] = await Promise.all([
            requirePermission(finalPartnerId, "products", "create", _user),
            (async () => {
                if (data.storeId && data.storeId.trim() !== "") return data.storeId
                const admin = getAdminClient()
                const { data: stores } = await admin.from("stores").select("id").eq("partner_id", finalPartnerId).limit(1)
                if (stores && stores.length > 0) return stores[0].id
                throw new Error("Erro de infraestrutura: Nenhuma loja associada a este parceiro.")
            })(),
        ])

        const finalStoreId = storeResult

        // 3.5 Subscription limit check - enforce product and image limits before creating
        const [limitCheck, imagesLimitCheck] = await Promise.all([
            checkLimit(finalPartnerId, "items"),
            checkLimit(finalPartnerId, "images_per_item", (data.images?.length || 0)),
        ])
        if (!limitCheck.allowed) {
            return errorResponse(limitCheck.message || "Limite de produtos atingido.")
        }
        if (!imagesLimitCheck.allowed) {
            return errorResponse(imagesLimitCheck.message || "Limite de imagens atingido.")
        }

        const adminForBusinessInfo = getAdminClient()
        const { data: partnerData } = await adminForBusinessInfo.from('partners').select('business_info').eq('id', finalPartnerId).single()
        const businessInfo = normalizeBusinessInfo(partnerData?.business_info)
        const isQuick = businessInfo.mode === "quick"

        // Quick mode: enforce marketplace options (server-side)
        if (isQuick) {
            if (data.showInMarketplace === undefined) data.showInMarketplace = true
            data.subcategoryId = null
            data.featured = false
        }

        // SKU: função pura (zero queries), unicidade garantida pelo banco
        const sku = data.sku?.trim() || generateSKUBase(data.name)

        const videoMetadata = await normalizeVideoMetadata({
            video_type: data.videoType || (data.videoUrl ? "youtube" : null),
            video_url: data.videoUrl || null,
            video_thumbnail: data.videoThumbnail || null,
            video_duration: data.videoDuration || null,
            video_provider_id: data.videoProviderId || null,
        })
        if (videoMetadata.video_type === "upload" && !data.id) throw new Error("ID do produto é obrigatório para upload de vídeo")
        if (data.id) await assertUploadVideoOwnership(videoMetadata, _user.id, "products", data.id)

const productData = {
            id: data.id || undefined,
            partner_id: finalPartnerId,
            store_id: finalStoreId,
            name: data.name,
            description: data.description || null,
            sku,
            gtin: data.gtin || null,
            brand: data.brand || null,
            category: data.category || null,
            category_id: (data as any).category_id || data.categoryId || null,
            subcategory: data.subcategory || null,
            subcategory_id: data.subcategoryId || data.subcategory_id || null, // Handle both names
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
            price: data.price,
            promotional_price: data.promotionalPrice || null,
            min_stock: data.minStock || 0,
            max_stock: data.maxStock || 0,
            stock_quantity: data.stockQuantity || 0,
            status: data.isActive !== false ? "ativo" : "inativo",
            is_on_promotion: data.isOnPromotion || false,
            show_price_in_store: data.showPriceInStore !== false,
            images: data.images || [],
            // Marketplace enforced rules
            is_featured: data.featured || false,
            availability_value: data.availability_value || 0,
            availability_unit: data.availability_unit || "Dias",
            warranty: data.warranty || null,
            video_url: videoMetadata.video_url,
            technical_specs: data.technicalSpecs || {},
            delivery_format: data.deliveryFormat || null,
            show_in_marketplace: data.showInMarketplace !== false,
            moderation_status: 'approved',
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
            weight_gross: data.weight_gross ?? 0,
            weight_net: data.weight_net ?? 0,
            width: data.width ?? 0,
            height: data.height ?? 0,
            length: data.length ?? 0,
            packaging_type: data.packagingType || "package",
            preparation_days: data.preparationDays || 0,
        }

        // INSERT com retry em caso de SKU collision (unique_violation)
        let insertedProduct: any = null
        let transactionError: any = null
        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            if (attempt > 0) {
                productData.sku = generateSKUWithSuffix(sku, attempt)
            }

            const result = await supabase.rpc(
                "create_product_transaction",
                {
                    p_product_data: productData,
                    p_fiscal_data: fiscalData,
                    p_logistics_data: logisticsData
                }
            )

            if (!result.error) {
                insertedProduct = result.data
                transactionError = null
                break
            }

            // Se for unique_violation no SKU, retry com sufixo
            if (result.error.message?.includes('unique') || result.error.code === '23505') {
                transactionError = result.error
                continue
            }

            // Qualquer outro erro, retorna imediatamente
            return errorResponse(result.error.message, result.error)
        }

        if (transactionError) return errorResponse(transactionError.message, transactionError)

        const videoUpdate = {
            video_type: videoMetadata.video_type,
            video_url: videoMetadata.video_url,
            video_thumbnail: videoMetadata.video_thumbnail,
            video_duration: videoMetadata.video_duration,
            video_provider_id: videoMetadata.video_provider_id,
        }
        const { error: videoUpdateError } = await getAdminClient().from("products").update(videoUpdate).eq("id", insertedProduct.id)
        if (videoUpdateError) return errorResponse(videoUpdateError.message, videoUpdateError)

        // Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(insertedProduct.id, finalPartnerId, 'create')

        // DB_TRIGGER handles products_count, so we ONLY handle images_count manually
        if (data.images && data.images.length > 0) {
            await increment_usage_counter(finalPartnerId, "images_count", data.images.length)
        }

        return successResponse({ ...insertedProduct, ...fiscalData, ...logisticsData })
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
            fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, images, sku, name, description, moderation_status, video_type, video_url, video_thumbnail"),
        ])
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")

        const supabase = await getSupabaseServerClient()
        const payload: any = { updated_at: getBrasiliaTime() }
        const fiscalPayload: any = {}
        const logisticsPayload: any = {}

        // Cast for dynamic field mapping â€” safe because we only iterate over known allowlisted keys
        const dataRecord = data as Record<string, unknown>

        // Campos diretos
        const directMapFields = [
            'name', 'description', 'category', 'brand', 'sku', 'gtin', 'condition',
            'price', 'images',
            'availability_value', 'availability_unit', 'warranty', 'unit',
            'category_id', 'brand_id', 'location_id', 'subcategory_id', 'marketplace_category_id'
        ]

        const fiscalMapFields = [
            'ncm', 'cest', 'origin', 'csosn', 'pis_cst', 'cofins_cst', 'ipi_cst',
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

        fiscalMapFields.forEach(field => {
            if (dataRecord[field] !== undefined) fiscalPayload[field] = dataRecord[field]
        })

        logisticsMapFields.forEach(field => {
            if (dataRecord[field] !== undefined) logisticsPayload[field] = dataRecord[field]
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

        if (data.packagingType !== undefined) logisticsPayload.packaging_type = data.packagingType
        if (data.preparationDays !== undefined) logisticsPayload.preparation_days = data.preparationDays

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
        if (data.featured !== undefined) payload.is_featured = data.featured
        if (data.deliveryFormat !== undefined) payload.delivery_format = data.deliveryFormat
        if (data.tags !== undefined) payload.tags = data.tags
        if (data.showInMarketplace !== undefined) payload.show_in_marketplace = data.showInMarketplace

        payload.moderation_status = 'approved'

        const { data: updatedProduct, error: transactionError } = await supabase.rpc(
            "update_product_transaction",
            {
                p_product_id: productId,
                p_product_data: payload,
                p_fiscal_data: fiscalPayload,
                p_logistics_data: logisticsPayload
            }
        )

        if (transactionError) return errorResponse(transactionError.message, transactionError)

        // FIX: A função RPC no Supabase ignora o campo moderation_status. Fazemos o update direto aqui.
        const adminUpdate = getAdminClient()
        const directProductPatch: any = { moderation_status: payload.moderation_status }
            ;["video_type", "video_url", "video_thumbnail", "video_duration", "video_provider_id"].forEach((field) => {
                if (payload[field] !== undefined) directProductPatch[field] = payload[field]
            })
        await adminUpdate.from('products').update(directProductPatch).eq('id', productId)

        // Fire-and-forget: R2 image cleanup para imagens removidas
        if (product.images && Array.isArray(product.images)) {
            const oldImages = product.images.filter((img: any) => typeof img === 'string' && img.trim());
            const newImages = payload.images || [];
            const deletedImages = oldImages.filter((img: string) => !newImages.includes(img));
            const addedImages = newImages.filter((img: string) => !oldImages.includes(img));

            if (deletedImages.length > 0) {
                Promise.all(deletedImages.map((img: string) => _deleteFromR2(img))).catch(console.error)
                await decrement_usage_counter(product.partner_id, "images_count", deletedImages.length)
            }
            if (addedImages.length > 0) {
                await increment_usage_counter(product.partner_id, "images_count", addedImages.length)
            }
        } else if (payload.images && payload.images.length > 0) {
            await increment_usage_counter(product.partner_id, "images_count", payload.images.length)
        }

        if (
            product.video_type === "upload" &&
            payload.video_url !== undefined &&
            product.video_url &&
            product.video_url !== payload.video_url
        ) {
            Promise.all([
                _deleteFromR2(product.video_url),
                product.video_thumbnail ? _deleteFromR2(product.video_thumbnail) : Promise.resolve(),
            ]).catch(console.error)
        }

        // Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(productId, product.partner_id, 'update')

        // Fire-and-forget: low stock notification
        if (data.stockQuantity !== undefined || data.minStock !== undefined) {
            const { notifyLowStockAction } = await import("./notifications")
            notifyLowStockAction(productId).catch((err: Error) =>
                console.error("[notifications] low stock notification failed", err.message)
            )
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
        const product = await fetchProductAndVerifyOwnership(data.productId, "edit")

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
            is_active: true,
        })

        if (error) return { error: error.message }

        await invalidateProductCache(data.productId, product.partner_id, 'update')
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
        const csrf = await validateCSRF(data as Record<string, unknown>)
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")

        const product = await fetchProductAndVerifyOwnership(data.productId, "edit", "id, partner_id, images, sku, name, promotional_price")

        // Check subscription feature
        if (!await canUseFeature(product.partner_id, "product_variants")) {
            return errorResponse("Seu plano não permite o uso de variantes. Faça upgrade para desbloquear.")
        }

        const supabase = await getSupabaseServerClient()

        // 1. Buscar variantes existentes
        const { data: existingVariants } = await supabase
            .from("product_variants")
            .select("*")
            .eq("product_id", data.productId)

        // 2. Preparar dados para upsert
        const variantsToInsert = data.variants.map(v => ({
            product_id: data.productId,
            variant_name: v.variantName,
            variant_type: v.variantType,
            variant_value: v.variantValue,
            sku: v.sku,
            price_adjustment: v.price,
            stock_quantity: v.stockQuantity,
            variant_options: v.image ? { image: v.image } : null,
            is_active: v.isActive,
        }))

        // 3. Fazer upsert ao invés de delete + insert
        const { data: inserted, error } = await supabase
            .from("product_variants")
            .upsert(
                variantsToInsert,
                { onConflict: 'sku' } // Usa SKU como identificador único
            )
            .select()

        if (error) return errorResponse(error.message)

        if (product.promotional_price && Number(product.promotional_price) !== 0) {
            await supabase.from("products").update({
                promotional_price: null,
                is_on_promotion: false
            }).eq("id", data.productId)
        }

        // 4+5. Fire-and-forget: Deletar imagens removidas em paralelo
        const imagesToCleanup: string[] = []
        if (existingVariants) {
            const newSkus = new Set(data.variants.map(v => v.sku))
            for (const v of existingVariants) {
                if (!newSkus.has(v.sku) && v.variant_options?.image) imagesToCleanup.push(v.variant_options.image)
            }
        }
        if (data.deletedImages?.length) imagesToCleanup.push(...data.deletedImages)

        let newImagesCount = 0;
        data.variants.forEach(v => {
            if (v.image && (!existingVariants?.some((ev: any) => ev.variant_options?.image === v.image))) newImagesCount++;
        })

        if (imagesToCleanup.length > 0) {
            Promise.all(imagesToCleanup.map(img => _deleteFromR2(img))).catch(console.error)
            await decrement_usage_counter(product.partner_id, "images_count", imagesToCleanup.length)
        }

        if (newImagesCount > 0) {
            await increment_usage_counter(product.partner_id, "images_count", newImagesCount)
        }

        await invalidateProductCache(data.productId, product.partner_id, 'update')
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
        await verifyAuth()
        const supabase = await getSupabaseServerClient()
        const { data: variant } = await supabase.from("product_variants").select("product_id, variant_options").eq("id", variantId).single()
        if (!variant) return errorResponse("Variante não encontrada")

        const product = await fetchProductAndVerifyOwnership(variant.product_id, "edit")
        const { error } = await supabase.from("product_variants").delete().eq("id", variantId)
        if (error) return errorResponse(error.message)

        if (variant.variant_options?.image) {
            Promise.resolve().then(() => _deleteFromR2(variant.variant_options.image)).catch(console.error)
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
        await verifyAuth()
        const supabase = await getSupabaseServerClient()

        const { data: variant } = await supabase.from("product_variants").select("product_id, variant_options").eq("id", variantId).single()
        if (!variant) return errorResponse("Variante não encontrada")

        const product = await fetchProductAndVerifyOwnership(variant.product_id, "edit")

        const payload: any = { updated_at: new Date().toISOString() }
        if (data.variantName !== undefined) payload.variant_name = data.variantName
        if (data.sku !== undefined) payload.sku = data.sku
        if (data.price !== undefined) payload.price_adjustment = data.price
        if (data.stockQuantity !== undefined) payload.stock_quantity = data.stockQuantity
        if (data.isActive !== undefined) payload.is_active = data.isActive
        if (data.image !== undefined) {
            if (data.image !== null && variant.variant_options?.image && variant.variant_options.image !== data.image) {
                await _deleteFromR2(variant.variant_options.image)
            }
            payload.variant_options = { ...(variant.variant_options || {}), image: data.image }
        }

        const { data: updated, error } = await supabase.from("product_variants").update(payload).eq("id", variantId).select().single()
        if (error) return errorResponse(error.message)

        Promise.resolve().then(() => revalidateProducts(product.partner_id, variant.product_id)).catch(console.error)
        return successResponse(updated)
    } catch (error: any) {
        return errorResponse(error.message)
    }
}

export async function batchDeleteVariantsAction(variantIds: string[]): Promise<ActionResponse<any>> {
    try {
        const user = await verifyAuth()
        if (!variantIds?.length) return successResponse({ deletedCount: 0 })

        const supabase = await getSupabaseServerClient()

        const { data: variants } = await supabase
            .from("product_variants")
            .select("id, product_id, variant_options, products!inner(partner_id, partners!inner(user_id))")
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

        const { error } = await supabase.from("product_variants").delete().in("id", variantIds)
        if (error) return errorResponse(error.message)

        const imagesToDelete = variants.filter((v: any) => v.variant_options?.image).map((v: any) => v.variant_options.image)
        if (imagesToDelete.length > 0) {
            Promise.all(imagesToDelete.map((img: string) => _deleteFromR2(img))).catch(() => null)
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

        const supabase = await getSupabaseServerClient()
        const variantIds = updates.map(u => u.id)

        const { data: variants } = await supabase
            .from("product_variants")
            .select("id, product_id, variant_options, products!inner(partner_id, partners!inner(user_id))")
            .in("id", variantIds)

        if (!variants || variants.length === 0) return errorResponse("Variantes não encontradas")

        // SECURITY (BOLA/IDOR fix): authorize EVERY requested variant, not just variants[0].
        const uniqueRequestedIds = Array.from(new Set(variantIds))
        if (variants.length !== uniqueRequestedIds.length) {
            return errorResponse("Uma ou mais variantes não foram encontradas")
        }
        const productPartnerId = await verifyVariantBatchOwnership(variants, user)

        await Promise.all(updates.map(update => {
            const current = variants.find((v: any) => v.id === update.id)
            if (!current) return

            const payload: any = { updated_at: new Date().toISOString() }
            if (update.price !== undefined) payload.price_adjustment = update.price
            if (update.stock !== undefined) payload.stock_quantity = update.stock
            if (update.active !== undefined) payload.is_active = update.active
            if (update.image !== undefined) {
                payload.variant_options = { ...(current.variant_options || {}), image: update.image }
            }
            return supabase.from("product_variants").update(payload).eq("id", update.id)
        }))

        const firstProd = Array.isArray(variants[0]?.products) ? variants[0].products[0] : variants[0]?.products
        if (firstProd?.partner_id) {
            await invalidateProductCache(variants[0].product_id, firstProd.partner_id, 'update')
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
        const admin = getAdminClient()

        const { error } = await admin.from("product_suppliers").insert({
            product_id: productId,
            supplier_id: supplierId,
            cost_price: supplierData?.costPrice || null,
            supplier_sku: supplierData?.supplierSku || null,
            lead_time_days: supplierData?.leadTimeDays || null,
        })
        if (error && !error.message.includes("duplicate")) return { error: error.message }

        revalidateSuppliers(product.partner_id)
        revalidateProducts(product.partner_id, productId)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function unlinkProductSupplierAction(productId: string, supplierId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit")
        const admin = getAdminClient()
        const { error } = await admin.from("product_suppliers").delete().eq("product_id", productId).eq("supplier_id", supplierId)
        if (error) return { error: error.message }

        revalidateSuppliers(product.partner_id)
        revalidateProducts(product.partner_id, productId)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateProductSupplierAction(productId: string, supplierId: string, data: { costPrice?: number | null; supplierSku?: string | null; leadTimeDays?: number | null }) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "edit")
        const admin = getAdminClient()
        const updates: any = {}
        if (data.costPrice !== undefined) updates.cost_price = data.costPrice
        if (data.supplierSku !== undefined) updates.supplier_sku = data.supplierSku
        if (data.leadTimeDays !== undefined) updates.lead_time_days = data.leadTimeDays
        const { error } = await admin.from("product_suppliers").update(updates).eq("product_id", productId).eq("supplier_id", supplierId)
        if (error) return { error: error.message }
        revalidateSuppliers(product.partner_id)
        revalidateProducts(product.partner_id, productId)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export const getCachedSuppliers = async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data } = await supabase.from("suppliers").select("id, name, email, phone, cnpj, cpf, status").eq("partner_id", partnerId).order("name")
            return data || []
        },
        [`suppliers-list-${partnerId}`],
        { tags: [TAGS.suppliers(partnerId)], revalidate: 60 }
    )()
}

export async function getProductSuppliersAction(productId: string) {
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "view")
        const admin = getAdminClient()
        const { data, error } = await admin
            .from("product_suppliers")
            .select(`
                id, product_id, supplier_id, cost_price, supplier_sku, lead_time_days,
                last_purchase_price, last_purchase_date, last_invoice_key,
                supplier:suppliers!inner(id, name, email, phone, cnpj, cpf)
            `)
            .eq("product_id", productId)
        if (error) return { error: error.message }
        const suppliers = (data || []).map((ps: any) => ({
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
            supplier_document: ps.supplier?.cnpj || ps.supplier?.cpf || null,
        }))
        return { suppliers, partnerId: product.partner_id }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function searchSuppliersAction(partnerId: string, search: string) {
    try {
        const supabase = await getSupabaseServerClient()
        const sanitized = search.replace(/[%_]/g, "")
        if (!sanitized.trim()) {
            const { data } = await supabase.from("suppliers").select("id, name, email, phone, cnpj, cpf").eq("partner_id", partnerId).order("name").limit(20)
            return { suppliers: data || [] }
        }
        const term = `%${sanitized}%`
        const { data, error } = await supabase
            .from("suppliers")
            .select("id, name, email, phone, cnpj, cpf")
            .eq("partner_id", partnerId)
            .or(`name.ilike.${term},email.ilike.${term},cnpj.ilike.${term},cpf.ilike.${term},phone.ilike.${term}`)
            .order("name")
            .limit(20)
        if (error) return { error: error.message }
        return { suppliers: data || [] }
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
        await fetchProductAndVerifyOwnership(productId, "view")
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
        await fetchProductAndVerifyOwnership(productId, "view")
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

export async function getReplenishmentSuggestionsAction(partnerId: string) {
    try {
        const user = await requireUser()
        await requirePermission(partnerId, "products", "view")
        const admin = getAdminClient()

        const { data, error } = await admin
            .from("products")
            .select(`
                id, name, sku, gtin, stock_quantity, min_stock, cost_price, unit, images,
                product_suppliers(supplier_id, cost_price)
            `)
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .gt("min_stock", 0)
            .order("name")
            .limit(200)

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

        const suggestions = lowStockProducts.map((p: any) => {
            const stock = Number(p.stock_quantity) || 0
            const min = Number(p.min_stock) || 0
            const suggestion = Math.max(0, min - stock)
            const primarySupplier = p.product_suppliers?.[0]
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
                image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
                supplier_name: primarySupplier ? (supplierNameMap[primarySupplier.supplier_id] || null) : null,
                supplier_cost: primarySupplier?.cost_price || null,
            }
        })

        return { suggestions, total: suggestions.length }
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
        const { sanitized, partnerId, user } = await verifyBatchOwnership(productIds)
        await requirePermission(partnerId, "products", "edit", user)
        const admin = getAdminClient()

        const { error } = await admin.from("products").update({ status: isActive ? "ativo" : "inativo" }).in("id", sanitized)
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
        const { sanitized, partnerId } = await verifyBatchOwnership(productIds)
        await requirePermission(partnerId, "products", "delete")
        const admin = getAdminClient()

        // Fetch products details first for audit logging
        const { data: products } = await admin.from("products").select("id, name, sku").in("id", sanitized)

        // 1. Explicit batch update (soft delete)
        const payload = buildSoftDeletePayload(user.id, reason)
        const { error } = await admin.from("products").update(payload).in("id", sanitized)
        if (error) return { error: error.message }

        // 2. Log audit event for each product in batch
        const reqHeaders = await headers()
        const ip = reqHeaders.get("x-forwarded-for") || "127.0.0.1"

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
        const { sanitized, partnerId, user } = await verifyBatchOwnership(productIds)
        await requirePermission(partnerId, "products", "edit", user)

        const admin = getAdminClient()

        // Use RPC to handle batch updates safely if possible, or iterate
        // Given Supabase limitations, a series of updates or a specific RPC is best.
        // For now, let's use a Promise.all for simplicity, but strictly validated.

        const results = await Promise.all(updates.map(update => {
            const { id, ...data } = update
            if (!sanitized.includes(id)) return Promise.resolve({ error: "Unauthorized ID" })
            return admin.from("products").update(data).eq("id", id)
        }))

        const firstError = results.find(r => r.error)
        if (firstError) return { error: firstError.error?.message }

        if (partnerId) {
            // Revalidate each product to ensure Redis marketplace index is updated
            await Promise.all(sanitized.map(id =>
                invalidateProductCache(id, partnerId, 'update')
            ))
        }
        return { success: true, count: updates.length }
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
        await verifyAuth()
        const supabase = await getSupabaseServerClient()
        const { data: products } = await supabase.from("products").select("*").in("id", productIds)

        if (!products?.length) return { success: false, error: "Produtos não encontrados" }
        await requirePermission(products[0].partner_id, "products", "create")

        // SKU puro (zero queries) â€” unicidade pelo banco
        const duplicated = products.map((p: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, created_at, updated_at, ...data } = p
            return {
                ...data,
                name: `${data.name} (Cópia)`,
                sku: generateSKUBase(`${data.name} Copy`),
            }
        })

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

            const result = await supabase.from("products").insert(duplicated).select()

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
        const { data: count } = await supabase.rpc('get_product_pending_orders_count', { p_product_id: productId })
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
        .select("product_id, price_adjustment, stock_quantity, is_active")
        .in("product_id", productIds)
    if (!data) return {}
    const map: Record<string, { variant_min_price: number; variant_max_price: number; variant_total_stock: number }> = {}
    for (const v of data) {
        if (!v.is_active) continue
        if (!map[v.product_id]) map[v.product_id] = { variant_min_price: Infinity, variant_max_price: -Infinity, variant_total_stock: 0 }
        const m = map[v.product_id]
        const price = Number(v.price_adjustment) || 0
        if (price < m.variant_min_price) m.variant_min_price = price
        if (price > m.variant_max_price) m.variant_max_price = price
        m.variant_total_stock += Number(v.stock_quantity) || 0
    }
    for (const pid of productIds) {
        if (map[pid]) {
            if (map[pid].variant_min_price === Infinity) map[pid].variant_min_price = 0
            if (map[pid].variant_max_price === -Infinity) map[pid].variant_max_price = 0
        }
    }
    return map
}

export const getCachedProducts = async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data, error } = await supabase
                .from("products")
                .select("id, name, stock_quantity, price, promotional_price, min_stock, is_active, sku, images, unit, created_at, variants:product_variants(count), show_in_marketplace, moderation_status, category_id, category:product_categories!category_id(name), brand_id, brand:brands!brand_id(name)")
                .eq("partner_id", partnerId)
                .limit(100)
                .order("created_at", { ascending: false })
            if (error) throw error
            const rows = (data || []).map((p: any) => ({
                ...p,
                category: p.category?.name || null,
                brand: p.brand?.name || null
            }))
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
                    }
                }
            }
            return rows
        },
        [TAGS.products(partnerId)],
        { tags: [TAGS.products(partnerId)] }
    )()
}

export const getCachedProductById = async (productId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data: product, error } = await supabase
                .from("products")
                .select("*, category:product_categories!category_id(name), subcategory:product_categories!subcategory_id(name), brand:brands!brand_id(name), location:storage_locations!location_id(name), variants:product_variants(*)")
                .eq("id", productId)
                .single()
            if (error) throw error
            if (product) {
                return {
                    ...product,
                    category: product.category?.name || null,
                    subcategory: product.subcategory?.name || null,
                    brand: product.brand?.name || null,
                    location: product.location?.name || null
                }
            }
            return product
        },
        [`product-details-${productId}`],
        { tags: [TAGS.product(productId)] }
    )()
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
        const user = await requireUser()
        await requirePermission(partnerId, "products", "view")
        const supabase = await getSupabaseServerClient()
        
        let q = supabase.from("products").select("*").eq("partner_id", partnerId)
        if (storeId) q = q.eq("store_id", storeId)
        
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
        await requirePermission(partnerId, "products", "view")
        const supabase = await getSupabaseServerClient()

        if (options?.storeId) {
            await requireStorePermission(options.storeId, partnerId, "products", "view")
        }

        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_PRODUCTS_PAGE_SIZE))))
        const fetchLimit = limit + 1

        let q = supabase
            .from("products")
            .select("id, name, stock_quantity, price, promotional_price, min_stock, is_active, sku, images, unit, created_at, variants:product_variants(count), show_in_marketplace, moderation_status, category_id, category:product_categories!category_id(name), brand_id, brand:brands!brand_id(name)")
            .eq("partner_id", partnerId)

        if (options?.storeId) {
            q = q.eq("store_id", options.storeId)
        }

        if (!options?.filters?.includeArchived) {
            q = scopeActiveOnly(q)
        }

        if (cursor) {
            q = q.or(buildProductsKeysetOrFilter(cursor))
        }

        const { data, error } = await q
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit)

        if (error) throw error

        const rows = (data || []).map((p: any) => ({
            ...p,
            category: p.category?.name || null,
            brand: p.brand?.name || null
        }))

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
                }
            }
        }

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
        if (!resolvedPartnerId) {
            const context = await getCurrentPartnerContext()
            if (!context) return { success: false, error: "Contexto do parceiro não encontrado" }
            resolvedPartnerId = context.partnerId
        }

        await requirePermission(resolvedPartnerId, "products", "view")
        const supabase = getAdminClient()

        const cleanCode = code.trim()
        if (!cleanCode) return { success: false, error: "Código inválido" }

        // 1. GTIN exact match on products
        const { data: gtinMatch } = await scopeActiveOnly(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("gtin", cleanCode)
            .eq("is_active", true))
            .maybeSingle()

        if (gtinMatch) {
            return { success: true, data: gtinMatch }
        }

        // 2. SKU exact match on products
        const { data: skuMatch } = await scopeActiveOnly(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("sku", cleanCode)
            .eq("is_active", true))
            .maybeSingle()

        if (skuMatch) {
            return { success: true, data: skuMatch }
        }

        // 3. SKU exact match on product variants (joining active product only)
        const { data: variantMatch } = await supabase
            .from("product_variants")
            .select("*, products!inner(*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options))")
            .eq("sku", cleanCode)
            .eq("is_active", true)
            .is("products.deleted_at", null)
            .maybeSingle()

        if (variantMatch && variantMatch.products && variantMatch.products.partner_id === resolvedPartnerId) {
            const product = {
                ...variantMatch.products,
                matchedVariantId: variantMatch.id
            }
            return { success: true, data: product }
        }

        // 4. Partial SKU fallback
        const { data: partialSkuMatch } = await scopeActiveOnly(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("is_active", true)
            .ilike("sku", `%${cleanCode}%`))
            .limit(1)

        if (partialSkuMatch && partialSkuMatch.length > 0) {
            return { success: true, data: partialSkuMatch[0] }
        }

        // 5. Product name fallback
        const { data: nameMatch } = await scopeActiveOnly(supabase
            .from("products")
            .select("*, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", resolvedPartnerId)
            .eq("is_active", true)
            .ilike("name", `%${cleanCode}%`))
            .limit(1)

        if (nameMatch && nameMatch.length > 0) {
            return { success: true, data: nameMatch[0] }
        }

        return { success: false, error: "Produto não encontrado" }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

