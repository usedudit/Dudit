"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export type MpAcceptedPaymentMethods = {
  credit_card: boolean
  debit_card: boolean
  pix: boolean
  boleto: boolean
  mercado_pago_wallet: boolean
}

const DEFAULT_MP_ACCEPTED_PAYMENT_METHODS: MpAcceptedPaymentMethods = {
  credit_card: true,
  debit_card: true,
  pix: true,
  boleto: true,
  mercado_pago_wallet: true,
}

export async function disconnectMercadoPagoAction() {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }

  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const { data: partner } = await supabase.from("partners").select("id").eq("id", ctx.partnerId).single()

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

  revalidateTag(`mp-status-${partner.id}`, "max")
  revalidatePath("/erp/settings")
  return { success: true }
}

const getCachedMercadoPagoStatus = (partnerId: string) => unstable_cache(
  async () => {
    const supabase = await getSupabaseServerClient()
    const { data: partner } = await supabase
      .from("partners")
      .select("mp_user_id, mp_connected_at, mp_public_key, mp_accepted_payment_methods")
      .eq("id", partnerId)
      .single()

    if (!partner) {
      throw new Error("Parceiro não encontrado")
    }

    const acceptedPaymentMethods: MpAcceptedPaymentMethods = {
      ...DEFAULT_MP_ACCEPTED_PAYMENT_METHODS,
      ...(partner.mp_accepted_payment_methods as Partial<MpAcceptedPaymentMethods> || {}),
    }

    return {
      connected: !!partner.mp_user_id,
      connectedAt: partner.mp_connected_at,
      publicKey: partner.mp_public_key,
      acceptedPaymentMethods,
    }
  },
  [`mp-status-${partnerId}`],
  {
    tags: [`mp-status-${partnerId}`],
    revalidate: 3600 // Cache for 1 hour
  }
)

export async function getMercadoPagoStatusAction() {
  const user = await requireUser()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  try {
    const status = await getCachedMercadoPagoStatus(ctx.partnerId)()
    return status
  } catch (err: any) {
    return { error: err?.message || "Erro ao carregar status do Mercado Pago" }
  }
}

export async function refreshMercadoPagoTokenAction() {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const { data: partner } = await supabase.from("partners").select("*").eq("id", ctx.partnerId).single()

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

    revalidateTag(`mp-status-${partner.id}`, "max")
    revalidatePath("/erp/settings")
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function updateMpAcceptedPaymentMethodsAction(methods: MpAcceptedPaymentMethods) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }

  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  // Sanitize: only keep valid boolean keys
  const sanitized: MpAcceptedPaymentMethods = {
    credit_card: Boolean(methods.credit_card),
    debit_card: Boolean(methods.debit_card),
    pix: Boolean(methods.pix),
    boleto: Boolean(methods.boleto),
    mercado_pago_wallet: Boolean(methods.mercado_pago_wallet),
  }

  const { error } = await supabase
    .from("partners")
    .update({ mp_accepted_payment_methods: sanitized })
    .eq("id", ctx.partnerId)

  if (error) {
    return { error: error.message }
  }

  revalidateTag(`mp-status-${ctx.partnerId}`, "max")
  revalidatePath("/erp/settings")
  return { success: true }
}

/**
 * Public getter: any logged-in user can read (storefront/checkout data).
 * Returns the accepted payment methods for a given partner.
 */
export async function getMpAcceptedPaymentMethodsPublicAction(partnerId: string) {
  await requireUser()
  try {
    const status = await getCachedMercadoPagoStatus(partnerId)()
    return status.acceptedPaymentMethods
  } catch (err) {
    return { ...DEFAULT_MP_ACCEPTED_PAYMENT_METHODS }
  }
}

export async function checkMercadoPagoPaymentStatusAction(paymentId: string) {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  if (!/^\d+$/.test(paymentId)) {
    return { error: "ID de pagamento inválido" }
  }

  const { getValidMercadoPagoAccessToken } = await import("@/lib/mercadopago/token-manager")
  let mpAccessToken: string
  try {
    mpAccessToken = await getValidMercadoPagoAccessToken(ctx.partnerId)
  } catch (err: any) {
    return { error: "Configuração de pagamento indisponível" }
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
      },
    })

    if (!response.ok) {
      return { error: "Falha ao consultar pagamento no Mercado Pago" }
    }

    const paymentData = await response.json()
    return {
      success: true,
      status: paymentData.status,
      statusDetail: paymentData.status_detail,
    }
  } catch (error: any) {
    return { error: error.message }
  }
}
