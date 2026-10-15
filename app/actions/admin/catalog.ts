"use server"

/**
 * Ações administrativas de catálogo (produtos, serviços e planos recorrentes).
 *
 * Permitem que o admin edite o catálogo de um vendedor "como se fosse o
 * vendedor", SEM impersonation e SEM bypass de RLS no cliente do usuário:
 *
 *  - Gates: requireAdminScope("moderation") + rate limit (ADMIN_READ/ACTION)
 *  - Escrita: getAdminClient() (service role) — o RPC update_product_transaction
 *    exige membership do parceiro via auth.uid(), por isso o update é feito com
 *    updates diretos espelhando as colunas do RPC (migrations 20260820/20260822).
 *  - Auditoria: adminAuditLog obrigatório em toda mutação + timeline do parceiro
 *    (logAuditEvent) para o vendedor ver que o item foi alterado.
 *
 * Os limites de plano (requireMinimumPlan/checkLimit/checkRecurringPlanCreateLimit)
 * são deliberadamente pulados: o admin atua como superusuário e a ação fica
 * registrada em admin_audit_logs.
 */

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context"
import { sanitizeString, sanitizeUUID } from "@/lib/security/input-sanitizer"
import { sanitizeInput, sanitizeNotes } from "@/lib/input-validator"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import type { ActionResponse } from "@/lib/types/action-response"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { EMPTY_VIDEO_METADATA, normalizeVideoMetadata } from "@/lib/video/shared"
import {
    invalidateProductCache,
    invalidateServiceCache,
    invalidateRecurringPlanCache,
} from "@/lib/cache/invalidation"
import { revalidateServices } from "@/lib/utils/revalidation"
import {
    buildSoftDeletePayload,
    buildArchivePayload,
    buildRestorePayload,
} from "@/lib/supabase/query-helpers"
import {
    increment_usage_counter,
    decrement_usage_counter,
} from "@/lib/services/subscription.service"
import { mapPlanRow } from "@/lib/types/recurring"
import type {
    RecurringPlanItem,
    RecurringPlanStatus,
    RecurringFrequencyType,
    RecurringShippingMode,
} from "@/lib/types/recurring"
import type { FulfillmentMode } from "@/lib/commerce/capabilities"
import {
    validatePlanInput,
    normalizeShippingInput,
    normalizePlanFulfillmentModes,
    mapItemsToDb,
} from "@/lib/recurring/plan-form-helpers"

type AdminClient = ReturnType<typeof getAdminClient>

const MAX_REASON_LEN = 300
const PAGE_SIZE = 30

const getBrasiliaTime = () => new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString()

async function adminReadGate(): Promise<void> {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)
}

async function adminWriteGate() {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    return admin
}

async function clientIp(): Promise<string> {
    try {
        return getTrustedClientIP(await headers())
    } catch {
        return "unknown"
    }
}

/** Timeline do parceiro (visível ao vendedor). Nunca derruba a action. */
async function partnerTimeline(entry: {
    partnerId: string
    actorUserId: string | null
    entityType: "product" | "service" | "recurring_plan"
    entityId: string
    actionType: string
    changeLines: string[]
    metadata?: Record<string, unknown>
}): Promise<void> {
    try {
        await logAuditEvent({
            partnerId: entry.partnerId,
            actorUserId: entry.actorUserId,
            entityType: entry.entityType,
            entityId: entry.entityId,
            actionType: entry.actionType as any,
            changeLines: entry.changeLines,
            metadata: { ip_address: await clientIp(), ...(entry.metadata || {}) },
            source: "manual",
        })
    } catch (e) {
        console.error("[ADMIN_CATALOG] timeline failed:", e)
    }
}

const _deleteFromR2 = async (url: string) => {
    if (!url || !url.trim()) return
    try {
        const { extractKeyFromR2Url, deleteFileFromR2 } = await import("@/lib/r2/server")
        const key = url.startsWith("http") ? extractKeyFromR2Url(url) : url
        if (key) await deleteFileFromR2(key)
    } catch (e) {
        console.error("Failed to delete image: ", url, e)
    }
}

async function fetchHeadStore(admin: AdminClient, partnerId: string | null | undefined) {
    if (!partnerId) return null
    const { data } = await admin
        .from("stores")
        .select("id, name, logo_url, risk_score, slug, short_id, addresses(city, state)")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    return data || null
}

async function fetchPartnerNames(admin: AdminClient, partnerIds: string[]) {
    const unique = [...new Set(partnerIds.filter(Boolean))]
    if (unique.length === 0) return {} as Record<string, string>
    const { data } = await admin.from("partners").select("id, name").in("id", unique)
    const map: Record<string, string> = {}
    for (const p of data || []) map[p.id] = p.name || "Parceiro"
    return map
}

function sanitizeSearchTerm(raw: string | undefined): string {
    return String(raw || "").trim().replace(/[%_,()]/g, "").slice(0, 100)
}

// ───────────────────────────────────────────────────────────────────────────
// LISTAGENS
// ───────────────────────────────────────────────────────────────────────────

