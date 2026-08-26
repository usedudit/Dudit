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

        // Check if there is an active deletion request for this email
        const { getAdminClient } = await import("@/lib/supabase/admin")
        const admin = getAdminClient()
        const { data: userProfile } = await admin
            .from("user_profiles")
            .select("user_id")
            .eq("email", cleanEmail)
            .maybeSingle()

        if (userProfile?.user_id) {
            const { data: activeDeletion } = await admin
                .from("account_deletions")
                .select("id, status")
                .eq("user_id", userProfile.user_id)
                .not("status", "eq", "completed")
                .not("status", "eq", "failed")
                .maybeSingle()

            if (activeDeletion) {
                return {
                    allowed: false,
                    error: "Esta conta está em processo de exclusão definitiva e não pode mais ser acessada."
                }
            }
        }
    } catch (err) {
        console.error("[PRECHECK] Error in checkAccountLockout/deletion:", err)
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
