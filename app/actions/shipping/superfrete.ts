"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { revalidateOrders, safeRevalidateTag } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import {
  createSuperFreteClient,
  type SuperFreteEnvironment,
  type SuperFreteQuoteParams,
  type SuperFreteCreateLabelParams,
  type SuperFreteServiceId,
  SUPERFRETE_SERVICE_IDS,
  DEFAULT_SUPERFRETE_EVENTS,
  SERVICE_LABELS,
} from "@/lib/services/shipping/superfrete"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"

const SUPERFRETE_WEBHOOK_URL = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL}/api/shipping/superfrete/webhook`
const SUPERFRETE_PROVIDER = "superfrete"

export interface PartnerIntegrationRow {
  id: string
  partner_id: string
  provider_slug: string
  status: "connected" | "disconnected" | "pending" | "error"
  account_id: string | null
  account_email: string | null
  access_token_encrypted: string | null
  webhook_secret_encrypted: string | null
  webhook_id: string | null
  config: Record<string, any>
  credentials: Record<string, any>
  metadata: Record<string, any>
  connected_at: string | null
}

async function getSuperFreteIntegration(
  supabase: ReturnType<typeof getAdminClient>,
  partnerId: string,
): Promise<PartnerIntegrationRow | null> {
  const { data } = await supabase
    .from("partner_integrations")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("provider_slug", SUPERFRETE_PROVIDER)
    .maybeSingle()
  return (data as PartnerIntegrationRow) || null
}

function resolveSuperFreteEnvironment(
  explicit: unknown,
  fallback?: unknown,
): SuperFreteEnvironment {
  if (explicit === "sandbox" || explicit === "production") return explicit
  if (fallback === "sandbox" || fallback === "production") return fallback
  return process.env.NODE_ENV === "production" ? "production" : "sandbox"
}

function createClientFromIntegration(integration: PartnerIntegrationRow | null) {
  if (!integration?.access_token_encrypted) return null
  const token = decrypt(integration.access_token_encrypted, SUPERFRETE_PROVIDER)
  const environment = resolveSuperFreteEnvironment((integration.config as SuperFreteConfig)?.environment)
  return createSuperFreteClient(token, integration.account_email || undefined, environment)
}

export interface SuperFreteStatus {
  connected: boolean
  email?: string
  connectedAt?: string | null
  balance?: number
  webhookConfigured: boolean
  planAllowed: boolean
  config?: SuperFreteConfig | null
}

export interface SuperFreteConfig {
  originCep?: string
  height?: number
  width?: number
  length?: number
  weight?: number
  insuranceValue?: number
  ownHand?: boolean
  receipt?: boolean
  services?: SuperFreteServiceId[]
  environment?: SuperFreteEnvironment
}

export async function getSuperFreteStatusAction(): Promise<{
  success: true
  data: SuperFreteStatus
} | { success: false; error: string }> {
  const user = await requireUser()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  try {
    const supabase = getAdminClient()
    const integration = await getSuperFreteIntegration(supabase, ctx.partnerId)

    const plan = await getPartnerPlan(ctx.partnerId)
    const planSlug = plan?.slug || "free"
    const planAllowed = hasMinimumPlan(planSlug, "escalar")

    const connected = integration?.status === "connected" && Boolean(integration?.access_token_encrypted)

    let balance: number | undefined
    let userEmail = integration?.account_email || undefined

    const statusClient = createClientFromIntegration(integration)
    if (connected && statusClient) {
      try {
        const userInfo = await statusClient.getUserInfo()
        balance = userInfo.balance
        if (userInfo.email && !userEmail) userEmail = userInfo.email
      } catch (err) {
        captureError(err, {
          module: "shipping",
          action: "get_superfrete_status",
          partnerId: ctx.partnerId,
        })
      }
    }

    return {
      success: true,
      data: {
        connected,
        email: userEmail,
        connectedAt: integration?.connected_at,
        balance,
        webhookConfigured: Boolean(integration?.webhook_id),
        planAllowed,
        config: (integration?.config as SuperFreteConfig) || null,
      },
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_superfrete_status",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao carregar status do SuperFrete" }
  }
}

export async function connectSuperFreteAction(payload: {
  token: string
  webhookSecret?: string
  environment?: SuperFreteEnvironment
}): Promise<{ success: boolean; error?: string; balance?: number; email?: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const plan = await getPartnerPlan(ctx.partnerId)
  const planSlug = plan?.slug || "free"
  if (!hasMinimumPlan(planSlug, "escalar")) {
    return { success: false, error: "Recursos de entrega nacional exigem o plano Escalar." }
  }

  const token = payload.token.trim()
  if (!token) {
    return { success: false, error: "Token de API é obrigatório." }
  }

  addMonitoringBreadcrumb({
    domain: "orders",
    message: "superfrete.connect.started",
    metadata: { partnerId: ctx.partnerId },
  })

  const supabase = getAdminClient()

  try {
    const existing = await getSuperFreteIntegration(supabase, ctx.partnerId)
    const existingConfig = (existing?.config as Record<string, any> | null) || {}
    const environment = resolveSuperFreteEnvironment(payload.environment, existingConfig.environment)

    const client = createSuperFreteClient(token, undefined, environment)
    const userInfo = await client.getUserInfo()

    const encryptedToken = encrypt(token, "superfrete")

    const webhookSecret = payload.webhookSecret
      ? encrypt(payload.webhookSecret.trim(), "superfrete")
      : null

    const { error } = await supabase.from("partner_integrations").upsert(
      {
        partner_id: ctx.partnerId,
        provider_slug: SUPERFRETE_PROVIDER,
        status: "connected",
        account_id: userInfo.id || null,
        account_email: userInfo.email || null,
        access_token_encrypted: encryptedToken,
        webhook_secret_encrypted: webhookSecret,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        config: { ...existingConfig, environment },
      },
      { onConflict: "partner_id,provider_slug" },
    )

    if (error) {
      return { success: false, error: error.message }
    }

    try {
      await setupSuperFreteWebhookInternal(ctx.partnerId, token, webhookSecret)
    } catch (webhookErr: any) {
      console.warn("[SuperFrete] Webhook registration failed (non-blocking):", webhookErr.message)
    }

    await safeRevalidateTag(TAGS.partner(ctx.partnerId))
    revalidatePath("/erp/configuracoes/integracoes")

    return {
      success: true,
      balance: userInfo.balance,
      email: userInfo.email,
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "connect_superfrete",
      partnerId: ctx.partnerId,
    })
    return {
      success: false,
      error: err?.message || "Falha ao conectar ao SuperFrete. Verifique o token informado.",
    }
  }
}

export async function disconnectSuperFreteAction(): Promise<{ success: boolean; error?: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const supabase = getAdminClient()

  try {
    const integration = await getSuperFreteIntegration(supabase, ctx.partnerId)
    const client = createClientFromIntegration(integration)

    if (client) {
      try {
        await client.listWebhooks()
      } catch (err) {
        console.warn("[SuperFrete] Error during disconnect webhook cleanup:", err)
      }
    }

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        account_id: null,
        account_email: null,
        webhook_id: null,
        webhook_secret_encrypted: null,
        disconnected_at: new Date().toISOString(),
      })
      .eq("partner_id", ctx.partnerId)
      .eq("provider_slug", SUPERFRETE_PROVIDER)

    if (error) {
      return { success: false, error: error.message }
    }

    await safeRevalidateTag(TAGS.partner(ctx.partnerId))
    revalidatePath("/erp/configuracoes/integracoes")

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "disconnect_superfrete",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: "Erro inesperado ao desconectar." }
  }
}

export async function saveSuperFreteConfigAction(config: SuperFreteConfig): Promise<{
  success: boolean
  error?: string
}> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  try {
    const supabase = getAdminClient()
    const existing = await getSuperFreteIntegration(supabase, ctx.partnerId)
    const existingConfig = (existing?.config as Record<string, any> | null) || {}

    const sanitized: SuperFreteConfig = {
      originCep: typeof config.originCep === "string" ? config.originCep.replace(/\D/g, "").slice(0, 8) : undefined,
      height: clampNumber(config.height, 0, 200),
      width: clampNumber(config.width, 0, 200),
      length: clampNumber(config.length, 0, 200),
      weight: clampNumber(config.weight, 0, 300),
      insuranceValue: clampNumber(config.insuranceValue, 0, 100000),
      ownHand: Boolean(config.ownHand),
      receipt: Boolean(config.receipt),
      services: Array.isArray(config.services)
        ? (config.services.filter((s) => SUPERFRETE_SERVICE_IDS.includes(s)) as SuperFreteServiceId[])
        : undefined,
    }

    const environment = resolveSuperFreteEnvironment(config.environment, existingConfig.environment)

    const { error } = await supabase
      .from("partner_integrations")
      .upsert(
        {
          partner_id: ctx.partnerId,
          provider_slug: SUPERFRETE_PROVIDER,
          config: { ...existingConfig, ...sanitized, environment },
        },
        { onConflict: "partner_id,provider_slug" },
      )

    if (error) {
      return { success: false, error: error.message }
    }

    await safeRevalidateTag(TAGS.partner(ctx.partnerId))

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "save_superfrete_config",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: "Erro ao salvar configurações do SuperFrete." }
  }
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const num = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(num)) return undefined
  return Math.min(max, Math.max(min, num))
}

async function setupSuperFreteWebhookInternal(
  partnerId: string,
  token: string,
  webhookSecretEncrypted: string | null,
): Promise<void> {
  if (!webhookSecretEncrypted) return

  try {
    const webhookSecret = decrypt(webhookSecretEncrypted, "superfrete")
    const supabase = getAdminClient()
    const integration = await getSuperFreteIntegration(supabase, partnerId)
    const environment = resolveSuperFreteEnvironment((integration?.config as SuperFreteConfig)?.environment)
    const client = createSuperFreteClient(token, undefined, environment)

    // Check if a webhook is already registered
    const existingWebhooks = await client.listWebhooks()
    const existing = existingWebhooks.find(
      (w: any) => w.url?.includes("api/shipping/superfrete/webhook"),
    )

    if (existing) {
      await client.updateWebhook(existing.id, {
        name: "Dudit ERP Integration",
        url: SUPERFRETE_WEBHOOK_URL,
        events: DEFAULT_SUPERFRETE_EVENTS,
        is_active: true,
      })
    } else {
      await client.createWebhook("Dudit ERP Integration", SUPERFRETE_WEBHOOK_URL, DEFAULT_SUPERFRETE_EVENTS)
    }

    const { error } = await getAdminClient()
      .from("partner_integrations")
      .update({ webhook_id: existing?.id || "pending" })
      .eq("partner_id", partnerId)
      .eq("provider_slug", SUPERFRETE_PROVIDER)

    if (error) {
      console.warn("[SuperFrete] Failed to save webhook ID:", error.message)
    }
  } catch (err) {
    console.error("[SuperFrete] Webhook setup failed:", err)
    throw err
  }
}

export async function quoteSuperFreteAction(payload: {
  partnerId: string
  fromPostalCode: string
  toPostalCode: string
  services?: SuperFreteServiceId[]
  package: {
    height: number
    width: number
    length: number
    weight: number
  }
  options?: {
    own_hand?: boolean
    receipt?: boolean
    insurance_value?: number
    use_insurance_value?: boolean
  }
}): Promise<{ success: true; quotes: any[] } | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "view", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, payload.partnerId)
  const client = createClientFromIntegration(integration)

  if (!client) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    const quoteParams: SuperFreteQuoteParams = {
      fromPostalCode: payload.fromPostalCode,
      toPostalCode: payload.toPostalCode,
      services: payload.services && payload.services.length > 0
        ? payload.services
        : [...SUPERFRETE_SERVICE_IDS],
      package: payload.package,
      options: payload.options,
    }

    const quotes = await client.calculateFreight(quoteParams)

    return { success: true, quotes }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "quote_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao cotar frete." }
  }
}

export async function generateSuperFreteLabelAction(payload: {
  partnerId: string
  orderId: string
  service: SuperFreteServiceId
  from: NonNullable<SuperFreteCreateLabelParams["from"]>
  to: NonNullable<SuperFreteCreateLabelParams["to"]>
  products: NonNullable<SuperFreteCreateLabelParams["products"]>
  volumes: NonNullable<SuperFreteCreateLabelParams["volumes"]>
  options?: NonNullable<SuperFreteCreateLabelParams["options"]>
  tags?: NonNullable<SuperFreteCreateLabelParams["tags"]>
}): Promise<{
  success: true
  label: { id: string; price: number; status: string; tracking?: string; printUrl?: string; serviceId: number }
  error?: string
} | { success: false; error: string }> {
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "edit", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, payload.partnerId)
  const client = createClientFromIntegration(integration)

  if (!client) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    const order = await client.createOrder({
      service: payload.service,
      from: payload.from,
      to: payload.to,
      products: payload.products,
      volumes: payload.volumes,
      options: payload.options,
      tags: payload.tags,
    })

    const createResult = {
      id: order.id,
      price: order.price,
      status: order.status,
      serviceId: order.service_id || payload.service,
      tracking: order.tracking,
      printUrl: order.print?.url,
    }

    const serviceId = order.service_id || payload.service
    await supabase.from("order_shipments").insert({
      order_id: payload.orderId,
      partner_id: payload.partnerId,
      integration_id: integration!.id,
      provider_slug: SUPERFRETE_PROVIDER,
      status: order.status || "pending",
      service_code: String(serviceId),
      service_name: SERVICE_LABELS[serviceId] || SERVICE_LABELS[payload.service],
      carrier: "SuperFrete",
      external_label_id: order.id,
      price: typeof order.price === "number" ? order.price : null,
      tracking_number: order.tracking || null,
      label_url: order.print?.url || null,
      requested_at: new Date().toISOString(),
      payload: { service: payload.service, service_id: serviceId, response_status: order.status },
    })

    revalidateOrders(payload.partnerId)

    return { success: true, label: createResult }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "generate_label_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao criar etiqueta." }
  }
}

export async function checkoutSuperFreteLabelAction(payload: {
  partnerId: string
  orderId: string
  labelId: string
}): Promise<{
  success: true
  result: { tracking?: string; trackingUrl?: string; printUrl?: string; status: string }
} | { success: false; error: string }> {
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "edit", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, payload.partnerId)
  const client = createClientFromIntegration(integration)

  if (!client) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    // Credit check: the seller pays from their own SuperFrete wallet.
    try {
      const [labelInfo, userInfo] = await Promise.all([
        client.getOrderInfo(payload.labelId),
        client.getUserInfo(),
      ])
      const price = Number(labelInfo.price || 0)
      const balance = Number(userInfo.balance ?? 0)
      if (balance < price) {
        return {
          success: false,
          error: `Saldo insuficiente na carteira SuperFrete: disponível R$ ${balance.toFixed(2)}, necessário R$ ${price.toFixed(2)}. Recarregue em https://sandbox.superfrete.com/#/account/credits`,
        }
      }
    } catch (checkErr) {
      console.warn("[SuperFrete] Balance pre-check failed (continuing):", checkErr)
    }

    const checkout = await client.checkoutOrders([payload.labelId])

    const orderData = checkout.purchase.orders.find((o: any) => o.id === payload.labelId)

    if (!checkout.success || !orderData) {
      return {
        success: false,
        error: "Falha ao finalizar pagamento da etiqueta. Verifique saldo na SuperFrete.",
      }
    }

    let printUrl: string | undefined
    if (orderData.print?.url) {
      printUrl = orderData.print.url
    } else {
      try {
        const labelPrint = await client.getLabelPrintUrl([payload.labelId])
        printUrl = labelPrint.url
      } catch (err) {
        console.warn("[SuperFrete] Failed to get print URL:", err)
      }
    }

    const trackingUrl = orderData.tracking
      ? `https://rastreio.superfrete.com/#/tracking/${orderData.tracking}`
      : undefined

    await supabase
      .from("order_shipments")
      .update({
        status: "released",
        tracking_number: orderData.tracking || null,
        tracking_url: trackingUrl || null,
        label_url: printUrl || null,
        paid_at: new Date().toISOString(),
      })
      .eq("partner_id", payload.partnerId)
      .eq("external_label_id", payload.labelId)

    revalidateOrders(payload.partnerId)

    return {
      success: true,
      result: {
        tracking: orderData.tracking,
        trackingUrl,
        printUrl,
        status: "released",
      },
    }
  } catch (err: any) {
    if (err.status === 402 || err.message?.includes("insufficient")) {
      return {
        success: false,
        error: "Saldo insuficiente na carteira SuperFrete. Recarregue em https://sandbox.superfrete.com/#/account/credits",
      }
    }
    captureError(err, {
      module: "shipping",
      action: "checkout_label_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao pagar etiqueta." }
  }
}

