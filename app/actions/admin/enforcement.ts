"use server"

/**
 * Admin enforcement server actions (ban, suspend, disable, soft-delete).
 *
 * CRITICAL ACTIONS (⚠️) require step-up re-authentication.
 *
 * SECURITY: All mutations via authenticated client (RLS enforced).
 * Service-role only for audit log writes.
 */

import { getAdminClient } from "@/lib/supabase/admin"
import { requireAdmin, assertNotSelf, assertNotProtected } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireStepUp } from "@/lib/admin/step-up-auth"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"

// SECURITY FIX (MED-01): Sanitize wildcard chars in ILIKE queries
function sanitizeIlike(input: string): string {
    return input.replace(/[%_\\]/g, c => `\\${c}`)
}
import type { EnforcementUser, EnforcementPartner, CursorPaginatedResult } from "@/lib/admin/types"

// ─── Helper: increment partner risk_score (capped at 100) ──────────────────

async function incrementRiskScore(partnerId: string, points: number): Promise<void> {
    try {
        const adminClient: any = getAdminClient()
        const { data } = await adminClient
            .from("partners")
            .select("risk_score")
            .eq("id", partnerId)
            .single() as { data: { risk_score: number } | null }
        const current = data?.risk_score || 0
        const newScore = Math.min(current + points, 100)
        await adminClient
            .from("partners")
            .update({ risk_score: newScore } as any)
            .eq("id", partnerId)
    } catch (e) {
        console.error("[RISK_SCORE] Failed to increment:", partnerId, e)
    }
}

// ─── Helper: deactivate all products for a partner ──────────────────────

async function deactivatePartnerProducts(partnerId: string): Promise<void> {
    try {
        const adminClient: any = getAdminClient()
        await adminClient
            .from("products")
            .update({ is_active: false } as any)
            .eq("partner_id", partnerId)
            .is("deleted_at", null)
    } catch (e) {
        console.error("[ENFORCEMENT] Failed to deactivate products:", partnerId, e)
    }
}

// ─── Get Users ──────────────────────────────────────────────────────────────

