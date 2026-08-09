import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import type { RoleId, RbacPermissions } from "@/lib/permissions/rbac-types"
import type { PartnerRole } from "@/lib/permissions/types"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { normalizeBusinessInfo } from "@/lib/business-info"

const ACTIVE_PARTNER_COOKIE = "active_partner_id"
const ACTIVE_STORE_COOKIE = "active_store_id"
const PENDING_INVITE_COOKIE = "pending_invite_token"

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PartnerContext {
    userId: string
    partnerId: string
    activeStoreId: string | null
    /** @deprecated Use roleId (lowercase DB id). */
    role: PartnerRole
    roleId: RoleId
    permissions: RbacPermissions
    businessInfo: any // Added for feature flags
}

export interface PartnerAccessRecord {
    partnerId: string
    userId: string
    /** @deprecated Use roleId (lowercase DB id). */
    role: PartnerRole
    roleId: RoleId
    permissions: RbacPermissions
    storeName: string
    ownerName: string | null
    businessInfo: any // Added for feature flags
}

export interface StoreAccessRecord {
    storeId: string
    storeName: string
    partnerId: string
    partnerName: string
    userId: string
    roleId: RoleId
    role: PartnerRole
    permissions: RbacPermissions
    isOwn: boolean
    ownerName: string | null
    businessInfo: any
    /** True quando o storeId é a matriz (is_headquarters) do parceiro. */
    isHeadquarters: boolean
}

// ─── Active Partner Cookie Management ───────────────────────────────────────

/**
 * Sets the active partner ID in a secure HttpOnly cookie.
 * Used after ERP selection or invitation acceptance.
 */
export async function setActivePartner(partnerId: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_PARTNER_COOKIE, partnerId, COOKIE_OPTIONS)
}

/**
 * Clears the active partner cookie.
 * Used when switching ERPs or logging out.
 */
export async function clearActivePartner(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(ACTIVE_PARTNER_COOKIE)
}

/**
 * Reads the active partner ID from the cookie.
 * Returns null if no active partner is set.
 */
export async function getActivePartnerId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get(ACTIVE_PARTNER_COOKIE)?.value ?? null
}

// ─── Pending Invite Token Cookie ────────────────────────────────────────────

/**
 * Stores the invite token in a short-lived HttpOnly cookie.
 * Used to persist the token through the auth flow (login/register).
 */
export async function setPendingInviteToken(token: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.set(PENDING_INVITE_COOKIE, token, {
        ...COOKIE_OPTIONS,
        maxAge: 60 * 30, // 30 minutes - enough for auth flow
    })
}

/**
 * Reads and clears the pending invite token cookie.
 * Returns null if no pending invite.
 */
export async function consumePendingInviteToken(): Promise<string | null> {
    const cookieStore = await cookies()
    const token = cookieStore.get(PENDING_INVITE_COOKIE)?.value ?? null
    if (token) {
        cookieStore.delete(PENDING_INVITE_COOKIE)
    }
    return token
}

/**
 * Reads the pending invite token without clearing it.
 */
export async function getPendingInviteToken(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get(PENDING_INVITE_COOKIE)?.value ?? null
}

// ─── Active Store Cookie Management ─────────────────────────────────────────

/**
 * Sets the active store ID in a secure HttpOnly cookie.
 * Used when user switches store via StoreSwitcher.
 * This cookie is UI context only - authorization is always validated server-side.
 */
export async function setActiveStore(storeId: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_STORE_COOKIE, storeId, COOKIE_OPTIONS)
}

/**
 * Clears the active store cookie.
 * Used when switching partners or logging out.
 */
export async function clearActiveStore(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(ACTIVE_STORE_COOKIE)
}

/**
 * Reads the active store ID from the cookie.
 * Returns null if no active store is set.
 * This is UI context only - never trust this for authorization.
 */
export async function getActiveStoreId(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? null
}

// ─── Partner Context Resolution ─────────────────────────────────────────────

import { getPermissionTemplate } from "@/lib/permissions/rbac-template-loader"
import { normalizePermissions } from "@/lib/permissions/rbac-normalize"

// ─── Extracted Cache Factory for stability and strict keying ────────────────
//
// unstable_cache must NOT call cookies(), headers(), or createClient() (session).
// We load access by userId using the service role; userId is always resolved from
// getCurrentUser() outside this scope, so rows cannot cross users.