export async function getSuperFreteLabelInfoAction(payload: {
  partnerId: string
  labelId: string
}): Promise<{ success: true; order: any } | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "view", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, payload.partnerId)
  const client = createClientFromIntegration(integration)

  if (!client) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    const order = await client.getOrderInfo(payload.labelId)

    return { success: true, order }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_label_info_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao buscar informações da etiqueta." }
  }
}

export async function cancelSuperFreteLabelAction(payload: {
  partnerId: string
  orderId: string
  labelId: string
  reason: string
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "edit", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, payload.partnerId)
  const client = createClientFromIntegration(integration)

  if (!client) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    await client.cancelOrder(payload.labelId, payload.reason)

    await supabase
      .from("order_shipments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("partner_id", payload.partnerId)
      .eq("external_label_id", payload.labelId)

    revalidateOrders(payload.partnerId)

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "cancel_label_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao cancelar etiqueta." }
  }
}

export async function printSuperFreteLabelAction(payload: {
  partnerId: string
  labelId: string
}): Promise<{ success: true; url: string } | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "view", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, payload.partnerId)
  const client = createClientFromIntegration(integration)

  if (!client) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    const result = await client.getLabelPrintUrl([payload.labelId])
    return { success: true, url: result.url }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "print_label_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao gerar URL de impressão." }
  }
}

