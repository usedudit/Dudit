"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
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
import { checkLimit, canUseFeature, increment_usage_counter } from "@/lib/services/subscription.service"

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

const fetchProductAndVerifyOwnership = async (productId: string, requiredAction?: "view" | "create" | "edit" | "delete", selectColumns = "id, partner_id, images, sku, name") => {
    const admin = getAdminClient()

    const { data: product, error } = await admin
        .from("products")
        .select(selectColumns)
        .eq("id", productId)
        .single()

    if (error || !product) throw new Error("Produto nÃ£o encontrado")

    if (requiredAction) {
        await requirePartnerAccessWithPermission(product.partner_id, "products", requiredAction)
    } else {
        const { requirePartnerAccess } = await import("@/lib/auth/authorization")
        await requirePartnerAccess(product.partner_id)
    }

    return product
}

const verifyBatchOwnership = async (productIds: string[]) => {
    const { sanitizeUUID } = await import("@/lib/security/input-sanitizer")
    const sanitized = productIds.map(sanitizeUUID).filter((id): id is string => id !== null)

    if (!sanitized.length) throw new Error("Nenhum ID vÃ¡lido")
    if (sanitized.length > 100) throw new Error("MÃ¡ximo: 100 produtos")

    const admin = getAdminClient()

    const { data } = await admin
        .from("products")
        .select("id, partner_id")
        .in("id", sanitized)

    if (!data || data.length !== sanitized.length) throw new Error("Produtos nÃ£o encontrados")

    // All products must belong to the same partner
    const partnerId = data[0]?.partner_id
    if (!partnerId || data.some((p: any) => p.partner_id !== partnerId)) throw new Error("Produtos de parceiros diferentes")

    const { requirePartnerAccess } = await import("@/lib/auth/authorization")
    await requirePartnerAccess(partnerId)

    return { sanitized, partnerId }
}



// ============================================================================
// ACTIONS BÃSICAS (Mantidas por compatibilidade)
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

