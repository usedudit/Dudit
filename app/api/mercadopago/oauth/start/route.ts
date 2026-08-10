import { type NextRequest, NextResponse } from "next/server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser, requireMinimumPlan } from "@/lib/auth/authorization"
import { generateOAuthState } from "@/lib/security/oauth-state"

export const dynamic = "force-dynamic"

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl
}

export async function GET(request: NextRequest) {
  // ✅ base URL segura
  const appUrl = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"
  )

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.redirect(`${appUrl}/auth/login`)
    }

    const clientId = process.env.NEXT_PUBLIC_MP_CLIENT_ID

    if (!clientId) {
      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=missing_client_id`
      )
    }

    const redirectUri = `${appUrl}/api/mercadopago/oauth/callback`

    const supabase = await getSupabaseServerClient()

    const { data: partner } = await supabase
      .from("partners")
      .select("id, user_id")
      .eq("user_id", user.id)
      .single()

    if (!partner) {
      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=partner_not_found`
      )
    }

    try {
      await requireMinimumPlan(partner.id, "crescer")
    } catch {
      return NextResponse.redirect(
        `${appUrl}/erp/settings?tab=integracoes&mp_error=plano_insuficiente`
      )
    }

    const signedState = await generateOAuthState(
      partner.id,
      partner.user_id
    )

    const authUrl = new URL(
      "https://auth.mercadopago.com.br/authorization"
    )

    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("platform_id", "mp")
    authUrl.searchParams.set("state", signedState)
    authUrl.searchParams.set("redirect_uri", redirectUri)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error("Mercado Pago OAuth start error:", error)

    return NextResponse.redirect(
      `${appUrl}/erp/settings?mp_error=oauth_start_failed`
    )
  }
}