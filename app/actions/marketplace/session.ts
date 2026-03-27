"use server"

import { getCurrentUser } from "@/lib/auth/server-user"
import { getUserSessionData } from "@/lib/data/user"

/**
 * Unified action to fetch all basic session data required by global components
 * (such as MarketplaceHeader) in a SINGLE React Server Action POST request.
 * This prevents SWR from duplicating DB queries via parallel POSTs.
 */
export async function getUnifiedUserSessionAction() {
    const user = await getCurrentUser()
    if (!user) {
        return {
            profile: null,
            cartCount: 0
        }
    }

    const sessionData = await getUserSessionData(user.id)
    const rawProfile = sessionData?.profile

    return {
        profile: rawProfile ? {
            full_name: rawProfile.full_name || null,
            address: rawProfile.city ? `${rawProfile.city} - ${rawProfile.state}` : null
        } : null,
        cartCount: sessionData?.cartCount || 0
    }
}