export async function listAdminCatalogProducts(input?: {
    search?: string
    partnerId?: string
    limit?: number
}) {
    try {
        await adminReadGate()
        const admin = getAdminClient()
        const limit = Math.min(Math.max(Number(input?.limit) || PAGE_SIZE, 1), 100)

        let query = admin
            .from("products")
            .select(
                "id, name, sku, price, promotional_price, status, is_active, moderation_status, show_in_marketplace, images, stock_quantity, partner_id, store_id, updated_at, created_at",
            )
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit)

        const partnerId = sanitizeUUID(input?.partnerId || "")
        if (partnerId) query = query.eq("partner_id", partnerId)

        const search = sanitizeSearchTerm(input?.search)
        if (search) {
            query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
        }

        const { data, error } = await query
        if (error) return errorResponse(error.message)

        const rows = data || []
        const partnerMap = await fetchPartnerNames(admin, rows.map((r: any) => r.partner_id))
        return successResponse({
            items: rows.map((r: any) => ({ ...r, partner_name: partnerMap[r.partner_id] || null })),
            hasMore: rows.length === limit,
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao listar produtos")
    }
}

export async function listAdminCatalogServices(input?: {
    search?: string
    partnerId?: string
    limit?: number
}) {
    try {
        await adminReadGate()
        const admin = getAdminClient()
        const limit = Math.min(Math.max(Number(input?.limit) || PAGE_SIZE, 1), 100)

        let query = admin
            .from("services")
            .select(
                "id, name, sku, price, duration_minutes, status, is_active, moderation_status, show_in_marketplace, images, partner_id, store_id, updated_at, created_at",
            )
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit)

        const partnerId = sanitizeUUID(input?.partnerId || "")
        if (partnerId) query = query.eq("partner_id", partnerId)

        const search = sanitizeSearchTerm(input?.search)
        if (search) {
            query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
        }

        const { data, error } = await query
        if (error) return errorResponse(error.message)

        const rows = data || []
        const partnerMap = await fetchPartnerNames(admin, rows.map((r: any) => r.partner_id))
        return successResponse({
            items: rows.map((r: any) => ({ ...r, partner_name: partnerMap[r.partner_id] || null })),
            hasMore: rows.length === limit,
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao listar serviços")
    }
}

export async function listAdminCatalogPlans(input?: {
    search?: string
    partnerId?: string
    limit?: number
}) {
    try {
        await adminReadGate()
        const admin = getAdminClient()
        const limit = Math.min(Math.max(Number(input?.limit) || PAGE_SIZE, 1), 100)

        let query = admin
            .from("recurring_plans")
            .select(
                "id, name, status, frequency_type, frequency_interval, start_date, show_in_marketplace, images, partner_id, store_id, updated_at, created_at",
            )
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit)

        const partnerId = sanitizeUUID(input?.partnerId || "")
        if (partnerId) query = query.eq("partner_id", partnerId)

        const search = sanitizeSearchTerm(input?.search)
        if (search) {
            query = query.or(`name.ilike.%${search}%`)
        }

        const { data, error } = await query
        if (error) return errorResponse(error.message)

        const rows = data || []
        const partnerMap = await fetchPartnerNames(admin, rows.map((r: any) => r.partner_id))
        return successResponse({
            items: rows.map((r: any) => ({ ...r, partner_name: partnerMap[r.partner_id] || null })),
            hasMore: rows.length === limit,
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao listar planos")
    }
}

// ───────────────────────────────────────────────────────────────────────────
// DETALHES
// ───────────────────────────────────────────────────────────────────────────

export async function getAdminCatalogProductDetail(productId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(productId)
        if (!id) return errorResponse("ID de produto inválido")

        const admin = getAdminClient()
        const [prodRes, fiscalRes, logisticsRes] = await Promise.all([
            admin
                .from("products")
                .select(
                    "*, category:product_categories!category_id(name), subcategory:product_categories!subcategory_id(name), brand_rel:brands!brand_id(name), location_rel:storage_locations!location_id(name), variants:product_variants(*)",
                )
                .eq("id", id)
                .maybeSingle(),
            admin.from("product_fiscal_profiles").select("*").eq("product_id", id).maybeSingle(),
            admin.from("product_logistics").select("*").eq("product_id", id).maybeSingle(),
        ])

        const raw = prodRes.data as any
        if (!raw) return errorResponse("Produto não encontrado")

        const { product_id: _fp, ...fiscal } = (fiscalRes.data as any) || {}
        const { product_id: _lp, ...logistics } = (logisticsRes.data as any) || {}

        const product = {
            ...raw,
            category: raw.category?.name || null,
            subcategory: raw.subcategory?.name || null,
            brand: raw.brand_rel?.name || raw.brand || null,
            location: raw.location_rel?.name || raw.location || null,
            ...fiscal,
            ...logistics,
        }

        const [suppliersRes, store, partnerRes, auditRes] = await Promise.all([
            admin
                .from("suppliers")
                .select("id, name, email, phone, cnpj, cpf, status")
                .eq("partner_id", raw.partner_id)
                .order("name"),
            fetchHeadStore(admin, raw.partner_id),
            admin.from("partners").select("id, name, business_info").eq("id", raw.partner_id).maybeSingle(),
            admin
                .from("admin_audit_logs")
                .select("*")
                .eq("target_id", id)
                .order("created_at", { ascending: false })
                .limit(100),
        ])

        return successResponse({
            product,
            suppliers: suppliersRes.data || [],
            store,
            partner: partnerRes.data || null,
            auditEvents: (auditRes.data as any[]) || [],
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar produto")
    }
}

export async function getAdminCatalogServiceDetail(serviceId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(serviceId)
        if (!id) return errorResponse("ID de serviço inválido")

        const admin = getAdminClient()
        const { data: service, error } = await admin
            .from("services")
            .select("*")
            .eq("id", id)
            .maybeSingle()
        if (error) return errorResponse(error.message)
        if (!service) return errorResponse("Serviço não encontrado")

        const [store, partnerRes, auditRes] = await Promise.all([
            fetchHeadStore(admin, (service as any).partner_id),
            admin
                .from("partners")
                .select("id, name, business_info")
                .eq("id", (service as any).partner_id)
                .maybeSingle(),
            admin
                .from("admin_audit_logs")
                .select("*")
                .eq("target_id", id)
                .order("created_at", { ascending: false })
                .limit(100),
        ])

        return successResponse({
            service,
            store,
            partner: partnerRes.data || null,
            auditEvents: (auditRes.data as any[]) || [],
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar serviço")
    }
}

export async function getAdminCatalogPlanDetail(planId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(planId)
        if (!id) return errorResponse("ID de plano inválido")

        const admin = getAdminClient()
        const { data: row, error } = await admin
            .from("recurring_plans")
            .select(
                `*,
                recurring_plan_items(
                    id, item_type, product_id, variant_id, service_id, quantity, unit_price,
                    staff_partner_user_id, preferred_time, duration_minutes, sort_order,
                    products:product_id(id, name, price, images),
                    services:service_id(id, name, price, duration_minutes, images)
                )`,
            )
            .eq("id", id)
            .maybeSingle()
        if (error) return errorResponse(error.message)
        if (!row) return errorResponse("Plano não encontrado")

        const plan = {
            ...mapPlanRow(row as Record<string, unknown>),
            items: ((row as any).recurring_plan_items || []).map((item: Record<string, unknown>) => ({
                id: String(item.id),
                planId: String(row.id),
                itemType: item.item_type,
                productId: item.product_id,
                variantId: item.variant_id,
                serviceId: item.service_id,
                quantity: Number(item.quantity),
                unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
                staffPartnerUserId: item.staff_partner_user_id,
                preferredTime: item.preferred_time,
                durationMinutes: item.duration_minutes,
                sortOrder: item.sort_order,
                product: item.products || null,
                service: item.services || null,
            })),
        }

        const [store, partnerRes, auditRes] = await Promise.all([
            fetchHeadStore(admin, (row as any).partner_id),
            admin
                .from("partners")
                .select("id, name, business_info")
                .eq("id", (row as any).partner_id)
                .maybeSingle(),
            admin
                .from("admin_audit_logs")
                .select("*")
                .eq("target_id", id)
                .order("created_at", { ascending: false })
                .limit(100),
        ])

        return successResponse({
            plan,
            store,
            partner: partnerRes.data || null,
            auditEvents: (auditRes.data as any[]) || [],
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar plano")
    }
}

export async function getAdminCatalogStoreSummary(partnerId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(partnerId)
        if (!id) return errorResponse("ID de parceiro inválido")
        const store = await fetchHeadStore(getAdminClient(), id)
        return successResponse({ store })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar loja")
    }
}

// ───────────────────────────────────────────────────────────────────────────
// METADATA / FORM DATA (leituras que os forms do ERP fazem com requirePermission)
// ───────────────────────────────────────────────────────────────────────────

export async function getAdminCatalogMetadata(partnerId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(partnerId)
        if (!id) return errorResponse("ID de parceiro inválido")

        const admin = getAdminClient()
        const [categoriesRes, brandsRes, locationsRes] = await Promise.all([
            admin
                .from("product_categories")
                .select("id, name, parent_id, is_active, created_at")
                .eq("partner_id", id)
                .order("name"),
            admin.from("brands").select("id, name, is_active, created_at").eq("partner_id", id).order("name"),
            admin
                .from("storage_locations")
                .select("id, name, is_active, created_at")
                .eq("partner_id", id)
                .order("name"),
        ])

        return successResponse({
            categories: categoriesRes.data || [],
            brands: brandsRes.data || [],
            locations: locationsRes.data || [],
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar metadata")
    }
}

export async function getAdminServiceCatalogMetadata(partnerId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(partnerId)
        if (!id) return errorResponse("ID de parceiro inválido")

        const { data, error } = await getAdminClient()
            .from("service_categories")
            .select("id, name, parent_id, is_active, created_at")
            .eq("partner_id", id)
            .order("name")
        if (error) return errorResponse(error.message)

        return successResponse({ categories: data || [] })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar categorias")
    }
}

export async function getAdminPlanFormData(partnerId: string) {
    try {
        await adminReadGate()
        const id = sanitizeUUID(partnerId)
        if (!id) return errorResponse("ID de parceiro inválido")

        const admin = getAdminClient()
        const [productsRes, servicesRes, staffRes] = await Promise.all([
            admin
                .from("products")
                .select("id, name, price, images")
                .eq("partner_id", id)
                .eq("is_active", true)
                .order("name")
                .limit(500),
            admin
                .from("services")
                .select("id, name, price, duration_minutes, images")
                .eq("partner_id", id)
                .eq("is_active", true)
                .order("name")
                .limit(500),
            admin.from("partner_users").select("id, user_id, role_id").eq("partner_id", id).order("created_at"),
        ])

        const userIds = (staffRes.data || []).map((pu: any) => pu.user_id).filter(Boolean)
        const profileMap: Record<string, string> = {}
        if (userIds.length > 0) {
            const { data: profiles } = await admin
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", userIds)
            for (const p of profiles || []) {
                if (p.full_name) profileMap[p.user_id] = p.full_name
            }
        }

        return successResponse({
            products: productsRes.data || [],
            services: servicesRes.data || [],
            staff: (staffRes.data || []).map((pu: any) => ({
                id: pu.id,
                display_name: profileMap[pu.user_id] || "Profissional",
            })),
        })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao carregar dados do plano")
    }
}

// ───────────────────────────────────────────────────────────────────────────
// PRODUTO — UPDATE
// ───────────────────────────────────────────────────────────────────────────

export async function updateAdminProduct(
    productId: string,
    data: Record<string, unknown>,
    ctx?: AdminActionContext | null,
): Promise<ActionResponse<any>> {
    const adminUser = await adminWriteGate()
    const id = sanitizeUUID(productId)
    if (!id) return errorResponse("ID de produto inválido")

    try {
        const admin = getAdminClient()
        const { data: product, error: fetchError } = await admin
            .from("products")
            .select(
                "id, partner_id, store_id, images, sku, name, moderation_status, video_type, video_url, video_thumbnail",
            )
            .eq("id", id)
            .single()
        if (fetchError || !product) return errorResponse("Produto não encontrado")

        const payload: any = { updated_at: getBrasiliaTime() }
        const fiscalPayload: any = {}
        const logisticsPayload: any = {}

        const d = data as any

        const directMapFields = [
            "name", "description", "category", "brand", "location", "sku", "gtin", "condition",
            "price", "images",
            "availability_value", "availability_unit", "warranty", "unit",
            "category_id", "brand_id", "location_id", "subcategory_id", "marketplace_category_id",
        ]

        const fiscalMapFields = [
            "ncm", "cest", "origin", "csosn", "pis_cst", "cofins_cst", "ipi_cst",
            "item_type", "cfop_internal", "cfop_external", "tax_percentage",
            "pis_rate", "cofins_rate", "ipi_code", "product_situation",
            "c_benef", "inf_ad_prod",
        ]

        const logisticsMapFields = ["weight_gross", "weight_net", "width", "height", "length"]

        directMapFields.forEach((field) => {
            if (d[field] !== undefined) payload[field] = d[field]
        })

        if (payload.name !== undefined) payload.name = sanitizeInput(payload.name, 150)

        if (payload.sku !== undefined && payload.sku !== null) {
            const rawSku = String(payload.sku).trim()
            const isAutoSku =
                !rawSku ||
                rawSku.toLowerCase() === "gerar automaticamente" ||
                rawSku.toLowerCase() === "gerar" ||
                rawSku.toLowerCase() === "sem sku"
            payload.sku = isAutoSku ? generateSKUBase(payload.name || product.name) : rawSku
        }

        fiscalMapFields.forEach((field) => {
            if (d[field] !== undefined) fiscalPayload[field] = d[field]
        })

        logisticsMapFields.forEach((field) => {
            if (d[field] !== undefined) logisticsPayload[field] = d[field]
        })

        // Mesma normalização de modo rápido do ERP (partner business_info via admin)
        const hasMarketplaceFields =
            d.showInMarketplace !== undefined || d.subcategoryId !== undefined || d.featured !== undefined
        if (hasMarketplaceFields) {
            const { data: partnerData } = await admin
                .from("partners")
                .select("business_info")
                .eq("id", product.partner_id)
                .single()
            const businessInfo = normalizeBusinessInfo(partnerData?.business_info)
            if (businessInfo.mode === "quick") {
                if (d.showInMarketplace === undefined) d.showInMarketplace = true
                d.subcategoryId = undefined
                d.featured = false
            }
        }

        if (d.stockQuantity !== undefined) payload.stock_quantity = d.stockQuantity
        if (d.minStock !== undefined) payload.min_stock = d.minStock
        if (d.maxStock !== undefined) payload.max_stock = d.maxStock
        if (d.isActive !== undefined) payload.status = d.isActive ? "ativo" : "inativo"
        if (d.productType !== undefined) payload.product_type = d.productType
        if (d.fulfillment_modes !== undefined) payload.fulfillment_modes = d.fulfillment_modes
        if (d.fulfillmentModes !== undefined) payload.fulfillment_modes = d.fulfillmentModes

        if (d.packagingType !== undefined) logisticsPayload.packaging_type = d.packagingType
        if (d.preparationDays !== undefined) logisticsPayload.preparation_days = d.preparationDays

        if (d.fciCode !== undefined) fiscalPayload.fci_code = d.fciCode
        if (d.allow_sell_without_stock !== undefined) payload.allow_sell_without_stock = d.allow_sell_without_stock

        if (d.costPrice !== undefined) payload.cost_price = d.costPrice
        if (d.promotionalPrice !== undefined) payload.promotional_price = d.promotionalPrice
        if (d.isOnPromotion !== undefined) payload.is_on_promotion = d.isOnPromotion
        if (d.showPriceInStore !== undefined) payload.show_price_in_store = d.showPriceInStore

        if (d.subcategoryId !== undefined) payload.subcategory_id = d.subcategoryId
        if (d.subcategory_id !== undefined) payload.subcategory_id = d.subcategory_id
        if (d.marketplaceCategoryId !== undefined) payload.marketplace_category_id = d.marketplaceCategoryId
        if (d.marketplace_category_id !== undefined) payload.marketplace_category_id = d.marketplace_category_id
        if (d.categoryId !== undefined) payload.category_id = d.categoryId
        if (d.brandId !== undefined) payload.brand_id = d.brandId
        if (d.locationId !== undefined) payload.location_id = d.locationId

        if (
            d.videoType !== undefined ||
            d.videoUrl !== undefined ||
            d.videoThumbnail !== undefined ||
            d.videoDuration !== undefined ||
            d.videoProviderId !== undefined
        ) {
            // Admin não passa pela checagem de dono do arquivo (ação superuser auditada)
            const videoMetadata = d.videoType
                ? await normalizeVideoMetadata({
                    video_type: d.videoType,
                    video_url: d.videoUrl || null,
                    video_thumbnail: d.videoThumbnail || null,
                    video_duration: d.videoDuration || null,
                    video_provider_id: d.videoProviderId || null,
                })
                : EMPTY_VIDEO_METADATA
            payload.video_type = videoMetadata.video_type
            payload.video_url = videoMetadata.video_url
            payload.video_thumbnail = videoMetadata.video_thumbnail
            payload.video_duration = videoMetadata.video_duration
            payload.video_provider_id = videoMetadata.video_provider_id
        }

        if (d.technicalSpecs !== undefined) payload.technical_specs = d.technicalSpecs
        if (d.deliveryFormat !== undefined) payload.delivery_format = d.deliveryFormat
        if (d.tags !== undefined) payload.tags = d.tags
        if (d.showInMarketplace !== undefined) payload.show_in_marketplace = d.showInMarketplace

        payload.moderation_status = d.requiresManualModeration
            ? "pending_moderation"
            : product.moderation_status || "approved"

        // Persistência direta espelhando o RPC update_product_transaction
        // (o RPC bloqueia admin: exige auth.uid() com membership no parceiro).
        const productPatch: any = {}
        const RPC_PRODUCT_FIELDS = [
            "name", "description", "sku", "gtin", "brand", "brand_id", "category_id",
            "subcategory_id", "marketplace_category_id", "condition", "unit", "product_type",
            "location", "location_id", "cost_price", "price", "promotional_price",
            "min_stock", "max_stock", "stock_quantity", "status", "is_on_promotion",
            "show_price_in_store", "show_in_marketplace", "images", "availability_value",
            "availability_unit", "warranty", "video_url", "technical_specs", "delivery_format",
            "tags", "allow_sell_without_stock",
        ]
        RPC_PRODUCT_FIELDS.forEach((field) => {
            if (payload[field] !== undefined) productPatch[field] = payload[field]
        })
        ;[
            "video_type", "video_thumbnail", "video_duration", "video_provider_id",
            "moderation_status",
        ].forEach((field) => {
            if (payload[field] !== undefined) productPatch[field] = payload[field]
        })
        productPatch.updated_at = getBrasiliaTime()

        const { error: updateError } = await admin.from("products").update(productPatch).eq("id", id)
        if (updateError) return errorResponse(updateError.message)

        if (Object.keys(fiscalPayload).length > 0) {
            const { error } = await admin
                .from("product_fiscal_profiles")
                .upsert({ product_id: id, ...fiscalPayload }, { onConflict: "product_id" })
            if (error) return errorResponse(error.message)
        }

        if (Object.keys(logisticsPayload).length > 0) {
            const { error } = await admin
                .from("product_logistics")
                .upsert({ product_id: id, ...logisticsPayload }, { onConflict: "product_id" })
            if (error) return errorResponse(error.message)
        }

        // R2 cleanup de imagens removidas + contadores de uso (fire-and-forget)
        if (product.images && Array.isArray(product.images)) {
            const oldImages = product.images.filter((img: any) => typeof img === "string" && img.trim())
            const newImages = payload.images || []
            const deletedImages = oldImages.filter((img: string) => !newImages.includes(img))
            const addedImages = newImages.filter((img: string) => !oldImages.includes(img))

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

        await invalidateProductCache(id, product.partner_id, "update")

        const fields = Object.keys(payload).filter((k) => k !== "updated_at")
        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.CATALOG_PRODUCT_UPDATE,
            targetType: "product",
            targetId: id,
            metadata: {
                partnerId: product.partner_id,
                name: payload.name ?? product.name,
                fields,
                ...(ctx?.reason?.trim() ? { reason: ctx.reason.trim() } : {}),
            },
        })
        await partnerTimeline({
            partnerId: product.partner_id,
            actorUserId: adminUser.userId,
            entityType: "product",
            entityId: id,
            actionType: "updated",
            changeLines: [`atualizou o produto "${payload.name || product.name}" via painel admin.`],
        })

        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId: product.partner_id,
            storeId: (product as any).store_id || null,
            targetType: "product",
            targetId: id,
            actionTitle: `Produto "${payload.name || product.name}" alterado pela administração`,
            entityLabel: "produto",
            entityName: (payload.name as string) || product.name,
            sellerUrl: `/erp/produtos?view=${id}`,
            ctx,
        })

        return successResponse({ ...product, ...productPatch, ...fiscalPayload, ...logisticsPayload })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao atualizar produto")
    }
}

// ───────────────────────────────────────────────────────────────────────────
// SERVIÇO — UPDATE
// ───────────────────────────────────────────────────────────────────────────

export async function updateAdminService(
    serviceId: string,
    data: Record<string, unknown>,
    ctx?: AdminActionContext | null,
): Promise<ActionResponse<any>> {
    const adminUser = await adminWriteGate()
    const id = sanitizeUUID(serviceId)
    if (!id) return errorResponse("ID de serviço inválido")

    try {
        const admin = getAdminClient()
        const { data: existing, error: fetchError } = await admin
            .from("services")
            .select("partner_id, store_id, sku, name, images, video_type, video_url, video_thumbnail")
            .eq("id", id)
            .single()
        if (fetchError || !existing) return errorResponse("Serviço não encontrado")

        const dataAny = data as any
        const payload: any = { updated_at: getBrasiliaTime() }

        if (dataAny.name !== undefined) payload.name = sanitizeInput(dataAny.name, 150)
        if (dataAny.description !== undefined) payload.description = dataAny.description
        if (dataAny.sku !== undefined) payload.sku = dataAny.sku
        if (dataAny.brand !== undefined) payload.brand = dataAny.brand
        if (dataAny.category_id !== undefined) payload.category_id = dataAny.category_id
        if (dataAny.categoryId !== undefined) payload.category_id = dataAny.categoryId
        if (dataAny.subcategory_id !== undefined) payload.subcategory_id = dataAny.subcategory_id
        if (dataAny.subcategoryId !== undefined) payload.subcategory_id = dataAny.subcategoryId
        if (dataAny.unit !== undefined) payload.unit = dataAny.unit
        if (dataAny.costPrice !== undefined) payload.cost_price = dataAny.costPrice
        if (dataAny.cost_price !== undefined) payload.cost_price = dataAny.cost_price
        if (dataAny.price !== undefined) payload.price = dataAny.price
        if (dataAny.promotional_price !== undefined) payload.promotional_price = dataAny.promotional_price
        if (dataAny.promotionalPrice !== undefined) payload.promotional_price = dataAny.promotionalPrice
        if (dataAny.price_type !== undefined) payload.price_type = dataAny.price_type
        if (dataAny.priceType !== undefined) payload.price_type = dataAny.priceType
        if (dataAny.billing_unit !== undefined) payload.billing_unit = dataAny.billing_unit
        if (dataAny.billingUnit !== undefined) payload.billing_unit = dataAny.billingUnit
        if (dataAny.duration_minutes !== undefined || dataAny.durationMinutes !== undefined) {
            const dur = Math.max(
                1,
                Number(
                    dataAny.duration_minutes !== undefined ? dataAny.duration_minutes : dataAny.durationMinutes,
                ),
            )
            if (dur > 525600) {
                return errorResponse("A duração do serviço não pode exceder 1 ano (525.600 minutos).")
            }
            payload.duration_minutes = dur
        }
        if (dataAny.buffer_minutes !== undefined) payload.buffer_minutes = dataAny.buffer_minutes
        if (dataAny.bufferMinutes !== undefined) payload.buffer_minutes = dataAny.bufferMinutes
        if (dataAny.service_type !== undefined) payload.service_type = dataAny.service_type
        if (dataAny.serviceType !== undefined) payload.service_type = dataAny.serviceType
        if (dataAny.show_in_marketplace !== undefined) payload.show_in_marketplace = dataAny.show_in_marketplace
        if (dataAny.showInMarketplace !== undefined) payload.show_in_marketplace = dataAny.showInMarketplace
        if (dataAny.tags !== undefined) payload.tags = dataAny.tags
        if (dataAny.notes !== undefined) payload.notes = sanitizeNotes(dataAny.notes)
        if (
            dataAny.video_type !== undefined ||
            dataAny.videoType !== undefined ||
            dataAny.video_url !== undefined ||
            dataAny.videoUrl !== undefined ||
            dataAny.video_thumbnail !== undefined ||
            dataAny.videoThumbnail !== undefined ||
            dataAny.video_duration !== undefined ||
            dataAny.videoDuration !== undefined ||
            dataAny.video_provider_id !== undefined ||
            dataAny.videoProviderId !== undefined
        ) {
            // Sem assertUploadVideoOwnership: admin atua como superuser (auditado)
            const videoMetadata =
                dataAny.video_type || dataAny.videoType
                    ? await normalizeVideoMetadata({
                        video_type: dataAny.video_type || dataAny.videoType,
                        video_url: dataAny.video_url || dataAny.videoUrl || null,
                        video_thumbnail: dataAny.video_thumbnail || dataAny.videoThumbnail || null,
                        video_duration: dataAny.video_duration || dataAny.videoDuration || null,
                        video_provider_id: dataAny.video_provider_id || dataAny.videoProviderId || null,
                    })
                    : EMPTY_VIDEO_METADATA
            payload.video_type = videoMetadata.video_type
            payload.video_url = videoMetadata.video_url
            payload.video_thumbnail = videoMetadata.video_thumbnail
            payload.video_duration = videoMetadata.video_duration
            payload.video_provider_id = videoMetadata.video_provider_id
        }
        if (dataAny.warranty !== undefined) payload.warranty = dataAny.warranty
        if (dataAny.technical_details !== undefined) payload.technical_details = dataAny.technical_details
        if (dataAny.technicalDetails !== undefined) payload.technical_details = dataAny.technicalDetails
        if (dataAny.resources !== undefined) payload.resources = dataAny.resources
        if (dataAny.assigned_staff !== undefined) payload.assigned_staff = dataAny.assigned_staff
        if (dataAny.isActive !== undefined) payload.status = dataAny.isActive ? "ativo" : "inativo"
        if (dataAny.is_active !== undefined) payload.status = dataAny.is_active ? "ativo" : "inativo"
        if (dataAny.marketplace_category_id !== undefined) {
            payload.marketplace_category_id = dataAny.marketplace_category_id
        }
        if (dataAny.marketplaceCategoryId !== undefined) {
            payload.marketplace_category_id = dataAny.marketplaceCategoryId
        }
        if (dataAny.fulfillment_modes !== undefined) payload.fulfillment_modes = dataAny.fulfillment_modes
        if (dataAny.fulfillmentModes !== undefined) payload.fulfillment_modes = dataAny.fulfillmentModes
        if (dataAny.payment_requirement !== undefined) payload.payment_requirement = dataAny.payment_requirement
        if (dataAny.paymentRequirement !== undefined) payload.payment_requirement = dataAny.paymentRequirement
        if (dataAny.show_price_in_store !== undefined) payload.show_price_in_store = dataAny.show_price_in_store
        if (dataAny.showPriceInStore !== undefined) payload.show_price_in_store = dataAny.showPriceInStore
        // O update do ERP ignora images (comportamento herdado); o admin persiste
        // para que a edição de imagens funcione no modo vendedor.
        if (dataAny.images !== undefined && Array.isArray(dataAny.images)) {
            payload.images = dataAny.images
        }
        if (dataAny.requiresManualModeration || dataAny.requires_manual_moderation) {
            payload.moderation_status = "pending_moderation"
        }

        const { data: updated, error } = await admin
            .from("services")
            .update(payload)
            .eq("id", id)
            .select()
            .single()
        if (error) return errorResponse(error.message)

        if (
            existing.video_type === "upload" &&
            payload.video_url !== undefined &&
            existing.video_url &&
            existing.video_url !== payload.video_url
        ) {
            const cleanup = [existing.video_url, existing.video_thumbnail]
                .filter(Boolean)
                .map((url: string) => _deleteFromR2(url))
            Promise.all(cleanup).catch(console.error)
        }

        await invalidateServiceCache(id, existing.partner_id, "update")
        await revalidateServices(existing.partner_id, id)
        revalidatePath("/erp/servicos")

        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.CATALOG_SERVICE_UPDATE,
            targetType: "service",
            targetId: id,
            metadata: {
                partnerId: existing.partner_id,
                name: payload.name ?? existing.name,
                fields: Object.keys(payload).filter((k) => k !== "updated_at"),
                ...(ctx?.reason?.trim() ? { reason: ctx.reason.trim() } : {}),
            },
        })
        await partnerTimeline({
            partnerId: existing.partner_id,
            actorUserId: adminUser.userId,
            entityType: "service",
            entityId: id,
            actionType: "updated",
            changeLines: [`atualizou o serviço "${payload.name || existing.name}" via painel admin.`],
        })

        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId: existing.partner_id,
            storeId: (existing as any).store_id || null,
            targetType: "service",
            targetId: id,
            actionTitle: `Serviço "${payload.name || existing.name}" alterado pela administração`,
            entityLabel: "serviço",
            entityName: (payload.name as string) || existing.name,
            sellerUrl: `/erp/servicos?view=${id}`,
            ctx,
        })

        return successResponse(updated)
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao atualizar serviço")
    }
}

