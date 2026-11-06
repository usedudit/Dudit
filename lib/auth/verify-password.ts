import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Server-side user password verification helper.
 *
 * Verifies a user's password against Supabase Auth without:
 * 1. Being blocked by Cloudflare Turnstile / Captcha protection on the Supabase project
 *    (by using an isolated temporary client with the service role key).
 * 2. Mutating singleton or request-bound clients such as getAdminClient() or getSupabaseServerClient() (CWE-250).
 *
 * SECURITY:
 * - Uses a temporary, non-persistent client (autoRefreshToken: false, persistSession: false)
 * - Safe for one-off password checks (admin step-up auth, profile change-password, refund approval)
 * - Guarantees the temporary client is signed out and discarded after execution
 */
export async function verifyUserPassword(
    email: string,
    password: string
): Promise<{ success: boolean; error?: string }> {
    const trimmedEmail = email?.trim().toLowerCase()
    if (!trimmedEmail || !password) {
        return { success: false, error: "Credenciais incompletas para verificação." }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Configuração de autenticação Supabase incompleta.")
    }

    const verifyClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    try {
        const { error } = await verifyClient.auth.signInWithPassword({
            email: trimmedEmail,
            password,
        })

        if (error) {
            return { success: false, error: error.message }
        }

        return { success: true }
    } finally {
        verifyClient.auth.signOut().catch(() => { })
    }
}

