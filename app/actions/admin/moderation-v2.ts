"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import type { FetchedProduct, FetchedService, FetchedRecurringPlan, FetchedPartner, FetchedReview } from "@/lib/admin/types"
import { MANAGEMENT_ROLES } from "@/lib/notifications/audience"

// ─── Helpers ────────────────────────────────────────────────────────────────

const MODERATION_FIELDS: Record<string, readonly string[]> = {
    product: ["name", "description", "tags", "video_url"],
    service: ["name", "description", "tags", "video_url"],
    recurring_plan: ["name", "description"],
    partner: ["store_name", "store_description"],
}

const VARIANT_FIELDS = ["name"] as const
const IMAGE_FIELDS: Record<string, readonly string[]> = {
    product: ["images"],
    service: ["images"],
    variant: ["variant_options"],
    partner: ["store_image_url", "logo_url", "banner_url", "gallery"],
}

function normalizeRiskScoreIncrement(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(Math.max(Math.trunc(value), 0), 100)
}

function hasAllowedField(type: string, field: string): boolean {
    return MODERATION_FIELDS[type]?.includes(field) ?? false
}

const _deleteFromR2 = async (url: string) => {
    if (!url || !url.trim()) return
    try {
        const { extractKeyFromR2Url, deleteFileFromR2 } = await import("@/lib/r2/server")
        const key = url.startsWith("http") ? extractKeyFromR2Url(url) : url
        if (key) await deleteFileFromR2(key)
    } catch (e) {
        console.error("Failed to delete image from R2:", url, e)
    }
}

async function getPartnerIdFromTarget(type: string, id: string): Promise<string | null> {
    const admin = getAdminClient()
    try {
        switch (type) {
            case "product": {
                const { data } = await admin.from("products").select("partner_id").eq("id", id).single()
                return data?.partner_id || null
            }
            case "service": {
                const { data } = await admin.from("services").select("partner_id").eq("id", id).single()
                return data?.partner_id || null
            }
            case "recurring_plan": {
                const { data } = await admin.from("recurring_plans").select("partner_id").eq("id", id).single()
                return data?.partner_id || null
            }
            case "review": {
                const { data } = await admin.from("reviews").select("partner_id").eq("id", id).single()
                return data?.partner_id || null
            }
            case "partner":
                return id
            default:
                return null
        }
    } catch {
        return null
    }
}

async function logModerationAction(params: {
    adminUserId: string
    partnerId: string | null
    actionType: AdminActionType
    targetType: string
    targetId: string
    fieldName?: string
    previousValue?: string
    newValue?: string
    riskScoreIncrement: number
    notes?: string
}) {
    const admin = getAdminClient()

    // Log to admin_audit_logs
    await adminAuditLog({
        adminUserId: params.adminUserId,
        actionType: params.actionType,
        targetType: params.targetType as any,
        targetId: params.targetId,
        metadata: {
            fieldName: params.fieldName,
            previousValue: params.previousValue,
            newValue: params.newValue,
            riskScoreIncrement: params.riskScoreIncrement,
            notes: sanitizeNotes(params.notes),
        },
    })

    // Log to partner_moderation_actions
    if (params.partnerId) {
        try {
            await admin.from("partner_moderation_actions").insert({
                partner_id: params.partnerId,
                admin_user_id: params.adminUserId,
                action_type: params.actionType,
                target_type: params.targetType,
                target_id: params.targetId,
                field_name: params.fieldName || null,
                previous_value: params.previousValue || null,
                new_value: params.newValue || null,
                risk_score_increment: params.riskScoreIncrement,
                notes: sanitizeNotes(params.notes),
            })
        } catch (e) {
            console.error("[MODERATION] Failed to log partner_moderation_actions:", e)
        }
    }

    // Increment risk score
    if (params.riskScoreIncrement > 0 && params.partnerId) {
        try {
            await admin.rpc("increment_risk_score", {
                p_partner_id: params.partnerId,
                p_points: params.riskScoreIncrement,
            })
        } catch (e) {
            console.error("[MODERATION] Failed to increment risk score:", e)
        }
    }

    // Increment user risk score if target is a review
    if (params.targetType === "review" && params.riskScoreIncrement > 0) {
        try {
            const { data: review } = await admin
                .from("reviews")
                .select("user_id")
                .eq("id", params.targetId)
                .single()
            if (review?.user_id) {
                await admin.rpc("increment_user_risk_score", {
                    p_user_id: review.user_id,
                    p_points: params.riskScoreIncrement,
                })
            }
        } catch (e) {
            console.error("[MODERATION] Failed to increment user risk score:", e)
        }
    }
}