// ───────────────────────────────────────────────────────────────────────────
// DELETE / ARCHIVE (produto e serviço)
// ───────────────────────────────────────────────────────────────────────────

export async function deleteAdminCatalogProduct(
    productId: string,
    ctx?: AdminActionContext | string | null,
) {
    const adminUser = await adminWriteGate()
    const id = sanitizeUUID(productId)
    if (!id) return errorResponse("ID de produto inválido")
    const actionCtx: AdminActionContext | null =
        typeof ctx === "string" ? { reason: ctx } : ctx || null

    try {
        const cleanReason = sanitizeString(actionCtx?.reason || "Remoção administrativa", MAX_REASON_LEN)
        const admin = getAdminClient()
        const { data: product, error } = await admin
            .from("products")
            .select("id, partner_id, store_id, sku, name")
            .eq("id", id)
            .single()
        if (error || !product) return errorResponse("Produto não encontrado")

        const payload = buildSoftDeletePayload(adminUser.userId, cleanReason)
        const { error: delError } = await admin.from("products").update(payload).eq("id", id)
        if (delError) return errorResponse(delError.message)

        await invalidateProductCache(id, product.partner_id, "delete")

        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.PRODUCT_SOFT_DELETE,
            targetType: "product",
            targetId: id,
            metadata: { partnerId: product.partner_id, name: product.name, sku: product.sku, reason: cleanReason },
        })
        await partnerTimeline({
            partnerId: product.partner_id,
            actorUserId: adminUser.userId,
            entityType: "product",
            entityId: id,
            actionType: "deleted",
            changeLines: [`excluiu o produto "${product.name}" via painel admin.`],
            metadata: { deleted_reason: cleanReason },
        })

        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId: product.partner_id,
            storeId: (product as any).store_id || null,
            targetType: "product",
            targetId: id,
            actionTitle: `Produto "${product.name}" excluído pela administração`,
            entityLabel: "produto",
            entityName: product.name,
            sellerUrl: `/erp/produtos?view=${id}`,
            ctx: actionCtx,
        })

        return successResponse({ deleted: true })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao excluir produto")
    }
}

