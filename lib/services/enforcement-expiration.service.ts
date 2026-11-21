import "server-only"
import { getAdminClient } from "@/lib/supabase/admin"
import { TAGS } from "@/lib/utils/revalidation-tags"

export interface PartnerEnforcementClearResult {
    cleared: boolean
    partnerCleared: boolean
    erpCleared: boolean
    storesCleared: number
    stillBlocked: boolean
}

export interface ExpireAllEnforcementsResult {
    expiredUsers: number
    expiredPartners: number
    expiredErpDisables: number
    expiredStores: number
    totalCleared: number
}

/**
 * Returns true if an enforcement expiration timestamp is set and has arrived or passed.
 */
export function isEnforcementExpired(
    until: string | null | undefined,
    nowMs: number = Date.now()
): boolean {
    if (!until) return false
    const ts = Date.parse(until)
    if (Number.isNaN(ts)) return false
    return ts <= nowMs
}

async function revalidateUsersAndPartners(
    userIds: Iterable<string>,
    partnerIds: Iterable<string>,
    supabase?: any
): Promise<void> {
    const uniqueUsers = new Set<string>()
    for (const uid of userIds) {
        if (uid) uniqueUsers.add(uid)
    }

    const uniquePartners = new Set<string>()
    for (const pid of partnerIds) {
        if (pid) uniquePartners.add(pid)
    }

    if (uniquePartners.size > 0) {
        try {
            const admin = supabase ?? getAdminClient()
            const partnerIdList = Array.from(uniquePartners)
            const [ownersRes, teamRes] = await Promise.all([
                admin.from("partners").select("user_id").in("id", partnerIdList),
                admin.from("partner_users").select("user_id").in("partner_id", partnerIdList),
            ])
            for (const row of ownersRes?.data || []) {
                if (row?.user_id) uniqueUsers.add(row.user_id)
            }
            for (const row of teamRes?.data || []) {
                if (row?.user_id) uniqueUsers.add(row.user_id)
            }
        } catch (err) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed to resolve users for revalidation:", err)
        }
    }

    if (uniqueUsers.size === 0 && uniquePartners.size === 0) return

    try {
        const { revalidateUserAccess, safeRevalidateTag, safeRevalidatePath } = await import(
            "@/lib/utils/revalidation"
        )

        const tasks: Promise<unknown>[] = []
        for (const uid of uniqueUsers) {
            tasks.push(revalidateUserAccess(uid))
            tasks.push(safeRevalidateTag(`user-ban-${uid}`))
        }
        for (const pid of uniquePartners) {
            tasks.push(safeRevalidateTag(TAGS.partner(pid)))
            tasks.push(safeRevalidateTag(TAGS.partnerProfile(pid)))
        }
        if (uniquePartners.size > 0) {
            tasks.push(safeRevalidatePath("/select-erp"))
            tasks.push(safeRevalidatePath("/erp", "layout"))
        }

        await Promise.allSettled(tasks)
    } catch (err) {
        console.error("[ENFORCEMENT_EXPIRATION] Cache revalidation failed:", err)
    }
}

/**
 * Clears an expired ban on `user_profiles` for a single user (service-role).
 * Returns true if an expired ban was found and cleared.
 */
export async function clearExpiredUserBan(
    userId: string,
    supabase?: any,
    now: Date = new Date()
): Promise<boolean> {
    if (!userId) return false

    try {
        const admin = supabase ?? getAdminClient()
        const nowIso = now.toISOString()

        const { data, error } = await admin
            .from("user_profiles")
            .update({
                banned_at: null,
                banned_until: null,
                banned_reason: null,
                banned_by: null,
                banned_case_id: null,
            })
            .eq("user_id", userId)
            .not("banned_at", "is", null)
            .not("banned_until", "is", null)
            .lte("banned_until", nowIso)
            .select("user_id")

        if (error) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed to clear expired user ban:", error.message)
            return false
        }

        const cleared = Array.isArray(data) && data.length > 0
        if (cleared) {
            await revalidateUsersAndPartners([userId], [], admin)
        }
        return cleared
    } catch (err) {
        console.error("[ENFORCEMENT_EXPIRATION] Unexpected error clearing user ban:", err)
        return false
    }
}

