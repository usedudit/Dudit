/**
 * Shared server-side search helpers for admin list actions.
 *
 * Keeps PostgREST queries safe (no invalid UUID `.eq()` casts, no cross-table
 * `.or()` filters) and enables partial ILIKE searches across related tables
 * (stores, customers, user_profiles, auth.users).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function sanitizeIlike(input: string): string {
    return input
        .trim()
        .replace(/[%_\\]/g, (c) => `\\${c}`)
        .replace(/[,()]/g, " ")
        .trim()
        .slice(0, 120)
}

export function isValidUuid(input: string): boolean {
    return UUID_REGEX.test(input.trim())
}

/**
 * Resolves store IDs whose name matches `storeName` (case-insensitive contains).
 * Returns `null` if no filter was provided, or `string[]` (possibly empty) if filtered.
 */
export async function resolveStoreIdsByName(
    admin: any,
    storeName?: string | null,
    limit: number = 100
): Promise<string[] | null> {
    const raw = (storeName || "").trim()
    if (!raw) return null

    const s = sanitizeIlike(raw)
    if (!s) return null

    const { data, error } = await admin
        .from("stores")
        .select("id")
        .ilike("name", `%${s}%`)
        .limit(limit)

    if (error) {
        console.error("[ADMIN_SEARCH] resolveStoreIdsByName failed:", error.message)
        return []
    }

    return (data || []).map((row: any) => String(row.id))
}

/**
 * Resolves partner IDs that have at least one store matching `storeName`.
 * Returns `null` if no filter was provided, or `string[]` (possibly empty) if filtered.
 */
export async function resolvePartnerIdsByStoreName(
    admin: any,
    storeName?: string | null,
    limit: number = 100
): Promise<string[] | null> {
    const raw = (storeName || "").trim()
    if (!raw) return null

    const s = sanitizeIlike(raw)
    if (!s) return null

    const { data, error } = await admin
        .from("stores")
        .select("partner_id")
        .ilike("name", `%${s}%`)
        .limit(limit)

    if (error) {
        console.error("[ADMIN_SEARCH] resolvePartnerIdsByStoreName failed:", error.message)
        return []
    }

    return Array.from(
        new Set((data || []).map((row: any) => row.partner_id).filter(Boolean).map(String))
    )
}

/**
 * Resolves customer IDs matching name or email (case-insensitive contains).
 * Returns `null` if no filter was provided, or `string[]` (possibly empty) if filtered.
 */
export async function resolveCustomerIdsByQuery(
    admin: any,
    customerQuery?: string | null,
    limit: number = 100
): Promise<string[] | null> {
    const raw = (customerQuery || "").trim()
    if (!raw) return null

    const s = sanitizeIlike(raw)
    if (!s) return null

    const { data, error } = await admin
        .from("customers")
        .select("id")
        .or(`name.ilike.%${s}%,email.ilike.%${s}%`)
        .limit(limit)

    if (error) {
        console.error("[ADMIN_SEARCH] resolveCustomerIdsByQuery failed:", error.message)
        return []
    }

    return (data || []).map((row: any) => String(row.id))
}

/**
 * Resolves partner IDs owned by users matching `ownerName` (via user_profiles.full_name).
 * Returns `null` if no filter was provided, or `string[]` (possibly empty) if filtered.
 */
export async function resolvePartnerIdsByOwnerName(
    admin: any,
    ownerName?: string | null,
    limit: number = 100
): Promise<string[] | null> {
    const raw = (ownerName || "").trim()
    if (!raw) return null

    const s = sanitizeIlike(raw)
    if (!s) return null

    const { data: profiles, error: profErr } = await admin
        .from("user_profiles")
        .select("user_id")
        .ilike("full_name", `%${s}%`)
        .limit(limit)

    if (profErr || !profiles || profiles.length === 0) return []

    const userIds = profiles.map((p: any) => String(p.user_id))
    const { data: partners, error: partErr } = await admin
        .from("partners")
        .select("id")
        .in("user_id", userIds)
        .limit(limit)

    if (partErr || !partners) return []
    return partners.map((p: any) => String(p.id))
}

/**
 * Resolves auth.users matching an email substring (via RPC `admin_search_auth_users_by_email`,
 * with automatic fallback to exact `auth.admin.getUserByEmail` if the RPC is not yet deployed).
 * Returns `null` if no filter was provided, or array of `{ id, email }` (possibly empty).
 */
export async function resolveAuthUsersByEmail(
    admin: any,
    emailQuery?: string | null,
    limit: number = 50
): Promise<Array<{ id: string; email: string }> | null> {
    const raw = (emailQuery || "").trim()
    if (!raw) return null

    try {
        const { data, error } = await admin.rpc("admin_search_auth_users_by_email", {
            search_term: raw,
            max_results: limit,
        })

        if (!error && Array.isArray(data)) {
            return data.map((row: any) => ({
                id: String(row.user_id || row.id),
                email: String(row.email || ""),
            }))
        }
    } catch {
        // Fallback below if RPC is not deployed yet
    }

    // Fallback: exact email lookup via GoTrue Admin API
    try {
        if (raw.includes("@")) {
            const { data: authRes } = await admin.auth.admin.getUserByEmail(raw)
            if (authRes?.user?.id) {
                return [{ id: String(authRes.user.id), email: String(authRes.user.email || raw) }]
            }
        }
    } catch {
        // Ignore fallback failure
    }

    return []
}