export async function deleteAdminCatalogService(
    serviceId: string,
    ctx?: AdminActionContext | string | null,
) {
    const adminUser = await adminWriteGate()
    const id = sanitizeUUID(serviceId)
    if (!id) return errorResponse("ID de serviço inválido")
    const actionCtx: AdminActionContext | null =
        typeof ctx === "string" ? { reason: ctx } : ctx || null

    try {
        const cleanReason = sanitizeString(actionCtx?.reason || "Remoção administrativa", MAX_REASON_LEN)
        const admin = getAdminClient()
        const { data: existing, error } = await admin
            .from("services")
            .select("id, partner_id, store_id, sku, name")
            .eq("id", id)
            .single()
        if (error || !existing) return errorResponse("Serviço não encontrado")

        const payload = buildSoftDeletePayload(adminUser.userId, cleanReason)
        const { error: delError } = await admin.from("services").update(payload).eq("id", id)
        if (delError) return errorResponse(delError.message)

        await invalidateServiceCache(id, existing.partner_id, "delete")
        await revalidateServices(existing.partner_id, id)
        revalidatePath("/erp/servicos")

        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.SERVICE_SOFT_DELETE,
            targetType: "service",
            targetId: id,
            metadata: { partnerId: existing.partner_id, name: existing.name, sku: existing.sku, reason: cleanReason },
        })
        await partnerTimeline({
            partnerId: existing.partner_id,
            actorUserId: adminUser.userId,
            entityType: "service",
            entityId: id,
            actionType: "deleted",
            changeLines: [`excluiu o serviço "${existing.name}" via painel admin.`],
            metadata: { deleted_reason: cleanReason },
        })

        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId: existing.partner_id,
            storeId: (existing as any).store_id || null,
            targetType: "service",
            targetId: id,
            actionTitle: `Serviço "${existing.name}" excluído pela administração`,
            entityLabel: "serviço",
            entityName: existing.name,
            sellerUrl: `/erp/servicos?view=${id}`,
            ctx: actionCtx,
        })

        return successResponse({ deleted: true })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao excluir serviço")
    }
}