/**
 * Clears expired partner suspension, ERP disable, and/or store suspensions for a single partner.
 */
export async function clearExpiredPartnerEnforcement(
    partnerId: string,
    supabase?: any,
    now: Date = new Date()
): Promise<PartnerEnforcementClearResult> {
    if (!partnerId) {
        return { cleared: false, partnerCleared: false, erpCleared: false, storesCleared: 0, stillBlocked: false }
    }

    try {
        const admin = supabase ?? getAdminClient()
        const nowMs = now.getTime()
        const nowIso = now.toISOString()

        const { data: partner, error: partnerError } = await admin
            .from("partners")
            .select("id, user_id, is_active, erp_disabled, suspended_at, suspended_until")
            .eq("id", partnerId)
            .maybeSingle()

        if (partnerError || !partner) {
            return { cleared: false, partnerCleared: false, erpCleared: false, storesCleared: 0, stillBlocked: true }
        }

        const partnerUntilExpired = isEnforcementExpired(partner.suspended_until, nowMs)
        const partnerSuspensionExpired = partnerUntilExpired && partner.suspended_at !== null
        const erpDisableExpired = partnerUntilExpired && partner.erp_disabled === true

        let partnerCleared = false
        let erpCleared = false

        if (partnerSuspensionExpired || erpDisableExpired) {
            const updatePayload: Record<string, unknown> = {
                suspended_until: null,
                suspended_reason: null,
                suspended_case_id: null,
            }

            if (partnerSuspensionExpired) {
                updatePayload.is_active = true
                updatePayload.suspended_at = null
                updatePayload.suspended_by = null
            }

            if (erpDisableExpired) {
                updatePayload.erp_disabled = false
                updatePayload.erp_disabled_at = null
                updatePayload.erp_disabled_by = null
            }

            const { error: updateError } = await admin
                .from("partners")
                .update(updatePayload)
                .eq("id", partnerId)

            if (updateError) {
                console.error("[ENFORCEMENT_EXPIRATION] Failed to clear expired partner enforcement:", updateError.message)
            } else {
                partnerCleared = partnerSuspensionExpired
                erpCleared = erpDisableExpired
            }
        }

        const { data: clearedStores, error: storeError } = await admin
            .from("stores")
            .update({
                is_active: true,
                suspended_at: null,
                suspended_until: null,
                suspended_reason: null,
                suspended_by: null,
                suspended_case_id: null,
            })
            .eq("partner_id", partnerId)
            .not("suspended_at", "is", null)
            .not("suspended_until", "is", null)
            .lte("suspended_until", nowIso)
            .select("id")

        if (storeError) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed to clear expired store suspensions:", storeError.message)
        }

        const storesCleared = Array.isArray(clearedStores) ? clearedStores.length : 0
        const cleared = partnerCleared || erpCleared || storesCleared > 0

        if (cleared) {
            await revalidateUsersAndPartners(partner.user_id ? [partner.user_id] : [], [partnerId], admin)
        }

        const effectiveIsActive = partnerCleared ? true : partner.is_active
        const effectiveErpDisabled = erpCleared ? false : partner.erp_disabled
        const stillBlocked = effectiveIsActive === false || effectiveErpDisabled === true

        return { cleared, partnerCleared, erpCleared, storesCleared, stillBlocked }
    } catch (err) {
        console.error("[ENFORCEMENT_EXPIRATION] Unexpected error clearing partner enforcement:", err)
        return { cleared: false, partnerCleared: false, erpCleared: false, storesCleared: 0, stillBlocked: true }
    }
}

/**
 * Clears expired store suspension for a single store.
 */
