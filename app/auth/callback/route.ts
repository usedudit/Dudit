import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getAdminClient } from "@/lib/supabase/admin"
import { ensureLegalConsents } from "@/app/actions/auth/legal-consent"
import type { EmailOtpType } from "@supabase/supabase-js"

/**
 * Supabase Auth PKCE and Email Confirmation Callback Route.
 * This route is called by Supabase after a user clicks on an email confirmation
 * link or completes an OAuth login. It exchanges the "code" or "token_hash" parameter for a session
 * and sets auth and context cookies directly on the redirect response.
 */

// Só aceita caminhos internos para evitar open-redirect
function getSafeNext(rawNext: string | null): string {
  if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.includes("://")) {
    return rawNext
  }
  return "/"
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash") || searchParams.get("token")
  const type = (searchParams.get("type") as EmailOtpType) || "signup"
  const next = getSafeNext(searchParams.get("next"))
  const errorParam = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"

  if (errorParam) {
    console.error("[AUTH CALLBACK] Error param received from provider:", errorParam, errorDescription)
    return NextResponse.redirect(
      `${baseUrl}/auth/login?error=${encodeURIComponent(errorDescription || errorParam)}`
    )
  }

  const cookieStore = await cookies()
  const redirectResponse = NextResponse.redirect(`${baseUrl}${next}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[AUTH CALLBACK] Missing Supabase environment variables")
    return NextResponse.redirect(`${baseUrl}/auth/login?error=${encodeURIComponent("Erro de configuração do servidor.")}`)
  }

  // Cria o cliente Supabase vinculando os cookies diretamente à resposta do redirecionamento
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
          redirectResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  let authSuccess = false

  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    if (error) {
      console.error("[AUTH CALLBACK] verifyOtp error:", error.message)
      if (type !== "email") {
        const { error: retryError } = await supabase.auth.verifyOtp({
          type: "email",
          token_hash,
        })
        if (!retryError) {
          authSuccess = true
        } else {
          console.error("[AUTH CALLBACK] verifyOtp fallback error:", retryError.message)
        }
      }
    } else {
      authSuccess = true
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("[AUTH CALLBACK] exchangeCodeForSession error:", error.message)
    } else {
      authSuccess = true
    }
  }

  if (authSuccess) {
    // Garantir que todos os cookies de sessão gerados pelo GoTrue no cookieStore estejam na resposta
    cookieStore.getAll().forEach((c) => {
      if (c.name.startsWith("sb-") && !redirectResponse.cookies.has(c.name)) {
        redirectResponse.cookies.set(c.name, c.value)
      }
    })

    const { data: authUserData } = await supabase.auth.getUser()
    const authUser = authUserData?.user

    if (authUser?.id) {
      const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>
      const fullName =
        (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
        (typeof metadata.name === "string" && metadata.name.trim()) ||
        authUser.email?.split("@")[0] ||
        ""

      const admin = getAdminClient()

      // Safety net: ensure user_profiles exists even when DB trigger doesn't run
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
        })
      }

      // LEGAL: garante o aceite dos documentos legais vigentes
      const provider = (authUser.app_metadata?.provider as string) || undefined
      await ensureLegalConsents(
        authUser.id,
        provider === "google" ? "oauth" : "signup"
      )

      // Se o usuário for parceiro, ativa os cookies de contexto para entrar no ERP de imediato
      const { data: partner } = await admin
        .from("partners")
        .select("id, is_active, erp_disabled, suspended_at, stores(id, is_headquarters, is_active, suspended_at)")
        .eq("user_id", authUser.id)
        .maybeSingle()

      if (partner && partner.is_active && !partner.erp_disabled && !partner.suspended_at) {
        redirectResponse.cookies.set("active_partner_id", partner.id, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30, // 30 dias
        })

        const activeStores = (partner.stores || []).filter((s: any) => s.is_active && !s.suspended_at)
        const hqStore = activeStores.find((s: any) => s.is_headquarters) || activeStores[0]
        if (hqStore?.id) {
          redirectResponse.cookies.set("active_store_id", hqStore.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
          })
        }
      }
    }

    // Limpa cookies antigos de geolocalização da sessão anterior
    redirectResponse.cookies.set("dudit_city", "", { maxAge: 0, path: "/" })
    redirectResponse.cookies.set("dudit_state", "", { maxAge: 0, path: "/" })

    return redirectResponse
  }

  // Falha na autenticação ou código/token ausente/expirado
  return NextResponse.redirect(
    `${baseUrl}/auth/login?error=${encodeURIComponent("Não foi possível validar seu acesso. O link pode ter expirado ou já foi utilizado.")}`
  )
}