export async function deleteProductAction(productId: string) {
    const actionStart = performance.now()
    await requireRateLimit(RateLimitCategory.PRODUCT_DELETE)
    try {
        const product = await fetchProductAndVerifyOwnership(productId, "delete")

        const admin = getAdminClient()

        // Sequential: fetch variants FIRST (before delete cascades them away)
        const variantsRes = await admin.from("product_variants").select("variant_options").eq("product_id", productId)

        // Now safe to delete the product
        const deleteResult = await admin.from("products").delete().eq("id", productId)
        if (deleteResult.error) return { error: deleteResult.error.message }

        // Coletar TODAS as imagens para deletar: produto + variantes
        const imagesToDelete: string[] = []

        if (product.images?.length) {
            imagesToDelete.push(...product.images.filter((img: any) => img && typeof img === 'string' && img.trim()))
        }

        variantsRes.data?.forEach((variant: any) => {
            if (variant.variant_options && typeof variant.variant_options === 'object') {
                const image = variant.variant_options.image
                if (image && typeof image === 'string' && image.trim()) {
                    imagesToDelete.push(image)
                }
            }
        })

        // Fire-and-forget: R2 image cleanup (non-blocking)
        if (imagesToDelete.length > 0) {
            Promise.all(imagesToDelete.map(img => _deleteFromR2(img))).catch(console.error)
        }

        // Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(productId, product.partner_id, 'delete', { silent: true })

        console.log(`[PERF] deleteProduct took ${Math.round(performance.now() - actionStart)}ms`)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

// ============================================================================
// COMPREHENSIVE ACTIONS (Otimizadas com novos campos)
// ============================================================================

export async function createProductComprehensiveAction(data: {
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
    availability?: string
    warranty?: string | null
    videoUrl?: string | null
    technicalSpecs?: any
    deliveryFormat?: string | null
    showInMarketplace?: boolean
    requiresManualModeration?: boolean
    csrf_token?: string
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
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF invÃ¡lido")

        // â”€â”€ SERVER-SIDE CONTEXT FALLBACK â”€â”€
        let finalPartnerId = data.partnerId
        if (!finalPartnerId || finalPartnerId.trim() === "") {
            const { getCurrentPartnerContext } = await import("@/lib/auth/partner-context")
            const ctx = await getCurrentPartnerContext()
            if (ctx?.partnerId) finalPartnerId = ctx.partnerId
            else throw new Error("Acesso negado: ID do Parceiro nÃ£o pÃ´de ser resolvido.")
        }

        const supabase = await getSupabaseServerClient()

        // 3. Permission + Store em paralelo (moderaÃ§Ã£o agora Ã© assÃ­ncrona)
        const [_access, storeResult] = await Promise.all([
            requirePartnerAccessWithPermission(finalPartnerId, "products", "create"),
            (async () => {
                if (data.storeId && data.storeId.trim() !== "") return data.storeId
                const admin = getAdminClient()
                const { data: stores } = await admin.from("stores").select("id").eq("partner_id", finalPartnerId).limit(1)
                if (stores && stores.length > 0) return stores[0].id
                throw new Error("Erro de infraestrutura: Nenhuma loja associada a este parceiro.")
            })(),
        ])

        const finalStoreId = storeResult

        // 3.5 Subscription limit check â€” enforce product limits before creating
        // 3.5 Subscription limit check — enforce product and image limits before creating
        const [limitCheck, imagesLimitCheck] = await Promise.all([
            checkLimit(finalPartnerId, "products"),
            checkLimit(finalPartnerId, "total_images", (data.images?.length || 0)),
        ])
        if (!limitCheck.allowed) {
            return errorResponse(limitCheck.message || "Limite de produtos atingido.")
        }
        if (!imagesLimitCheck.allowed) {
            return errorResponse(imagesLimitCheck.message || "Limite de imagens atingido.")
        }

        const adminForBusinessInfo = getAdminClient()
        const { data: partnerData } = await adminForBusinessInfo.from('partners').select('business_info').eq('id', finalPartnerId).single()
        const businessInfo = partnerData?.business_info || { sells: ["products"], channels: ["online"] }
        const sellsOnline = businessInfo.channels?.includes("online") ?? true

        // If not selling online, enforce marketplace options off
        if (!sellsOnline) {
            data.showInMarketplace = false
            data.subcategoryId = null
            data.featured = false
        }

        // SKU: funÃ§Ã£o pura (zero queries), unicidade garantida pelo banco
        const sku = data.sku?.trim() || generateSKUBase(data.name)

        const productData = {
            partner_id: finalPartnerId,
            store_id: finalStoreId,
            name: data.name,
            description: data.description || null,
            sku,
            gtin: data.gtin || null,
            brand: data.brand || null,
            category: data.category || null,
            category_id: data.categoryId || null,
            subcategory: data.subcategory || null,
            subcategory_id: data.subcategoryId || data.subcategory_id || null, // Handle both names
            condition: data.condition || "Novo",
            unit: data.unit || null,
            brand_id: (data as any).brandId || null,
            product_type: data.productType || "FÃ­sico",
            location: data.location || null,
            location_id: data.locationId || null,
            cost_price: data.costPrice || 0,
            price: data.price,
            promotional_price: data.promotionalPrice || null,
            min_stock: data.minStock || 0,
            max_stock: data.maxStock || 0,
            stock_quantity: data.stockQuantity || 0,
            is_active: data.isActive !== false,
            is_on_promotion: data.isOnPromotion || false,
            show_price_in_store: data.showPriceInStore !== false,
            images: data.images || [],
            // Marketplace enforced rules
            is_featured: data.featured || false,
            availability: data.availability || "in_stock",
            warranty: data.warranty || null,
            video_url: data.videoUrl || null,
            technical_specs: data.technicalSpecs || {},
            delivery_format: data.deliveryFormat || null,
            show_in_marketplace: data.showInMarketplace !== false,
            // ModeraÃ§Ã£o assÃ­ncrona ou status de bloqueio do enviador
            moderation_status: data.requiresManualModeration ? 'pending_moderation' : 'approved',
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

        // Criar moderation job (cron processa)
        const admin = getAdminClient()
        Promise.resolve(
            admin.from('moderation_jobs').insert({
                product_id: insertedProduct.id,
                type: 'product',
                status: 'pending',
            })
        ).catch(console.error)

        // Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(insertedProduct.id, finalPartnerId, 'create', { silent: true })

        // Increment usage counters
        increment_usage_counter(finalPartnerId, "products_count").catch(console.error)
        if (data.images && data.images.length > 0) {
            increment_usage_counter(finalPartnerId, "images_count", data.images.length).catch(console.error)
        }

        console.log(`[PERF] createProduct took ${Math.round(performance.now() - actionStart)}ms`)
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
    availability?: string
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
    locationId?: string
    featured?: boolean
    productType?: string
    packagingType?: string
    preparationDays?: number
    costPrice?: number
    isOnPromotion?: boolean
    deliveryFormat?: string
    tags?: string[]
    videoUrl?: string
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
}

export async function updateProductComprehensiveAction(productId: string, data: UpdateProductData): Promise<ActionResponse<any>> {
    const actionStart = performance.now()
    // 1. GATEKEEPER â€” isolado
    await requireRateLimit(RateLimitCategory.PRODUCT_UPDATE)
    try {
        // 2. CSRF + ownership em paralelo (independentes)
        const [csrf, product] = await Promise.all([
            validateCSRF(data as Record<string, unknown>),
            fetchProductAndVerifyOwnership(productId, "edit", "id, partner_id, images, sku, name, description, moderation_status"),
        ])
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF invÃ¡lido")

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
            'availability', 'warranty', 'unit',
            'category_id', 'brand_id', 'location_id', 'subcategory_id'
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
            const businessInfo = partnerData?.business_info || { sells: ["products"], channels: ["online"] }
            const sellsOnline = businessInfo.channels?.includes("online") ?? true

            if (!sellsOnline) {
                data.showInMarketplace = false
                data.subcategoryId = undefined
                data.featured = false
            }
        }

        // Mapeamento CamelCase â†’ SnakeCase
        if (data.stockQuantity !== undefined) payload.stock_quantity = data.stockQuantity
        if (data.minStock !== undefined) payload.min_stock = data.minStock
        if (data.maxStock !== undefined) payload.max_stock = data.maxStock
        if (data.isActive !== undefined) payload.is_active = data.isActive
        if (data.productType !== undefined) payload.product_type = data.productType

        if (data.packagingType !== undefined) logisticsPayload.packaging_type = data.packagingType
        if (data.preparationDays !== undefined) logisticsPayload.preparation_days = data.preparationDays

        if (data.fciCode !== undefined) fiscalPayload.fci_code = data.fciCode
        if (data.allow_sell_without_stock !== undefined) payload.allow_sell_without_stock = data.allow_sell_without_stock

        // Campos promocionais e de preÃ§o
        if (data.costPrice !== undefined) payload.cost_price = data.costPrice
        if (data.promotionalPrice !== undefined) payload.promotional_price = data.promotionalPrice
        if (data.isOnPromotion !== undefined) payload.is_on_promotion = data.isOnPromotion
        if (data.showPriceInStore !== undefined) payload.show_price_in_store = data.showPriceInStore

        // Novos campos (Marketplace/Outros)
        if (data.subcategoryId !== undefined) payload.subcategory_id = data.subcategoryId
        if (data.subcategory_id !== undefined) payload.subcategory_id = data.subcategory_id
        if (data.categoryId !== undefined) payload.category_id = data.categoryId
        if (data.brandId !== undefined) payload.brand_id = data.brandId
        if (data.locationId !== undefined) payload.location_id = data.locationId
        if (data.videoUrl !== undefined) payload.video_url = data.videoUrl
        if (data.technicalSpecs !== undefined) payload.technical_specs = data.technicalSpecs
        if (data.featured !== undefined) payload.is_featured = data.featured
        if (data.deliveryFormat !== undefined) payload.delivery_format = data.deliveryFormat
        if (data.tags !== undefined) payload.tags = data.tags
        if (data.showInMarketplace !== undefined) payload.show_in_marketplace = data.showInMarketplace

        // ModeraÃ§Ã£o de TEXTO: cria job para cron processar (nÃ£o altera moderation_status)
        const needsTextRemoderation =
            (data.name !== undefined && data.name !== product.name) ||
            (data.description !== undefined && data.description !== product.description)

        // ModeraÃ§Ã£o de IMAGEM: simples â€” bloqueou algo? pending. NÃ£o bloqueou? approved.
        payload.moderation_status = data.requiresManualModeration ? 'pending_moderation' : 'approved'

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
        await adminUpdate.from('products').update({ moderation_status: payload.moderation_status }).eq('id', productId)

        // Criar moderation job se necessário (cron processa) — reuses same admin client
        if (needsTextRemoderation) {
            Promise.resolve(
                adminUpdate.from('moderation_jobs').insert({
                    product_id: productId,
                    type: 'product',
                    status: 'pending',
                })
            ).catch(console.error)
        }

        // Fire-and-forget: R2 image cleanup para imagens removidas
        if (product.images && Array.isArray(product.images)) {
            const oldImages = product.images.filter((img: any) => typeof img === 'string' && img.trim());
            const newImages = payload.images || [];
            const deletedImages = oldImages.filter((img: string) => !newImages.includes(img));

            if (deletedImages.length > 0) {
                Promise.all(deletedImages.map((img: string) => _deleteFromR2(img))).catch(console.error)
            }
        }

        // Synchronous revalidation and Redis sync to prevent stale data
        await invalidateProductCache(productId, product.partner_id, 'update', { silent: true })

        console.log(`[PERF] updateProduct took ${Math.round(performance.now() - actionStart)}ms`)
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
            return { error: "Seu plano não permite o uso de variantes. Faça upgrade para desbloquear." }
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

        // Silent mode prevents redundant ERP list re-render
        await invalidateProductCache(data.productId, product.partner_id, 'update', { silent: true })
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
        return errorResponse("Limite máximo de 50 variantes por vez excedido.")
    }

    try {
        const csrf = await validateCSRF(data as Record<string, unknown>)
        if (!csrf.valid) return errorResponse(csrf.error || "CSRF inválido")

        const product = await fetchProductAndVerifyOwnership(data.productId, "edit")
        
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

        // 4+5. Fire-and-forget: Deletar imagens removidas em paralelo
        const imagesToCleanup: string[] = []
        if (existingVariants) {
            const newSkus = new Set(data.variants.map(v => v.sku))
            for (const v of existingVariants) {
                if (!newSkus.has(v.sku) && v.variant_options?.image) imagesToCleanup.push(v.variant_options.image)
            }
        }
        if (data.deletedImages?.length) imagesToCleanup.push(...data.deletedImages)
        if (imagesToCleanup.length > 0) {
            Promise.all(imagesToCleanup.map(img => _deleteFromR2(img))).catch(console.error)
        }

        // Silent mode prevents redundant ERP list re-render
        await invalidateProductCache(data.productId, product.partner_id, 'update', { silent: true })
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
        if (!variant) return errorResponse("Variante nÃ£o encontrada")

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
        if (!variant) return errorResponse("Variante nÃ£o encontrada")

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

        if (!variants || variants.length === 0) return errorResponse("Variantes nÃ£o encontradas")

        // Check access via partner_users first, then fallback to partners.user_id
        const productPartnerId = variants[0]?.products?.partner_id
        if (productPartnerId) {
            const admin = getAdminClient()
            const { data: puAccess } = await admin
                .from("partner_users")
                .select("id")
                .eq("partner_id", productPartnerId)
                .eq("user_id", user?.id)
                .maybeSingle()
            if (!puAccess) {
                const { data: partner } = await admin
                    .from("partners")
                    .select("user_id")
                    .eq("id", productPartnerId)
                    .single()
                if (!partner || partner.user_id !== user?.id) {
                    return errorResponse("Sem permissÃ£o")
                }
            }
        }

        const { error } = await supabase.from("product_variants").delete().in("id", variantIds)
        if (error) return errorResponse(error.message)

        const imagesToDelete = variants.filter((v: any) => v.variant_options?.image).map((v: any) => v.variant_options.image)
        if (imagesToDelete.length > 0) {
            Promise.all(imagesToDelete.map((img: string) => _deleteFromR2(img))).catch(() => null)
        }

        if (variants[0]?.products?.partner_id) {
            await invalidateProductCache(variants[0].product_id, variants[0].products.partner_id, 'update', { silent: true })
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

        if (!variants) return errorResponse("Variantes nÃ£o encontradas")

        // Check access via partner_users first, then fallback to partners.user_id
        const productPartnerId = (variants[0] as any)?.products?.partner_id
        if (productPartnerId) {
            const admin = getAdminClient()
            const { data: puAccess } = await admin
                .from("partner_users")
                .select("id")
                .eq("partner_id", productPartnerId)
                .eq("user_id", user?.id)
                .maybeSingle()
            if (!puAccess) {
                const { data: partner } = await admin
                    .from("partners")
                    .select("user_id")
                    .eq("id", productPartnerId)
                    .single()
                if (!partner || partner.user_id !== user?.id) {
                    return errorResponse("Sem permissÃ£o")
                }
            }
        }

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

        if (variants[0]?.products?.partner_id) {
            await invalidateProductCache(variants[0].product_id, variants[0].products.partner_id, 'update', { silent: true })
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
        const supabase = await getSupabaseServerClient()

        const { error } = await supabase.from("product_suppliers").insert({
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
        const supabase = await getSupabaseServerClient()
        const { error } = await supabase.from("product_suppliers").delete().eq("product_id", productId).eq("supplier_id", supplierId)
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
            const { data } = await supabase.from("suppliers").select("id, name, email, phone").eq("partner_id", partnerId).order("name")
            return data || []
        },
        [`suppliers-list-${partnerId}`],
        { tags: [TAGS.suppliers(partnerId)], revalidate: 60 }
    )()
}

// ============================================================================
// OPERAÃ‡Ã•ES EM LOTE E UTILS
// ============================================================================

export async function toggleProductStatusAction(productIds: string[], isActive: boolean) {
    try {
        await verifyAuth()
        const { sanitized, partnerId } = await verifyBatchOwnership(productIds)
        const admin = getAdminClient()

        const { error } = await admin.from("products").update({ is_active: isActive }).in("id", sanitized)
        if (error) return { error: error.message }

        if (partnerId) {
            // Revalidate each product to ensure Redis marketplace index is updated
            Promise.all(sanitized.map(id => 
                invalidateProductCache(id, partnerId, 'update', { silent: true })
            )).catch(console.error)
        }
        return { success: true, count: sanitized.length }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteProductsInBatchAction(productIds: string[]) {
    try {
        await verifyAuth()
        const { sanitized, partnerId } = await verifyBatchOwnership(productIds)
        await requirePartnerAccessWithPermission(partnerId, "products", "delete")
        const admin = getAdminClient()

        const { data: products } = await admin.from("products").select("images").in("id", sanitized)
        const { error } = await admin.from("products").delete().in("id", sanitized)
        if (error) return { error: error.message }

        if (products?.length) {
            const allImages = products.flatMap((p: any) => p.images || [])
            Promise.all(allImages.map((img: string) => _deleteFromR2(img))).catch(() => null)
        }

        if (partnerId) {
            // Revalidate each product to ensure Redis marketplace index is updated
            Promise.all(sanitized.map(id => 
                invalidateProductCache(id, partnerId, 'delete', { silent: true })
            )).catch(console.error)
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
        const { sanitized, partnerId } = await verifyBatchOwnership(productIds)

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
            Promise.all(sanitized.map(id => 
                invalidateProductCache(id, partnerId, 'update', { silent: true })
            )).catch(console.error)
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

        if (!products?.length) return { success: false, error: "Produtos nÃ£o encontrados" }
        await requirePartnerAccessWithPermission(products[0].partner_id, "products", "create")

        // SKU puro (zero queries) â€” unicidade pelo banco
        const duplicated = products.map((p: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, created_at, updated_at, ...data } = p
            return {
                ...data,
                name: `${data.name} (CÃ³pia)`,
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
                    d.sku = generateSKUWithSuffix(generateSKUBase(d.name.replace(' (CÃ³pia)', '') + ' Copy'), attempt)
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
        console.log(`[PERF] duplicateProducts took ${Math.round(performance.now() - actionStart)}ms`)
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

export const getCachedProducts = async (partnerId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data, error } = await supabase
                .from("products")
                .select("id, name, category, brand, stock_quantity, price, min_stock, is_active, sku, images, unit, created_at, variants:product_variants(count), show_in_marketplace, moderation_status")
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })
            if (error) throw error
            return data || []
        },
        [TAGS.products(partnerId)],
        { tags: [TAGS.products(partnerId)], revalidate: 60 }
    )()
}

export const getCachedProductById = async (productId: string) => {
    return unstable_cache(
        async () => {
            const supabase = getAdminClient()
            const { data: product, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("id", productId)
                .single()
            if (error) throw error
            return product
        },
        [`product-details-${productId}`],
        { tags: [TAGS.product(productId)], revalidate: 60 }
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

export async function getProducts(partnerId: string) {
    try {
        const user = await requireUser()
        await requirePartnerAccessWithPermission(partnerId, "products", "view")
        const supabase = await getSupabaseServerClient()
        const { data } = await supabase.from("products").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false })
        return data || []
    } catch {
        return null
    }
}

export const getMarketplaceCategoriesAction = async (parentId: string | null = null) => {
    return unstable_cache(
        async () => {
            const supabase = await getSupabaseServerClient()

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
    // Variant count is fetched inline — no second query needed
    const products = await getCachedProducts(partnerId)

    return {
        products: products || [],
        partnerId: partnerId,
        variants: [] // Variants are loaded on-demand when editing a specific product
    }
})