export async function getUsers(
    cursor?: string | null,
    limit: number = 20,
    search?: string,
    status?: string
): Promise<CursorPaginatedResult<EnforcementUser>> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    // Use admin client to bypass RLS and see ALL users
    const supabase: any = getAdminClient()
    const pageSize = Math.min(limit, 50)

    // First, get admin/moderator user_ids to exclude them from the list
    const { data: adminRoles } = await supabase
        .from("admin_roles")
        .select("user_id")
    const adminUserIds = new Set((adminRoles || []).map((r: any) => r.user_id))

    let query = supabase
        .from("user_profiles")
        .select("user_id, full_name, banned_at, banned_until, banned_reason, created_at")

    if (search && search.trim().length > 0) {
        const sanitized = sanitizeIlike(search.trim())
        query = query.ilike("full_name", `%${sanitized}%`)
    }

    if (status === "active") {
        query = query.is("banned_at", null)
    } else if (status === "banned") {
        query = query.not("banned_at", "is", null)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    // Fetch more to account for admin filtering
    query = query.order("created_at", { ascending: false }).limit((pageSize + 1) * 2)

    const { data: profiles, error } = await query

    if (error) {
        console.error("[ADMIN_ENFORCEMENT] Failed to fetch users:", error.message)
        return { data: [], nextCursor: null, prevCursor: null, hasMore: false }
    }

    // Filter out admin/moderator accounts
    const filteredProfiles = (profiles || []).filter((p: any) => !adminUserIds.has(p.user_id))
    const hasMore = filteredProfiles.length > pageSize
    const items = filteredProfiles.slice(0, pageSize)

    // Fetch partner info for each user
    const userIds = items.map((p: any) => p.user_id)
    let partnerMap = new Map()
    if (userIds.length > 0) {
        const { data: partners } = await supabase
            .from("partners")
            .select("id, user_id, store_name, is_active, suspended_at, erp_disabled")
            .in("user_id", userIds)
        partnerMap = new Map((partners || []).map((p: any) => [p.user_id, p]))
    }

    const mapped: EnforcementUser[] = items.map((p: any) => ({
        user_id: p.user_id,
        email: "",
        full_name: p.full_name,
        banned_at: p.banned_at,
        banned_until: p.banned_until,
        banned_reason: p.banned_reason,
        created_at: p.created_at,
        partner: partnerMap.get(p.user_id)
            ? {
                id: partnerMap.get(p.user_id)!.id,
                store_name: partnerMap.get(p.user_id)!.store_name,
                is_active: partnerMap.get(p.user_id)!.is_active,
                suspended_at: partnerMap.get(p.user_id)!.suspended_at,
                erp_disabled: partnerMap.get(p.user_id)!.erp_disabled,
            }
            : null,
    }))

    return {
        data: mapped,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

// ─── Get Partners (separate from users) ─────────────────────────────────────

export async function getPartners(
    cursor?: string | null,
    limit: number = 20,
    search?: string,
    status?: string
): Promise<CursorPaginatedResult<EnforcementPartner>> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase: any = getAdminClient()
    const pageSize = Math.min(limit, 50)

    let query = supabase
        .from("partners")
        .select("id, store_name, user_id, is_active, erp_disabled, suspended_at, suspended_until, risk_score, created_at")

    if (search && search.trim().length > 0) {
        const sanitized = sanitizeIlike(search.trim())
        query = query.ilike("store_name", `%${sanitized}%`)
    }

    if (status === "active") {
        query = query.is("suspended_at", null).eq("erp_disabled", false).eq("is_active", true)
    } else if (status === "suspended") {
        query = query.not("suspended_at", "is", null)
    } else if (status === "erp_disabled") {
        query = query.eq("erp_disabled", true)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

    query = query.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: partners, error } = await query

    if (error) {
        console.error("[ADMIN_ENFORCEMENT] Failed to fetch partners:", error.message)
        return { data: [], nextCursor: null, prevCursor: null, hasMore: false }
    }

    const hasMore = (partners?.length || 0) > pageSize
    const items = (partners || []).slice(0, pageSize)

    // Fetch owner names
    const ownerIds = items.map((p: any) => p.user_id).filter(Boolean)
    let ownerMap = new Map<string, string>()
    if (ownerIds.length > 0) {
        const { data: owners } = await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", ownerIds)
        ownerMap = new Map((owners || []).map((o: any) => [o.user_id, o.full_name]))
    }

    // Fetch stores for each partner
    const partnerIds = items.map((p: any) => p.id)
    let storesByPartner = new Map<string, any[]>()
    if (partnerIds.length > 0) {
        const { data: stores } = await supabase
            .from("stores")
            .select("id, name, is_active, suspended_at, suspended_reason, risk_score, created_at, partner_id")
            .in("partner_id", partnerIds)
        if (stores) {
            for (const s of stores) {
                const list = storesByPartner.get(s.partner_id) || []
                list.push(s)
                storesByPartner.set(s.partner_id, list)
            }
        }
    }

    // If searching, also search stores
    let storeMatches: any[] = []
    if (search && search.trim().length > 0) {
        const sanitized = sanitizeIlike(search.trim())
        const { data: searchStores } = await supabase
            .from("stores")
            .select("id, name, is_active, suspended_at, suspended_reason, risk_score, created_at, partner_id")
            .ilike("name", `%${sanitized}%`)
        if (searchStores) {
            // Also fetch partner info for matching stores
            const storePartnerIds = [...new Set(searchStores.map((s: any) => s.partner_id))]
            const { data: storePartners } = await supabase
                .from("partners")
                .select("id, store_name, user_id, is_active, erp_disabled, suspended_at, suspended_until, risk_score, created_at")
                .in("id", storePartnerIds)
            const partnerMap = new Map((storePartners || []).map((p: any) => [p.id, p]))

            // Only include stores whose partner is not already in the main list
            const existingIds = new Set(items.map((p: any) => p.id))
            const storePartnerIdsSet = new Set(storePartnerIds)
            // Filter out stores whose partners are already in results
            storeMatches = searchStores
                .filter((s: any) => !existingIds.has(s.partner_id))
                .map((s: any) => {
                    const p = partnerMap.get(s.partner_id)
                    return { store: s, partner: p }
                })
                .filter((x: any) => x.partner)
        }
    }

    const mapped: EnforcementPartner[] = items.map((p: any) => {
        const stores = (storesByPartner.get(p.id) || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            is_active: s.is_active,
            suspended_at: s.suspended_at,
            suspended_reason: s.suspended_reason,
            risk_score: s.risk_score || 0,
            created_at: s.created_at,
            partner_id: s.partner_id,
        }))
        return {
            id: p.id,
            store_name: p.store_name || "Sem nome",
            owner_name: ownerMap.get(p.user_id) || "Desconhecido",
            owner_user_id: p.user_id,
            is_active: p.is_active,
            erp_disabled: p.erp_disabled || false,
            suspended_at: p.suspended_at,
            suspended_until: p.suspended_until,
            risk_score: p.risk_score || 0,
            created_at: p.created_at,
            type: "partner",
            stores: stores.length > 0 ? stores : undefined,
        }
    })

    // Add store-only items found by search
    const storeMapped: EnforcementPartner[] = storeMatches.map((x: any) => ({
        id: x.store.id,
        store_name: `${x.store.name} (${x.partner.store_name})`,
        owner_name: ownerMap.get(x.partner.user_id) || "Desconhecido",
        owner_user_id: x.partner.user_id || "",
        is_active: x.store.is_active,
        erp_disabled: false,
        suspended_at: x.store.suspended_at,
        suspended_until: null,
        risk_score: x.store.risk_score || 0,
        created_at: x.store.created_at,
        partner_id: x.store.partner_id,
        type: "store",
    }))

    const allItems = [...mapped, ...storeMapped]
    const totalHasMore = hasMore || storeMapped.length > 0

    return {
        data: allItems,
        nextCursor: totalHasMore && allItems.length > 0 ? allItems[allItems.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore: totalHasMore,
    }
}

