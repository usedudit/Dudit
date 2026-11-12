"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"
import { encrypt, decrypt } from "@/lib/cryptoService"
import {
  MERCADOPAGO_PROVIDER,
  findMercadoPagoIntegration,
  getMpRefreshTokenEncrypted,
  mapToMpPartnerFields,
} from "@/lib/services/payments/mercadopago-integration"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"

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

  const admin = getAdminClient()
  const integration = await findMercadoPagoIntegration(admin, ctx.partnerId)

  // Revoga o token no Mercado Pago antes de limpar localmente
  try {
    addMonitoringBreadcrumb({ domain: "payment", message: "mercadopago.disconnect.started", metadata: { partnerId: ctx.partnerId } })
    const accessToken = integration?.access_token_encrypted
      ? decrypt(integration.access_token_encrypted, MERCADOPAGO_PROVIDER)
      : null

    const refreshTokenEncrypted = getMpRefreshTokenEncrypted(integration)
    const refreshToken = refreshTokenEncrypted
      ? decrypt(refreshTokenEncrypted, MERCADOPAGO_PROVIDER)
      : null

    const tokenToRevoke = refreshToken || accessToken

    if (tokenToRevoke) {
      await fetch("https://api.mercadopago.com/oauth/token/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: process.env.MP_CLIENT_ID!,
          client_secret: process.env.MP_CLIENT_SECRET!,
          token: tokenToRevoke,
          token_type_hint: refreshToken ? "refresh_token" : "access_token",
        }),
      })
    }
  } catch (err) {
    captureError(err, {
      module: "payments",
      action: "mercadopago_token_revoke",
      partnerId: ctx.partnerId,
    })
    console.error({ event: "mercadopago_token_revoke_error", partnerId: ctx.partnerId, error: err })
  }

  const { error } = await admin
    .from("partner_integrations")
    .update({
      status: "disconnected",
      account_id: null,
      access_token_encrypted: null,
      credentials: {},
      metadata: {},
      // Connection-scoped settings die with the connection; accepted payment
      // methods are preferences and stay.
      config: { ...(integration?.config || {}), public_key: null, live_mode: null },
      connected_at: null,
      disconnected_at: new Date().toISOString(),
    })
    .eq("partner_id", ctx.partnerId)
    .eq("provider_slug", MERCADOPAGO_PROVIDER)

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
    .eq("partner_id", ctx.partnerId)
    .eq("integration_source", "mercadopago")

  revalidateTag(`mp-status-${ctx.partnerId}`, "max")
  revalidatePath("/erp/configuracoes")
  return { success: true }
}

const getCachedMercadoPagoStatus = (partnerId: string) => unstable_cache(
  async () => {
    const supabase = getAdminClient()
    const [{ data: partner }, integration] = await Promise.all([
      supabase.from("partners").select("id").eq("id", partnerId).single(),
      findMercadoPagoIntegration(supabase, partnerId),
    ])

    if (!partner) {
      throw new Error("Parceiro não encontrado")
    }

    const fields = mapToMpPartnerFields(integration)

    const acceptedPaymentMethods: MpAcceptedPaymentMethods = {
      ...DEFAULT_MP_ACCEPTED_PAYMENT_METHODS,
      ...(fields.mp_accepted_payment_methods || {}),
    }

    return {
      connected: !!fields.mp_user_id,
      connectedAt: fields.mp_connected_at,
      publicKey: fields.mp_public_key,
      liveMode: fields.mp_live_mode ?? null,
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
    captureError(err, {
      module: "payments",
      action: "get_mercadopago_status",
      partnerId: ctx.partnerId,
    })
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

  const { data: partner } = await supabase.from("partners").select("id").eq("id", ctx.partnerId).single()

  if (!partner) {
    return { error: "Parceiro não encontrado" }
  }

  const admin = getAdminClient()
  const integration = await findMercadoPagoIntegration(admin, ctx.partnerId)
  const refreshTokenEncrypted = getMpRefreshTokenEncrypted(integration)

  if (!refreshTokenEncrypted) {
    return { error: "Mercado Pago não conectado" }
  }

  try {
    const refreshToken = decrypt(refreshTokenEncrypted, MERCADOPAGO_PROVIDER)

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

    // JSONB columns are replaced as a whole, so merge with what was read above.
    const metadata = { ...(integration?.metadata || {}) }
    if (expiresAt) {
      metadata.token_expires_at = expiresAt.toISOString()
    } else {
      delete metadata.token_expires_at
    }

    const credentials = { ...(integration?.credentials || {}) }
    if (tokenData.refresh_token) {
      credentials.refresh_token_encrypted = encrypt(tokenData.refresh_token, MERCADOPAGO_PROVIDER)
    }

    const { error } = await admin
      .from("partner_integrations")
      .update({
        access_token_encrypted: encrypt(tokenData.access_token, MERCADOPAGO_PROVIDER),
        credentials,
        metadata,
      })
      .eq("partner_id", ctx.partnerId)
      .eq("provider_slug", MERCADOPAGO_PROVIDER)

    if (error) {
      return { error: error.message }
    }

    revalidateTag(`mp-status-${partner.id}`, "max")
    revalidatePath("/erp/configuracoes")
    return { success: true }
  } catch (error: any) {
    captureError(error, {
      module: "payments",
      action: "refresh_mercadopago_token",
      partnerId: ctx.partnerId,
    })
    return { error: error.message }
  }
}

export async function updateMpAcceptedPaymentMethodsAction(methods: MpAcceptedPaymentMethods) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()

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

  // partner_integrations has no write policy for authenticated users.
  const admin = getAdminClient()
  const integration = await findMercadoPagoIntegration(admin, ctx.partnerId)

  // JSONB columns are replaced as a whole: read-merge-write the config.
  const { error } = await admin.from("partner_integrations").upsert(
    {
      partner_id: ctx.partnerId,
      provider_slug: MERCADOPAGO_PROVIDER,
      config: { ...(integration?.config || {}), accepted_payment_methods: sanitized },
    },
    { onConflict: "partner_id,provider_slug" },
  )

  if (error) {
    return { error: error.message }
  }

  revalidateTag(`mp-status-${ctx.partnerId}`, "max")
  revalidatePath("/erp/configuracoes")
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

  const { checkPartnerPermission } = await import("@/lib/auth/authorization")
  const [ordersPerm, pdvPerm, settingsPerm] = await Promise.all([
    checkPartnerPermission(ctx.partnerId, "orders", "view"),
    checkPartnerPermission(ctx.partnerId, "pdv", "sell"),
    checkPartnerPermission(ctx.partnerId, "settings", "settings_integrations"),
  ])

  if (!ordersPerm.allowed && !pdvPerm.allowed && !settingsPerm.allowed) {
    return { error: "Acesso negado para consultar status do pagamento" }
  }

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
    captureError(error, {
      module: "payments",
      action: "check_mercadopago_payment_status",
      partnerId: ctx.partnerId,
      entityId: paymentId,
    })
    return { error: error.message }
  }
}
