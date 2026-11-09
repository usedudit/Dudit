"use server"

import { getCurrentUser } from "@/lib/auth/authorization"
import { auditLog } from "@/lib/security/audit-logger"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"

/**
 * Records a user-initiated logout in the immutable audit trail.
 *
 * Must be called while the session cookies are still present, i.e. before
 * `supabase.auth.signOut()` runs on the client.
 */
export async function logLogoutAction(): Promise<void> {
    try {
        const user = await getCurrentUser()
        if (!user) return

        await auditLog({
            action: "auth.logout",
            actorUserId: user.id,
            metadata: { method: "password" },
        })
    } catch (error) {
        // Audit logging must never block the logout itself.
        console.error("[AUTH_AUDIT] Failed to log logout:", error)
    }
}

/**
 * Records a password reset request. There is no authenticated user yet, so the
 * event is stored as an anonymous security entry targeting the e-mail.
 */
export async function logPasswordResetRequestedAction(email: string): Promise<void> {
    try {
        const cleanEmail = (email || "").toLowerCase().trim()
        if (!cleanEmail || cleanEmail.length > 254) return
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return

        // This action is callable without a session (the user is not logged in
        // yet), so rate-limit it to prevent audit-log flooding.
        await requireRateLimit(RateLimitCategory.AUTH_PASSWORD_CHANGE)

        await auditLog({
            action: "auth.password_reset_requested",
            actorUserId: null,
            metadata: { email: cleanEmail },
        })
    } catch (error) {
        console.error("[AUTH_AUDIT] Failed to log password reset request:", error)
    }
}