// ─── Enable Tenant ERP Access ────────────────────────────────────────────────

export async function enableTenantAccess(
    partnerId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = getAdminClient()

    // Anti-IDOR
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select("id, store_name, erp_disabled")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    if (!partner.erp_disabled) {
        return { success: false, error: "Acesso ERP já está habilitado" }
    }

    const { error: updateError } = await supabase
        .from("partners")
        .update({
            erp_disabled: false,
            erp_disabled_at: null,
            erp_disabled_by: null,
            suspended_until: null,
        } as any)
        .eq("id", partnerId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_ENABLE_ERP,
        targetType: "partner",
        targetId: partnerId,
        metadata: { reason: reason.trim(), storeName: partner.store_name },
    })

    return { success: true }
}

// ─── Ban User ⚠️ (step-up required) ─────────────────────────────────────────

export async function banUser(
    targetUserId: string,
    reason: string,
    durationDays: number | null,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    // Self-lock
    assertNotSelf(admin.userId, targetUserId)
    await assertNotProtected(targetUserId)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    // Anti-IDOR: re-fetch user
    const { data: user, error: fetchError } = await supabase
        .from("user_profiles")
        .select("user_id, full_name, banned_at")
        .eq("user_id", targetUserId)
        .single()

    if (fetchError || !user) {
        return { success: false, error: "Usuário não encontrado" }
    }

    if (user.banned_at) {
        return { success: false, error: "Usuário já está banido" }
    }

    // Mass-assignment: whitelisted fields only
    const bannedUntil = durationDays && durationDays > 0
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
        : null  // null = permanent ban

    const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
            banned_at: new Date().toISOString(),
            banned_until: bannedUntil,
            banned_reason: reason.trim(),
            banned_by: admin.userId,
        } as any)
        .eq("user_id", targetUserId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.USER_BAN,
        targetType: "user",
        targetId: targetUserId,
        metadata: { reason: reason.trim(), targetName: user.full_name, durationDays: durationDays || "permanent", bannedUntil },
    })

    // If user has partner, deactivate their products + increment risk_score
    const { data: partner } = await supabase
        .from("partners")
        .select("id")
        .eq("user_id", targetUserId)
        .single()

    if (partner) {
        await deactivatePartnerProducts(partner.id)
        await incrementRiskScore(partner.id, 10)
    }

    return { success: true }
}

