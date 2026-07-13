/**
 * Ban check utility.
 *
 * Check-on-access pattern: if banned_until IS NOT NULL and < now(),
 * auto-clear the ban. Returns true if user is currently banned.
 *
 * @module auth/ban-check
 */

import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

import { unstable_cache } from "next/cache"

export async function checkAndClearExpiredBan(userId: string): Promise<boolean> {
    const supabase = await getSupabaseServerClient()

    const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("banned_at, banned_until")
        .eq("user_id", userId)
        .maybeSingle()

    if (error || !profile) {
        return false // No profile = not banned
    }

    // Not banned at all
    if (!profile.banned_at) {
        return false
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
            })
            .eq("user_id", userId)

        return false // Ban was cleared, user is no longer banned
    }

    // Actively banned (permanent or not yet expired)
    return true
}

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