export async function setupSuperFreteWebhookAction(): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const supabase = getAdminClient()

  const integration = await getSuperFreteIntegration(supabase, ctx.partnerId)

  if (!integration?.access_token_encrypted) {
    return { success: false, error: "SuperFrete não conectado." }
  }

  try {
    const token = decrypt(integration.access_token_encrypted, SUPERFRETE_PROVIDER)
    await setupSuperFreteWebhookInternal(
      ctx.partnerId,
      token,
      integration.webhook_secret_encrypted,
    )

    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "setup_superfrete_webhook",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao configurar webhook." }
  }
}

interface ResolvedShippingAddress {
  name: string
  address: string
  number?: string
  complement?: string
  district: string
  city: string
  state_abbr: string
  postal_code: string
  email?: string
  phone?: string
}

function parseDeliveryAddressString(raw: string): Partial<ResolvedShippingAddress> | null {
  if (!raw) return null
  let text = raw.trim()
  const zipMatch = text.match(/\d{5}-?\d{3}/)
  const postalCode = zipMatch ? zipMatch[0] : ""
  if (zipMatch) text = text.replace(zipMatch[0], "")
  text = text.replace(/(^[,\-\s]+)|([,\-\s]+$)/g, "")
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null

  const address = parts[0] || ""
  let city = ""
  let state = ""
  let cityStateIndex = -1
  for (let i = parts.length - 1; i >= 1; i--) {
    const dashParts = parts[i].split("-").map((p) => p.trim())
    if (dashParts.length >= 2 && dashParts[dashParts.length - 1].length === 2) {
      state = dashParts[dashParts.length - 1].toUpperCase()
      city = dashParts.slice(0, -1).join("-").trim()
      cityStateIndex = i
      break
    }
  }
  if (cityStateIndex === -1) {
    city = parts[parts.length - 1]
    cityStateIndex = parts.length - 1
  }
  const middle = parts.slice(1, cityStateIndex)
  const number = middle.find((m) => /^\d+/.test(m)) || ""
  const district = middle.find((m) => m !== number && !/^\d+$/.test(m)) || ""

  return { address, number, district, city, state_abbr: state, postal_code: postalCode }
}

