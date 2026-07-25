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
            .from("stores")
            .select("risk_score")
            .eq("partner_id", partnerId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle() as { data: { risk_score: number } | null }
        const current = data?.risk_score || 0
        const newScore = Math.min(current + points, 100)
        await adminClient
            .from("stores")
            .update({ risk_score: newScore } as any)
            .eq("partner_id", partnerId)
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
            .select("id, user_id, is_active, suspended_at, erp_disabled, stores(name)")
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
                store_name: partnerMap.get(p.user_id)!.stores?.[0]?.name,
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
// Now returns STORES as primary list items. Partners appear only in the detail sheet.

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

    // Main query: fetch stores with partner info
    let storeQuery = supabase
        .from("stores")
        .select("id, name, is_active, suspended_at, suspended_reason, risk_score, created_at, partner_id")

    if (search && search.trim().length > 0) {
        const sanitized = sanitizeIlike(search.trim())
        storeQuery = storeQuery.ilike("name", `%${sanitized}%`)
    }

    if (status === "active") {
        storeQuery = storeQuery.eq("is_active", true).is("suspended_at", null)
    } else if (status === "suspended") {
        storeQuery = storeQuery.not("suspended_at", "is", null)
    } else if (status === "erp_disabled") {
        storeQuery = storeQuery.eq("is_active", false)
    }

    if (cursor) {
        storeQuery = storeQuery.lt("created_at", cursor)
    }

    storeQuery = storeQuery.order("created_at", { ascending: false }).limit(pageSize + 1)

    const { data: stores, error } = await storeQuery

    if (error) {
        console.error("[ADMIN_ENFORCEMENT] Failed to fetch stores:", error.message)
        return { data: [], nextCursor: null, prevCursor: null, hasMore: false }
    }

    const hasMore = (stores?.length || 0) > pageSize
    const items = (stores || []).slice(0, pageSize)

    // Fetch partner info + owner names for each store
    const partnerIds = [...new Set(items.map((s: any) => s.partner_id).filter(Boolean))]
    let partnerMap = new Map<string, any>()
    let ownerMap = new Map<string, string>()
    if (partnerIds.length > 0) {
        const { data: partners } = await supabase
            .from("partners")
            .select("id, user_id, is_active, erp_disabled, suspended_at, suspended_until, created_at, stores(name, risk_score)")
            .in("id", partnerIds)
        if (partners) {
            partnerMap = new Map(partners.map((p: any) => [p.id, p]))
        }

        const ownerIds = [...new Set(partners.map((p: any) => p.user_id).filter(Boolean))]
        if (ownerIds.length > 0) {
            const { data: owners } = await supabase
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", ownerIds)
            ownerMap = new Map((owners || []).map((o: any) => [o.user_id, o.full_name]))
        }
    }

    // Build a map of partner_id -> all their stores (for detail sheet)
    let allStoresByPartner = new Map<string, any[]>()
    if (partnerIds.length > 0) {
        const { data: allStores } = await supabase
            .from("stores")
            .select("id, name, is_active, suspended_at, suspended_reason, risk_score, created_at, partner_id")
            .in("partner_id", partnerIds)
        if (allStores) {
            for (const s of allStores) {
                const list = allStoresByPartner.get(s.partner_id) || []
                list.push(s)
                allStoresByPartner.set(s.partner_id, list)
            }
        }
    }

    const mapped: EnforcementPartner[] = items.map((s: any) => {
        const partner = partnerMap.get(s.partner_id)
        return {
            id: s.id,
            store_name: `${s.name} (${partner?.store_name || "Sem parceiro"})`,
            owner_name: ownerMap.get(partner?.user_id) || "Desconhecido",
            owner_user_id: partner?.user_id || "",
            is_active: s.is_active,
            erp_disabled: !s.is_active,
            suspended_at: s.suspended_at,
            suspended_until: null,
            risk_score: s.risk_score || 0,
            created_at: s.created_at,
            partner_id: s.partner_id,
            type: "store",
            stores: allStoresByPartner.get(s.partner_id)?.map((st: any) => ({
                id: st.id,
                name: st.name,
                is_active: st.is_active,
                suspended_at: st.suspended_at,
                suspended_reason: st.suspended_reason,
                risk_score: st.risk_score || 0,
                created_at: st.created_at,
                partner_id: st.partner_id,
            })),
        }
    })

    return {
        data: mapped,
        nextCursor: hasMore && mapped.length > 0 ? mapped[mapped.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
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
        .select("id, erp_disabled")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    // Get store name from stores table
    const { data: hqStore } = await supabase
        .from("stores")
        .select("name")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    const storeName = hqStore?.name || "Loja"

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
        metadata: { reason: reason.trim(), storeName },
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
        .select("id, user_id, is_active, suspended_at")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    // Get store name from stores table
    const { data: hqStore } = await supabase
        .from("stores")
        .select("name")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    const storeName = hqStore?.name || "Loja"

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

    // Also suspend all stores of this partner
    await supabase
        .from("stores")
        .update({
            is_active: false,
            suspended_at: new Date().toISOString(),
            suspended_reason: `Parceiro suspenso: ${reason.trim()}`,
            suspended_by: admin.userId,
        } as any)
        .eq("partner_id", partnerId)

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_SUSPEND,
        targetType: "partner",
        targetId: partnerId,
        metadata: { reason: reason.trim(), storeName },
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
        .select("id, suspended_at")
        .eq("id", partnerId)
        .single()

    if (fetchError || !partner) {
        return { success: false, error: "Parceiro não encontrado" }
    }

    // Get store name from stores table
    const { data: hqStore } = await supabase
        .from("stores")
        .select("name")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    const storeName = hqStore?.name || "Loja"

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

    // Also unsuspend all stores of this partner
    await supabase
        .from("stores")
        .update({
            is_active: true,
            suspended_at: null,
            suspended_reason: null,
            suspended_by: null,
        } as any)
        .eq("partner_id", partnerId)

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_UNSUSPEND,
        targetType: "partner",
        targetId: partnerId,
        metadata: { reason: reason.trim(), storeName },
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
        .select("id, user_id, erp_disabled")
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
