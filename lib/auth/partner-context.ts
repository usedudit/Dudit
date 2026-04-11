import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { cookies } from "next/headers"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import type { PartnerRole, PartnerPermissions } from "@/lib/permissions/types"
import { TAGS } from "@/lib/utils/revalidation-tags"// ─── Constants ──────────────────────────────────────────────────────────────

const ACTIVE_PARTNER_COOKIE = "active_partner_id"
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
    role: PartnerRole
    permissions: PartnerPermissions
    businessInfo: any // Added for feature flags
}

export interface PartnerAccessRecord {
    partnerId: string
    userId: string
    role: PartnerRole
    permissions: PartnerPermissions
    storeName: string
    ownerName: string | null
    businessInfo: any // Added for feature flags
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
        maxAge: 60 * 30, // 30 minutes — enough for auth flow
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

// ─── Partner Context Resolution ─────────────────────────────────────────────

import { PERMISSION_PRESETS } from "@/lib/permissions/partner-roles"

// ─── Extracted Cache Factory for stability and strict keying ────────────────

function normalizeUserFullContextRpcPayload(data: unknown): any[] {
    if (data == null) return []
    if (Array.isArray(data)) return data
    if (typeof data === "string") {
        try {
            const parsed = JSON.parse(data)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

const getCachedUserAccess = (userId: string) => unstable_cache(
    async () => {
        const admin = createAdminClient()

        // RPC uses auth.uid() — MUST use the user's session client, not service role (auth.uid() is null there).
        const supabase = await createClient()
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_user_full_context")
        const rows = normalizeUserFullContextRpcPayload(rpcData)

        if (!rpcError) {
            if (rows.length === 0) {
                return []
            }
            return rows.map((record: any) => ({
                partnerId: record.partner_id,
                userId: record.user_id,
                role: record.role as PartnerRole,
                permissions: typeof record.permissions === "string" ? JSON.parse(record.permissions) : record.permissions,
                storeName: record.store_name || "Loja sem nome",
                ownerName: record.owner_name || "Desconhecido",
                businessInfo: typeof record.business_info === "string" ? JSON.parse(record.business_info) : (record.business_info || { sells: ["products"], channels: ["online"] }),
            })) as PartnerAccessRecord[]
        }

        if (rpcError && process.env.NODE_ENV === "development") {
            console.warn("[AUTH] get_user_full_context RPC failed, using admin fallback:", rpcError.message)
        }

        const [invitedDataRes, ownedDataRes] = await Promise.all([
            admin.from("partner_users").select(`
                    partner_id, user_id, role, permissions,
                    partners!inner (store_name, user_id, business_info)
                `).eq("user_id", userId),
            admin.from("partners").select(`
                    id, user_id, store_name, business_info
                `).eq("user_id", userId)
        ])

        const invitedData = invitedDataRes.data || []
        const ownedData = ownedDataRes.data || []

        const accessRecords: Record<string, PartnerAccessRecord> = {}
        const ownerUserIds = new Set<string>()

        if (ownedData) {
            for (const store of ownedData) {
                accessRecords[store.id] = {
                    partnerId: store.id,
                    userId: userId,
                    role: "OWNER" as PartnerRole,
                    permissions: PERMISSION_PRESETS.OWNER,
                    storeName: store.store_name || "Loja sem nome",
                    ownerName: "Você",
                    businessInfo: typeof store.business_info === "string" ? JSON.parse(store.business_info) : (store.business_info || { sells: ["products"], channels: ["online"] }),
                }
            }
        }

        if (invitedData) {
            for (const record of invitedData as any[]) {
                if (!accessRecords[record.partner_id]) {
                    const ownerId = record.partners.user_id
                    if (ownerId) ownerUserIds.add(ownerId)

                    accessRecords[record.partner_id] = {
                        partnerId: record.partner_id,
                        userId: record.user_id,
                        role: record.role as PartnerRole,
                        permissions: record.permissions as PartnerPermissions,
                        storeName: record.partners.store_name || "Loja sem nome",
                        ownerName: ownerId, // temporary
                        businessInfo: typeof record.partners.business_info === "string" ? JSON.parse(record.partners.business_info) : (record.partners.business_info || { sells: ["products"], channels: ["online"] }),
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
                    if (record.role !== "OWNER" && record.ownerName && names[record.ownerName]) {
                        record.ownerName = names[record.ownerName]
                    } else if (record.role !== "OWNER") {
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

/**
 * Gets ALL partner access records for the current user.
 * Built safely using cache factory injection and real fallback logic.
 */
export const getAllUserPartnerAccess = cache(async (resolvedUser?: any): Promise<PartnerAccessRecord[]> => {
    const user = resolvedUser || await getCurrentUser()
    if (!user) return []

    // Logging Cache Hit vs Exec will be seen structurally (if MISS log above wasn't fired, it is a HIT)
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
            return {
                userId: match.userId,
                partnerId: match.partnerId,
                role: match.role,
                permissions: match.permissions,
                businessInfo: match.businessInfo,
            }
        }
    }

    // If no valid cookie, and they only have 1 ERP, auto-resolve to it
    if (allAccess.length === 1) {
        const match = allAccess[0]
        return {
            userId: match.userId,
            partnerId: match.partnerId,
            role: match.role,
            permissions: match.permissions,
            businessInfo: match.businessInfo,
        }
    }

    return null
})
