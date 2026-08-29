"use server"

import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { checkAccountLockout, recordFailedLogin, clearFailedLogins } from "@/lib/security/account-lockout"

export async function preCheckLogin(email: string): Promise<{ allowed: boolean; error?: string }> {
    try {
        await requireRateLimit(RateLimitCategory.AUTH_LOGIN)
    } catch {
        return { allowed: false, error: "Muitas tentativas de acesso. Tente novamente em 15 minutos." }
    }

    try {
        const cleanEmail = email.toLowerCase().trim()
        const { locked, remainingSeconds } = await checkAccountLockout(cleanEmail)
        if (locked) {
            const mins = Math.ceil((remainingSeconds || 900) / 60)
            return {
                allowed: false,
                error: `Esta conta foi temporariamente bloqueada por segurança devido a múltiplas tentativas incorretas. Tente novamente em ${mins} minuto(s).`
            }
        }

        // Account-deletion enforcement happens after authentication through the
        // secure runtime-status RPC and the post-login deletion check. Do not
        // query user_profiles by email here: email is owned by Supabase Auth,
        // not by user_profiles, and this pre-auth lookup caused a 400 on every
        // login attempt while adding no security boundary.
    } catch (err) {
        console.error("[PRECHECK] Error in checkAccountLockout:", err)
    }

    return { allowed: true }
}

export async function handleLoginResult(email: string, success: boolean): Promise<{ error?: string }> {
    try {
        if (success) {
            await clearFailedLogins(email)
            return {}
        } else {
            const { lockedNow } = await recordFailedLogin(email)
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