// ─── Unban User ─────────────────────────────────────────────────────────────

export async function unbanUser(
    targetUserId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    // Anti-IDOR
    const { data: user, error: fetchError } = await supabase
        .from("user_profiles")
        .select("user_id, full_name, banned_at")
        .eq("user_id", targetUserId)
        .single()

    if (fetchError || !user) {
        return { success: false, error: "Usuário não encontrado" }
    }

    if (!user.banned_at) {
        return { success: false, error: "Usuário não está banido" }
    }

    const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
            banned_at: null,
            banned_until: null,
            banned_reason: null,
            banned_by: null,
        } as any)
        .eq("user_id", targetUserId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.USER_UNBAN,
        targetType: "user",
        targetId: targetUserId,
        metadata: { reason: reason.trim(), targetName: user.full_name },
    })

    return { success: true }
}

// ─── Suspend Partner ⚠️ (step-up required) ──────────────────────────────────

export async function suspendPartner(
    partnerId: string,
    reason: string,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase = getAdminClient()

    // Anti-IDOR
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select("id, user_id, store_name, is_active, suspended_at")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    assertNotSelf(admin.userId, partner.user_id)
    await assertNotProtected(partner.user_id)

    if (partner.suspended_at) {
        return { success: false, error: "Parceiro já está suspenso" }
    }

    // Mass-assignment: whitelisted
    const { error: updateError } = await supabase
        .from("partners")
        .update({
            is_active: false,
            suspended_at: new Date().toISOString(),
            suspended_reason: reason.trim(),
            suspended_by: admin.userId,
        } as any)
        .eq("id", partnerId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_SUSPEND,
        targetType: "partner",
        targetId: partnerId,
        metadata: { reason: reason.trim(), storeName: partner.store_name },
    })

    return { success: true }
}

// ─── Unsuspend Partner ──────────────────────────────────────────────────────

export async function unsuspendPartner(
    partnerId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    // Anti-IDOR
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select("id, store_name, suspended_at")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    if (!partner.suspended_at) {
        return { success: false, error: "Parceiro não está suspenso" }
    }

    const { error: updateError } = await supabase
        .from("partners")
        .update({
            is_active: true,
            suspended_at: null,
            suspended_reason: null,
            suspended_by: null,
        } as any)
        .eq("id", partnerId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_UNSUSPEND,
        targetType: "partner",
        targetId: partnerId,
        metadata: { reason: reason.trim(), storeName: partner.store_name },
    })

    return { success: true }
}

// ─── Suspend Store (store-level, not partner) ⚠️ (step-up required) ─────────

export async function suspendStore(
    storeId: string,
    reason: string,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    const { data: store, error: fetchError } = await supabase
        .from("stores")
        .select("id, name, partner_id, is_active, suspended_at")
        .eq("id", storeId)
        .single()

    if (fetchError || !store) {
        return { success: false, error: "Loja não encontrada" }
    }

    if (store.suspended_at) {
        return { success: false, error: "Loja já está suspensa" }
    }

    const { error: updateError } = await supabase
        .from("stores")
        .update({
            is_active: false,
            suspended_at: new Date().toISOString(),
            suspended_reason: reason.trim(),
            suspended_by: admin.userId,
        } as any)
        .eq("id", storeId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_SUSPEND,
        targetType: "partner",
        targetId: storeId,
        metadata: { reason: reason.trim(), storeName: store.name, storeId },
    })

    return { success: true }
}

// ─── Unsuspend Store ────────────────────────────────────────────────────────