export async function clearExpiredStoreSuspension(
    storeId: string,
    supabase?: any,
    now: Date = new Date()
): Promise<boolean> {
    if (!storeId) return false

    try {
        const admin = supabase ?? getAdminClient()
        const nowIso = now.toISOString()

        const { data, error } = await admin
            .from("stores")
            .update({
                is_active: true,
                suspended_at: null,
                suspended_until: null,
                suspended_reason: null,
                suspended_by: null,
                suspended_case_id: null,
            })
            .eq("id", storeId)
            .not("suspended_at", "is", null)
            .not("suspended_until", "is", null)
            .lte("suspended_until", nowIso)
            .select("id, partner_id")

        if (error) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed to clear expired store suspension:", error.message)
            return false
        }

        const rows = Array.isArray(data) ? data : []
        if (rows.length > 0) {
            const partnerIds = rows.map((r: any) => r.partner_id).filter(Boolean)
            await revalidateUsersAndPartners([], partnerIds, admin)
            return true
        }
        return false
    } catch (err) {
        console.error("[ENFORCEMENT_EXPIRATION] Unexpected error clearing store suspension:", err)
        return false
    }
}

/**
 * Checks and clears any expired partner/ERP/store suspensions for all partners
 * a user owns or is a member of.
 */
export async function clearExpiredEnforcementsForUserPartners(
    userId: string,
    supabase?: any,
    now: Date = new Date(),
    options?: { skipRevalidate?: boolean }
): Promise<boolean> {
    if (!userId) return false

    try {
        const admin = supabase ?? getAdminClient()
        const nowIso = now.toISOString()

        const [ownedRes, invitedRes] = await Promise.all([
            admin.from("partners").select("id").eq("user_id", userId),
            admin.from("partner_users").select("partner_id").eq("user_id", userId),
        ])

        const partnerIds = Array.from(
            new Set<string>([
                ...(ownedRes?.data || []).map((p: any) => p.id).filter(Boolean),
                ...(invitedRes?.data || []).map((r: any) => r.partner_id).filter(Boolean),
            ])
        )

        if (partnerIds.length === 0) return false

        const [expiredPartnersRes, clearedStoresRes] = await Promise.all([
            admin
                .from("partners")
                .select("id, user_id, suspended_at, erp_disabled")
                .in("id", partnerIds)
                .not("suspended_until", "is", null)
                .lte("suspended_until", nowIso),
            admin
                .from("stores")
                .update({
                    is_active: true,
                    suspended_at: null,
                    suspended_until: null,
                    suspended_reason: null,
                    suspended_by: null,
                    suspended_case_id: null,
                })
                .in("partner_id", partnerIds)
                .not("suspended_at", "is", null)
                .not("suspended_until", "is", null)
                .lte("suspended_until", nowIso)
                .select("id, partner_id"),
        ])

        const affectedPartnerIds = new Set<string>()
        const affectedUserIds = new Set<string>()

        const expiredPartners = (expiredPartnersRes?.data || []).filter(
            (p: any) => p.suspended_at !== null || p.erp_disabled === true
        )

        for (const partner of expiredPartners) {
            const updatePayload: Record<string, unknown> = {
                suspended_until: null,
                suspended_reason: null,
                suspended_case_id: null,
            }
            if (partner.suspended_at !== null) {
                updatePayload.is_active = true
                updatePayload.suspended_at = null
                updatePayload.suspended_by = null
            }
            if (partner.erp_disabled === true) {
                updatePayload.erp_disabled = false
                updatePayload.erp_disabled_at = null
                updatePayload.erp_disabled_by = null
            }

            const { error } = await admin
                .from("partners")
                .update(updatePayload)
                .eq("id", partner.id)

            if (!error) {
                affectedPartnerIds.add(partner.id)
                if (partner.user_id) affectedUserIds.add(partner.user_id)
            }
        }

        for (const st of clearedStoresRes?.data || []) {
            if (st?.partner_id) affectedPartnerIds.add(st.partner_id)
        }

        if (affectedPartnerIds.size > 0) {
            if (!options?.skipRevalidate) {
                affectedUserIds.add(userId)
                await revalidateUsersAndPartners(affectedUserIds, affectedPartnerIds, admin)
            }
            return true
        }

        return false
    } catch (err) {
        console.error("[ENFORCEMENT_EXPIRATION] Failed to clear expired partner enforcements for user:", err)
        return false
    }
}

/**
 * Global sweep: clears all expired user bans, partner suspensions, ERP disables,
 * and store suspensions whose `banned_until` / `suspended_until` <= now.
 */
