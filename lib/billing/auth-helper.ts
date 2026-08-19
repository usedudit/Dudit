import "server-only"
import { getAdminRole } from "@/lib/auth/admin-authorization"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"

export interface BillingPartnerScope {
    allowed: boolean
    /**
     * If defined, queries must filter by partner_id IN (partnerIds).
     * If undefined, the user is a platform admin with no partner filter (can view all).
     */
    partnerIds?: string[]
}

/**
 * Resolves the partner scope for billing operations to prevent cross-tenant data leakage.
 * 
 * - Platform Admin: Can view all partners' records or filter by a specific partner.
 * - Regular Partner User:
 *   - Can ONLY view records for partners they have access to.
 *   - If requestedPartnerId is specified, verifies they have access to that partner. If not, access is denied.
 *   - If requestedPartnerId is not specified, scopes to their active partner or all partners they have access to.
 *   - If they have no partner access, access is denied.
 */
export async function resolveBillingPartnerScope(
    user: any,
    requestedPartnerId?: string,
): Promise<BillingPartnerScope> {
    if (!user) {
        return { allowed: false }
    }

    const adminUser = await getAdminRole()
    if (adminUser) {
        if (requestedPartnerId) {
            return { allowed: true, partnerIds: [requestedPartnerId] }
        }
        return { allowed: true, partnerIds: undefined }
    }

    const allAccess = await getAllUserPartnerAccess(user)
    if (!allAccess || allAccess.length === 0) {
        return { allowed: false }
    }

    const accessiblePartnerIds = allAccess.map((a) => a.partnerId)

    if (requestedPartnerId) {
        if (!accessiblePartnerIds.includes(requestedPartnerId)) {
            return { allowed: false }
        }
        return { allowed: true, partnerIds: [requestedPartnerId] }
    }

    // Try to use active partner context if set
    const context = await getCurrentPartnerContext(user)
    if (context?.partnerId && accessiblePartnerIds.includes(context.partnerId)) {
        return { allowed: true, partnerIds: [context.partnerId] }
    }

    return { allowed: true, partnerIds: accessiblePartnerIds }
}
