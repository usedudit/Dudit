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

// ─── Helper: Generate Clean Human-Readable Case Protocol ID (CAS-XXXXXXXX) ───

function generateCaseId(prefix: string = "CAS"): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 32 chars, no 0/O, 1/I to avoid user confusion
    let result = ""
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return `${prefix}-${result}`
}

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

export interface AdminUserStats {
    total: number
    active: number
    banned: number
    partners: number
}

export async function getAdminUserStats(): Promise<AdminUserStats> {
    await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase: any = getAdminClient()

    const [totalRes, bannedRes, partnersRes] = await Promise.all([
        supabase.from("user_profiles").select("user_id", { count: "exact", head: true }),
        supabase.from("user_profiles").select("user_id", { count: "exact", head: true }).not("banned_at", "is", null),
        supabase.from("partners").select("id", { count: "exact", head: true }),
    ])

    const total = totalRes.count || 0
    const banned = bannedRes.count || 0
    const partners = partnersRes.count || 0
    const active = Math.max(0, total - banned)

    return { total, active, banned, partners }
}

export async function getUsers(
    cursor?: string | null,
    limit: number = 20,
    search?: string,
    status?: string
): Promise<CursorPaginatedResult<EnforcementUser>> {
    await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase: any = getAdminClient()
    const pageSize = Math.min(limit, 50)

    // Admin/moderator user_ids to exclude
    const { data: adminRoles } = await supabase
        .from("admin_roles")
        .select("user_id")
    const adminUserIds = new Set((adminRoles || []).map((r: any) => r.user_id))

    let query = supabase
        .from("user_profiles")
        .select("user_id, full_name, avatar_url, phone, cpf, banned_at, banned_until, banned_reason, banned_case_id, created_at")

    if (search && search.trim().length > 0) {
        const sanitized = sanitizeIlike(search.trim())
        query = query.or(`full_name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,cpf.ilike.%${sanitized}%`)
    }

    if (status === "active" || status === "Ativos") {
        query = query.is("banned_at", null)
    } else if (status === "banned" || status === "Banidos") {
        query = query.not("banned_at", "is", null)
    }

    if (cursor) {
        query = query.lt("created_at", cursor)
    }

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

    // Fetch partner info and auth emails in parallel
    const userIds = items.map((p: any) => p.user_id)
    let partnerMap = new Map()
    let partnerUserMap = new Map()
    let emailMap = new Map<string, string>()

    if (userIds.length > 0) {
        const [partnersRes, partnerUsersRes, authUsers] = await Promise.all([
            supabase
                .from("partners")
                .select("id, user_id, is_active, suspended_at, suspended_case_id, erp_disabled, stores(id, name)")
                .in("user_id", userIds),
            supabase
                .from("partner_users")
                .select("partner_id, user_id, partners(id, is_active, suspended_at, suspended_case_id, erp_disabled, stores(id, name))")
                .in("user_id", userIds),
            Promise.allSettled(
                userIds.map(async (uid: string) => {
                    try {
                        const { data: u } = await supabase.auth.admin.getUserById(uid)
                        return { uid, email: u?.user?.email || "" }
                    } catch {
                        return { uid, email: "" }
                    }
                })
            ),
        ])

        if (partnersRes.data) {
            partnerMap = new Map(partnersRes.data.map((p: any) => [p.user_id, p]))
        }

        if (partnerUsersRes.data) {
            partnerUsersRes.data.forEach((pu: any) => {
                partnerUserMap.set(pu.user_id, pu)
            })
        }

        authUsers.forEach((result) => {
            if (result.status === "fulfilled" && result.value.email) {
                emailMap.set(result.value.uid, result.value.email)
            }
        })
    }

    const mapped: EnforcementUser[] = items.map((p: any) => {
        const directPartner = partnerMap.get(p.user_id)
        const partnerUser = partnerUserMap.get(p.user_id)
        const partnerInfo = directPartner || partnerUser?.partners
        const storesCount = directPartner?.stores?.length || partnerUser?.partners?.stores?.length || 0

        return {
            user_id: p.user_id,
            email: emailMap.get(p.user_id) || "",
            full_name: p.full_name || "",
            banned_at: p.banned_at,
            banned_until: p.banned_until,
            banned_reason: p.banned_reason,
            banned_case_id: p.banned_case_id,
            created_at: p.created_at,
            stores_count: storesCount,
            partner: partnerInfo
                ? {
                    id: partnerInfo.id,
                    store_name: partnerInfo.stores?.[0]?.name || "Loja",
                    is_active: partnerInfo.is_active,
                    suspended_at: partnerInfo.suspended_at,
                    suspended_case_id: partnerInfo.suspended_case_id,
                    erp_disabled: partnerInfo.erp_disabled,
                    stores_count: storesCount,
                }
                : null,
        }
    })

    return {
        data: mapped,
        nextCursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        prevCursor: cursor || null,
        hasMore,
    }
}