async function loadShippingOrderContext(orderId: string, partnerId: string) {
  const supabase = getAdminClient()

  const [{ data: integration }, { data: partner }, { data: order }] = await Promise.all([
    supabase
      .from("partner_integrations")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("provider_slug", SUPERFRETE_PROVIDER)
      .maybeSingle(),
    supabase
      .from("partners")
      .select("store_name")
      .eq("id", partnerId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select(
        "id, order_number, situation, store_id, buyer_id, customer_id, customer_name, delivery_address, stores(name), order_items(product_name, quantity, product_price, products(name), services(name))",
      )
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle(),
  ])

  if (!order) return { error: "Pedido não encontrado." }
  if (order.situation === "cancelled") return { error: "Pedidos cancelados não podem ter etiqueta." }
  if (!integration?.access_token_encrypted) return { error: "SuperFrete não conectado." }

  const config = ((integration as any).config as Record<string, any>) || {}

  return { integration: integration as PartnerIntegrationRow, partner, order, config, supabase }
}

async function resolveOriginAddress(
  supabase: ReturnType<typeof getAdminClient>,
  order: any,
  partner: any,
  partnerId: string,
): Promise<ResolvedShippingAddress | null> {
  let row: any = null
  if (order.store_id) {
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .eq("store_id", order.store_id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()
    row = data
  }
  if (!row) {
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .eq("partner_id", partnerId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()
    row = data
  }
  if (!row) return null
  return {
    name: order.stores?.name || partner?.store_name || "Remetente",
    address: row.street || "",
    number: row.number || undefined,
    complement: row.complement || undefined,
    district: row.neighborhood || "",
    city: row.city || "",
    state_abbr: (row.state || "").toUpperCase(),
    postal_code: (row.zip_code || "").replace(/\D/g, ""),
  }
}

async function resolveDestinationAddress(
  supabase: ReturnType<typeof getAdminClient>,
  order: any,
): Promise<ResolvedShippingAddress | null> {
  const customerIds = [order.buyer_id, order.customer_id].filter(Boolean)
  let row: any = null
  if (customerIds.length > 0) {
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .in("customer_id", customerIds)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()
    row = data
  }

  let customer: any = null
  if (customerIds.length > 0) {
    const { data } = await supabase
      .from("customers")
      .select("name, email, phone")
      .eq("id", customerIds[0])
      .maybeSingle()
    customer = data
  }

  const parsed = row
    ? {
        address: row.street || "",
        number: row.number || undefined,
        complement: row.complement || undefined,
        district: row.neighborhood || "",
        city: row.city || "",
        state_abbr: (row.state || "").toUpperCase(),
        postal_code: (row.zip_code || "").replace(/\D/g, ""),
      }
    : parseDeliveryAddressString(order.delivery_address || "")

  if (!parsed || !parsed.address || !parsed.city || !parsed.state_abbr || !parsed.postal_code) {
    return null
  }

  return {
    name: customer?.name || order.customer_name || "Destinatário",
    address: parsed.address,
    number: parsed.number,
    complement: parsed.complement,
    district: parsed.district || "",
    city: parsed.city,
    state_abbr: parsed.state_abbr,
    postal_code: parsed.postal_code,
    email: customer?.email || undefined,
    phone: customer?.phone || undefined,
  }
}

function buildShippingProducts(order: any): Array<{ name: string; quantity: number; unitary_value: number }> {
  const items = order.order_items || []
  if (items.length === 0) {
    return [{ name: `Pedido ${order.order_number || order.id}`, quantity: 1, unitary_value: 0 }]
  }
  return items.map((item: any) => ({
    name: item.product_name || item.products?.name || item.services?.name || "Item do pedido",
    quantity: Math.max(1, Number(item.quantity || 1)),
    unitary_value: Math.max(0, Number(item.product_price || 0)),
  }))
}

function buildVolumes(config: Record<string, any>) {
  return {
    height: Number(config.height ?? 10),
    width: Number(config.width ?? 10),
    length: Number(config.length ?? 10),
    weight: Number(config.weight ?? 0.5),
  }
}

export async function getOrderShippingQuoteAction(payload: { orderId: string }): Promise<{
  success: true
  quotes: any[]
  balance?: number
  fromPostalCode: string
  toPostalCode: string
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  const plan = await getPartnerPlan(ctx.partnerId)
  if (!hasMinimumPlan(plan?.slug || "free", "escalar")) {
    return { success: false, error: "Entrega nacional exige o plano Escalar." }
  }

  try {
    const context = await loadShippingOrderContext(payload.orderId, ctx.partnerId)
    if ("error" in context && context.error) return { success: false, error: context.error }
    const { integration, partner, order, config, supabase } = context as any

    const origin = await resolveOriginAddress(supabase, order, partner, ctx.partnerId)
    const destination = await resolveDestinationAddress(supabase, order)
    const originPostalCode = (config.originCep || origin?.postal_code || "").replace(/\D/g, "")
    const destinationPostalCode = destination?.postal_code || ""

    if (!originPostalCode) {
      return { success: false, error: "Informe o CEP de origem nas configurações do SuperFrete ou cadastre o endereço da loja." }
    }
    if (!destinationPostalCode) {
      return { success: false, error: "O pedido não tem endereço de entrega com CEP. Complete o endereço antes de gerar a etiqueta." }
    }

    const client = createClientFromIntegration(integration)
    if (!client) return { success: false, error: "SuperFrete não conectado." }

    const services = Array.isArray(config.services) && config.services.length > 0
      ? (config.services as SuperFreteServiceId[])
      : ([1, 2] as SuperFreteServiceId[])

    const [quotes, userInfo] = await Promise.all([
      client.calculateFreight({
        fromPostalCode: originPostalCode,
        toPostalCode: destinationPostalCode,
        services,
        package: buildVolumes(config),
        options: {
          own_hand: Boolean(config.ownHand),
          receipt: Boolean(config.receipt),
          insurance_value: Number(config.insuranceValue || 0),
          use_insurance_value: Number(config.insuranceValue || 0) > 0,
        },
      }),
      client.getUserInfo().catch(() => undefined),
    ])

    return {
      success: true,
      quotes: Array.isArray(quotes) ? quotes : [],
      balance: userInfo?.balance,
      fromPostalCode: originPostalCode,
      toPostalCode: destinationPostalCode,
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_order_shipping_quote",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao cotar frete." }
  }
}

export async function createOrderShippingLabelAction(payload: {
  orderId: string
  service: SuperFreteServiceId
}): Promise<{
  success: true
  label: { id: string; price: number; status: string; serviceId: number }
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "edit", user)

  const plan = await getPartnerPlan(ctx.partnerId)
  if (!hasMinimumPlan(plan?.slug || "free", "escalar")) {
    return { success: false, error: "Entrega nacional exige o plano Escalar." }
  }

  try {
    const context = await loadShippingOrderContext(payload.orderId, ctx.partnerId)
    if ("error" in context && context.error) return { success: false, error: context.error }
    const { integration, partner, order, config, supabase } = context as any

    const origin = await resolveOriginAddress(supabase, order, partner, ctx.partnerId)
    const destination = await resolveDestinationAddress(supabase, order)

    if (!origin) {
      return { success: false, error: "Cadastre o endereço da loja (Ficha da Empresa) para gerar etiquetas." }
    }
    if (!origin.district || !origin.city || !origin.state_abbr || !origin.postal_code) {
      return { success: false, error: "O endereço da loja está incompleto (bairro, cidade, estado e CEP são obrigatórios)." }
    }
    if (!destination || !destination.district) {
      return { success: false, error: "O endereço de entrega do pedido está incompleto. Preencha bairro, cidade, estado e CEP." }
    }

    const client = createClientFromIntegration(integration)
    if (!client) return { success: false, error: "SuperFrete não conectado." }

    const volumes = buildVolumes(config)
    const label = await client.createOrder({
      service: payload.service,
      from: {
        name: origin.name,
        address: origin.address,
        number: origin.number,
        complement: origin.complement,
        district: origin.district,
        city: origin.city,
        state_abbr: origin.state_abbr,
        postal_code: origin.postal_code,
      },
      to: {
        name: destination.name,
        address: destination.address,
        number: destination.number,
        complement: destination.complement,
        district: destination.district,
        city: destination.city,
        state_abbr: destination.state_abbr,
        postal_code: destination.postal_code,
        email: destination.email,
        phone: destination.phone,
        document: "",
      },
      products: buildShippingProducts(order),
      volumes,
      options: {
        insurance_value: Number(config.insuranceValue || 0),
        receipt: Boolean(config.receipt),
        own_hand: Boolean(config.ownHand),
        non_commercial: true,
      },
      tags: [{ tag: `Dudit ${order.order_number || order.id}` }],
    })

    const serviceId = label.service_id || payload.service

    await supabase.from("order_shipments").insert({
      order_id: payload.orderId,
      partner_id: ctx.partnerId,
      integration_id: integration.id,
      provider_slug: SUPERFRETE_PROVIDER,
      status: label.status || "pending",
      service_code: String(serviceId),
      service_name: SERVICE_LABELS[serviceId] || SERVICE_LABELS[payload.service],
      carrier: "SuperFrete",
      external_label_id: label.id,
      price: typeof label.price === "number" ? label.price : null,
      tracking_number: label.tracking || null,
      label_url: label.print?.url || null,
      requested_at: new Date().toISOString(),
      payload: { service: payload.service, service_id: serviceId, response_status: label.status },
    })

    revalidateOrders(ctx.partnerId)

    return {
      success: true,
      label: {
        id: label.id,
        price: label.price,
        status: label.status,
        serviceId,
      },
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "create_order_shipping_label",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao criar etiqueta." }
  }
}

export async function getOrderShippingGateAction(): Promise<{
  success: true
  data: { connected: boolean; planAllowed: boolean; balance?: number }
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  try {
    const plan = await getPartnerPlan(ctx.partnerId)
    const planAllowed = hasMinimumPlan(plan?.slug || "free", "escalar")

    const supabase = getAdminClient()
    const integration = await getSuperFreteIntegration(supabase, ctx.partnerId)

    const connected = integration?.status === "connected" && Boolean(integration?.access_token_encrypted)
    let balance: number | undefined

    const client = createClientFromIntegration(integration)
    if (connected && client) {
      try {
        balance = (await client.getUserInfo()).balance
      } catch (err) {
        captureError(err, {
          module: "shipping",
          action: "get_order_shipping_gate",
          partnerId: ctx.partnerId,
        })
      }
    }

    return { success: true, data: { connected, planAllowed, balance } }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_order_shipping_gate",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao verificar frete." }
  }
}

export interface OrderShipmentSummary {
  id: string
  order_id: string
  provider_slug: string
  status: string
  service_code: string | null
  service_name: string | null
  carrier: string | null
  external_label_id: string | null
  price: number | null
  tracking_number: string | null
  tracking_url: string | null
  label_url: string | null
  requested_at: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
}

export async function getOrderShipmentAction(payload: { orderId: string }): Promise<{
  success: true
  shipment: OrderShipmentSummary | null
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  try {
    const supabase = getAdminClient()
    const { data } = await supabase
      .from("order_shipments")
      .select(
        "id, order_id, provider_slug, status, service_code, service_name, carrier, external_label_id, price, tracking_number, tracking_url, label_url, requested_at, paid_at, cancelled_at, created_at",
      )
      .eq("order_id", payload.orderId)
      .eq("partner_id", ctx.partnerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return { success: true, shipment: (data as OrderShipmentSummary) || null }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_order_shipment",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao carregar envio do pedido." }
  }
}