const fetchUserAccessStatic = (userId: string) => unstable_cache(
    async (): Promise<PartnerAccessRecord[]> => {
        const admin = createAdminClient()
        const template = await getPermissionTemplate()

        const [ownedPartnersRes, invitedRowsRes] = await Promise.all([
            admin.from("partners")
                .select("id, user_id, business_info, is_active, erp_disabled, stores(name)")
                .eq("user_id", userId),
            admin.from("partner_users")
                .select("id, partner_id, user_id, role_id, permissions")
                .eq("user_id", userId)
        ])

        const ownedPartners = ownedPartnersRes.data || []
        const invitedRows = invitedRowsRes.data || []

        const accessRecords: Record<string, PartnerAccessRecord> = {}
        const ownedPartnerIds = new Set<string>()

        for (const partner of ownedPartners) {
            if (partner.is_active === false || partner.erp_disabled === true) {
                continue
            }
            ownedPartnerIds.add(partner.id)
            const storeName = partner.stores?.[0]?.name || "Loja sem nome"
            accessRecords[partner.id] = {
                partnerId: partner.id,
                userId: userId,
                role: "OWNER" as PartnerRole,
                roleId: "owner",
                permissions: normalizePermissions(template, {}),
                storeName,
                ownerName: "Você",
                businessInfo: normalizeBusinessInfo(partner.business_info),
            }
        }

        const invitedPartnerIds = ([...new Set(invitedRows.map((r: any) => String(r.partner_id)))] as string[])
            .filter((id: string) => !ownedPartnerIds.has(id))

        if (invitedPartnerIds.length > 0) {
            const [invitedPartnersRes, storesRes, rolesRes] = await Promise.all([
                admin.from("partners")
                    .select("id, user_id, business_info, is_active, erp_disabled")
                    .in("id", invitedPartnerIds),
                admin.from("stores")
                    .select("id, name, partner_id, is_headquarters")
                    .in("partner_id", invitedPartnerIds),
                admin.from("roles")
                    .select("id, permissions")
            ])

            const partnerMap = new Map<string, any>((invitedPartnersRes.data || []).map((p: any) => [p.id, p]))
            const storeNameMap = new Map<string, string>()
            for (const s of (storesRes.data || []) as any[]) {
                if (!storeNameMap.has(s.partner_id) || s.is_headquarters) {
                    storeNameMap.set(s.partner_id, s.name)
                }
            }
            const rolePermsMap = new Map<string, any>((rolesRes.data || []).map((r: any) => [String(r.id).toLowerCase(), r.permissions]))

            const ownerUserIds = new Set<string>()
            for (const p of (invitedPartnersRes.data || []) as any[]) {
                if (p.user_id) ownerUserIds.add(p.user_id)
            }

            let ownerNameMap = new Map<string, string>()
            if (ownerUserIds.size > 0) {
                const { data: profiles } = await admin.from("user_profiles")
                    .select("user_id, full_name")
                    .in("user_id", Array.from(ownerUserIds))
                if (profiles) {
                    ownerNameMap = new Map((profiles as any[]).map((p: any) => [p.user_id, p.full_name]))
                }
            }

            for (const record of invitedRows as any[]) {
                const partner = partnerMap.get(record.partner_id)
                if (!partner) continue
                if (partner.is_active === false || partner.erp_disabled === true) continue

                if (!accessRecords[record.partner_id]) {
                    const roleId = (String(record.role_id || "delivery").toLowerCase() as RoleId)
                    const dbPerms = record.permissions || rolePermsMap.get(roleId) || undefined
                    const storeName = storeNameMap.get(record.partner_id) || "Loja sem nome"
                    const ownerName = partner.user_id ? (ownerNameMap.get(partner.user_id) || "Desconhecido") : "Desconhecido"

                    accessRecords[record.partner_id] = {
                        partnerId: record.partner_id,
                        userId: record.user_id,
                        role: String(roleId).toUpperCase() as PartnerRole,
                        roleId,
                        permissions: normalizePermissions(template, dbPerms),
                        storeName,
                        ownerName,
                        businessInfo: normalizeBusinessInfo(partner.business_info),
                    }
                }
            }
        }

        return Object.values(accessRecords)
    },
    [TAGS.userAccess(userId)],
    {
        tags: [TAGS.userAccess(userId)],
        revalidate: 900
    }
);

const getCachedUserAccess = async (userId: string) => fetchUserAccessStatic(userId)()

import type { User } from "@supabase/supabase-js"

export interface RequestContext {
    user: User | null
    activePartner: PartnerContext | null
    allPartners: PartnerAccessRecord[]
}