async function setCatalogItemArchived(
    adminUser: { userId: string },
    kind: "product" | "service",
    itemId: string,
    archived: boolean,
    ctx?: AdminActionContext | null,
): Promise<ActionResponse<any>> {
    const id = sanitizeUUID(itemId)
    if (!id) return errorResponse("ID inválido")

    try {
        const admin = getAdminClient()
        const table = kind === "product" ? "products" : "services"
        const { data: existing, error } = await admin
            .from(table)
            .select("id, partner_id, store_id, sku, name")
            .eq("id", id)
            .single()
        if (error || !existing) return errorResponse(kind === "product" ? "Produto não encontrado" : "Serviço não encontrado")

        const payload = archived ? buildArchivePayload("arquivado") : buildRestorePayload("ativo")
        const { error: updError } = await admin.from(table).update(payload).eq("id", id)
        if (updError) return errorResponse(updError.message)

        if (kind === "product") {
            await invalidateProductCache(id, existing.partner_id, archived ? "delete" : "update")
        } else {
            await invalidateServiceCache(id, existing.partner_id, archived ? "delete" : "update")
            await revalidateServices(existing.partner_id, id)
            revalidatePath("/erp/servicos")
        }

        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.CATALOG_PRODUCT_UPDATE,
            targetType: kind,
            targetId: id,
            metadata: {
                partnerId: existing.partner_id,
                name: existing.name,
                action: archived ? "archived" : "unarchived",
                ...(ctx?.reason?.trim() ? { reason: ctx.reason.trim() } : {}),
            },
        })
        await partnerTimeline({
            partnerId: existing.partner_id,
            actorUserId: adminUser.userId,
            entityType: kind,
            entityId: id,
            actionType: archived ? "updated" : "restored",
            changeLines: [
                archived
                    ? `arquivou o ${kind === "product" ? "produto" : "serviço"} "${existing.name}" via painel admin.`
                    : `desarquivou o ${kind === "product" ? "produto" : "serviço"} "${existing.name}" via painel admin.`,
            ],
        })

        const entityLabel = kind === "product" ? "produto" : "serviço"
        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId: existing.partner_id,
            storeId: (existing as any).store_id || null,
            targetType: kind,
            targetId: id,
            actionTitle: `${entityLabel === "produto" ? "Produto" : "Serviço"} "${existing.name}" ${
                archived ? "arquivado" : "desarquivado"
            } pela administração`,
            entityLabel,
            entityName: existing.name,
            sellerUrl: kind === "product" ? `/erp/produtos?view=${id}` : `/erp/servicos?view=${id}`,
            ctx,
        })

        return successResponse({ archived })
    } catch (e: any) {
        return errorResponse(e.message || "Erro ao alterar status")
    }
}

