"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export async function disconnectMercadoPagoAction() {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: partner } = await supabase.from("partners").select("id").eq("user_id", user.id).single()

  if (!partner) {
    return { error: "Parceiro não encontrado" }
  }

  const { error } = await supabase
    .from("partners")
    .update({
      mp_user_id: null,
      mp_access_token_encrypted: null,
      mp_refresh_token_encrypted: null,
      mp_public_key: null,
      mp_token_expires_at: null,
      mp_connected_at: null,
    })
    .eq("id", partner.id)

  if (error) {
    return { error: error.message }
  }

  await supabase
    .from("finance_accounts")
    .update({
      is_system_managed: true,
      integration_source: "mercadopago",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("partner_id", partner.id)
    .eq("integration_source", "mercadopago")

  revalidatePath("/erp/settings")
  return { success: true }
}

export async function getMercadoPagoStatusAction() {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: partner } = await supabase
    .from("partners")
    .select("mp_user_id, mp_connected_at, mp_public_key")
    .eq("user_id", user.id)
    .single()

  if (!partner) {
    return { error: "Parceiro não encontrado" }
  }

  return {
    connected: !!partner.mp_user_id,
    connectedAt: partner.mp_connected_at,
    publicKey: partner.mp_public_key,
  }
}

export async function refreshMercadoPagoTokenAction() {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: partner } = await supabase.from("partners").select("*").eq("user_id", user.id).single()

  if (!partner || !partner.mp_refresh_token_encrypted) {
    return { error: "Mercado Pago não conectado" }
  }

  try {
    const refreshToken = decrypt(partner.mp_refresh_token_encrypted, "mercadopago")

    const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: process.env.MP_CLIENT_ID!,
        client_secret: process.env.MP_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    if (!tokenResponse.ok) {
      return { error: "Erro ao renovar token" }
    }

    const tokenData = await tokenResponse.json()

    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null

    const { error } = await supabase
      .from("partners")
      .update({
        mp_access_token_encrypted: encrypt(tokenData.access_token, "mercadopago"),
        mp_refresh_token_encrypted: tokenData.refresh_token
          ? encrypt(tokenData.refresh_token, "mercadopago")
          : partner.mp_refresh_token_encrypted,
        mp_token_expires_at: expiresAt?.toISOString(),
      })
      .eq("id", partner.id)

    if (error) {
      return { error: error.message }
    }

    revalidatePath("/erp/settings")
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}