/**
 * Unified request-scoped context resolver.
 * Resolves user, active partner context, and all partner access records in parallel.
 * Reused by Server Actions and server components during a single request.
 */
export const getCurrentContext = cache(async (): Promise<RequestContext> => {
    const user = await getCurrentUser()
    if (!user) {
        return { user: null, activePartner: null, allPartners: [] }
    }

    const [allPartners, activePartner] = await Promise.all([
        getAllUserPartnerAccess(user),
        getCurrentPartnerContext(user),
    ])

    return {
        user,
        activePartner,
        allPartners,
    }
})

/**
 * Gets ALL partner access records for the current user.
 * Built safely using cache factory injection and real fallback logic.
 */
export const getAllUserPartnerAccess = cache(async (resolvedUser?: any): Promise<PartnerAccessRecord[]> => {
    const user = resolvedUser || await getCurrentUser()
    if (!user) return []

    const records = await getCachedUserAccess(user.id);
    return records;
})

/**
 * Returns the count of unique partner access records for the current user.
 * Used by the ERP layout to decide whether to show the selection screen.
 */
export const getUserPartnerCount = cache(async (): Promise<number> => {
    const access = await getAllUserPartnerAccess()
    return access.length
})

// ─── Store-Level Access ───────────────────────────────────────────────────────

