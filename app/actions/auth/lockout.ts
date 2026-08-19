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
        const { locked, remainingSeconds } = await checkAccountLockout(email)
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
