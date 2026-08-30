import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Password recovery intentionally uses a separate implicit-flow client.
 *
 * The normal browser client uses PKCE, which is the right default for sign-in
 * and OAuth but requires the email link to be opened in the same browser that
 * requested it. Recovery links are commonly opened by a mail app in another
 * browser/device, so the recovery flow must not depend on that browser's PKCE
 * verifier. The separate storage key also prevents a recovery session from
 * replacing (or being mistaken for) the user's normal app session.
 */
let passwordRecoveryClient: SupabaseClient | null = null

export function getPasswordRecoveryClient(): SupabaseClient {
    if (!passwordRecoveryClient) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error("Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined.")
        }

        passwordRecoveryClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                flowType: "implicit",
                storageKey: "dudit-password-recovery",
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
            },
        })
    }

    return passwordRecoveryClient
}
