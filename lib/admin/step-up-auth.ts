/**
 * Step-up re-authentication for critical admin actions.
 *
 * Flow:
 * 1. Admin clicks critical action (ban, cancel subscription, etc)
 * 2. UI prompts for password re-entry
 * 3. Server validates password via Supabase Auth
 * 4. If valid, creates a short-lived token (5 min) stored in admin_step_up_tokens
 * 5. Admin action proceeds using that token
 * 6. Token is single-use (marked as used_at after consumption)
 *
 * @module admin/step-up-auth
 */

import "server-only"
import { createHash, randomBytes } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { ForbiddenError } from "@/lib/auth/authorization"

const STEP_UP_TTL_MINUTES = 5

/**
 * Create a step-up authentication token after validating the admin's password.
 *
 * SECURITY:
 * - Password is validated server-side via Supabase Auth signInWithPassword
 * - Token is a random 32-byte hex string
 * - Only the SHA-256 hash is stored in the database
 * - Token expires in 5 minutes
 * - Old expired tokens are cleaned up automatically
 *
 * @returns The raw token (to be sent back to the client for the follow-up action)
 */
export async function createStepUpToken(
    userId: string,
    email: string,
    password: string
): Promise<string> {
    // 1. Validate password via Supabase Auth
    const { createClient } = await import("@supabase/supabase-js")
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: authError } = await tempClient.auth.signInWithPassword({
        email,
        password,
    })

    if (authError) {
        throw new ForbiddenError("Senha inválida. Autenticação adicional falhou.")
    }

    // 2. Generate token
    const rawToken = randomBytes(32).toString("hex")
    const tokenHash = createHash("sha256").update(rawToken).digest("hex")

    // 3. Store hash in DB
    const admin = getAdminClient()
    const expiresAt = new Date(Date.now() + STEP_UP_TTL_MINUTES * 60 * 1000).toISOString()

    await admin.from("admin_step_up_tokens").insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
    })

    // 4. Cleanup old expired tokens (fire & forget)
    admin
        .from("admin_step_up_tokens")
        .delete()
        .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .then(() => { })
        .catch(() => { })

    return rawToken
}

/**
 * Validate and consume a step-up token.
 *
 * SECURITY:
 * - Token is single-use (marked as used_at)
 * - Token must belong to the specified user
 * - Token must not be expired
 * - Token must not have been used before
 *
 * @throws ForbiddenError if token is invalid, expired, or already used
 */
export async function requireStepUp(userId: string, rawToken: string): Promise<void> {
    if (!rawToken || rawToken.length < 32) {
        throw new ForbiddenError("Token de autenticação adicional inválido")
    }

    const tokenHash = createHash("sha256").update(rawToken).digest("hex")
    const admin = getAdminClient()

    // Consume atomically: SELECT-then-UPDATE allowed concurrent requests to
    // both observe the same unused token and use it twice.
    const consumedAt = new Date().toISOString()
    const { data: consumedToken, error } = await admin
        .from("admin_step_up_tokens")
        .update({ used_at: consumedAt })
        .eq("user_id", userId)
        .eq("token_hash", tokenHash)
        .is("used_at", null)
        .gt("expires_at", consumedAt)
        .select("id")
        .maybeSingle()

    if (error || !consumedToken) {
        throw new ForbiddenError("Autenticação adicional necessária. Token inválido ou expirado.")
    }
}
