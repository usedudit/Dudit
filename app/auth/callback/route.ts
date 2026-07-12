import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAdminClient } from "@/lib/supabase/admin"

/**
 * Supabase Auth PKCE Callback Route.
 * This route is called by Supabase after a user clicks on an email confirmation
 * link or completes an OAuth login. It exchanges the "code" parameter for a session.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url) // Tirei o 'origin' daqui
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  // Use sua variável de ambiente ou o domínio fixo
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: authUserData } = await supabase.auth.getUser()
      const authUser = authUserData?.user

      if (authUser?.id) {
        const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>
        const fullName =
          (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
          (typeof metadata.name === "string" && metadata.name.trim()) ||
          authUser.email?.split("@")[0] ||
          ""

        // Safety net: ensure user_profiles exists even when DB trigger doesn't run.
        const admin = getAdminClient()
        const { error: profileError } = await admin
          .from("user_profiles")
          .upsert(
            {
              user_id: authUser.id,
              full_name: fullName,
              pending_partner_registration: false,
            },
            { onConflict: "user_id" }
          )

        if (profileError) {
          console.error("[AUTH CALLBACK] Failed to ensure user_profiles:", {
            userId: authUser.id,
            code: profileError.code,
            message: profileError.message,
            details: profileError.details,
          })
        }
      }

      // Clear old city cookie so a new user doesn't see previous user's city
      const response = NextResponse.redirect(`${baseUrl}${next}`)
      response.cookies.set("dudit_city", "", { maxAge: 0, path: "/" })
      response.cookies.set("dudit_state", "", { maxAge: 0, path: "/" })
      return response
    }
  }

  return NextResponse.redirect(`${baseUrl}/`)
}