// ─── Fetch by ID ─────────────────────────────────────────────────────────────

export async function fetchModerationTarget(
    type: string,
    id: string
): Promise<{ success: boolean; data?: any; error?: string }> {
    await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const admin = getAdminClient()

    try {
        switch (type) {
            case "product": {
                const { data, error } = await admin
                    .from("products")
                    .select(`
                        id, name, description, price, images, tags, video_url, video_type,
                        video_thumbnail, moderation_status, is_active, created_at,
                        partner:partners(id),
                        store:stores(id, name, risk_score)
                    `)
                    .eq("id", id)
                    .is("deleted_at", null)
                    .single()

                if (error || !data) return { success: false, error: "Produto não encontrado" }

                const { data: variants } = await admin
                    .from("product_variants")
                    .select("id, variant_name, variant_type, variant_value, sku, price_adjustment, stock_quantity, stock_available, variant_options, is_active")
                    .eq("product_id", id)
                    .order("variant_name")

                return { success: true, data: { ...data, variants: variants || [] } as FetchedProduct }
            }

            case "service": {
                const { data, error } = await admin
                    .from("services")
                    .select(`
                        id, name, description, price, images, tags, video_url, video_type,
                        video_thumbnail, moderation_status, is_active, created_at,
                        partner:partners!inner(id),
                        store:stores(id, name, risk_score)
                    `)
                    .eq("id", id)
                    .is("deleted_at", null)
                    .single()

                if (error || !data) return { success: false, error: "Serviço não encontrado" }
                return { success: true, data: data as FetchedService }
            }

            case "recurring_plan": {
                const { data, error } = await admin
                    .from("recurring_plans")
                    .select(`
                        id, name, description, status, frequency_type, show_in_marketplace, created_at,
                        partner:partners!inner(id),
                        store:stores(id, name, risk_score)
                    `)
                    .eq("id", id)
                    .single()

                if (error || !data) return { success: false, error: "Assinatura não encontrada" }

                const { data: items } = await admin
                    .from("recurring_plan_items")
                    .select("id, item_type, product_id, service_id, quantity, unit_price")
                    .eq("plan_id", id)

                return { success: true, data: { ...data, items: items || [] } as FetchedRecurringPlan }
            }

            case "partner": {
                const { data: partner, error } = await admin
                    .from("partners")
                    .select(`
                        id, is_active, created_at, user_id
                    `)
                    .eq("id", id)
                    .single()

                if (error || !partner) return { success: false, error: "Parceiro não encontrado" }

                // Get store name from stores table
                const { data: hqStore } = await admin
                    .from("stores")
                    .select("name, description, logo_url, banner_url, gallery, risk_score")
                    .eq("partner_id", id)
                    .order("is_headquarters", { ascending: false })
                    .limit(1)
                    .maybeSingle()

                // Fetch owner separately (avoid FK join issues)
                let owner = null
                if (partner.user_id) {
                    const { data: profile } = await admin
                        .from("user_profiles")
                        .select("full_name, risk_score")
                        .eq("id", partner.user_id)
                        .single()
                    if (profile) {
                        const { data: authData } = await admin.auth.admin.getUserById(partner.user_id)
                        const authUser = authData?.user ? { email: authData.user.email } : null
                        owner = {
                            ...profile,
                            email: authUser?.email || null
                        }
                    }
                }

                // Merge store data over partner data
                const storeName = hqStore?.name || "Loja"
                const { user_id, ...partnerData } = partner
                return {
                    success: true,
                    data: {
                        ...partnerData,
                        store_name: storeName,
                        store_description: hqStore?.description || null,
                        store_image_url: hqStore?.logo_url || null,
                        banner_url: hqStore?.banner_url || null,
                        gallery: hqStore?.gallery || [],
                        risk_score: hqStore?.risk_score ?? 0,
                        owner
                    } as FetchedPartner
                }
            }

            case "review": {
                const { data, error } = await admin
                    .from("reviews")
                    .select(`
                        id, rating, comment, is_hidden, created_at, user_id,
                        partner:partners(id),
                        store:stores(id, name, risk_score),
                        product:products(id, name)
                    `)
                    .eq("id", id)
                    .single()

                if (error || !data) return { success: false, error: "Review não encontrado" }

                // Fetch user separately (avoid FK join issues)
                let user = null
                if (data.user_id) {
                    const { data: profile } = await admin
                        .from("user_profiles")
                        .select("full_name")
                        .eq("id", data.user_id)
                        .single()
                    if (profile) user = profile
                }

                const { user_id, ...reviewData } = data
                return { success: true, data: { ...reviewData, user } as FetchedReview }
            }

            default:
                return { success: false, error: "Tipo inválido" }
        }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao buscar dados" }
    }
}

