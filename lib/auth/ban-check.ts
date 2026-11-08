/**
 * Ban check utility.
 *
 * Check-on-access pattern: if banned_until IS NOT NULL and < now(),
 * auto-clear the ban. Returns true if user is currently banned.
 *
 * @module auth/ban-check
 */

import "server-only"
import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { unstable_cache } from "next/cache"

export type BannedProfile = {
    user_id: string
    full_name: string | null
    banned_at: string
    banned_until: string | null
    banned_reason: string | null
    banned_case_id: string | null
}

/**
 * Retrieves the full ban record for a user if actively banned.
 * If the ban has an expiration date and it has passed, the ban is cleared automatically.
 * Uses React cache() for per-request deduplication.
 */
export const getBannedUserProfile = cache(async (userId: string): Promise<BannedProfile | null> => {
    if (!userId) return null

    try {
        const supabase = getAdminClient()

        const { data: profile, error } = await supabase
            .from("user_profiles")
            .select("user_id, full_name, banned_at, banned_until, banned_reason, banned_case_id")
            .eq("user_id", userId)
            .maybeSingle()

        if (error || !profile || !profile.banned_at) {
            return null
        }

        // Banned with expiration AND expired → auto-clear
        if (profile.banned_until && new Date(profile.banned_until) < new Date()) {
            await supabase
                .from("user_profiles")
                .update({
                    banned_at: null,
                    banned_until: null,
                    banned_reason: null,
                    banned_by: null,
                    banned_case_id: null,
                })
                .eq("user_id", userId)

            return null
        }

        return {
            user_id: profile.user_id,
            full_name: profile.full_name,
            banned_at: profile.banned_at,
            banned_until: profile.banned_until,
            banned_reason: profile.banned_reason,
            banned_case_id: profile.banned_case_id,
        }
    } catch (err) {
        console.error("[BAN_CHECK] Error fetching banned profile:", err)
        return null
    }
})

export const checkAndClearExpiredBan = cache(async (userId: string): Promise<boolean> => {
    const profile = await getBannedUserProfile(userId)
    return !!profile
})

export const getCachedBanStatus = (userId: string) => unstable_cache(
    async () => {
        return checkAndClearExpiredBan(userId)
    },
    [`user-ban-${userId}`],
    {
        tags: [`user-ban-${userId}`],
        revalidate: 60 // 60 seconds TTL
    }
)
