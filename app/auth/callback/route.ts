import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { NextResponse } from "next/server"

// SECURITY FIX (CRIT-01): createUserProfile removed — profiles auto-created by DB trigger
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const token_hash = requestUrl.searchParams.get("token_hash")
  const type = requestUrl.searchParams.get("type")

  // Proteção contra Open Redirect: Garante que o 'next' começa com /
  const next = requestUrl.searchParams.get("next")?.startsWith("/")
    ? requestUrl.searchParams.get("next")
    : "/"

  const origin = requestUrl.origin
  const supabase = await getSupabaseServerClient()

  // 1. Check for errors from Supabase in the URL
  const error_code = requestUrl.searchParams.get("error")
  const error_description = requestUrl.searchParams.get("error_description")
  if (error_code) {
    console.error("[Auth Callback] Supabase returned error:", error_code, error_description)
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error_description || error_code)}`)
  }

  // 2. Fluxo PKCE (Padrão para Login/Magic Link/Email Confirmation)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return handleRedirection(supabase, origin, next!)
    }
    console.error("[Auth] Erro no exchangeCode:", error)
  }

  // 3. Fluxo OTP/Token Hash (Verificação de E-mail / Recuperação de Senha legado)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    })

    if (!error) {
      return handleRedirection(supabase, origin, next!)
    }
    console.error("[Auth] Erro no verifyOtp:", error)
  }

  // Falha genérica
  console.error("[Auth Callback] Nenhum código válido ou erro ocorrido:", { code, token_hash, type })
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_failed`)
}

// Helper para centralizar a lógica de para onde o usuário vai
async function handleRedirection(supabase: any, origin: string, nextPath: string) {
  // Verifica se o usuário é um parceiro para redirecionar corretamente
  const user = await getCurrentUser()

  if (user) {
    // SECURITY FIX (CRIT-01): Profile creation is now handled by the
    // database trigger on auth.users. We only check for existence here
    // as a read-only guard for routing decisions.
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!existingProfile) {
      // Fallback: create profile if DB trigger didn't fire
      const displayName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Usuário"

      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          full_name: displayName,
          pending_partner_registration: false,
        })

      if (insertError) {
        console.error("[Auth Callback] Failed to create fallback profile for:", user.id, insertError)
      } else {
        console.warn("[Auth Callback] Profile created via fallback for:", user.id, "— DB trigger may not be active")
      }
    }

    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()

    // Se for parceiro e a rota não for específica, joga pro dashboard
    if (partner && (nextPath === "/" || nextPath === "/auth/login")) {
      return NextResponse.redirect(`${origin}/erp/dashboard`)
    }

    // Se estava tentando ir para o wizard de parceiro mas já tem parceiro
    if (partner && nextPath.includes("mode=partner")) {
      return NextResponse.redirect(`${origin}/erp/dashboard`)
    }
  }

  // Redirect to invite accept flow preserving query params (e.g., ?token=xxx)
  if (nextPath.startsWith("/invite/accept")) {
    return NextResponse.redirect(`${origin}${nextPath}`)
  }

  // Redirecionamento padrão (usuário comum ou rota específica solicitada)
  return NextResponse.redirect(`${origin}${nextPath}`)
}
