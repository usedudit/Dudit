import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Supabase Auth PKCE Callback Route.
 * This route is called by Supabase after a user clicks on an email confirmation
 * link or completes an OAuth login. It exchanges the "code" parameter for a session.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  
  // if "next" is in the search params, use it as the redirection URL (e.g. for inviting users)
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // If we have a next URL (from searchParams), redirect there
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Fallback: Redirect to home or an error page
  // You can customize this if you have a specific error page
  return NextResponse.redirect(`${origin}/`)
}
