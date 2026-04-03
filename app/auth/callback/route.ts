import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
      // Força o redirecionamento para o domínio real
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
  }

  return NextResponse.redirect(`${baseUrl}/`)
}