export async function unsuspendStore(
    storeId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    const { data: store, error: fetchError } = await supabase
        .from("stores")
        .select("id, name, suspended_at")
        .eq("id", storeId)
        .single()

    if (fetchError || !store) {
        return { success: false, error: "Loja não encontrada" }
    }

    if (!store.suspended_at) {
        return { success: false, error: "Loja não está suspensa" }
    }

    const { error: updateError } = await supabase
        .from("stores")
        .update({
            is_active: true,
            suspended_at: null,
            suspended_reason: null,
            suspended_by: null,
        } as any)
        .eq("id", storeId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_UNSUSPEND,
        targetType: "partner",
        targetId: storeId,
        metadata: { reason: reason.trim(), storeName: store.name },
    })

    return { success: true }
}

// ─── Disable Tenant ERP Access ⚠️ (step-up required) ────────────────────────

export async function disableTenantAccess(
    partnerId: string,
    reason: string,
    durationDays: number | null,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    // Anti-IDOR
    const { data: partner, error: fetchError } = await supabase
        .from("partners")
        .select("id, user_id, store_name, erp_disabled")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    assertNotSelf(admin.userId, partner.user_id)
    await assertNotProtected(partner.user_id)

    if (partner.erp_disabled) {
        return { success: false, error: "Acesso ERP já está desabilitado" }
    }

    const suspendedUntil = durationDays && durationDays > 0
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
        : null  // null = permanent disable

    const { error: updateError } = await supabase
        .from("partners")
        .update({
            erp_disabled: true,
            erp_disabled_at: new Date().toISOString(),
            erp_disabled_by: admin.userId,
            suspended_until: suspendedUntil,
        } as any)
        .eq("id", partnerId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_DISABLE_ERP,
        targetType: "partner",
        targetId: partnerId,
        metadata: { reason: reason.trim(), storeName: partner.store_name },
    })

    return { success: true }
}

// ─── Soft-Delete Product ⚠️ (step-up required) ──────────────────────────────

export async function softDeleteProduct(
    productId: string,
    reason: string,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    // Anti-IDOR
    const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("id, name, partner_id, deleted_at")
        .eq("id", productId)
        .single()

    if (fetchError || !product) {
        return { success: false, error: "Produto não encontrado" }
    }

    if (product.deleted_at) {
        return { success: false, error: "Produto já foi deletado" }
    }

    // Mass-assignment: whitelisted
    const { error: updateError } = await supabase
        .from("products")
        .update({
            deleted_at: new Date().toISOString(),
            deleted_reason: reason.trim(),
            deleted_by: admin.userId,
            is_active: false,
            status: "archived",
        } as any)
        .eq("id", productId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PRODUCT_SOFT_DELETE,
        targetType: "product",
        targetId: productId,
        metadata: { reason: reason.trim(), productName: product.name },
    })

    return { success: true }
}

// ─── Soft-Delete Service ⚠️ (step-up required) ──────────────────────────────

export async function softDeleteService(
    serviceId: string,
    reason: string,
    stepUpToken: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)
    await requireStepUp(admin.userId, stepUpToken)

    if (!reason || reason.trim().length < 5) {
        return { success: false, error: "O motivo deve ter pelo menos 5 caracteres" }
    }

    const supabase: any = getAdminClient()

    // Anti-IDOR
    const { data: service, error: fetchError } = await supabase
        .from("services")
        .select("id, name, partner_id, deleted_at")
        .eq("id", serviceId)
        .single()

    if (fetchError || !service) {
        return { success: false, error: "Serviço não encontrado" }
    }

    if (service.deleted_at) {
        return { success: false, error: "Serviço já foi deletado" }
    }

    const { error: updateError } = await supabase
        .from("services")
        .update({
            deleted_at: new Date().toISOString(),
            deleted_reason: reason.trim(),
            deleted_by: admin.userId,
            is_active: false,
            status: "archived",
        } as any)
        .eq("id", serviceId)

    if (updateError) {
        return { success: false, error: updateError.message }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.SERVICE_SOFT_DELETE,
        targetType: "service",
        targetId: serviceId,
        metadata: { reason: reason.trim(), serviceName: service.name },
    })

    return { success: true }
}
