import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { encrypt } from "@/lib/cryptoService"
import { validateOAuthState } from "@/lib/security/oauth-state"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state") // partner ID
  const error = searchParams.get("error")

  if (error) {
    return NextResponse.redirect(new URL(`/erp/settings?mp_error=${encodeURIComponent(error)}`, request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/erp/settings?mp_error=missing_code", request.url))
  }

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    const supabase = await getSupabaseServerClient()

    // SECURITY FIX (HIGH-01): Validate signed OAuth state token
    const stateValidation = await validateOAuthState(state, user.id)
    if (!stateValidation.valid || !stateValidation.partnerId) {
      console.warn({
        event: "oauth_invalid_state",
        error: !stateValidation.valid ? stateValidation.error : "Missing partnerId"
      })
      return NextResponse.redirect(new URL("/erp/settings?mp_error=invalid_state", request.url))
    }

    const partnerId = stateValidation.partnerId

    const { data: partner } = await supabase
      .from("partners")
      .select("*")
      .eq("id", partnerId)
      .eq("user_id", user.id)
      .single()

    if (!partner) {
      return NextResponse.redirect(new URL("/erp/settings?mp_error=unauthorized", request.url))
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"}/api/mercadopago/oauth/callback`



    interface MercadoPagoTokenResponse {
      access_token: string
      refresh_token?: string
      user_id: number
      expires_in?: number
    }

    const tokenController = new AbortController()
    const tokenTimeoutId = setTimeout(() => tokenController.abort(), 10000)

    let tokenResponse;
    try {
      tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: process.env.MP_CLIENT_ID!,
          client_secret: process.env.MP_CLIENT_SECRET!,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri,
        }),
        signal: tokenController.signal
      })
      clearTimeout(tokenTimeoutId)
    } catch (fetchError) {
      clearTimeout(tokenTimeoutId)
      console.error({
        event: "oauth_token_exchange_network_error",
        error: fetchError instanceof Error ? fetchError.message : "Unknown error"
      })
      return NextResponse.redirect(new URL("/erp/settings?mp_error=token_exchange_failed", request.url))
    }

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => null)
      console.error({
        event: "oauth_token_exchange_failed",
        status: tokenResponse.status,
        code: errorData?.error
      })
      return NextResponse.redirect(new URL("/erp/settings?mp_error=token_exchange_failed", request.url))
    }

    const tokenData = (await tokenResponse.json()) as MercadoPagoTokenResponse

    if (!tokenData.access_token || !tokenData.user_id) {
      console.error({
        event: "oauth_invalid_token_response",
        error: "Missing access_token or user_id",
      })
      return NextResponse.redirect(new URL("/erp/settings?mp_error=invalid_token_response", request.url))
    }

    const publicKey = process.env.MP_PUBLIC_KEY || null

    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null



    const { error: updateError } = await supabase
      .from("partners")
      .update({
        mp_user_id: tokenData.user_id?.toString(),
        mp_access_token_encrypted: encrypt(tokenData.access_token, "mercadopago"),
        mp_refresh_token_encrypted: tokenData.refresh_token
          ? encrypt(tokenData.refresh_token, "mercadopago")
          : null,
        mp_public_key: publicKey,
        mp_token_expires_at: expiresAt?.toISOString(),
        mp_connected_at: new Date().toISOString(),
      })
      .eq("id", partnerId)

    if (updateError) {
      console.error("Error saving MP tokens:", updateError)
      return NextResponse.redirect(new URL("/erp/settings?mp_error=save_failed", request.url))
    }



    // Limpa o cache do carrinho para forçar revalidação com a nova public key
    try {
      const { revalidateCart } = await import("@/lib/utils/revalidation")
      await revalidateCart()
    } catch (err) {
      console.error("Error clearing cache:", err)
    }

    return NextResponse.redirect(new URL("/erp/settings?mp_connected=true", request.url))
  } catch (error: any) {
    console.error("MP OAuth callback error:", error)
    return NextResponse.redirect(new URL(`/erp/settings?mp_error=${encodeURIComponent(error.message)}`, request.url))
  }
}