export async function setAdminCatalogProductArchived(
    productId: string,
    archived: boolean,
    ctx?: AdminActionContext | null,
) {
    const adminUser = await adminWriteGate()
    return setCatalogItemArchived(adminUser, "product", productId, archived, ctx)
}

export async function setAdminCatalogServiceArchived(
    serviceId: string,
    archived: boolean,
    ctx?: AdminActionContext | null,
) {
    const adminUser = await adminWriteGate()
    return setCatalogItemArchived(adminUser, "service", serviceId, archived, ctx)
}

// ───────────────────────────────────────────────────────────────────────────
// PLANOS RECORRENTES — CREATE / UPDATE / DELETE
// ───────────────────────────────────────────────────────────────────────────

type AdminPlanInput = {
    partnerId: string
    planId?: string
    name?: string
    description?: string | null
    status?: RecurringPlanStatus
    frequencyType?: RecurringFrequencyType
    frequencyInterval?: number
    weekdays?: number[] | null
    dayOfMonth?: number | null
    useLastDay?: boolean
    yearMonth?: number | null
    yearDay?: number | null
    startDate?: string
    endDate?: string | null
    showInMarketplace?: boolean
    items?: RecurringPlanItem[]
    images?: string[] | null
    billingMode?: "manual" | "auto_mercado_pago"
    creditExpirationPolicy?: "never" | "end_of_cycle" | "fixed_days"
    creditExpirationDays?: number | null
    shippingMode?: RecurringShippingMode
    shippingFlatAmount?: number
    fulfillmentModes?: FulfillmentMode[]
    storeId?: string
}