// ─── Edit Field ──────────────────────────────────────────────────────────────

export async function editField(
    targetType: string,
    targetId: string,
    field: string,
    value: string,
    riskScoreIncrement: number,
    notes?: string,
    knownPartnerId?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!hasAllowedField(targetType, field)) {
        return { success: false, error: "Campo não permitido para moderação" }
    }

    const resolvedPartnerId = await getPartnerIdFromTarget(targetType, targetId)
    if (!resolvedPartnerId) return { success: false, error: "Recurso não encontrado" }
    if (knownPartnerId && knownPartnerId !== resolvedPartnerId) {
        return { success: false, error: "Contexto do parceiro inválido" }
    }
    const partnerId = resolvedPartnerId
    const normalizedRiskScoreIncrement = normalizeRiskScoreIncrement(riskScoreIncrement)

    try {
        // Fetch previous value for audit
        let previousValue = ""
        const fetchAdmin = getAdminClient()
        if (targetType === "product") {
            const { data } = await fetchAdmin.from("products").select(field).eq("id", targetId).single()
            previousValue = data?.[field] !== null && data?.[field] !== undefined ? String(data[field]) : ""
        } else if (targetType === "service") {
            const { data } = await fetchAdmin.from("services").select(field).eq("id", targetId).single()
            previousValue = data?.[field] !== null && data?.[field] !== undefined ? String(data[field]) : ""
        } else if (targetType === "recurring_plan") {
            const { data } = await fetchAdmin.from("recurring_plans").select(field).eq("id", targetId).single()
            previousValue = data?.[field] !== null && data?.[field] !== undefined ? String(data[field]) : ""
        } else if (targetType === "partner") {
            const storeFieldMap: Record<string, string> = {
                store_name: "name",
                store_description: "description",
                store_image_url: "logo_url"
            }
            const actualField = storeFieldMap[field] || field
            const isStoreField = ["name", "description", "logo_url", "banner_url", "gallery", "opening_hours", "phone", "risk_score", "rating", "marketplace_reputation", "vendas_totais", "vendas_produtos", "vendas_servicos", "vendas_assinaturas", "completed_orders_count", "completed_appointments_count", "active_subscriptions_count", "cancellation_rate", "timezone", "pickup_payment_policy", "person_type", "cnpj", "cpf", "crt", "contribuinte", "inscricao_estadual", "ie_isento", "inscricao_municipal"].includes(actualField)
            
            if (isStoreField) {
                const { data } = await fetchAdmin.from("stores").select(actualField).eq("partner_id", targetId).limit(1).maybeSingle()
                previousValue = data?.[actualField] !== null && data?.[actualField] !== undefined ? String(data[actualField]) : ""
                const { error: updateError } = await fetchAdmin.from("stores").update({ [actualField]: value === "" ? null : value }).eq("partner_id", targetId)
                if (updateError) return { success: false, error: updateError.message }
            } else {
                const { data } = await fetchAdmin.from("partners").select(field).eq("id", targetId).single()
                previousValue = data?.[field] !== null && data?.[field] !== undefined ? String(data[field]) : ""
                const { error: updateError } = await fetchAdmin.from("partners").update({ [field]: value === "" ? null : value }).eq("id", targetId)
                if (updateError) return { success: false, error: updateError.message }
            }
        }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_EDIT_FIELD,
            targetType,
            targetId,
            fieldName: field,
            previousValue,
            newValue: value,
            riskScoreIncrement: normalizedRiskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao editar" }
    }
}

