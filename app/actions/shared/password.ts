"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { auditLog } from "@/lib/security/audit-logger"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { calculatePasswordScore } from "@/lib/utils"
import { getErrorMessage } from "@/lib/utils/error-handlers"
import { verifyUserPassword } from "@/lib/auth/verify-password"
import type { User } from "@supabase/supabase-js"

// ─── Helpers ────────────────────────────────────────────────────────────────

const SESSION_FRESHNESS_SECONDS = 10 * 60 // 10 minutes

/**
 * Determine if user has a password (email identity) based on their identities array.
 * FAIL-SAFE: defaults to true (require current password) if uncertain.
 */
function userHasPassword(user: User): boolean {
    const identities = user.identities
    if (!identities || identities.length === 0) {
        // Can't determine → fail-safe: assume has password
        return true
    }
    return identities.some((id) => id.provider === "email")
}

/**
 * Get the primary display provider for UX messaging.
 * Returns the first non-email provider, or "email" if that's the only one.
 */
function getDisplayProvider(user: User): string {
    const provider = user.app_metadata?.provider
    if (provider && provider !== "email") return provider
    const providers = user.app_metadata?.providers as string[] | undefined
    if (providers) {
        const oauthProvider = providers.find((p) => p !== "email")
        if (oauthProvider) return oauthProvider
    }
    return "email"
}

/**
 * Check if the user's session was created recently (within SESSION_FRESHNESS_SECONDS).
 * Uses the JWT `iat` (issued at) claim from the session, with fallback to user.last_sign_in_at.
 */
async function isSessionFresh(user?: User): Promise<boolean> {
    const supabase = await getSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.access_token) {
        // Decode the access token to get `iat`
        try {
            const payload = JSON.parse(
                Buffer.from(session.access_token.split(".")[1], "base64url").toString()
            )
            const iat = payload.iat as number | undefined
            if (iat) {
                const now = Math.floor(Date.now() / 1000)
                if ((now - iat) < SESSION_FRESHNESS_SECONDS) {
                    return true
                }
            }
        } catch {
            // fallback below
        }
    }

    if (user?.last_sign_in_at) {
        const lastSignIn = new Date(user.last_sign_in_at).getTime()
        const now = Date.now()
        if (!isNaN(lastSignIn) && (now - lastSignIn) < SESSION_FRESHNESS_SECONDS * 1000) {
            return true
        }
    }

    return false
}

// ─── Server Actions ─────────────────────────────────────────────────────────

/**
 * Returns password security info for the authenticated user.
 * Frontend uses this to decide which UI to render.
 *
 * NEVER exposes sensitive data - only boolean flags and display provider.
 */
export async function getPasswordSecurityInfo(): Promise<{
    hasPassword: boolean
    provider: string
    isSessionFresh: boolean
}> {
    const user = await requireUser()

    return {
        hasPassword: userHasPassword(user),
        provider: getDisplayProvider(user),
        isSessionFresh: await isSessionFresh(user),
    }
}

/**
 * Secure password change / set action.
 *
 * SECURITY:
 * - userId is ALWAYS from requireUser(), NEVER from client input
 * - hasPassword is computed server-side, NEVER trusted from client
 * - Session freshness enforced for initial password definition (OAuth accounts without password)
 * - Rate limited (5 req / 15 min per user+IP)
 * - CSRF validated
 * - Current password verified server-side via isolated verifyUserPassword (bypasses CAPTCHA)
 * - Password set via admin API (service role) to prevent client bypass
 */
export async function changePasswordAction(data: {
    currentPassword?: string
    newPassword: string
    confirmPassword: string
    csrf_token?: string
}): Promise<{ error?: string; success?: boolean }> {
    // 1. Rate limiting
    await requireRateLimit(RateLimitCategory.AUTH_PASSWORD_CHANGE)

    // 2. CSRF validation
    const { requireCSRF, extractCSRFTokenFromObject } = await import(
        "@/lib/security/csrf-action-wrapper"
    )
    const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
    const csrfValidation = await requireCSRF(csrfToken)
    if (!csrfValidation.valid) {
        return { error: csrfValidation.error || "Token CSRF inválido" }
    }

    // 3. Authentication - userId comes ONLY from server session
    const user = await requireUser()

    // 4. Compute hasPassword server-side (NEVER trust client)
    const hasPassword = userHasPassword(user)

    // 5. Session freshness check
    // If user does NOT have an existing password (OAuth account setting password for the first time),
    // require recent login. If user HAS a password, verifying current password below provides real-time proof.
    if (!hasPassword) {
        const sessionFresh = await isSessionFresh(user)
        if (!sessionFresh) {
            return {
                error:
                    "Sua sessão expirou. Por segurança, faça login novamente antes de definir uma senha.",
            }
        }
    }

    // 6. Input validation (never HTML-strip passwords to prevent CWE-20 mangling)
    if (typeof data.newPassword !== "string" || typeof data.confirmPassword !== "string") {
        return { error: "Dados inválidos" }
    }

    const newPassword = data.newPassword
    const confirmPassword = data.confirmPassword

    if (!newPassword || newPassword.length < 8) {
        return { error: "A nova senha deve ter pelo menos 8 caracteres" }
    }

    if (newPassword.length > 128) {
        return { error: "A nova senha deve ter no máximo 128 caracteres" }
    }

    if (calculatePasswordScore(newPassword) < 2) {
        return { error: "Sua nova senha deve ter força Média ou Forte" }
    }

    if (newPassword !== confirmPassword) {
        return { error: "As senhas não coincidem" }
    }

    // 7. If user has password, verify current password server-side
    if (hasPassword) {
        const currentPassword = data.currentPassword
        if (!currentPassword) {
            return { error: "Digite sua senha atual" }
        }

        let userEmail = user.email?.trim().toLowerCase()
        if (!userEmail) {
            const admin = getAdminClient()
            const { data: userData } = await admin.auth.admin.getUserById(user.id)
            userEmail = userData?.user?.email?.trim().toLowerCase() || ""
        }

        if (!userEmail) {
            return { error: "Não foi possível identificar o email associado à conta." }
        }

        // Verify current password via isolated service role client (bypasses CAPTCHA)
        const verifyResult = await verifyUserPassword(userEmail, currentPassword)
        if (!verifyResult.success) {
            return { error: "Senha atual incorreta" }
        }
    }

    // 8. Set new password via admin API (server-side only, no client bypass)
    const admin = getAdminClient()
    const { error: updateError } = await admin.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
    )

    if (updateError) {
        return { error: getErrorMessage(updateError) }
    }

    await auditLog({
        action: "auth.password_changed",
        actorUserId: user.id,
        metadata: {
            hadExistingPassword: hasPassword,
        },
    })

    return { success: true }
}
