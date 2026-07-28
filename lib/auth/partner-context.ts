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

const getCachedUserAccess = (userId: string) => unstable_cache(
    async () => {
        const admin = createAdminClient()
        const template = await getPermissionTemplate()

        const [invitedDataRes, ownedDataRes] = await Promise.all([
            admin.from("partner_users").select(`
                    partner_id, user_id, role_id,
                    roles:roles!inner (id, permissions),
                    partners!inner (id, user_id, business_info, is_active, erp_disabled, stores(name))
                `).eq("user_id", userId),
            admin.from("partners").select(`
                    id, user_id, business_info, is_active, erp_disabled, stores(name)
                `).eq("user_id", userId)
        ])

        const invitedData = invitedDataRes.data || []
        const ownedData = ownedDataRes.data || []

        const accessRecords: Record<string, PartnerAccessRecord> = {}
        const ownerUserIds = new Set<string>()

        if (ownedData) {
            for (const partner of ownedData) {
                if (partner.is_active === false || partner.erp_disabled === true) {
                    continue
                }
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
        }

        if (invitedData) {
            for (const record of invitedData as any[]) {
                if (record.partners?.is_active === false || record.partners?.erp_disabled === true) {
                    continue
                }
                if (!accessRecords[record.partner_id]) {
                    const ownerId = record.partners.user_id
                    if (ownerId) ownerUserIds.add(ownerId)

                    const roleId = (String(record.role_id || "delivery").toLowerCase() as RoleId)
                    const dbPerms = record.roles?.permissions
                    const storeName = record.partners?.stores?.[0]?.name || "Loja sem nome"

                    accessRecords[record.partner_id] = {
                        partnerId: record.partner_id,
                        userId: record.user_id,
                        role: String(roleId).toUpperCase() as PartnerRole,
                        roleId,
                        permissions: normalizePermissions(template, dbPerms),
                        storeName,
                        ownerName: ownerId, // temporary
                        businessInfo: normalizeBusinessInfo(record.partners.business_info),
                    }
                }
            }
        }

        let records = Object.values(accessRecords)

        if (ownerUserIds.size > 0) {
            const { data: profiles } = await admin.from("user_profiles").select("user_id, full_name").in("user_id", Array.from(ownerUserIds))
            if (profiles) {
                const names = Object.fromEntries(profiles.map((p: any) => [p.user_id, p.full_name]))
                records = records.map(record => {
                    if (record.roleId !== "owner" && record.ownerName && names[record.ownerName]) {
                        record.ownerName = names[record.ownerName]
                    } else if (record.roleId !== "owner") {
                        record.ownerName = "Desconhecido"
                    }
                    return record
                })
            }
        }

        return records
    },
    [TAGS.userAccess(userId)],
    {
        tags: [TAGS.userAccess(userId)],
        revalidate: 900 // 15 mins (strictly short TTL)
    }
);

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

    const records = await getCachedUserAccess(user.id)();
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
        const [ownedPartnersRes, invitedPartnersRes] = await Promise.all([
            admin.from("partners").select("id, business_info").eq("user_id", userId).eq("is_active", true).neq("erp_disabled", true),
            admin.from("partner_users").select("partner_id").eq("user_id", userId)
        ])

        const ownedPartnerIds = (ownedPartnersRes.data || []).map((p: any) => p.id)
        const invitedPartnerIds = (invitedPartnersRes.data || []).map((p: any) => p.partner_id)
        const allPartnerIds = [...new Set([...ownedPartnerIds, ...invitedPartnerIds])]

        if (allPartnerIds.length === 0) return []

        // Get all stores for these partners
        const { data: stores } = await admin.from("stores")
            .select("id, name, partner_id")
            .in("partner_id", allPartnerIds)

        if (!stores || stores.length === 0) return []

        // For invited users, get store_members to know which stores they have access to
        const invitedStoreIds = new Set<string>()
        if (invitedPartnerIds.length > 0) {
            const { data: storeMembers } = await admin.from("store_members")
                .select("store_id, partner_user_id, role, permissions")
                .in("store_id", stores.map((s: any) => s.id))
            if (storeMembers) {
                // Get partner_user_ids for this user in these partners
                const { data: partnerUsers } = await admin.from("partner_users")
                    .select("id, partner_id")
                    .eq("user_id", userId)
                    .in("partner_id", invitedPartnerIds)
                const partnerUserIds = new Set((partnerUsers || []).map((pu: any) => pu.id))
                for (const sm of storeMembers) {
                    if (partnerUserIds.has(sm.partner_user_id)) {
                        invitedStoreIds.add(sm.store_id)
                    }
                }
            }
        }

        // Get partner names for display
        const { data: partners } = await admin.from("partners")
            .select("id, business_info")
            .in("id", allPartnerIds)
        const partnerNames = new Map<string, string>()
        if (partners) {
            for (const p of partners) {
                const biz = p.business_info as any
                partnerNames.set(p.id, biz?.nome_fantasia || biz?.razao_social || "Parceiro")
            }
        }

        // Get owner names for invited partners
        const ownerUserIds = new Set<string>()
        if (invitedPartnerIds.length > 0) {
            const { data: invitedPartners } = await admin.from("partners")
                .select("id, user_id")
                .in("id", invitedPartnerIds)
            if (invitedPartners) {
                for (const p of invitedPartners) {
                    if (p.user_id) ownerUserIds.add(p.user_id)
                }
            }
        }
        const ownerNames = new Map<string, string>()
        if (ownerUserIds.size > 0) {
            const { data: profiles } = await admin.from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", Array.from(ownerUserIds))
            if (profiles) {
                for (const p of profiles) {
                    ownerNames.set(p.user_id, p.full_name)
                }
            }
        }

        // Build store access records
        const storeRecords: StoreAccessRecord[] = []
        for (const store of stores) {
            const isOwned = ownedPartnerIds.includes(store.partner_id)
            const hasAccess = isOwned || invitedStoreIds.has(store.id)
            if (!hasAccess) continue

            const partnerName = partnerNames.get(store.partner_id) || "Parceiro"
            const roleId = isOwned ? "owner" : "operator" // invited users get operator as base
            const dbPerms = isOwned ? {} : undefined
            const ownerName = isOwned ? "Você" : (ownerNames.get(
                (await admin.from("partners").select("user_id").eq("id", store.partner_id).single()).data?.user_id || ""
            ) || "Desconhecido")

            storeRecords.push({
                storeId: store.id,
                storeName: store.name,
                partnerId: store.partner_id,
                partnerName,
                userId,
                roleId,
                role: roleId.toUpperCase() as PartnerRole,
                permissions: normalizePermissions(template, dbPerms),
                isOwn: isOwned,
                ownerName: isOwned ? "Você" : ownerName,
                businessInfo: null
            })
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

            return {
                userId: match.userId,
                partnerId: match.partnerId,
                activeStoreId: await getActiveStoreId(),
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
        return {
            userId: match.userId,
            partnerId: match.partnerId,
            activeStoreId: await getActiveStoreId(),
            role: match.role,
            roleId: match.roleId,
            permissions: match.permissions,
            businessInfo: match.businessInfo,
        }
    }

    return null
})