// ─── Remove Image ────────────────────────────────────────────────────────────

export async function removeImage(
    targetType: string,
    targetId: string,
    imageUrl: string,
    field: string,
    riskScoreIncrement: number,
    notes?: string,
    knownPartnerId?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!IMAGE_FIELDS[targetType]?.includes(field)) {
        return { success: false, error: "Campo de imagem não permitido para moderação" }
    }

    let effectiveType = targetType
    let effectiveId = targetId

    try {
        const fetchAdmin = getAdminClient()
        let currentImages: string[] = []
        let previousImagesStr = ""

        // For variants, resolve to product first
        if (targetType === "variant") {
            const { data } = await fetchAdmin.from("product_variants").select("product_id").eq("id", targetId).single()
            if (!data) return { success: false, error: "Variante não encontrada" }
            effectiveType = "product"
            effectiveId = data.product_id
        }

        const resolvedPartnerId = await getPartnerIdFromTarget(effectiveType, effectiveId)
        if (!resolvedPartnerId) return { success: false, error: "Recurso não encontrado" }
        if (knownPartnerId && knownPartnerId !== resolvedPartnerId) {
            return { success: false, error: "Contexto do parceiro inválido" }
        }
        const partnerId = resolvedPartnerId

        if (effectiveType === "product") {
            const { data } = await fetchAdmin.from("products").select("images").eq("id", effectiveId).single()
            currentImages = data?.images || []
            previousImagesStr = JSON.stringify(currentImages)
            currentImages = currentImages.filter((img: string) => img !== imageUrl)

            const { error } = await fetchAdmin
                .from("products")
                .update({ images: currentImages })
                .eq("id", effectiveId)

            if (error) return { success: false, error: error.message }

            // If this was a variant, also update variant image in variant_options
            if (targetType === "variant") {
                const { data: vData } = await fetchAdmin.from("product_variants").select("variant_options").eq("id", targetId).single()
                if (vData?.variant_options) {
                    const opts = typeof vData.variant_options === "string" ? JSON.parse(vData.variant_options) : vData.variant_options
                    if (opts?.image) {
                        delete opts.image
                        await fetchAdmin.from("product_variants").update({
                            variant_options: Object.keys(opts).length > 0 ? opts : null
                        }).eq("id", targetId)
                    }
                }
            }
        } else if (effectiveType === "service") {
            const { data } = await fetchAdmin.from("services").select("images").eq("id", effectiveId).single()
            currentImages = data?.images || []
            previousImagesStr = JSON.stringify(currentImages)
            currentImages = currentImages.filter((img: string) => img !== imageUrl)

            const { error } = await fetchAdmin
                .from("services")
                .update({ images: currentImages })
                .eq("id", effectiveId)

            if (error) return { success: false, error: error.message }
        } else if (effectiveType === "partner") {
            if (field === "store_image_url" || field === "logo_url") {
                const { data } = await fetchAdmin.from("stores").select("logo_url").eq("partner_id", effectiveId).limit(1).maybeSingle()
                previousImagesStr = data?.logo_url || ""

                const { error } = await fetchAdmin
                    .from("stores")
                    .update({ logo_url: null })
                    .eq("partner_id", effectiveId)

                if (error) return { success: false, error: error.message }
            } else if (field === "banner_url") {
                const { data } = await fetchAdmin.from("stores").select("banner_url").eq("partner_id", effectiveId).limit(1).maybeSingle()
                previousImagesStr = data?.banner_url || ""

                const { error } = await fetchAdmin
                    .from("stores")
                    .update({ banner_url: null })
                    .eq("partner_id", effectiveId)

                if (error) return { success: false, error: error.message }
            } else if (field === "gallery") {
                const { data } = await fetchAdmin.from("stores").select("gallery").eq("partner_id", effectiveId).limit(1).maybeSingle()
                const gallery = data?.gallery || []
                currentImages = Array.isArray(gallery) ? gallery : typeof gallery === "string" ? JSON.parse(gallery) : []
                previousImagesStr = JSON.stringify(currentImages)
                currentImages = currentImages.filter((img: string) => img !== imageUrl)

                const { error } = await fetchAdmin
                    .from("stores")
                    .update({ gallery: currentImages })
                    .eq("partner_id", effectiveId)

                if (error) return { success: false, error: error.message }
            }
        }

        // Delete from R2
        await _deleteFromR2(imageUrl)

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_REMOVE_IMAGE,
            targetType: effectiveType,
            targetId: effectiveId,
            fieldName: field,
            previousValue: previousImagesStr,
            newValue: JSON.stringify(currentImages),
            riskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao remover imagem" }
    }
}