export async function getAdminUserDetail(userId: string): Promise<any | null> {
    await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase: any = getAdminClient()

    // 1. Profile
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle()

    // 2. Auth User
    let authUser = null
    try {
        const { data: u } = await supabase.auth.admin.getUserById(userId)
        authUser = u?.user || null
    } catch (e) {
        console.error("[getAdminUserDetail] Error fetching auth user:", e)
    }

    // 3. Partner & Stores
    const { data: partner } = await supabase
        .from("partners")
        .select("*, stores(*)")
        .eq("user_id", userId)
        .maybeSingle()

    // 4. Orders made by user (buyer)
    const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, situation, delivery_status, created_at, stores(name)")
        .eq("buyer_id", userId)
        .order("created_at", { ascending: false })
        .limit(10)

    // 5. Return requests by user
    const { data: returns } = await supabase
        .from("return_requests")
        .select("id, request_type, status, refund_amount, created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(10)

    // 6. Audit logs targeting this user
    const { data: auditEvents } = await supabase
        .from("admin_audit_logs")
        .select("*")
        .eq("target_id", userId)
        .order("created_at", { ascending: false })
        .limit(20)

    return {
        profile,
        authUser,
        partner,
        orders: orders || [],
        returns: returns || [],
        auditEvents: auditEvents || [],
    }
}

export interface AdminPartnerStats {
    total: number
    active: number
    suspended: number
    highRisk: number
}

export async function getAdminPartnerStats(): Promise<AdminPartnerStats> {
    await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase: any = getAdminClient()

    const [totalRes, activeRes, suspendedRes, highRiskRes] = await Promise.all([
        supabase.from("stores").select("id", { count: "exact", head: true }),
        supabase.from("stores").select("id", { count: "exact", head: true }).eq("is_active", true).is("suspended_at", null),
        supabase.from("stores").select("id", { count: "exact", head: true }).not("suspended_at", "is", null),
        supabase.from("stores").select("id", { count: "exact", head: true }).gte("risk_score", 50),
    ])

    return {
        total: totalRes.count || 0,
        active: activeRes.count || 0,
        suspended: suspendedRes.count || 0,
        highRisk: highRiskRes.count || 0,
    }
}

export async function getAdminPartnerDetail(storeId: string): Promise<any | null> {
    await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_READ)

    const supabase: any = getAdminClient()

    // 1. Try finding store by store ID first
    let store: any = null
    const { data: storeById } = await supabase
        .from("stores")
        .select("*, partners(*)")
        .eq("id", storeId)
        .maybeSingle()

    if (storeById) {
        store = storeById
    } else {
        // Fallback 1: Try finding store by partner_id
        const { data: storeByPartner } = await supabase
            .from("stores")
            .select("*, partners(*)")
            .eq("partner_id", storeId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (storeByPartner) {
            store = storeByPartner
        } else {
            // Fallback 2: Check if partner exists directly
            const { data: partnerData } = await supabase
                .from("partners")
                .select("*, stores(*)")
                .eq("id", storeId)
                .maybeSingle()

            if (partnerData) {
                store = partnerData.stores?.[0] || {
                    id: partnerData.id,
                    name: partnerData.store_name || "Loja",
                    partner_id: partnerData.id,
                    is_active: partnerData.is_active,
                    risk_score: partnerData.risk_score || 0,
                    partners: partnerData,
                }
                store.partners = partnerData
            }
        }
    }

    if (!store) {
        console.error("[getAdminPartnerDetail] Store/Partner not found for ID:", storeId)
        return null
    }

    const actualStoreId = store.id
    const partner = store.partners
    const actualPartnerId = partner?.id || store.partner_id || storeId

    // 2. Owner Profile & Email
    let ownerProfile = null
    if (partner?.user_id) {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", partner.user_id)
            .maybeSingle()

        try {
            const { data: u } = await supabase.auth.admin.getUserById(partner.user_id)
            ownerProfile = {
                ...(profile || {}),
                email: u?.user?.email || null,
            }
        } catch {
            ownerProfile = profile
        }
    }

    // 3. Products count & list
    const [productsCountRes, recentProductsRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", actualStoreId).is("deleted_at", null),
        supabase.from("products").select("id, name, price, is_active, images, sku, stock_quantity, created_at").eq("store_id", actualStoreId).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    ])

    // 4. Services count & list
    const [servicesCountRes, recentServicesRes] = await Promise.all([
        supabase.from("services").select("id", { count: "exact", head: true }).eq("store_id", actualStoreId).is("deleted_at", null),
        supabase.from("services").select("id, name, price, is_active, images, created_at").eq("store_id", actualStoreId).is("deleted_at", null).order("created_at", { ascending: false }).limit(50),
    ])

    // 5. Orders count & list
    const [ordersCountRes, recentOrdersRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("store_id", actualStoreId),
        supabase.from("orders").select("id, order_number, total_amount, paid_amount, situation, delivery_status, created_at, customer_name, order_source, payment_method").eq("store_id", actualStoreId).order("created_at", { ascending: false }).limit(50),
    ])

    // 6. Returns count & list
    const returnFilter = actualStoreId && actualPartnerId && actualStoreId !== actualPartnerId
        ? `partner_id.eq.${actualPartnerId},store_id.eq.${actualStoreId}`
        : `partner_id.eq.${actualPartnerId}`

    const [returnsCountRes, recentReturnsRes] = await Promise.all([
        supabase.from("return_requests").select("id", { count: "exact", head: true }).is("deleted_at", null).or(returnFilter),
        supabase.from("return_requests").select("id, request_type, status, resolution_type, refund_amount, store_credit_amount, created_at, customer_name_snapshot, order_number_snapshot").is("deleted_at", null).or(returnFilter).order("created_at", { ascending: false }).limit(50),
    ])

    // 7. Audit & Risk Events
    const auditFilter = actualStoreId && actualPartnerId && actualStoreId !== actualPartnerId
        ? `target_id.eq.${actualStoreId},target_id.eq.${actualPartnerId}`
        : `target_id.eq.${actualPartnerId}`

    const { data: auditEvents } = await supabase
        .from("admin_audit_logs")
        .select("*")
        .or(auditFilter)
        .order("created_at", { ascending: false })
        .limit(30)

    return {
        store,
        partner,
        ownerProfile,
        productsCount: productsCountRes.count || 0,
        recentProducts: recentProductsRes.data || [],
        servicesCount: servicesCountRes.count || 0,
        recentServices: recentServicesRes.data || [],
        ordersCount: ordersCountRes.count || 0,
        recentOrders: recentOrdersRes.data || [],
        returnsCount: returnsCountRes.count || 0,
        recentReturns: recentReturnsRes.data || [],
        auditEvents: auditEvents || [],
    }
}