export async function createAdminRecurringPlan(input: AdminPlanInput) {
    const adminUser = await adminWriteGate()
    const partnerId = sanitizeUUID(input?.partnerId || "")
    if (!partnerId) return { success: false as const, error: "ID de parceiro inválido" }

    try {
        const admin = getAdminClient()
        const { name, interval } = validatePlanInput({
            name: String(input.name || ""),
            frequencyType: input.frequencyType as RecurringFrequencyType,
            frequencyInterval: input.frequencyInterval,
            startDate: String(input.startDate || ""),
            items: input.items || [],
        })
        const fulfillmentModes = normalizePlanFulfillmentModes(input.fulfillmentModes)
        const shipping = normalizeShippingInput({
            shippingMode: fulfillmentModes.includes("delivery") ? input.shippingMode : "included",
            shippingFlatAmount: fulfillmentModes.includes("delivery") ? input.shippingFlatAmount : 0,
        })

        let storeId: string | null = input.storeId?.trim() || null
        if (!storeId) {
            const { data: firstStore } = await admin
                .from("stores")
                .select("id")
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle()
            storeId = firstStore?.id || null
        }

        const { data: plan, error } = await admin
            .from("recurring_plans")
            .insert({
                partner_id: partnerId,
                store_id: storeId,
                name,
                description: input.description?.trim() || null,
                status: input.status || "active",
                frequency_type: input.frequencyType,
                frequency_interval: interval,
                weekdays: input.weekdays || null,
                day_of_month: input.dayOfMonth ?? null,
                use_last_day: !!input.useLastDay,
                year_month: input.yearMonth ?? null,
                year_day: input.yearDay ?? null,
                start_date: input.startDate,
                end_date: input.endDate || null,
                show_in_marketplace: input.showInMarketplace !== false,
                images: input.images || [],
                billing_mode: input.billingMode || "auto_mercado_pago",
                credit_expiration_policy: input.creditExpirationPolicy || "end_of_cycle",
                credit_expiration_days: input.creditExpirationDays ?? null,
                shipping_mode: shipping.mode,
                shipping_flat_amount: shipping.flatAmount,
                fulfillment_modes: fulfillmentModes,
            })
            .select("*")
            .single()
        if (error) throw error

        const itemsPayload = mapItemsToDb(input.items || []).map((item) => ({ ...item, plan_id: plan.id }))
        const { error: itemsError } = await admin.from("recurring_plan_items").insert(itemsPayload)
        if (itemsError) {
            await admin.from("recurring_plans").delete().eq("id", plan.id)
            throw itemsError
        }

        if (input.images && input.images.length > 0) {
            await increment_usage_counter(partnerId, "images_count", input.images.length)
        }

        await invalidateRecurringPlanCache(plan.id, partnerId, "create")

        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.CATALOG_PLAN_CREATE,
            targetType: "recurring_plan",
            targetId: plan.id,
            metadata: { partnerId, name },
        })
        await partnerTimeline({
            partnerId,
            actorUserId: null,
            entityType: "recurring_plan",
            entityId: plan.id,
            actionType: "created",
            changeLines: [`criou plano recorrente "${name}" via painel admin.`],
        })

        return { success: true as const, data: mapPlanRow(plan as Record<string, unknown>) }
    } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : "Erro ao criar plano" }
    }
}

export async function updateAdminRecurringPlan(input: AdminPlanInput, ctx?: AdminActionContext | null) {
    const adminUser = await adminWriteGate()
    const partnerId = sanitizeUUID(input?.partnerId || "")
    const planId = sanitizeUUID(input?.planId || "")
    if (!partnerId) return { success: false as const, error: "ID de parceiro inválido" }
    if (!planId) return { success: false as const, error: "ID de plano inválido" }

    try {
        const admin = getAdminClient()

        const { data: oldPlan } = await admin
            .from("recurring_plans")
            .select("images")
            .eq("id", planId)
            .eq("partner_id", partnerId)
            .maybeSingle()

        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (input.name != null) updatePayload.name = String(input.name).trim()
        if (input.description !== undefined) updatePayload.description = input.description?.trim() || null
        if (input.status) updatePayload.status = input.status
        if (input.frequencyType) updatePayload.frequency_type = input.frequencyType
        if (input.frequencyInterval != null) {
            updatePayload.frequency_interval = Math.max(input.frequencyInterval, 1)
        }
        if (input.weekdays !== undefined) updatePayload.weekdays = input.weekdays
        if (input.dayOfMonth !== undefined) updatePayload.day_of_month = input.dayOfMonth
        if (input.useLastDay !== undefined) updatePayload.use_last_day = input.useLastDay
        if (input.yearMonth !== undefined) updatePayload.year_month = input.yearMonth
        if (input.yearDay !== undefined) updatePayload.year_day = input.yearDay
        if (input.startDate) updatePayload.start_date = input.startDate
        if (input.endDate !== undefined) updatePayload.end_date = input.endDate
        if (input.showInMarketplace !== undefined) updatePayload.show_in_marketplace = input.showInMarketplace
        if (input.images !== undefined) updatePayload.images = input.images
        if (input.billingMode) updatePayload.billing_mode = input.billingMode
        if (input.creditExpirationPolicy) updatePayload.credit_expiration_policy = input.creditExpirationPolicy
        if (input.creditExpirationDays !== undefined) {
            updatePayload.credit_expiration_days = input.creditExpirationDays
        }
        let fulfillmentModes: FulfillmentMode[] | null = null
        if (input.fulfillmentModes !== undefined) {
            fulfillmentModes = normalizePlanFulfillmentModes(input.fulfillmentModes)
            updatePayload.fulfillment_modes = fulfillmentModes
        }
        const deliveryEnabled = fulfillmentModes ? fulfillmentModes.includes("delivery") : true
        if (input.shippingMode !== undefined || !deliveryEnabled) {
            const shipping = normalizeShippingInput({
                shippingMode: deliveryEnabled ? input.shippingMode : "included",
                shippingFlatAmount: deliveryEnabled ? input.shippingFlatAmount : 0,
            })
            updatePayload.shipping_mode = shipping.mode
            updatePayload.shipping_flat_amount = shipping.flatAmount
        }

        const { data: plan, error } = await admin
            .from("recurring_plans")
            .update(updatePayload)
            .eq("id", planId)
            .eq("partner_id", partnerId)
            .select("*")
            .single()
        if (error) throw error

        if (input.items) {
            validatePlanInput({
                name: plan.name,
                frequencyType: plan.frequency_type,
                startDate: plan.start_date,
                items: input.items,
            })
            await admin.from("recurring_plan_items").delete().eq("plan_id", planId)
            const itemsPayload = mapItemsToDb(input.items).map((item) => ({ ...item, plan_id: planId }))
            const { error: itemsError } = await admin.from("recurring_plan_items").insert(itemsPayload)
            if (itemsError) throw itemsError

            const { detectPlanPriceChange } = await import("@/lib/services/recurring/price-consent")
            await detectPlanPriceChange(admin, { planId })
        }

        if (oldPlan && input.images !== undefined) {
            const oldImages = Array.isArray(oldPlan.images)
                ? oldPlan.images.filter((img: any) => typeof img === "string" && img.trim())
                : []
            const newImages = input.images || []
            const deletedImages = oldImages.filter((img: string) => !newImages.includes(img))
            const addedImages = newImages.filter((img: string) => !oldImages.includes(img))

            if (deletedImages.length > 0) {
                Promise.all(deletedImages.map((img: string) => _deleteFromR2(img))).catch(console.error)
                await decrement_usage_counter(partnerId, "images_count", deletedImages.length)
            }
            if (addedImages.length > 0) {
                await increment_usage_counter(partnerId, "images_count", addedImages.length)
            }
        } else if (input.images && input.images.length > 0) {
            await increment_usage_counter(partnerId, "images_count", input.images.length)
        }

        await invalidateRecurringPlanCache(planId, partnerId, "update")

        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.CATALOG_PLAN_UPDATE,
            targetType: "recurring_plan",
            targetId: planId,
            metadata: {
                partnerId,
                name: plan.name,
                fields: Object.keys(updatePayload),
                ...(ctx?.reason?.trim() ? { reason: ctx.reason.trim() } : {}),
            },
        })
        await partnerTimeline({
            partnerId,
            actorUserId: null,
            entityType: "recurring_plan",
            entityId: planId,
            actionType: "updated",
            changeLines: [`atualizou plano recorrente "${plan.name}" via painel admin.`],
        })

        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId,
            storeId: null,
            targetType: "recurring_plan",
            targetId: planId,
            actionTitle: `Plano "${plan.name}" alterado pela administração`,
            entityLabel: "plano",
            entityName: plan.name,
            sellerUrl: `/erp/recorrentes/planos?view=${planId}`,
            ctx,
        })

        return { success: true as const, data: mapPlanRow(plan as Record<string, unknown>) }
    } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : "Erro ao atualizar plano" }
    }
}