// ─── Edit Variant ────────────────────────────────────────────────────────────

export async function editVariant(
    variantId: string,
    field: string,
    value: string,
    riskScoreIncrement: number,
    notes?: string,
    knownPartnerId?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!VARIANT_FIELDS.includes(field as (typeof VARIANT_FIELDS)[number])) {
        return { success: false, error: "Campo de variante não permitido para moderação" }
    }

    try {
        const fetchAdmin = getAdminClient()
        const { data: variant } = await fetchAdmin
            .from("product_variants")
            .select("product_id, variant_name")
            .eq("id", variantId)
            .single()

        if (!variant) return { success: false, error: "Variante não encontrada" }

        const previousValue = variant.variant_name

        const dbField = field === "name" ? "variant_name" : field
        const updateData: any = {}
        updateData[dbField] = value === "" ? null : value

        const { error } = await fetchAdmin
            .from("product_variants")
            .update(updateData)
            .eq("id", variantId)

        if (error) return { success: false, error: error.message }

        const partnerId = await getPartnerIdFromTarget("product", variant.product_id)
        if (!partnerId) return { success: false, error: "Produto da variante não encontrado" }
        if (knownPartnerId && knownPartnerId !== partnerId) {
            return { success: false, error: "Contexto do parceiro inválido" }
        }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_EDIT_FIELD,
            targetType: "product",
            targetId: variant.product_id,
            fieldName: `variant_${field}`,
            previousValue,
            newValue: value,
            riskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao editar variante" }
    }
}

// ─── Review Actions ──────────────────────────────────────────────────────────

export async function hideReview(
    reviewId: string,
    riskScoreIncrement: number,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const { data: review } = await fetchAdmin
            .from("reviews")
            .select("id, partner_id, comment, is_hidden")
            .eq("id", reviewId)
            .single()

        if (!review) return { success: false, error: "Review não encontrado" }

        const { error } = await fetchAdmin
            .from("reviews")
            .update({
                is_hidden: true,
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
                moderation_reason: notes || null,
            })
            .eq("id", reviewId)

        if (error) return { success: false, error: error.message }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId: review.partner_id,
            actionType: AdminActionType.MODERATION_HIDE_REVIEW,
            targetType: "review",
            targetId: reviewId,
            fieldName: "is_hidden",
            previousValue: String(review.is_hidden),
            newValue: "true",
            riskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao ocultar review" }
    }
}

export async function editReview(
    reviewId: string,
    newComment: string,
    riskScoreIncrement: number,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const { data: review } = await fetchAdmin
            .from("reviews")
            .select("id, partner_id, comment")
            .eq("id", reviewId)
            .single()

        if (!review) return { success: false, error: "Review não encontrado" }

        const { error } = await fetchAdmin
            .from("reviews")
            .update({
                comment: newComment,
                moderation_reviewed_by: admin.userId,
                moderation_reviewed_at: new Date().toISOString(),
                moderation_reason: notes || null,
            })
            .eq("id", reviewId)

        if (error) return { success: false, error: error.message }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId: review.partner_id,
            actionType: AdminActionType.MODERATION_EDIT_REVIEW,
            targetType: "review",
            targetId: reviewId,
            fieldName: "comment",
            previousValue: review.comment || "",
            newValue: newComment,
            riskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao editar review" }
    }
}

// ─── Delete Variant ──────────────────────────────────────────────────────────

