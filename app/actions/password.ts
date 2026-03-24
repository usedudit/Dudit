"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { sanitizeInput } from "@/lib/input-validator"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { calculatePasswordScore } from "@/lib/utils"
import { getErrorMessage } from "@/lib/utils/error-handlers"
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
 * Uses the JWT `iat` (issued at) claim from the session.
 */
async function isSessionFresh(): Promise<boolean> {
    const supabase = await getSupabaseServerClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) return false

    // Decode the access token to get `iat`
    try {
        const payload = JSON.parse(
            Buffer.from(session.access_token.split(".")[1], "base64").toString()
        )
        const iat = payload.iat as number | undefined
        if (!iat) return false
        const now = Math.floor(Date.now() / 1000)
        return (now - iat) < SESSION_FRESHNESS_SECONDS
    } catch {
        return false
    }
}

// ─── Server Actions ─────────────────────────────────────────────────────────

/**
 * Returns password security info for the authenticated user.
 * Frontend uses this to decide which UI to render.
 *
 * NEVER exposes sensitive data — only boolean flags and display provider.
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
        isSessionFresh: await isSessionFresh(),
    }
}

/**
 * Secure password change / set action.
 *
 * SECURITY:
 * - userId is ALWAYS from requireUser(), NEVER from client input
 * - hasPassword is computed server-side, NEVER trusted from client
 * - Session freshness enforced server-side
 * - Rate limited (5 req / 15 min per user+IP)
 * - CSRF validated
 * - Current password verified server-side via signInWithPassword when applicable
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

    // 3. Authentication — userId comes ONLY from server session
    const user = await requireUser()

    // 4. Session freshness check
    const sessionFresh = await isSessionFresh()
    if (!sessionFresh) {
        return {
            error:
                "Sua sessão expirou. Por segurança, faça login novamente antes de alterar a senha.",
        }
    }

    // 5. Input validation
    const newPassword = sanitizeInput(data.newPassword, 128)
    const confirmPassword = sanitizeInput(data.confirmPassword, 128)

    if (!newPassword || newPassword.length < 8) {
        return { error: "A nova senha deve ter pelo menos 8 caracteres" }
    }

    if (calculatePasswordScore(newPassword) < 2) {
        return { error: "Sua nova senha deve ter força Média ou Forte" }
    }

    if (newPassword !== confirmPassword) {
        return { error: "As senhas não coincidem" }
    }

    // 6. Compute hasPassword server-side (NEVER trust client)
    const hasPassword = userHasPassword(user)

    // 7. If user has password, verify current password server-side
    if (hasPassword) {
        const currentPassword = data.currentPassword
        if (!currentPassword) {
            return { error: "Digite sua senha atual" }
        }

        // Verify current password via signInWithPassword
        const supabase = await getSupabaseServerClient()
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: user.email!,
            password: currentPassword,
        })

        if (signInError) {
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

    return { success: true }
}