export async function deleteAdminRecurringPlan(
    planId: string,
    ctx?: AdminActionContext | string | null,
) {
    const adminUser = await adminWriteGate()
    const id = sanitizeUUID(planId)
    if (!id) return { success: false as const, error: "ID de plano inválido" }
    const actionCtx: AdminActionContext | null =
        typeof ctx === "string" ? { reason: ctx } : ctx || null

    try {
        const cleanReason = sanitizeString(actionCtx?.reason || "Remoção administrativa", MAX_REASON_LEN)
        const admin = getAdminClient()

        const { data: plan } = await admin
            .from("recurring_plans")
            .select("id, partner_id, name")
            .eq("id", id)
            .maybeSingle()
        if (!plan) return { success: false as const, error: "Plano não encontrado" }

        // Planos referenciados por assinaturas/pedidos não podem ser removidos (FK).
        const [subsRef, ordersRef] = await Promise.all([
            admin
                .from("recurring_subscriptions")
                .select("id", { count: "exact", head: true })
                .eq("recurring_plan_id", id),
            admin
                .from("order_items")
                .select("id", { count: "exact", head: true })
                .eq("recurring_plan_id", id),
        ])
        const referencedBySubscriptions = (subsRef.count || 0) > 0
        const referencedByOrders = (ordersRef.count || 0) > 0

        if (referencedBySubscriptions || referencedByOrders) {
            const { error: archiveError } = await admin
                .from("recurring_plans")
                .update({
                    status: "archived",
                    show_in_marketplace: false,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", id)
            if (archiveError) throw archiveError

            await invalidateRecurringPlanCache(id, plan.partner_id, "update")
            await adminAuditLog({
                adminUserId: adminUser.userId,
                actionType: AdminActionType.RECURRING_PLAN_DELETE,
                targetType: "recurring_plan",
                targetId: id,
                metadata: {
                    partnerId: plan.partner_id,
                    name: plan.name,
                    reason: cleanReason,
                    outcome: "archived",
                    referencedBy: referencedBySubscriptions ? "subscriptions" : "orders",
                },
            })
            await partnerTimeline({
                partnerId: plan.partner_id,
                actorUserId: null,
                entityType: "recurring_plan",
                entityId: id,
                actionType: "updated",
                changeLines: [`arquivou plano recorrente "${plan.name}" via painel admin (itens vinculados).`],
            })

            await applyAdminActionContext({
                adminUserId: adminUser.userId,
                partnerId: plan.partner_id,
                storeId: null,
                targetType: "recurring_plan",
                targetId: id,
                actionTitle: `Plano "${plan.name}" arquivado pela administração`,
                entityLabel: "plano",
                entityName: plan.name,
                sellerUrl: `/erp/recorrentes/planos?view=${id}`,
                ctx: { ...actionCtx, reason: actionCtx?.reason?.trim() || cleanReason },
            })

            return {
                success: true as const,
                archived: true,
                message:
                    "O plano tinha itens vinculados, então foi arquivado em vez de excluído. Ele saiu da vitrine e continua disponível apenas no histórico.",
            }
        }

        const { error: itemsError } = await admin.from("recurring_plan_items").delete().eq("plan_id", id)
        if (itemsError) throw itemsError

        const { error } = await admin.from("recurring_plans").delete().eq("id", id)
        if (error) throw error

        await invalidateRecurringPlanCache(id, plan.partner_id, "delete")
        await adminAuditLog({
            adminUserId: adminUser.userId,
            actionType: AdminActionType.RECURRING_PLAN_DELETE,
            targetType: "recurring_plan",
            targetId: id,
            metadata: { partnerId: plan.partner_id, name: plan.name, reason: cleanReason, outcome: "deleted" },
        })
        await partnerTimeline({
            partnerId: plan.partner_id,
            actorUserId: null,
            entityType: "recurring_plan",
            entityId: id,
            actionType: "deleted",
            changeLines: [`excluiu plano recorrente "${plan.name}" via painel admin.`],
            metadata: { deleted_reason: cleanReason },
        })

        await applyAdminActionContext({
            adminUserId: adminUser.userId,
            partnerId: plan.partner_id,
            storeId: null,
            targetType: "recurring_plan",
            targetId: id,
            actionTitle: `Plano "${plan.name}" excluído pela administração`,
            entityLabel: "plano",
            entityName: plan.name,
            sellerUrl: `/erp/recorrentes/planos?view=${id}`,
            ctx: { ...actionCtx, reason: actionCtx?.reason?.trim() || cleanReason },
        })

        return { success: true as const, archived: false as const }
    } catch (e: unknown) {
        return { success: false as const, error: e instanceof Error ? e.message : "Erro ao excluir plano" }
    }
}