export async function deleteVariant(
    variantId: string,
    riskScoreIncrement: number,
    notes?: string,
    knownPartnerId?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const { data: variant } = await fetchAdmin
            .from("product_variants")
            .select("product_id, variant_options")
            .eq("id", variantId)
            .single()

        if (!variant) return { success: false, error: "Variante não encontrada" }

        // Delete variant image from R2 if exists
        const opts = variant.variant_options
        if (opts) {
            const parsed = typeof opts === "string" ? JSON.parse(opts) : opts
            if (parsed?.image) await _deleteFromR2(parsed.image)
        }

        const partnerId = await getPartnerIdFromTarget("product", variant.product_id)
        if (!partnerId) return { success: false, error: "Produto da variante não encontrado" }
        if (knownPartnerId && knownPartnerId !== partnerId) {
            return { success: false, error: "Contexto do parceiro inválido" }
        }

        // Delete variant
        await fetchAdmin.from("product_variants").delete().eq("id", variantId)

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_EDIT_FIELD,
            targetType: "product",
            targetId: variant.product_id,
            fieldName: "variant_deleted",
            previousValue: variantId,
            newValue: "",
            riskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao remover variante" }
    }
}

// ─── Update Partner Risk Score Directly ──────────────────────────────────────

export async function updatePartnerRiskScore(
    partnerId: string,
    newScore: number,
    notes?: string,
    customTitle?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const { data: store } = await fetchAdmin
            .from("stores")
            .select("id, name, risk_score")
            .eq("partner_id", partnerId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!store) return { success: false, error: "Loja do parceiro não encontrada" }

        const previousScore = store.risk_score || 0
        const clampedScore = Math.min(Math.max(Math.round(Number(newScore) || 0), 0), 100)

        const { error } = await fetchAdmin
            .from("stores")
            .update({ risk_score: clampedScore })
            .eq("partner_id", partnerId)

        if (error) return { success: false, error: error.message }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_RISK_SCORE,
            targetType: "partner",
            targetId: partnerId,
            fieldName: "risk_score",
            previousValue: String(previousScore),
            newValue: String(clampedScore),
            riskScoreIncrement: clampedScore - previousScore,
            notes,
        })

        // ─── Dispatch In-App + Push Notification ──────────────────────────────
        try {
            const { createNotificationsForUsers, getPartnerTeamUserIds } = await import("@/lib/services/notification.service")
            const teamUserIds = await getPartnerTeamUserIds(partnerId, MANAGEMENT_ROLES)

            if (teamUserIds.length > 0) {
                const notifTitle = customTitle?.trim() || (clampedScore > previousScore
                    ? `Aviso: Atualização no Score de Risco da loja ${store.name || "Parceiro"}`
                    : `Ajuste no Score de Risco da loja ${store.name || "Parceiro"}`)

                const notifMessage = notes?.trim()
                    ? notes.trim()
                    : `O score de risco da loja foi ajustado de ${previousScore} para ${clampedScore} pontos.`

                await createNotificationsForUsers(teamUserIds, (uid) => ({
                    userId: uid,
                    type: "admin_announcement",
                    title: notifTitle,
                    message: notifMessage,
                    entityType: "announcement",
                    entityId: null,
                    data: {
                        partner_id: partnerId,
                        store_id: store.id,
                        store_name: store.name,
                        old_score: previousScore,
                        new_score: clampedScore,
                        reason: notes?.trim() || null,
                        audience: "seller",
                        url: "/erp/configuracoes",
                    },
                    idempotencyKey: `risk_score_partner:${partnerId}:${clampedScore}:${Date.now()}:${uid}`,
                    origin: "system",
                }))
            }
        } catch (notifErr) {
            console.error("[MODERATION_V2] Failed to send partner risk notification:", notifErr)
        }

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao atualizar risk score" }
    }
}

// ─── Batch Save Changes ──────────────────────────────────────────────────────

type FieldChange = { field: string; value: string }