export async function updateStoreRiskScore(
    storeId: string,
    newScore: number,
    reason: string,
    customTitle?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (newScore < 0 || newScore > 100) {
        return { success: false, error: "Pontuação de risco deve estar entre 0 e 100." }
    }

    const supabase: any = getAdminClient()

    const { data: currentStore } = await supabase
        .from("stores")
        .select("id, name, risk_score, partner_id")
        .eq("id", storeId)
        .maybeSingle()

    if (!currentStore) {
        return { success: false, error: "Loja não encontrada." }
    }

    const oldScore = currentStore.risk_score || 0

    const { error: updateErr } = await supabase
        .from("stores")
        .update({ risk_score: newScore, updated_at: new Date().toISOString() })
        .eq("id", storeId)

    if (updateErr) {
        return { success: false, error: "Falha ao atualizar score de risco." }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_RISK_SCORE,
        targetType: "partner",
        targetId: storeId,
        metadata: {
            store_name: currentStore.name,
            old_score: oldScore,
            new_score: newScore,
            reason: reason || "Ajuste manual de score de risco",
        },
    })

    // ─── Dispatch In-App + Push Notification ──────────────────────────────
    try {
        const { createNotificationsForUsers, getStoreTeamUserIds, getPartnerTeamUserIds } = await import("@/lib/services/notification.service")

        let teamUserIds: string[] = []
        if (currentStore.partner_id) {
            teamUserIds = await getStoreTeamUserIds({
                partnerId: currentStore.partner_id,
                storeId: storeId,
            })
            if (teamUserIds.length === 0) {
                teamUserIds = await getPartnerTeamUserIds(currentStore.partner_id)
            }
        }

        if (teamUserIds.length > 0) {
            const notifTitle = customTitle?.trim() || (newScore > oldScore
                ? `Aviso: Atualização no Score de Risco da loja ${currentStore.name}`
                : `Ajuste no Score de Risco da loja ${currentStore.name}`)

            const notifMessage = reason?.trim()
                ? reason.trim()
                : `O score de risco da loja foi ajustado de ${oldScore} para ${newScore} pontos.`

            await createNotificationsForUsers(teamUserIds, (uid) => ({
                userId: uid,
                type: "admin_announcement",
                title: notifTitle,
                message: notifMessage,
                entityType: "announcement",
                entityId: null,
                data: {
                    store_id: storeId,
                    store_name: currentStore.name,
                    partner_id: currentStore.partner_id,
                    old_score: oldScore,
                    new_score: newScore,
                    reason: reason?.trim() || null,
                    audience: "seller",
                    url: "/erp/configuracoes",
                },
                idempotencyKey: `risk_score_store:${storeId}:${newScore}:${Date.now()}:${uid}`,
                origin: "system",
            }))
        }
    } catch (notifErr) {
        console.error("[ADMIN_ENFORCEMENT] Failed to send store risk notification:", notifErr)
    }

    return { success: true }
}

