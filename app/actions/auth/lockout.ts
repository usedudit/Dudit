"use server"

import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { checkAccountLockout, recordFailedLogin, clearFailedLogins } from "@/lib/security/account-lockout"
import { getCurrentUser } from "@/lib/auth/authorization"
import { auditLog } from "@/lib/security/audit-logger"

export async function preCheckLogin(email: string): Promise<{ allowed: boolean; error?: string }> {
    try {
        await requireRateLimit(RateLimitCategory.AUTH_LOGIN)
    } catch {
        return { allowed: false, error: "Muitas tentativas de acesso. Tente novamente em 15 minutos." }
    }

    try {
        const cleanEmail = (email || "").toLowerCase().trim()
        if (!cleanEmail) return { allowed: true }

        const { locked, remainingSeconds } = await checkAccountLockout(cleanEmail)
        if (locked) {
            const mins = Math.ceil((remainingSeconds || 900) / 60)
            return {
                allowed: false,
                error: `Esta conta foi temporariamente bloqueada por segurança devido a múltiplas tentativas incorretas. Tente novamente em ${mins} minuto(s).`
            }
        }
    } catch (err) {
        console.error("[PRECHECK] Error in checkAccountLockout:", err)
    }

    return { allowed: true }
}

export async function handleLoginResult(
    email: string,
    success: boolean,
    reason?: string
): Promise<{ error?: string }> {
    try {
        await requireRateLimit(RateLimitCategory.AUTH_LOGIN)
    } catch {
        return { error: "Muitas tentativas de acesso. Tente novamente em 15 minutos." }
    }

    const cleanEmail = (email || "").toLowerCase().trim()
    if (!cleanEmail) return {}

    try {
        if (success) {
            // SECURITY: Only clear failed logins if the current session belongs to this user.
            // Prevents unauthenticated attackers from arbitrarily resetting lockout counters.
            const user = await getCurrentUser()
            if (user && user.email?.toLowerCase().trim() === cleanEmail) {
                await clearFailedLogins(cleanEmail)
                await auditLog({
                    action: "auth.login",
                    actorUserId: user.id,
                    metadata: { method: "password" },
                })
            }
            return {}
        } else {
            const { lockedNow } = await recordFailedLogin(cleanEmail)
            await auditLog({
                action: "auth.login_failed",
                actorUserId: null,
                metadata: {
                    email: cleanEmail,
                    reason: reason || (lockedNow ? "account_locked" : "invalid_credentials"),
                },
            })
            if (lockedNow) {
                return {
                    error: "Sua conta foi bloqueada por 15 minutos devido a 10 tentativas malsucedidas consecutivas."
                }
            }
            return {}
        }
    } catch (err) {
        console.error("[AUTH] Error in handleLoginResult:", err)
        return {}
    }
}