const getCachedUserStoreAccess = (userId: string) => unstable_cache(
    async () => {
        const admin = createAdminClient()
        const template = await getPermissionTemplate()

        // Get all partner_ids the user has access to (owned + invited)
        const [ownedPartnersRes, invitedRes] = await Promise.all([
            admin.from("partners").select("id, user_id, business_info").eq("user_id", userId).eq("is_active", true).neq("erp_disabled", true),
            admin.from("partner_users").select("id, partner_id, role_id").eq("user_id", userId)
        ])

        const ownedPartners = (ownedPartnersRes.data || []) as any[]
        const invitedRows = (invitedRes.data || []) as any[]
        const ownedPartnerIds = ownedPartners.map((p: any) => p.id)
        const invitedPartnerIds = [...new Set(invitedRows.map((pu: any) => pu.partner_id))]
        const allPartnerIds = [...new Set([...ownedPartnerIds, ...invitedPartnerIds])]

        if (allPartnerIds.length === 0) return []

        // Get all stores for these partners
        const { data: stores } = await admin.from("stores")
            .select("id, name, partner_id, is_headquarters")
            .in("partner_id", allPartnerIds)

        if (!stores || stores.length === 0) return []

        // store_members do usuário: define a quais lojas ele tem acesso nos
        // parceiros onde foi convidado (dono tem bypass via partners.user_id)
        const invitedPartnerUserIds = invitedRows.map((pu: any) => pu.id)
        const memberStores = new Map<string, Set<string>>() // partnerUserId -> storeIds
        const memberRoleByStore = new Map<string, Map<string, string | null>>() // partnerUserId -> storeId -> role
        if (invitedPartnerUserIds.length > 0) {
            const { data: storeMembers } = await admin.from("store_members")
                .select("store_id, partner_user_id, role")
                .in("partner_user_id", invitedPartnerUserIds)
            for (const sm of storeMembers || []) {
                if (!memberStores.has(sm.partner_user_id)) memberStores.set(sm.partner_user_id, new Set())
                memberStores.get(sm.partner_user_id)!.add(sm.store_id)
                if (!memberRoleByStore.has(sm.partner_user_id)) memberRoleByStore.set(sm.partner_user_id, new Map())
                memberRoleByStore.get(sm.partner_user_id)!.set(sm.store_id, sm.role)
            }
        }

        // Partner names + owner resolution in batch (no N+1)
        const { data: partners } = await admin.from("partners")
            .select("id, user_id, business_info")
            .in("id", allPartnerIds)
        const partnerById = new Map<string, any>()
        for (const p of partners || []) partnerById.set(p.id, p)

        const ownerUserIds = new Set<string>()
        for (const p of partners || []) if (p.user_id) ownerUserIds.add(p.user_id)
        const ownerNames = new Map<string, string>()
        if (ownerUserIds.size > 0) {
            const { data: profiles } = await admin.from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", Array.from(ownerUserIds))
            for (const prof of profiles || []) ownerNames.set(prof.user_id, prof.full_name)
        }

        const storeById = new Map<string, any>()
        for (const s of stores) storeById.set(s.id, s)

        const partnerNameOf = (partnerId: string): string => {
            const p = partnerById.get(partnerId)
            const biz = p?.business_info as any
            return biz?.nome_fantasia || biz?.razao_social || "Parceiro"
        }

        const partnerOwnerNameOf = (partnerId: string): string => {
            const ownerId = partnerById.get(partnerId)?.user_id
            return ownerId ? ownerNames.get(ownerId) || "Desconhecido" : "Desconhecido"
        }

        // Normaliza role para o id canônico (lowercase). store_members.role é a
        // coluna legacy uppercase (ex.: "MANAGER"); partner_users.role_id é canônica.
        const normalizeRoleId = (raw: string | null | undefined, fallback: RoleId = "delivery"): RoleId => {
            switch (String(raw || "").trim().toLowerCase()) {
                case "owner": return "owner"
                case "admin": return "admin"
                case "manager": return "manager"
                case "operator": return "operator"
                case "delivery": return "delivery"
                case "editor": return "operator"
                case "viewer": return "delivery"
                default: return fallback
            }
        }

        const pickHeadquarters = (partnerStores: any[]) =>
            partnerStores.find((s: any) => s.is_headquarters === true) || partnerStores[0]

        const storeRecords: StoreAccessRecord[] = []

        // ── ERPs próprios: 1 card por parceiro (matriz). O usuário troca de
        //    filial depois de entrar (StoreSwitcher) ──
        for (const partner of ownedPartners) {
            const partnerStores = stores.filter((s: any) => s.partner_id === partner.id)
            if (partnerStores.length === 0) continue
            const hq = pickHeadquarters(partnerStores)

            storeRecords.push({
                storeId: hq.id,
                storeName: hq.name,
                partnerId: partner.id,
                partnerName: partnerNameOf(partner.id),
                userId,
                roleId: "owner",
                role: "OWNER" as PartnerRole,
                permissions: normalizePermissions(template, {}),
                isOwn: true,
                ownerName: "Você",
                businessInfo: null,
                isHeadquarters: true,
            })
        }

        // ── Lojas convidadas (outros parceiros): 1 card por loja com o cargo
        //    real. Convites legados aceitos sem store_members caem na matriz ──
        for (const pu of invitedRows) {
            if (ownedPartnerIds.includes(pu.partner_id)) continue // dono já coberto acima
            const partner = partnerById.get(pu.partner_id)
            if (!partner) continue
            if (partner.is_active === false || partner.erp_disabled === true) continue

            const partnerStores = stores.filter((s: any) => s.partner_id === pu.partner_id)
            if (partnerStores.length === 0) continue

            const baseRoleId = normalizeRoleId(pu.role_id, "delivery")
            const storeIds = memberStores.get(pu.id) || new Set<string>()
            const roleByStore = memberRoleByStore.get(pu.id) || new Map<string, string | null>()

            if (storeIds.size === 0) {
                // Fallback defensivo: convite legado sem store_members → matriz
                const hq = pickHeadquarters(partnerStores)
                storeRecords.push({
                    storeId: hq.id,
                    storeName: hq.name,
                    partnerId: pu.partner_id,
                    partnerName: partnerNameOf(pu.partner_id),
                    userId,
                    roleId: baseRoleId,
                    role: baseRoleId.toUpperCase() as PartnerRole,
                    permissions: normalizePermissions(template, undefined),
                    isOwn: false,
                    ownerName: partnerOwnerNameOf(pu.partner_id),
                    businessInfo: null,
                    isHeadquarters: true,
                })
                continue
            }

            for (const sid of storeIds) {
                const store = storeById.get(sid)
                if (!store) continue
                const roleId = normalizeRoleId(roleByStore.get(sid) ?? null, baseRoleId)

                storeRecords.push({
                    storeId: store.id,
                    storeName: store.name,
                    partnerId: pu.partner_id,
                    partnerName: partnerNameOf(pu.partner_id),
                    userId,
                    roleId,
                    role: roleId.toUpperCase() as PartnerRole,
                    permissions: normalizePermissions(template, undefined),
                    isOwn: false,
                    ownerName: partnerOwnerNameOf(pu.partner_id),
                    businessInfo: null,
                    isHeadquarters: store.is_headquarters === true,
                })
            }
        }

        return storeRecords
    },
    [TAGS.userAccess(userId)],
    {
        tags: [TAGS.userAccess(userId)],
        revalidate: 900
    }
)

/**
 * Gets ALL store access records for the current user.
 * Returns stores the user has access to (owned partners' stores + store_members for invited).
 */