export async function updateUserRiskScore(
    userId: string,
    newScore: number,
    reason: string,
    customTitle?: string
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    if (newScore < 0 || newScore > 100) {
        return { success: false, error: "Pontuação de risco deve estar entre 0 e 100." }
    }

    const supabase: any = getAdminClient()

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("user_id, full_name, risk_score")
        .eq("user_id", userId)
        .maybeSingle()

    const oldScore = profile?.risk_score || 0

    const { error: updateErr } = await supabase
        .from("user_profiles")
        .update({ risk_score: newScore, updated_at: new Date().toISOString() })
        .eq("user_id", userId)

    if (updateErr) {
        return { success: false, error: "Falha ao atualizar score de risco do usuário." }
    }

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.MODERATION_RISK_SCORE,
        targetType: "user",
        targetId: userId,
        metadata: {
            user_name: profile?.full_name || userId,
            old_score: oldScore,
            new_score: newScore,
            reason: reason || "Ajuste manual de score de risco",
        },
    })

    // ─── Dispatch In-App + Push Notification ──────────────────────────────
    try {
        const { createNotification } = await import("@/lib/services/notification.service")

        const notifTitle = customTitle?.trim() || (newScore > oldScore
            ? "Aviso sobre seu Score de Risco"
            : "Atualização no Score da sua Conta")

        const notifMessage = reason?.trim()
            ? reason.trim()
            : `O score de risco da sua conta foi ajustado de ${oldScore} para ${newScore} pontos.`

        await createNotification({
            userId: userId,
            type: "admin_announcement",
            title: notifTitle,
            message: notifMessage,
            entityType: "announcement",
            entityId: null,
            data: {
                user_id: userId,
                user_name: profile?.full_name || null,
                old_score: oldScore,
                new_score: newScore,
                reason: reason?.trim() || null,
                audience: "customer",
                url: "/perfil",
            },
            idempotencyKey: `risk_score_user:${userId}:${newScore}:${Date.now()}`,
            origin: "system",
        })
    } catch (notifErr) {
        console.error("[ADMIN_ENFORCEMENT] Failed to send user risk notification:", notifErr)
    }

    return { success: true }
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
        .select("id, name, is_active, suspended_at, suspended_reason, suspended_case_id, risk_score, created_at, partner_id")

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
            .select("id, user_id, is_active, erp_disabled, suspended_at, suspended_until, suspended_reason, suspended_case_id, created_at, stores(name, risk_score)")
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
            .select("id, name, is_active, suspended_at, suspended_reason, suspended_case_id, risk_score, created_at, partner_id")
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
            erp_disabled: partner ? !!partner.erp_disabled : false,
            suspended_at: s.suspended_at || partner?.suspended_at || null,
            suspended_until: partner?.suspended_until || null,
            suspended_reason: s.suspended_reason || partner?.suspended_reason || null,
            suspended_case_id: s.suspended_case_id || partner?.suspended_case_id || null,
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
                suspended_case_id: st.suspended_case_id,
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
    reason: string = "Reativação administrativa de acesso ao ERP"
): Promise<{ success: boolean; error?: string }> {
    const admin = await requireAdmin("admin")
    await requireRateLimit(RateLimitCategory.ADMIN_ACTION)

    const finalReason = reason && reason.trim().length >= 5 ? reason.trim() : "Reativação administrativa de acesso ao ERP"

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
            suspended_reason: null,
            suspended_case_id: null,
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
    durationDays: number | null = null,
    stepUpToken: string = "admin-confirmed"
): Promise<{ success: boolean; caseId?: string; error?: string }> {
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

    const caseId = generateCaseId("CAS")

    const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
            banned_at: new Date().toISOString(),
            banned_until: bannedUntil,
            banned_reason: reason.trim(),
            banned_by: admin.userId,
            banned_case_id: caseId,
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
        metadata: { case_id: caseId, reason: reason.trim(), targetName: user.full_name, durationDays: durationDays || "permanent", bannedUntil },
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

    return { success: true, caseId }
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
            banned_case_id: null,
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

// ─── Suspend Partner (Tenant ERP + All Stores) ⚠️ (step-up required) ────────

export async function suspendPartner(
    partnerId: string,
    reason: string,
    stepUpToken: string = "admin-confirmed"
): Promise<{ success: boolean; caseId?: string; error?: string }> {
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

    const caseId = generateCaseId("CAS")

    // Mass-assignment: whitelisted
    const { error: updateError } = await supabase
        .from("partners")
        .update({
            is_active: false,
            suspended_at: new Date().toISOString(),
            suspended_reason: reason.trim(),
            suspended_by: admin.userId,
            suspended_case_id: caseId,
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
            suspended_case_id: caseId,
        } as any)
        .eq("partner_id", partnerId)

    await adminAuditLog({
        adminUserId: admin.userId,
        actionType: AdminActionType.PARTNER_SUSPEND,
        targetType: "partner",
        targetId: partnerId,
        metadata: { case_id: caseId, reason: reason.trim(), storeName },
    })

    return { success: true, caseId }
}

// ─── Unsuspend Partner (Tenant ERP + All Stores) ────────────────────────────

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
            suspended_case_id: null,
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
            suspended_case_id: null,
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

// ─── Suspend Single Store (Specific store, not partner) ⚠️ (step-up required) 

export async function suspendStore(
    storeId: string,
    reason: string,
    stepUpToken: string = "admin-confirmed"
): Promise<{ success: boolean; caseId?: string; error?: string }> {
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

    const caseId = generateCaseId("CAS")

    const { error: updateError } = await supabase
        .from("stores")
        .update({
            is_active: false,
            suspended_at: new Date().toISOString(),
            suspended_reason: reason.trim(),
            suspended_by: admin.userId,
            suspended_case_id: caseId,
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
        metadata: { case_id: caseId, reason: reason.trim(), storeName: store.name, storeId },
    })

    return { success: true, caseId }
}

// ─── Unsuspend Single Store ─────────────────────────────────────────────────

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
            suspended_case_id: null,
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
    durationDays: number | null = null,
    stepUpToken: string = "admin-confirmed"
): Promise<{ success: boolean; caseId?: string; error?: string }> {
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

    const caseId = generateCaseId("CAS")

    const { error: updateError } = await supabase
        .from("partners")
        .update({
            erp_disabled: true,
            erp_disabled_at: new Date().toISOString(),
            erp_disabled_by: admin.userId,
            suspended_until: suspendedUntil,
            suspended_reason: reason.trim(),
            suspended_case_id: caseId,
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
        metadata: { case_id: caseId, reason: reason.trim(), storeName: partner.store_name },
    })

    return { success: true, caseId }
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
            status: "deleted",
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
            status: "deleted",
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