export async function saveModerationChanges(params: {
    type: string
    targetId: string
    changes: FieldChange[]
    removedImages: string[]
    riskScoreIncrement: number
    notes?: string
    knownPartnerId?: string
}): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!MODERATION_FIELDS[params.type]) {
        return { success: false, error: "Tipo inválido para moderação" }
    }
    if (params.changes.length > 20 || params.changes.some((change) => !hasAllowedField(params.type, change.field))) {
        return { success: false, error: "Um ou mais campos não são permitidos para moderação" }
    }
    if (params.removedImages.length > 20 || (params.removedImages.length > 0 && !["product", "service"].includes(params.type))) {
        return { success: false, error: "Remoção de imagens não permitida para este recurso" }
    }

    const partnerId = await getPartnerIdFromTarget(params.type, params.targetId)
    if (!partnerId) return { success: false, error: "Recurso não encontrado" }
    if (params.knownPartnerId && params.knownPartnerId !== partnerId) {
        return { success: false, error: "Contexto do parceiro inválido" }
    }
    const normalizedRiskScoreIncrement = normalizeRiskScoreIncrement(params.riskScoreIncrement)

    try {
        const fetchAdmin = getAdminClient()

        // 1. Apply field changes
        for (const { field, value } of params.changes) {
            const dbField = field === "tags" ? "tags" : field

            const tableMap: Record<string, string> = {
                product: "products",
                service: "services",
                recurring_plan: "recurring_plans",
                partner: "partners",
            }
            const table = tableMap[params.type]

            if (params.type === "partner") {
                const storeFieldMap: Record<string, string> = {
                    store_name: "name",
                    store_description: "description",
                    store_image_url: "logo_url",
                }
                const actualField = storeFieldMap[dbField] || dbField
                const isStoreField = ["name", "description", "logo_url", "banner_url", "gallery", "opening_hours", "phone", "risk_score", "rating", "marketplace_reputation"].includes(actualField)

                if (isStoreField) {
                    await fetchAdmin.from("stores").update({ [actualField]: value === "" ? null : value }).eq("partner_id", params.targetId)
                } else {
                    await fetchAdmin.from("partners").update({ [dbField]: value === "" ? null : value }).eq("id", params.targetId)
                }
            } else if (table) {
                const updateData: any = {}
                updateData[dbField] = value === "" ? null : value
                await fetchAdmin.from(table as any).update(updateData).eq("id", params.targetId)
            }
        }

        // 2. Apply image removals
        for (const imageUrl of params.removedImages) {
            const tableMap: Record<string, string> = {
                product: "products",
                service: "services",
            }
            const table = tableMap[params.type]
            if (table) {
                const { data: current } = await fetchAdmin.from(table as any).select("images").eq("id", params.targetId).single()
                const images = (current?.images || []).filter((img: string) => img !== imageUrl)
                await fetchAdmin.from(table as any).update({ images }).eq("id", params.targetId)
                await _deleteFromR2(imageUrl)
            }
        }

        // 3. Audit log
        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_EDIT_FIELD,
            targetType: params.type,
            targetId: params.targetId,
            fieldName: params.changes.map(c => c.field).join(","),
            previousValue: "",
            newValue: params.changes.map(c => `${c.field}=${c.value}`).join(","),
            riskScoreIncrement: normalizedRiskScoreIncrement,
            notes: params.notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao salvar alterações" }
    }
}

// ─── Delete Moderation Target ────────────────────────────────────────────────

export async function deleteModerationTarget(
    type: string,
    id: string,
    riskScoreIncrement: number,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdminScope("moderation")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const partnerId = await getPartnerIdFromTarget(type, id)

        let actionType: AdminActionType

        switch (type) {
            case "product": {
                actionType = AdminActionType.PRODUCT_SOFT_DELETE
                await fetchAdmin.from("products").update({
                    deleted_at: new Date().toISOString(),
                    deleted_reason: notes?.trim() || "Removido pela moderação",
                    deleted_by: admin.userId,
                    is_active: false,
                    status: "deleted",
                }).eq("id", id)
                break
            }
            case "service": {
                actionType = AdminActionType.SERVICE_SOFT_DELETE
                await fetchAdmin.from("services").update({
                    deleted_at: new Date().toISOString(),
                    deleted_reason: notes?.trim() || "Removido pela moderação",
                    deleted_by: admin.userId,
                    is_active: false,
                    status: "deleted",
                }).eq("id", id)
                break
            }
            case "recurring_plan": {
                actionType = AdminActionType.RECURRING_PLAN_DELETE
                await fetchAdmin.from("recurring_plans").update({ status: "cancelled" }).eq("id", id)
                break
            }
            case "review": {
                actionType = AdminActionType.REVIEW_DELETE
                await fetchAdmin.from("reviews").delete().eq("id", id)
                break
            }
            default:
                return { success: false, error: "Tipo inválido para remoção" }
        }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType,
            targetType: type,
            targetId: id,
            riskScoreIncrement,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao remover" }
    }
}
