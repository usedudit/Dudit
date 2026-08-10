import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser, requireMinimumPlan } from "@/lib/auth/authorization"
import { encrypt } from "@/lib/cryptoService"
import { validateOAuthState } from "@/lib/security/oauth-state"

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  // ✅ BASE URL SEGURA (sem depender do request)
  const appUrl = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"
  )

  if (error) {
    const mpError = errorDescription
      ? `${error}: ${errorDescription}`
      : error

    return NextResponse.redirect(
      `${appUrl}/erp/settings?mp_error=${encodeURIComponent(mpError)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/erp/settings?mp_error=missing_code`
    )
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.redirect(`${appUrl}/auth/login`)
    }

    const supabase = await getSupabaseServerClient()

    // SECURITY: valida state
    const stateValidation = await validateOAuthState(state, user.id)

    if (!stateValidation.valid || !stateValidation.partnerId) {
      console.warn({
        event: "oauth_invalid_state",
        error: !stateValidation.valid
          ? stateValidation.error
          : "Missing partnerId",
      })

      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=invalid_state`
      )
    }

    const partnerId = stateValidation.partnerId

    const { data: partner } = await supabase
      .from("partners")
      .select("*")
      .eq("id", partnerId)
      .eq("user_id", user.id)
      .single()

    if (!partner) {
      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=unauthorized`
      )
    }

    try {
      await requireMinimumPlan(partner.id, "crescer")
    } catch {
      return NextResponse.redirect(
        `${appUrl}/erp/settings?tab=integracoes&mp_error=plano_insuficiente`
      )
    }

    const redirectUri = `${appUrl}/api/mercadopago/oauth/callback`

    interface MercadoPagoTokenResponse {
      access_token: string
      refresh_token?: string
      user_id: number
      expires_in?: number
      public_key?: string
      live_mode?: boolean
    }

    const tokenController = new AbortController()
    const tokenTimeoutId = setTimeout(
      () => tokenController.abort(),
      10000
    )

    let tokenResponse

    try {
      tokenResponse = await fetch(
        "https://api.mercadopago.com/oauth/token",
        {
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
          signal: tokenController.signal,
        }
      )

      clearTimeout(tokenTimeoutId)
    } catch (fetchError) {
      clearTimeout(tokenTimeoutId)

      console.error({
        event: "oauth_token_exchange_network_error",
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "Unknown error",
      })

      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=token_exchange_failed`
      )
    }

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => null)

      const detailedError = errorData?.error_description
        ? `${errorData?.error || "oauth_error"}:${errorData.error_description}`
        : errorData?.error || `status_${tokenResponse.status}`

      console.error({
        event: "oauth_token_exchange_failed",
        status: tokenResponse.status,
        code: errorData?.error,
      })

      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=${encodeURIComponent(detailedError)}`
      )
    }

    const tokenData =
      (await tokenResponse.json()) as MercadoPagoTokenResponse

    if (!tokenData.access_token || !tokenData.user_id) {
      console.error({
        event: "oauth_invalid_token_response",
        error: "Missing access_token or user_id",
      })

      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=invalid_token_response`
      )
    }

    const publicKey = tokenData.public_key || process.env.MP_PUBLIC_KEY || null

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null

    const { error: updateError } = await supabase
      .from("partners")
      .update({
        mp_user_id: tokenData.user_id?.toString(),
        mp_access_token_encrypted: encrypt(
          tokenData.access_token,
          "mercadopago"
        ),
        mp_refresh_token_encrypted: tokenData.refresh_token
          ? encrypt(tokenData.refresh_token, "mercadopago")
          : null,
        mp_public_key: publicKey,
        mp_live_mode: tokenData.live_mode ?? null,
        mp_token_expires_at: expiresAt?.toISOString(),
        mp_connected_at: new Date().toISOString(),
      })
      .eq("id", partnerId)

    if (updateError) {
      console.error("Error saving MP tokens:", updateError)

      return NextResponse.redirect(
        `${appUrl}/erp/settings?mp_error=save_failed`
      )
    }

    // Ensure dedicated Mercado Pago finance account exists and is locked while connected.
    let { data: existingMpAccount } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("integration_source", "mercadopago")
      .limit(1)
      .maybeSingle()

    if (!existingMpAccount?.id) {
      const { data: existingByName } = await supabase
        .from("finance_accounts")
        .select("id")
        .eq("partner_id", partnerId)
        .ilike("name", "Mercado Pago")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      existingMpAccount = existingByName || null
    }

    if (existingMpAccount?.id) {
      await supabase
        .from("finance_accounts")
        .update({
          name: "Mercado Pago",
          type: "wallet",
          is_system_managed: true,
          integration_source: "mercadopago",
          is_active: true,
        })
        .eq("id", existingMpAccount.id)
        .eq("partner_id", partnerId)
    } else {
      await supabase
        .from("finance_accounts")
        .insert({
          partner_id: partnerId,
          name: "Mercado Pago",
          type: "wallet",
          initial_balance: 0,
          current_balance: 0,
          is_active: true,
          is_system_managed: true,
          integration_source: "mercadopago",
        })
    }

    // limpa cache
    try {
      const { revalidateCart } = await import(
        "@/lib/utils/revalidation"
      )
      await revalidateCart()
    } catch (err) {
      console.error("Error clearing cache:", err)
    }

    return NextResponse.redirect(
      `${appUrl}/erp/settings?mp_connected=true`
    )
  } catch (error: any) {
    console.error("MP OAuth callback error:", error)

    return NextResponse.redirect(
      `${appUrl}/erp/settings?mp_error=${encodeURIComponent(
        error.message
      )}`
    )
  }
}