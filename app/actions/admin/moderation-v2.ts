"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import type { FetchedProduct, FetchedService, FetchedRecurringPlan, FetchedPartner, FetchedReview } from "@/lib/admin/types"

// ─── Helpers ────────────────────────────────────────────────────────────────

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
            notes: params.notes,
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
                notes: params.notes || null,
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
    await requireAdmin("moderator")
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
                        partner:partners!inner(id, store_name, risk_score)
                    `)
                    .eq("id", id)
                    .is("deleted_at", null)
                    .single()

                if (error || !data) return { success: false, error: "Produto não encontrado" }

                const { data: variants } = await admin
                    .from("product_variants")
                    .select("id, name, sku, price, stock_quantity, images, is_active")
                    .eq("product_id", id)
                    .order("name")

                return { success: true, data: { ...data, variants: variants || [] } as FetchedProduct }
            }

            case "service": {
                const { data, error } = await admin
                    .from("services")
                    .select(`
                        id, name, description, price, images, tags, video_url, video_type,
                        video_thumbnail, moderation_status, is_active, created_at,
                        partner:partners!inner(id, store_name, risk_score)
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
                        partner:partners!inner(id, store_name, risk_score)
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
                const { data, error } = await admin
                    .from("partners")
                    .select(`
                        id, store_name, store_description, store_image_url, banner_url,
                        gallery, logo_moderation_status, banner_moderation_status,
                        risk_score, is_active, created_at,
                        owner:user_profiles!partners_user_id_fkey(full_name, email, risk_score)
                    `)
                    .eq("id", id)
                    .single()

                if (error || !data) return { success: false, error: "Parceiro não encontrado" }

                let galleryArr: string[] = []
                if (data.gallery) {
                    if (Array.isArray(data.gallery)) galleryArr = data.gallery
                    else if (typeof data.gallery === "string") {
                        try { galleryArr = JSON.parse(data.gallery) } catch { galleryArr = [] }
                    }
                }

                return { success: true, data: { ...data, gallery: galleryArr } as FetchedPartner }
            }

            case "review": {
                const { data, error } = await admin
                    .from("reviews")
                    .select(`
                        id, rating, comment, is_hidden, created_at,
                        user:user_profiles(full_name),
                        partner:partners(id, store_name, risk_score),
                        product:products(id, name)
                    `)
                    .eq("id", id)
                    .single()

                if (error || !data) return { success: false, error: "Review não encontrado" }
                return { success: true, data: data as FetchedReview }
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
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const partnerId = knownPartnerId ?? await getPartnerIdFromTarget(targetType, targetId)

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
            const { data } = await fetchAdmin.from("partners").select(field).eq("id", targetId).single()
            previousValue = data?.[field] !== null && data?.[field] !== undefined ? String(data[field]) : ""
        }

        // Determine table
        const tableMap: Record<string, string> = {
            product: "products",
            service: "services",
            recurring_plan: "recurring_plans",
            partner: "partners",
        }
        const table = tableMap[targetType]
        if (!table) return { success: false, error: "Tipo inválido para edição" }

        const updateData: any = {}
        updateData[field] = value === "" ? null : value

        const { error: updateError } = await getAdminClient()
            .from(table as any)
            .update(updateData)
            .eq("id", targetId)

        if (updateError) return { success: false, error: updateError.message }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_EDIT_FIELD,
            targetType,
            targetId,
            fieldName: field,
            previousValue,
            newValue: value,
            riskScoreIncrement,
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
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

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

        const partnerId = knownPartnerId ?? await getPartnerIdFromTarget(effectiveType, effectiveId)

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

            // If this was a variant, also update variant images
            if (targetType === "variant") {
                const { data: vData } = await fetchAdmin.from("product_variants").select("images").eq("id", targetId).single()
                const vImages = (vData?.images || []).filter((img: string) => img !== imageUrl)
                await fetchAdmin.from("product_variants").update({ images: vImages }).eq("id", targetId)
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
            if (field === "store_image_url") {
                const { data } = await fetchAdmin.from("partners").select("store_image_url").eq("id", effectiveId).single()
                previousImagesStr = data?.store_image_url || ""

                const { error } = await fetchAdmin
                    .from("partners")
                    .update({ store_image_url: null })
                    .eq("id", effectiveId)

                if (error) return { success: false, error: error.message }
            } else if (field === "banner_url") {
                const { data } = await fetchAdmin.from("partners").select("banner_url").eq("id", effectiveId).single()
                previousImagesStr = data?.banner_url || ""

                const { error } = await fetchAdmin
                    .from("partners")
                    .update({ banner_url: null })
                    .eq("id", effectiveId)

                if (error) return { success: false, error: error.message }
            } else if (field === "gallery") {
                const { data } = await fetchAdmin.from("partners").select("gallery").eq("id", effectiveId).single()
                const gallery = data?.gallery || []
                currentImages = Array.isArray(gallery) ? gallery : typeof gallery === "string" ? JSON.parse(gallery) : []
                previousImagesStr = JSON.stringify(currentImages)
                currentImages = currentImages.filter((img: string) => img !== imageUrl)

                const { error } = await fetchAdmin
                    .from("partners")
                    .update({ gallery: currentImages })
                    .eq("id", effectiveId)

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
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const { data: variant } = await fetchAdmin
            .from("product_variants")
            .select("product_id, name")
            .eq("id", variantId)
            .single()

        if (!variant) return { success: false, error: "Variante não encontrada" }

        const previousValue = variant.name

        const updateData: any = {}
        updateData[field] = value === "" ? null : value

        const { error } = await fetchAdmin
            .from("product_variants")
            .update(updateData)
            .eq("id", variantId)

        if (error) return { success: false, error: error.message }

        const partnerId = knownPartnerId ?? await getPartnerIdFromTarget("product", variant.product_id)

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
    const admin = await requireAdmin("moderator")
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
    const admin = await requireAdmin("moderator")
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

// ─── Update Partner Risk Score Directly ──────────────────────────────────────

export async function updatePartnerRiskScore(
    partnerId: string,
    newScore: number,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    try {
        const fetchAdmin = getAdminClient()
        const { data: partner } = await fetchAdmin
            .from("partners")
            .select("id, risk_score")
            .eq("id", partnerId)
            .single()

        if (!partner) return { success: false, error: "Parceiro não encontrado" }

        const previousScore = partner.risk_score

        const { error } = await fetchAdmin
            .from("partners")
            .update({ risk_score: Math.min(newScore, 100) })
            .eq("id", partnerId)

        if (error) return { success: false, error: error.message }

        await logModerationAction({
            adminUserId: admin.userId,
            partnerId,
            actionType: AdminActionType.MODERATION_RISK_SCORE,
            targetType: "partner",
            targetId: partnerId,
            fieldName: "risk_score",
            previousValue: String(previousScore),
            newValue: String(newScore),
            riskScoreIncrement: newScore - previousScore,
            notes,
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao atualizar risk score" }
    }
}