export const getAllUserStoreAccess = cache(async (resolvedUser?: any): Promise<StoreAccessRecord[]> => {
    const user = resolvedUser || await getCurrentUser()
    if (!user) return []

    const records = await getCachedUserStoreAccess(user.id)()
    return records
})

const checkRealTimePartnerAccess = (partnerId: string, userId: string) => unstable_cache(
    async () => {
        try {
            const admin = createAdminClient()
            const { data: stillHasAccess, error: accessError } = await admin.rpc("user_has_partner_access", {
                p_partner_id: partnerId,
                p_user_id: userId,
            })
            if (accessError) {
                console.error("[checkRealTimePartnerAccess] RPC error:", accessError)
                return { stillHasAccess: false, hasError: true }
            }
            return { stillHasAccess: stillHasAccess === true, hasError: false }
        } catch (err) {
            console.error("[checkRealTimePartnerAccess] unexpected error:", err)
            return { stillHasAccess: false, hasError: true }
        }
    },
    [`realtime-access-${userId}-${partnerId}`],
    {
        tags: [`realtime-access-${userId}-${partnerId}`],
        revalidate: 30 // 30 seconds
    }
)

async function resolveDefaultStoreId(partnerId: string): Promise<string | null> {
    try {
        const admin = createAdminClient()
        const { data: stores } = await admin.from("stores").select("id, is_headquarters").eq("partner_id", partnerId).order("created_at", { ascending: true })
        if (stores && stores.length > 0) {
            const hq = stores.find((s: any) => s.is_headquarters) || stores[0]
            return hq.id
        }
    } catch (e) {
        console.error("Error resolving default store id:", e)
    }
    return null
}

/**
 * Gets the current authenticated user's partner context.
 * 
 * Resolution order:
 * 1. If `active_partner_id` cookie is set → validate against all available access
 * 2. If no valid cookie → if user has exactly 1 access, use it
 * 3. Otherwise return null (indicating they need to select or create)
 */
export const getCurrentPartnerContext = cache(async (resolvedUser?: any): Promise<PartnerContext | null> => {
    const user = resolvedUser || await getCurrentUser()
    if (!user) return null

    const allAccess = await getAllUserPartnerAccess(user)
    if (allAccess.length === 0) return null

    const activePartnerId = await getActivePartnerId()

    if (activePartnerId) {
        const match = allAccess.find(a => a.partnerId === activePartnerId)
        if (match) {
            // Real-time DB check: verify the user still has access (defense against stale cache)
            // This prevents removed users from accessing the ERP during the cache TTL window.
            // P1: usa uma única RPC (owner OR membro) em vez de 2 queries separadas por request.
            const { stillHasAccess, hasError } = await checkRealTimePartnerAccess(activePartnerId, user.id)()

            // Em caso de erro inesperado na RPC, não bloqueamos o acesso já validado pelo cache.
            if (!hasError && stillHasAccess === false) {
                // Access revoked - clear stale cookie and invalidate cached access
                await clearActivePartner()
                const { revalidateUserAccess } = await import("@/lib/utils/revalidation")
                revalidateUserAccess(user.id)
                return null
            }

            let activeStoreId = await getActiveStoreId()
            if (activeStoreId) {
                const admin = createAdminClient()
                const { data: validStore } = await admin.from("stores").select("id").eq("id", activeStoreId).eq("partner_id", match.partnerId).maybeSingle()
                if (!validStore) {
                    activeStoreId = await resolveDefaultStoreId(match.partnerId)
                }
            } else {
                activeStoreId = await resolveDefaultStoreId(match.partnerId)
            }

            return {
                userId: match.userId,
                partnerId: match.partnerId,
                activeStoreId,
                role: match.role,
                roleId: match.roleId,
                permissions: match.permissions,
                businessInfo: match.businessInfo,
            }
        }
    }

    // If no valid cookie, and they only have 1 ERP that belongs to them, auto-resolve
    if (allAccess.length === 1 && allAccess[0].roleId === "owner") {
        const match = allAccess[0]
        let activeStoreId = await getActiveStoreId()
        if (!activeStoreId) {
            activeStoreId = await resolveDefaultStoreId(match.partnerId)
        }
        return {
            userId: match.userId,
            partnerId: match.partnerId,
            activeStoreId,
            role: match.role,
            roleId: match.roleId,
            permissions: match.permissions,
            businessInfo: match.businessInfo,
        }
    }

    return null
})