export async function expireAllExpiredEnforcements(
    supabase?: any,
    now: Date = new Date()
): Promise<ExpireAllEnforcementsResult> {
    const admin = supabase ?? getAdminClient()
    const nowIso = now.toISOString()

    const affectedUserIds = new Set<string>()
    const affectedPartnerIds = new Set<string>()

    let expiredUsers = 0
    let expiredPartners = 0
    let expiredErpDisables = 0
    let expiredStores = 0

    try {
        const [usersRes, partnersRes, storesRes] = await Promise.all([
            admin
                .from("user_profiles")
                .update({
                    banned_at: null,
                    banned_until: null,
                    banned_reason: null,
                    banned_by: null,
                    banned_case_id: null,
                })
                .not("banned_at", "is", null)
                .not("banned_until", "is", null)
                .lte("banned_until", nowIso)
                .select("user_id"),
            admin
                .from("partners")
                .select("id, user_id, suspended_at, erp_disabled")
                .not("suspended_until", "is", null)
                .lte("suspended_until", nowIso),
            admin
                .from("stores")
                .update({
                    is_active: true,
                    suspended_at: null,
                    suspended_until: null,
                    suspended_reason: null,
                    suspended_by: null,
                    suspended_case_id: null,
                })
                .not("suspended_at", "is", null)
                .not("suspended_until", "is", null)
                .lte("suspended_until", nowIso)
                .select("id, partner_id"),
        ])

        if (usersRes?.error) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed sweeping expired user bans:", usersRes.error.message)
        } else if (Array.isArray(usersRes?.data)) {
            expiredUsers = usersRes.data.length
            for (const row of usersRes.data) {
                if (row?.user_id) affectedUserIds.add(row.user_id)
            }
        }

        if (partnersRes?.error) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed querying expired partner enforcements:", partnersRes.error.message)
        } else if (Array.isArray(partnersRes?.data)) {
            const targets = partnersRes.data.filter(
                (p: any) => p.suspended_at !== null || p.erp_disabled === true
            )
            for (const partner of targets) {
                const updatePayload: Record<string, unknown> = {
                    suspended_until: null,
                    suspended_reason: null,
                    suspended_case_id: null,
                }
                const wasPartnerSuspended = partner.suspended_at !== null
                const wasErpDisabled = partner.erp_disabled === true

                if (wasPartnerSuspended) {
                    updatePayload.is_active = true
                    updatePayload.suspended_at = null
                    updatePayload.suspended_by = null
                }
                if (wasErpDisabled) {
                    updatePayload.erp_disabled = false
                    updatePayload.erp_disabled_at = null
                    updatePayload.erp_disabled_by = null
                }

                const { error: updateErr } = await admin
                    .from("partners")
                    .update(updatePayload)
                    .eq("id", partner.id)

                if (updateErr) {
                    console.error(
                        `[ENFORCEMENT_EXPIRATION] Failed clearing partner ${partner.id}:`,
                        updateErr.message
                    )
                    continue
                }

                if (wasPartnerSuspended) expiredPartners++
                if (wasErpDisabled) expiredErpDisables++
                affectedPartnerIds.add(partner.id)
                if (partner.user_id) affectedUserIds.add(partner.user_id)
            }
        }

        if (storesRes?.error) {
            console.error("[ENFORCEMENT_EXPIRATION] Failed sweeping expired store suspensions:", storesRes.error.message)
        } else if (Array.isArray(storesRes?.data)) {
            expiredStores = storesRes.data.length
            for (const row of storesRes.data) {
                if (row?.partner_id) affectedPartnerIds.add(row.partner_id)
            }
        }

        if (affectedUserIds.size > 0 || affectedPartnerIds.size > 0) {
            await revalidateUsersAndPartners(affectedUserIds, affectedPartnerIds, admin)
        }
    } catch (err) {
        console.error("[ENFORCEMENT_EXPIRATION] Unexpected sweep error:", err)
    }

    return {
        expiredUsers,
        expiredPartners,
        expiredErpDisables,
        expiredStores,
        totalCleared: expiredUsers + expiredPartners + expiredErpDisables + expiredStores,
    }
}
