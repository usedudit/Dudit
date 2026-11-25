"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { encrypt, decrypt } from "@/lib/cryptoService"
import { encryptCPF, decryptCPF } from "@/lib/crypto"
import { validateCPF, validateCNPJ } from "@/lib/input-validator"
import { generateCpfLookupHash } from "@/lib/services/cpf-hash"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { revalidateOrders, revalidateTransactions, revalidateOrderHistory, safeRevalidateTag } from "@/lib/utils/revalidation"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { logAudit } from "@/lib/observability/audit-log"
import { resolveOrderBuyerFiscal } from "@/lib/orders/buyer-fiscal"
import type { ReturnShippingPayer } from "@/lib/returns/policy"
import { TAGS } from "@/lib/utils/revalidation-tags"
import {
  createSuperFreteClient,
  type SuperFreteClient,
  type SuperFreteEnvironment,
  type SuperFreteQuoteParams,
  type SuperFreteCreateLabelParams,
  type SuperFreteServiceId,
  SUPERFRETE_SERVICE_IDS,
  DEFAULT_SUPERFRETE_EVENTS,
  SERVICE_LABELS,
  SUPERFRETE_LABEL_STATUS,
  SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS,
  buildCarrierTrackingUrl,
} from "@/lib/services/shipping/superfrete"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { clearCarrierQuoteCache } from "@/lib/services/shipping/carrier-checkout"
import { cancelCarrierLabelForOrder } from "@/lib/services/shipping/superfrete-label-cancel"

const SUPERFRETE_WEBHOOK_URL = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL}/api/shipping/superfrete/webhook`
import {
  SUPERFRETE_PROVIDER,
  findSuperFreteIntegration as getSuperFreteIntegration,
  buildSuperFreteClient as createClientFromIntegration,
  resolveSuperFreteEnvironment,
  consolidateShippingVolumes,
  type ShippingItemLogistics,
  type PartnerIntegrationRow,
} from "@/lib/services/shipping/superfrete-integration"
import {
  recordIntegrationConnected,
  recordIntegrationDisconnected,
} from "@/lib/services/compliance/integration-history"

// Versão do fluxo de webhook. A versão 2 passou a salvar o secret_token real
// devolvido pela SuperFrete na criação; conexões antigas gravaram um UUID local
// e precisam recriar o webhook para voltar a receber eventos.
const SUPERFRETE_WEBHOOK_SETUP_VERSION = 2

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
        webhookConfigured: Boolean(
          integration?.webhook_id &&
          (integration.config as Record<string, any> | null)?.webhook_version ===
          SUPERFRETE_WEBHOOK_SETUP_VERSION,
        ),
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
  environment?: SuperFreteEnvironment
}): Promise<{
  success: boolean
  error?: string
  balance?: number
  email?: string
  webhookConfigured?: boolean
}> {
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

    const connectedAt = new Date().toISOString()
    const { error } = await supabase.from("partner_integrations").upsert(
      {
        partner_id: ctx.partnerId,
        provider_slug: SUPERFRETE_PROVIDER,
        status: "connected",
        account_id: userInfo.id || null,
        account_email: userInfo.email || null,
        access_token_encrypted: encryptedToken,
        // O secret real é gerado pela SuperFrete na criação do webhook e só
        // pode ser capturado nesse momento. Limpamos o que existia para o
        // setup abaixo gravar o par webhook_id/secret correto.
        webhook_id: null,
        webhook_secret_encrypted: null,
        connected_at: connectedAt,
        disconnected_at: null,
        config: { ...existingConfig, environment },
      },
      { onConflict: "partner_id,provider_slug" },
    )

    if (error) {
      return { success: false, error: error.message }
    }

    await recordIntegrationConnected(supabase, {
      partnerId: ctx.partnerId,
      providerSlug: SUPERFRETE_PROVIDER,
      externalAccountId: userInfo.id || null,
      externalAccountEmail: userInfo.email || null,
      connectedAt,
    })

    let webhookConfigured = false
    try {
      await setupSuperFreteWebhookInternal(ctx.partnerId, token)
      webhookConfigured = true
    } catch (webhookErr: any) {
      console.warn("[SuperFrete] Webhook registration failed (non-blocking):", webhookErr.message)
    }

    clearCarrierQuoteCache(ctx.partnerId)
    await safeRevalidateTag(TAGS.partner(ctx.partnerId))
    revalidatePath("/erp/configuracoes/integracoes")

    return {
      success: true,
      balance: userInfo.balance,
      email: userInfo.email,
      webhookConfigured,
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
        const webhooks = await client.listWebhooks()
        const targets = (webhooks || []).filter(
          (w: any) =>
            w?.id &&
            (w.id === integration?.webhook_id ||
              (typeof w.url === "string" && w.url.includes("api/shipping/superfrete/webhook"))),
        )
        for (const webhook of targets) {
          try {
            await client.deleteWebhook(String(webhook.id))
          } catch (delErr) {
            console.warn("[SuperFrete] Falha ao remover webhook ao desconectar:", delErr)
          }
        }
      } catch (err) {
        console.warn("[SuperFrete] Error during disconnect webhook cleanup:", err)
      }
    }

    const disconnectedAt = new Date().toISOString()

    await recordIntegrationDisconnected(supabase, {
      partnerId: ctx.partnerId,
      providerSlug: SUPERFRETE_PROVIDER,
      disconnectedAt,
      fallbackAccountId: integration?.account_id ?? null,
      fallbackAccountEmail: integration?.account_email ?? null,
      fallbackConnectedAt: integration?.connected_at ?? null,
    })

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        account_id: null,
        account_email: null,
        webhook_id: null,
        webhook_secret_encrypted: null,
        disconnected_at: disconnectedAt,
      })
      .eq("partner_id", ctx.partnerId)
      .eq("provider_slug", SUPERFRETE_PROVIDER)

    if (error) {
      return { success: false, error: error.message }
    }

    clearCarrierQuoteCache(ctx.partnerId)
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

    clearCarrierQuoteCache(ctx.partnerId)
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

async function setupSuperFreteWebhookInternal(partnerId: string, token: string): Promise<void> {
  try {
    const supabase = getAdminClient()
    const integration = await getSuperFreteIntegration(supabase, partnerId)
    const environment = resolveSuperFreteEnvironment((integration?.config as SuperFreteConfig)?.environment)
    const client = createSuperFreteClient(token, undefined, environment)

    try {
      new URL(SUPERFRETE_WEBHOOK_URL)
    } catch {
      throw new Error(
        "NEXT_PUBLIC_APP_URL/NEXT_PUBLIC_SITE_URL inválida: não é possível registrar o webhook da SuperFrete.",
      )
    }

    // A API da SuperFrete só devolve o secret_token na criação do webhook e
    // não permite consultá-lo depois. Recriamos o webhook da Dudit para
    // garantir que o secret salvo seja exatamente o usado pela SuperFrete
    // para assinar os eventos (o fluxo antigo salvava um UUID local e toda
    // notificação era rejeitada com 401).
    const existingWebhooks = await client.listWebhooks()
    const staleWebhooks = (existingWebhooks || []).filter(
      (w: any) => w?.id && typeof w.url === "string" && w.url.includes("api/shipping/superfrete/webhook"),
    )

    // Invalida o par antigo antes de remover o webhook: se a recriação falhar,
    // a integração fica explicitamente "não configurada" (e a UI oferece
    // reativar) em vez de continuar anunciando um secret que já não existe.
    const { error: clearError } = await supabase
      .from("partner_integrations")
      .update({ webhook_id: null, webhook_secret_encrypted: null })
      .eq("partner_id", partnerId)
      .eq("provider_slug", SUPERFRETE_PROVIDER)

    if (clearError) {
      throw new Error(`Falha ao limpar webhook antigo da SuperFrete: ${clearError.message}`)
    }

    for (const webhook of staleWebhooks) {
      try {
        await client.deleteWebhook(String(webhook.id))
      } catch (delErr) {
        console.warn("[SuperFrete] Falha ao remover webhook antigo:", delErr)
      }
    }

    const created: any = await client.createWebhook(
      "Dudit ERP Integration",
      SUPERFRETE_WEBHOOK_URL,
      DEFAULT_SUPERFRETE_EVENTS,
    )
    const webhookId = created?.id ? String(created.id) : null
    const secretToken = created?.secret_token ? String(created.secret_token) : null

    if (!webhookId || !secretToken) {
      // Não deixa um webhook sem secret válido ativo: ele só geraria 401s.
      if (webhookId) {
        try {
          await client.deleteWebhook(webhookId)
        } catch (delErr) {
          console.warn("[SuperFrete] Falha ao remover webhook sem secret:", delErr)
        }
      }
      throw new Error(
        "SuperFrete não retornou id/secret_token do webhook; atualização automática de status indisponível.",
      )
    }

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        webhook_id: webhookId,
        webhook_secret_encrypted: encrypt(secretToken, "superfrete"),
        config: {
          ...((integration?.config as Record<string, any> | null) || {}),
          webhook_version: SUPERFRETE_WEBHOOK_SETUP_VERSION,
        },
      })
      .eq("partner_id", partnerId)
      .eq("provider_slug", SUPERFRETE_PROVIDER)

    if (error) {
      throw new Error(`Falha ao salvar webhook da SuperFrete: ${error.message}`)
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
      tracking_url: buildCarrierTrackingUrl(serviceId, order.tracking),
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

function isSuperFreteSandboxIntegration(integration: PartnerIntegrationRow | null): boolean {
  const config = (integration?.config || {}) as Record<string, unknown>
  return resolveSuperFreteEnvironment(config.environment) === "sandbox"
}

async function simulateSandboxCheckout(params: {
  supabase: ReturnType<typeof getAdminClient>
  client: SuperFreteClient
  partnerId: string
  labelId: string
  reason: string
}): Promise<{
  success: true
  result: { tracking?: string; trackingUrl?: string; printUrl?: string; status: string; simulated: boolean }
}> {
  console.warn(
    `[SuperFrete] SANDBOX SIMULATION - pagamento pulado (${params.reason}). label=${params.labelId} partner=${params.partnerId}`,
  )

  let printUrl: string | undefined
  try {
    const labelPrint = await params.client.getLabelPrintUrl([params.labelId])
    printUrl = labelPrint?.url
  } catch (printErr: any) {
    console.warn("[SuperFrete] Sandbox simulation: impressão indisponível:", printErr?.message)
  }

  const tracking = `SBX${params.labelId.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase()}`
  const trackingUrl = `https://rastreio.superfrete.com/#/tracking/${tracking}`

  const { data: shipmentRow } = await params.supabase
    .from("order_shipments")
    .select("payload")
    .eq("partner_id", params.partnerId)
    .eq("external_label_id", params.labelId)
    .maybeSingle()

  await params.supabase
    .from("order_shipments")
    .update({
      status: "released",
      tracking_number: tracking,
      tracking_url: trackingUrl,
      label_url: printUrl || null,
      paid_at: new Date().toISOString(),
      payload: {
        ...((shipmentRow?.payload as Record<string, unknown> | null) || {}),
        payment_simulated: true,
        simulation_reason: params.reason,
      },
    })
    .eq("partner_id", params.partnerId)
    .eq("external_label_id", params.labelId)

  revalidateOrders(params.partnerId)

  return {
    success: true,
    result: { tracking, trackingUrl, printUrl, status: "released", simulated: true },
  }
}

export async function checkoutSuperFreteLabelAction(payload: {
  partnerId: string
  orderId: string
  labelId: string
}): Promise<{
  success: true
  result: { tracking?: string; trackingUrl?: string; printUrl?: string; status: string; simulated?: boolean }
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
    const result = await performLabelCheckout(
      supabase,
      integration,
      client,
      payload.partnerId,
      payload.labelId,
    )
    if (result.success) {
      await syncReturnRequestAfterPayment(supabase, payload.partnerId, payload.labelId)
    }
    return result
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "checkout_label_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao pagar etiqueta." }
  }
}

type PerformCheckoutResult =
  | {
    success: true
    result: {
      tracking?: string
      trackingUrl?: string
      printUrl?: string
      status: string
      simulated?: boolean
    }
  }
  | { success: false; error: string }

// Núcleo de pagamento de etiqueta (ida e devolução): checa saldo,
// finaliza o checkout na SuperFrete e atualiza order_shipments.
async function performLabelCheckout(
  supabase: ReturnType<typeof getAdminClient>,
  integration: PartnerIntegrationRow | null,
  client: SuperFreteClient,
  partnerId: string,
  labelId: string,
  balancePromise?: Promise<{ userInfo?: any; error?: unknown }>,
): Promise<PerformCheckoutResult> {
  try {
    // Credit check: the seller pays from their own SuperFrete wallet.
    // Preço vem do banco (order_shipments.price); saldo pode ter sido
    // buscado antes (em paralelo com a criação da etiqueta).
    let sandboxSkipReason: string | null = null
    let shipmentServiceCode: string | null = null
    let shipmentOrderId: string | null = null
    try {
      const [{ data: shipmentRow }, balanceRes] = await Promise.all([
        supabase
          .from("order_shipments")
          .select("order_id, price, service_code")
          .eq("partner_id", partnerId)
          .eq("external_label_id", labelId)
          .maybeSingle(),
        balancePromise ??
        client.getUserInfo().then(
          (userInfo: any) => ({ userInfo, error: null as unknown }),
          (error: unknown) => ({ userInfo: undefined, error }),
        ),
      ])
      shipmentServiceCode = (shipmentRow?.service_code as string | null) ?? null
      shipmentOrderId = shipmentRow?.order_id ? String(shipmentRow.order_id) : null
      if (balanceRes.error) {
        console.warn("[SuperFrete] Balance pre-check failed (continuing):", balanceRes.error)
      } else {
        const price = Number(shipmentRow?.price ?? 0)
        const balance = Number(balanceRes.userInfo?.balance ?? 0)
        if (price > 0 && balance < price) {
          if (isSuperFreteSandboxIntegration(integration)) {
            sandboxSkipReason = `saldo insuficiente: disponível R$ ${balance.toFixed(2)}, necessário R$ ${price.toFixed(2)}`
          } else {
            return {
              success: false,
              error: `Saldo insuficiente na carteira SuperFrete: disponível R$ ${balance.toFixed(2)}, necessário R$ ${price.toFixed(2)}. Recarregue em https://web.superfrete.com/#/account/credits`,
            }
          }
        }
      }
    } catch (checkErr) {
      console.warn("[SuperFrete] Balance pre-check failed (continuing):", checkErr)
    }

    if (sandboxSkipReason) {
      return await simulateSandboxCheckout({
        supabase,
        client,
        partnerId,
        labelId,
        reason: sandboxSkipReason,
      })
    }

    const checkout = await client.checkoutOrders([labelId])

    const orderData = checkout.purchase.orders.find((o: any) => o.id === labelId)

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
        const labelPrint = await client.getLabelPrintUrl([labelId])
        printUrl = labelPrint.url
      } catch (err) {
        console.warn("[SuperFrete] Failed to get print URL:", err)
      }
    }

    const trackingUrl = orderData.tracking
      ? buildCarrierTrackingUrl(
        Number(orderData.service_id ?? shipmentServiceCode) || undefined,
        orderData.tracking,
      ) || undefined
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
      .eq("partner_id", partnerId)
      .eq("external_label_id", labelId)

    // Sincroniza rastreio no Tiny ERP se o pedido estiver integrado
    const trackingCode: string | undefined = orderData.tracking
    const trackingOrderId = shipmentOrderId
    if (trackingCode && trackingOrderId) {
      import("@/lib/services/integrations/tiny/tiny-integration").then(({ syncOrderTrackingToTiny }) => {
        syncOrderTrackingToTiny({
          orderId: trackingOrderId,
          trackingCode,
          trackingUrl,
        }).catch((err) => {
          console.error("[SuperFrete] Error syncing tracking to Tiny:", err)
        })
      }).catch(() => { })
    }

    revalidateOrders(partnerId)

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
      if (isSuperFreteSandboxIntegration(integration)) {
        return await simulateSandboxCheckout({
          supabase,
          client,
          partnerId,
          labelId,
          reason: `API recusou o pagamento: ${err?.message || "saldo insuficiente"}`,
        })
      }
      return {
        success: false,
        error: "Saldo insuficiente na carteira SuperFrete. Recarregue em https://web.superfrete.com/#/account/credits",
      }
    }
    console.error(
      "[SuperFrete] performLabelCheckout failed:",
      err?.message,
      err?.detail ? JSON.stringify(err.detail) : "",
    )
    captureError(err, {
      module: "shipping",
      action: "checkout_label_superfrete",
      partnerId,
    })
    return { success: false, error: err?.message || "Erro ao pagar etiqueta." }
  }
}

// Chamada após pagamento bem-sucedido de uma etiqueta (ida ou devolução).
// Para remessa reversa (kind=return):
//   1) APPROVED -> WAITING_ITEM_RETURN (transição válida; o webhook depois
//      leva a PROCESSING quando o item chega);
//   2) frete reverso: vendedor -> cria despesa com vencimento de 30 dias;
//      cliente -> desconta o frete do reembolso (refund_amount);
//      case_by_case/NULL -> nenhum lançamento.
// Idempotente: despesa checada por reference_note, desconto por payload.
async function syncReturnRequestAfterPayment(
  supabase: ReturnType<typeof getAdminClient>,
  partnerId: string,
  labelId: string,
): Promise<void> {
  try {
    const { data: shipmentRow } = await supabase
      .from("order_shipments")
      .select("id, kind, return_request_id, price, order_id, external_label_id, payload")
      .eq("partner_id", partnerId)
      .eq("external_label_id", labelId)
      .maybeSingle()
    if (shipmentRow?.kind !== "return" || !shipmentRow.return_request_id) return

    const { data: returnRequest } = await supabase
      .from("return_requests")
      .select("id, status, refund_amount, return_freight_payer")
      .eq("id", shipmentRow.return_request_id)
      .is("deleted_at", null)
      .maybeSingle()
    if (!returnRequest) return

    if (returnRequest.status === "APPROVED") {
      await supabase
        .from("return_requests")
        .update({ status: "WAITING_ITEM_RETURN", updated_at: new Date().toISOString() })
        .eq("id", returnRequest.id)
      await logAuditEvent({
        partnerId,
        actorUserId: null,
        entityType: "return_request",
        entityId: returnRequest.id,
        actionType: "return_status_updated",
        changeLines: ["Etiqueta de devolução paga - aguardando o envio do item pelo cliente."],
        source: "system",
        metadata: { from_status: "APPROVED", to_status: "WAITING_ITEM_RETURN", shipment_id: shipmentRow.id },
      })
    }

    const payer = (returnRequest.return_freight_payer || "case_by_case") as ReturnShippingPayer
    const price = Math.round(Number(shipmentRow.price || 0) * 100) / 100
    if (price <= 0 || payer === "case_by_case") return

    if (payer === "seller") {
      const refNote = `return_freight:${shipmentRow.id}`
      const { data: existingExpense } = await supabase
        .from("transactions")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("reference_note", refNote)
        .limit(1)
        .maybeSingle()
      if (existingExpense) return

      const { data: orderRow } = await supabase
        .from("orders")
        .select("order_number, store_id")
        .eq("id", shipmentRow.order_id)
        .maybeSingle()
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { error: insertErr } = await supabase.from("transactions").insert({
        partner_id: partnerId,
        store_id: orderRow?.store_id || null,
        description: `Frete de devolução - Pedido ${orderRow?.order_number || shipmentRow.order_id}`.trim(),
        category: "Trocas e Devoluções",
        transaction_type: "expense",
        amount: price,
        original_amount: price,
        due_date: dueDate,
        status: "pending",
        notes: `Etiqueta de devolução SuperFrete ${shipmentRow.external_label_id}. Vencimento: 30 dias após o pagamento do frete.`,
        origin: "system",
        reference_note: refNote,
      })
      if (insertErr) {
        console.warn("[SuperFrete] Falha ao criar despesa do frete reverso:", insertErr)
        return
      }
      await revalidateTransactions(partnerId)
      await logAuditEvent({
        partnerId,
        actorUserId: null,
        entityType: "return_request",
        entityId: returnRequest.id,
        actionType: "return_freight_expense_created",
        changeLines: [
          `Despesa de frete da devolução criada: R$ ${price.toFixed(2)} (vencimento ${dueDate.split("-").reverse().join("/")}).`,
        ],
        source: "system",
        metadata: { shipment_id: shipmentRow.id, freight_price: price, due_date: dueDate, payer: "seller" },
      })
      return
    }

    if (payer === "customer") {
      const shipmentPayload = (shipmentRow.payload as Record<string, unknown> | null) || {}
      if (shipmentPayload.freight_discount_applied) return
      const refundAmount = Math.round(Number(returnRequest.refund_amount || 0) * 100) / 100
      const settledStatuses = ["RESOLVED", "REJECTED", "EXPIRED"]
      if (refundAmount <= 0 || settledStatuses.includes(returnRequest.status)) return

      const discount = Math.min(price, refundAmount)
      const newRefund = Math.round((refundAmount - discount) * 100) / 100
      const { error: updErr } = await supabase
        .from("return_requests")
        .update({ refund_amount: newRefund, updated_at: new Date().toISOString() })
        .eq("id", returnRequest.id)
      if (updErr) {
        console.warn("[SuperFrete] Falha ao descontar frete do reembolso:", updErr)
        return
      }
      await supabase
        .from("order_shipments")
        .update({
          payload: { ...shipmentPayload, freight_discount_applied: true, freight_discount_amount: discount },
        })
        .eq("id", shipmentRow.id)
      await logAuditEvent({
        partnerId,
        actorUserId: null,
        entityType: "return_request",
        entityId: returnRequest.id,
        actionType: "return_freight_discounted",
        changeLines: [
          `Desconto do frete da devolução no reembolso: R$ ${discount.toFixed(2)} (comprador paga o frete). Novo valor de reembolso: R$ ${newRefund.toFixed(2)}.`,
        ],
        source: "system",
        metadata: {
          shipment_id: shipmentRow.id,
          freight_price: discount,
          refund_before: refundAmount,
          refund_after: newRefund,
          payer: "customer",
        },
      })
    }
  } catch (err) {
    console.warn("[SuperFrete] Falha ao sincronizar return_request após pagamento:", err)
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
    const msg = String(err?.message || "").toLowerCase()
    const isNotFound =
      err?.status === 404 ||
      msg.includes("pedido não encontrado") ||
      msg.includes("não encontrado") ||
      msg.includes("orders.0")
    if (!isNotFound) {
      captureError(err, {
        module: "shipping",
        action: "get_label_info_superfrete",
        partnerId: payload.partnerId,
      })
    }
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

  const result = await cancelCarrierLabelForOrder({
    partnerId: payload.partnerId,
    orderId: payload.orderId,
    labelId: payload.labelId,
    reason: payload.reason,
    actorUserId: user.id,
  })

  if (!result.success) {
    captureError(new Error(result.error), {
      module: "shipping",
      action: "cancel_label_superfrete",
      partnerId: payload.partnerId,
    })
    return { success: false, error: result.error }
  }

  revalidateOrders(payload.partnerId)

  return { success: true }
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
    await setupSuperFreteWebhookInternal(ctx.partnerId, token)

    await revalidatePath("/erp/configuracoes/integracoes")

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
  nameCandidates?: string[]
  address: string
  number?: string
  complement?: string
  district: string
  city: string
  state_abbr: string
  postal_code: string
  email?: string
  phone?: string
  document?: string
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
  // O meio pode ser "123, Apto 4 - Centro" (com complemento) ou "123 - Centro"
  // (sem complemento). Separa o bairro pelo último " - " e depois número de
  // complemento pelas vírgulas.
  const middle = parts.slice(1, cityStateIndex).join(", ")
  const dashIndex = middle.lastIndexOf(" - ")
  const numberAndComplement = dashIndex >= 0 ? middle.slice(0, dashIndex) : middle
  const districtFromMiddle = dashIndex >= 0 ? middle.slice(dashIndex + 3).trim() : ""
  const middleParts = numberAndComplement.split(",").map((part) => part.trim()).filter(Boolean)
  const number = middleParts.find((m) => /^\d+/.test(m)) || ""
  const complement = middleParts.filter((m) => m !== number).join(", ")
  const district = districtFromMiddle || middleParts.find((m) => m !== number && !/^\d+$/.test(m)) || ""

  return { address, number, complement, district, city, state_abbr: state, postal_code: postalCode }
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
      .from("stores")
      .select("name, razao_social, nome_fantasia, cnpj, cpf")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select(
        "id, order_number, situation, store_id, buyer_id, customer_id, customer_name, partner_id, nfe_number, delivery_address, delivery_breakdown, stores(name, razao_social, nome_fantasia), order_items(id, product_id, product_name, quantity, product_price, products(name, product_logistics(weight_gross, weight_net, width, height, length, packaging_type, preparation_days)), services(name))",
      )
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle(),
  ])

  if (!order) return { error: "Pedido não encontrado." }
  if (order.situation === "cancelled") return { error: "Pedidos cancelados não podem ter etiqueta." }
  if (!integration?.access_token_encrypted) return { error: "SuperFrete não conectado." }

  if (order && Array.isArray(order.order_items) && order.order_items.length > 0) {
    const missingLogisticsProductIds = order.order_items
      .map((it: any) => it.product_id)
      .filter((id: string | null | undefined) => {
        if (!id) return false
        const it = order.order_items.find((item: any) => item.product_id === id)
        const log = Array.isArray(it?.products?.product_logistics)
          ? it.products.product_logistics[0]
          : it?.products?.product_logistics
        return !log
      })

    if (missingLogisticsProductIds.length > 0) {
      const { data: dbLogistics } = await supabase
        .from("product_logistics")
        .select("product_id, weight_gross, weight_net, width, height, length, packaging_type, preparation_days")
        .in("product_id", missingLogisticsProductIds)

      if (dbLogistics && dbLogistics.length > 0) {
        const logMap = new Map(dbLogistics.map((l: any) => [l.product_id, l]))
        for (const it of order.order_items) {
          if (it.product_id && logMap.has(it.product_id)) {
            it._directLogistics = logMap.get(it.product_id)
          }
        }
      }
    }
  }

  const config = ((integration as any).config as Record<string, any>) || {}

  return { integration: integration as PartnerIntegrationRow, partner, order, config, supabase }
}

async function resolvePlainCpf(raw: unknown): Promise<string | null> {
  if (!raw) return null
  const value = String(raw)
  if (!/^v\d+:/.test(value.trim())) {
    const digits = value.replace(/\D/g, "")
    return digits.length === 11 ? digits : null
  }
  try {
    const plain = (await decryptCPF(value)).replace(/\D/g, "")
    if (plain.length === 11) return plain
  } catch {
    return null
  }
  return null
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

  let docRow: any = partner
  if (order.store_id) {
    const { data } = await supabase
      .from("stores")
      .select("name, razao_social, nome_fantasia, cnpj, cpf")
      .eq("id", order.store_id)
      .maybeSingle()
    docRow = data || partner
  }
  let document: string | undefined
  const storeCnpj = String(docRow?.cnpj || "").replace(/\D/g, "")
  if (storeCnpj.length === 14) {
    document = storeCnpj
  } else if (docRow?.cpf) {
    document = (await resolvePlainCpf(docRow.cpf)) || undefined
  }

  const nameCandidates = [
    order.stores?.name,
    order.stores?.razao_social,
    order.stores?.nome_fantasia,
    docRow?.name,
    docRow?.razao_social,
    docRow?.nome_fantasia,
    partner?.name,
    partner?.razao_social,
    partner?.nome_fantasia,
  ]
    .map((value) => collapseSpaces(value))
    .filter((value) => value.length > 0)

  return {
    name: nameCandidates[0] || "Remetente",
    nameCandidates,
    address: row.street || "",
    number: row.number || undefined,
    complement: row.complement || undefined,
    district: row.neighborhood || "",
    city: row.city || "",
    state_abbr: (row.state || "").toUpperCase(),
    postal_code: (row.zip_code || "").replace(/\D/g, ""),
    document,
  }
}

async function resolveDestinationAddress(
  supabase: ReturnType<typeof getAdminClient>,
  order: any,
): Promise<ResolvedShippingAddress | null> {
  const customerIds = [order.buyer_id, order.customer_id].filter(Boolean)

  let customer: any = null
  for (const id of customerIds) {
    const { data } = await supabase
      .from("customers")
      .select("name, razao_social, nome_fantasia, email, phone, cpf, cnpj, person_type, user_id, marketplace_user_id")
      .eq("id", id)
      .maybeSingle()
    if (data) {
      customer = data
      break
    }
  }

  let customerDocument: string | undefined
  if (customer) {
    const cnpjDigits = String(customer.cnpj || "").replace(/\D/g, "")
    const cpfDigits = await resolvePlainCpf(customer.cpf)
    if (customer.person_type === "pj" && cnpjDigits.length === 14) {
      customerDocument = cnpjDigits
    } else {
      customerDocument = cpfDigits || (cnpjDigits.length === 14 ? cnpjDigits : undefined)
    }
  }
  let profileFullName: string | undefined
  const profileUserIds = Array.from(
    new Set(
      [...customerIds, customer?.user_id, customer?.marketplace_user_id].filter(Boolean),
    ),
  )
  if (profileUserIds.length > 0) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("user_id, cpf, full_name")
      .in("user_id", profileUserIds)
      .limit(1)
      .maybeSingle()
    if (profile) {
      profileFullName = profile.full_name || undefined
      if (!customerDocument) {
        customerDocument = (await resolvePlainCpf(profile.cpf)) || undefined
      }
    }
  }

  // O endereço do CHECKOUT é a fonte da verdade. A etiqueta precisa do mesmo
  // destino/CEP cotados - antes o endereço salvo do cliente era usado primeiro,
  // então a etiqueta saía para outra CEP e a SuperFrete recalculava outro preço.
  const breakdown = ((order as any)?.delivery_breakdown as Record<string, any> | null) || {}
  const structured = (breakdown.destinationAddress as Record<string, any> | null) || null
  const checkoutPostalCode = String(breakdown.toPostalCode || "").replace(/\D/g, "")
  const parsedString = parseDeliveryAddressString(order.delivery_address || "") || null

  const fromCheckout = {
    address: String(structured?.street || parsedString?.address || ""),
    number: structured?.number || parsedString?.number || undefined,
    complement: structured?.complement || parsedString?.complement || undefined,
    district: String(structured?.district || parsedString?.district || ""),
    city: String(structured?.city || parsedString?.city || ""),
    state_abbr: String(structured?.state || parsedString?.state_abbr || "").toUpperCase(),
    postal_code:
      checkoutPostalCode
      || String(structured?.postalCode || "").replace(/\D/g, "")
      || String(parsedString?.postal_code || "").replace(/\D/g, ""),
  }

  // Só busca o endereço salvo quando faltar algo no checkout (ex.: bairro).
  const needsSavedAddress =
    !fromCheckout.address || !fromCheckout.city || !fromCheckout.state_abbr || !fromCheckout.postal_code || !fromCheckout.district
  let savedRow: any = null
  if (needsSavedAddress && customerIds.length > 0) {
    const { data } = await supabase
      .from("addresses")
      .select("*")
      .in("customer_id", customerIds)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle()
    savedRow = data
  }

  const destination = {
    address: fromCheckout.address || String(savedRow?.street || ""),
    number: fromCheckout.number || savedRow?.number || undefined,
    complement: fromCheckout.complement || savedRow?.complement || undefined,
    district: fromCheckout.district || String(savedRow?.neighborhood || ""),
    city: fromCheckout.city || String(savedRow?.city || ""),
    state_abbr: (fromCheckout.state_abbr || String(savedRow?.state || "")).toUpperCase(),
    postal_code: fromCheckout.postal_code || String(savedRow?.zip_code || "").replace(/\D/g, ""),
  }

  if (!destination.address || !destination.city || !destination.state_abbr || !destination.postal_code) {
    return null
  }

  const nameCandidates = [
    customer?.name,
    customer?.razao_social,
    customer?.nome_fantasia,
    order.customer_name,
    profileFullName,
  ]
    .map((value) => collapseSpaces(value))
    .filter((value) => value.length > 0)

  return {
    name: nameCandidates[0] || "Destinatário",
    nameCandidates,
    address: destination.address,
    number: destination.number,
    complement: destination.complement,
    // A API exige bairro; usa "NA" quando não houver (mesma regra da doc).
    district: destination.district || "NA",
    city: destination.city,
    state_abbr: destination.state_abbr,
    postal_code: destination.postal_code,
    email: customer?.email || undefined,
    phone: customer?.phone || undefined,
    document: customerDocument,
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

function buildVolumes(config: Record<string, any>, order?: any) {
  if (order && Array.isArray(order.order_items) && order.order_items.length > 0) {
    const items: ShippingItemLogistics[] = order.order_items.map((it: any) => {
      const rawLog =
        it._directLogistics ||
        (Array.isArray(it.products?.product_logistics)
          ? it.products.product_logistics[0]
          : it.products?.product_logistics) ||
        it.product_logistics

      return {
        quantity: Math.max(1, Number(it.quantity || 1)),
        weight_gross: rawLog?.weight_gross != null ? Number(rawLog.weight_gross) : null,
        weight_net: rawLog?.weight_net != null ? Number(rawLog.weight_net) : null,
        width: rawLog?.width != null ? Number(rawLog.width) : null,
        height: rawLog?.height != null ? Number(rawLog.height) : null,
        length: rawLog?.length != null ? Number(rawLog.length) : null,
        packaging_type: rawLog?.packaging_type || null,
        preparation_days: rawLog?.preparation_days != null ? Number(rawLog.preparation_days) : null,
      }
    })
    return consolidateShippingVolumes(items, config)
  }
  return consolidateShippingVolumes(null, config)
}

function collapseSpaces(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim()
}

function truncateField(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trim() : value
}

function countWords(value: string): number {
  return value.split(" ").filter(Boolean).length
}

type ResolvedCompleteName = { ok: true; name: string } | { ok: false; error: string }

// A API SuperFrete rejeita nomes com menos de 2 palavras
// ("O nome do remetente/destinatário deve ser um nome completo").
// Prefere o primeiro candidato completo; quando há apenas uma palavra,
// aplica o prefixo configurado (ex.: "Loja" para loja, "Cliente" para comprador).
function resolveCompleteName(
  candidates: Array<unknown>,
  opts: { role: "remetente" | "destinatário"; prefixIfSingle?: string },
): ResolvedCompleteName {
  const names = candidates.map(collapseSpaces).filter(Boolean)
  const full = names.find((name) => countWords(truncateField(name, 50)) >= 2)
  if (full) return { ok: true, name: truncateField(full, 50) }
  const single = names[0]
  if (single && opts.prefixIfSingle) {
    return { ok: true, name: truncateField(`${opts.prefixIfSingle} ${single}`, 50) }
  }
  if (single) {
    return {
      ok: false,
      error: `O nome do ${opts.role} está incompleto ("${single}"). Informe nome e sobrenome para gerar a etiqueta.`,
    }
  }
  return {
    ok: false,
    error: `Informe o nome completo do ${opts.role} (nome e sobrenome) para gerar a etiqueta.`,
  }
}

function normalizePhoneDigits(value: unknown): string | undefined {
  const digits = String(value ?? "").replace(/\D/g, "")
  return digits.length === 11 ? digits : undefined
}

function buildFromAddressPayload(
  address: ResolvedShippingAddress,
  name: string,
): SuperFreteCreateLabelParams["from"] {
  return {
    name,
    address: truncateField(address.address, 50),
    number: truncateField(collapseSpaces(address.number ?? ""), 10),
    complement: truncateField(collapseSpaces(address.complement ?? ""), 20),
    district: truncateField(address.district, 60),
    city: truncateField(address.city, 50),
    state_abbr: collapseSpaces(address.state_abbr).toUpperCase(),
    postal_code: address.postal_code,
    document: address.document || undefined,
    phone: normalizePhoneDigits(address.phone),
  }
}

function buildToAddressPayload(
  address: ResolvedShippingAddress,
  name: string,
): SuperFreteCreateLabelParams["to"] {
  return {
    name,
    address: truncateField(address.address, 50),
    number: truncateField(collapseSpaces(address.number ?? ""), 10),
    complement: truncateField(collapseSpaces(address.complement ?? ""), 20),
    district: truncateField(address.district, 50),
    city: truncateField(address.city, 50),
    state_abbr: collapseSpaces(address.state_abbr).toUpperCase(),
    postal_code: address.postal_code,
    email: address.email || undefined,
    document: address.document || "",
    phone: normalizePhoneDigits(address.phone),
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
    const originPostalCode = (origin?.postal_code || config.originCep || "").replace(/\D/g, "")
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
        package: buildVolumes(config, order),
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
  service?: SuperFreteServiceId
  /** Permite gerar a etiqueta de pedido PJ sem NF-e informada (fica registrado). */
  allowMissingNfe?: boolean
}): Promise<{
  success: true
  label: { id: string; price: number; status: string; serviceId: number }
  priceMismatch: boolean
  checkoutPrice: number
  labelPrice: number | null
} | {
  success: false
  error: string
  code?: "missing_document" | "missing_nfe" | "incomplete_recipient_name"
  currentRecipientName?: string
}> {
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

    const client = createClientFromIntegration(integration)
    if (!client) return { success: false, error: "SuperFrete não conectado." }

    // Gate fiscal: comprador PJ exige NF-e. O envio pode ser liberado com
    // registro (payload.allowMissingNfe), mas nunca silenciosamente.
    const buyer = await resolveOrderBuyerFiscal(supabase, {
      ...order,
      partner_id: ctx.partnerId,
    })
    const buyerIsPj = buyer.personType === "pj"
    const missingNfe = buyerIsPj && !order.nfe_number

    if (missingNfe && !payload.allowMissingNfe) {
      return {
        success: false,
        code: "missing_nfe",
        error: "Este pedido é para pessoa jurídica. Informe o número da NF-e antes de gerar a etiqueta.",
      }
    }

    // Tudo em paralelo: checagem de saldo + origem + destino. Em sandbox a
    // checagem de saldo é dispensável (nunca bloqueia) - pula 1 roundtrip.
    const balancePromise = isSuperFreteSandboxIntegration(integration)
      ? Promise.resolve(undefined)
      : client.getUserInfo().catch(() => undefined)
    const [origin, destination] = await Promise.all([
      resolveOriginAddress(supabase, order, partner, ctx.partnerId),
      resolveDestinationAddress(supabase, order),
    ])

    if (!origin) {
      return { success: false, error: "Cadastre o endereço da loja (Ficha da Empresa) para gerar etiquetas." }
    }
    if (!origin.district || !origin.city || !origin.state_abbr || !origin.postal_code) {
      return { success: false, error: "O endereço da loja está incompleto (bairro, cidade, estado e CEP são obrigatórios)." }
    }
    if (!destination || !destination.district) {
      return { success: false, error: "O endereço de entrega do pedido está incompleto. Preencha bairro, cidade, estado e CEP." }
    }
    if (!destination.document) {
      return {
        success: false,
        error: "Este cliente não tem CPF/CNPJ cadastrado. Informe o documento para gerar a etiqueta.",
        code: "missing_document",
      }
    }

    const requestedService = Number(payload.service || (order as any)?.delivery_breakdown?.serviceId || 0)
    if (!requestedService) {
      return { success: false, error: "Este pedido não tem um serviço de frete selecionado." }
    }

    const userInfo = await balancePromise
    if (userInfo) {
      const balance = Number(userInfo.balance ?? 0)
      const estimated = Number((order as any)?.delivery_fee || 0)
      if (Number.isFinite(balance) && estimated > 0 && balance < estimated) {
        return {
          success: false,
          error: `Saldo insuficiente na carteira SuperFrete: disponível R$ ${balance.toFixed(2)}, necessário aproximadamente R$ ${estimated.toFixed(2)}. Recarregue em https://web.superfrete.com/#/account/credits`,
        }
      }
    }

    const senderName = resolveCompleteName(origin.nameCandidates ?? [origin.name], {
      role: "remetente",
      prefixIfSingle: "Loja",
    })
    if (!senderName.ok) return { success: false, error: senderName.error }
    const recipientName = resolveCompleteName(destination.nameCandidates ?? [destination.name], {
      role: "destinatário",
      prefixIfSingle: "Cliente",
    })
    if (!recipientName.ok) {
      return {
        success: false,
        error: recipientName.error,
        code: "incomplete_recipient_name",
        currentRecipientName: destination.name !== "Destinatário" ? destination.name : undefined,
      }
    }

    const volumes = buildVolumes(config, order)
    const label = await client.createOrder({
      service: requestedService as SuperFreteServiceId,
      from: buildFromAddressPayload(origin, senderName.name),
      to: buildToAddressPayload(destination, recipientName.name),
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

    const serviceId = label.service_id || requestedService
    // Garante que a etiqueta usa exatamente o serviço selecionado no checkout
    // (nunca outro serviço - ex.: PAC no checkout vira SEDEX no rótulo).
    if (label.service_id && Number(label.service_id) !== requestedService) {
      throw new Error(
        `A transportadora retornou o serviço ${label.service_id}, mas o pedido foi feito com o serviço ${requestedService}. A etiqueta usa sempre o serviço escolhido no checkout.`,
      )
    }
    const checkoutPrice = typeof (order as any)?.delivery_fee === "number" ? Number((order as any).delivery_fee) : 0
    const labelPrice = typeof label.price === "number" ? label.price : null
    const priceMismatch = checkoutPrice > 0 && labelPrice != null && Math.abs(checkoutPrice - labelPrice) > 0.01

    // O serviço e o valor cobrados no checkout são a fonte de verdade: a etiqueta
    // NUNCA deve usar outro serviço ou preço do que o escolhido pelo comprador.
    if (priceMismatch) {
      console.warn(
        `[SuperFrete] Divergência de preço na etiqueta: checkout=R$ ${checkoutPrice.toFixed(2)} ` +
        `vs SuperFrete=R$ ${labelPrice.toFixed(2)}. label=${label.id} service=${serviceId}`,
      )
    }

    await supabase.from("order_shipments").insert({
      order_id: payload.orderId,
      partner_id: ctx.partnerId,
      integration_id: integration.id,
      provider_slug: SUPERFRETE_PROVIDER,
      status: label.status || "pending",
      service_code: String(serviceId),
      service_name: SERVICE_LABELS[serviceId] || SERVICE_LABELS[requestedService] || (order as any)?.delivery_breakdown?.serviceName || null,
      carrier: "SuperFrete",
      external_label_id: label.id,
      price: labelPrice,
      tracking_number: label.tracking || null,
      tracking_url: buildCarrierTrackingUrl(serviceId, label.tracking),
      label_url: label.print?.url || null,
      requested_at: new Date().toISOString(),
      payload: {
        service: requestedService,
        service_id: serviceId,
        response_status: label.status,
        checkout_price: checkoutPrice > 0 ? checkoutPrice : null,
        label_price: labelPrice,
        price_mismatch: priceMismatch,
      },
    })

    // Só registra a liberação depois que a etiqueta realmente foi criada.
    if (missingNfe) {
      const reason = "Etiqueta gerada sem informar o número da NF-e."
      await supabase
        .from("orders")
        .update({
          nfe_override_by: user.id,
          nfe_override_at: new Date().toISOString(),
          nfe_override_reason: reason,
        })
        .eq("id", order.id)

      logAudit("order.nfe_override", {
        partnerId: ctx.partnerId,
        orderId: order.id,
        reason,
        userId: user.id,
        source: "shipping_label",
      })
    }

    // Histórico do pedido: registra a geração da etiqueta em português, com
    // serviço, valor e rastreio. Antes a geração não aparecia na timeline.
    const serviceName =
      SERVICE_LABELS[serviceId] ||
      SERVICE_LABELS[requestedService] ||
      (order as any)?.delivery_breakdown?.serviceName ||
      "Transportadora"
    const priceLine =
      labelPrice != null && labelPrice > 0
        ? ` no valor de R$ ${labelPrice.toFixed(2).replace(".", ",")}`
        : ""
    const trackingLine = label.tracking ? ` - rastreio ${label.tracking}` : ""

    await logAuditEvent({
      partnerId: ctx.partnerId,
      actorUserId: user.id,
      entityType: "order",
      entityId: order.id,
      actionType: "shipping_label_created",
      changeLines: [
        `gerou a etiqueta de frete (${serviceName})${priceLine}${trackingLine}.`,
      ],
      metadata: {
        label_id: label.id,
        service_id: serviceId,
        service_name: serviceName,
        price: labelPrice,
        checkout_price: checkoutPrice > 0 ? checkoutPrice : null,
        price_mismatch: priceMismatch,
        tracking_number: label.tracking || null,
      },
      source: "user",
    })
    await revalidateOrderHistory(order.id)

    revalidateOrders(ctx.partnerId)

    return {
      success: true,
      label: {
        id: label.id,
        price: label.price,
        status: label.status,
        serviceId,
      },
      priceMismatch,
      checkoutPrice,
      labelPrice,
    }
  } catch (err: any) {
    console.error(
      "[SuperFrete] createOrderShippingLabelAction failed:",
      err?.message,
      err?.detail ? JSON.stringify(err.detail) : "",
    )
    captureError(err, {
      module: "shipping",
      action: "create_order_shipping_label",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao criar etiqueta." }
  }
}

// Status de envio por transportadora aceitos no controle manual do ERP.
const CARRIER_SHIPMENT_STATUSES = new Set([
  "pending",
  "released",
  "posted",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
])

// Alteração manual do status de envio de um pedido com transportadora:
// grava em order_shipments.status e mantém orders.delivery_status em
// sincronia usando o mesmo mapeamento do webhook da SuperFrete.
export async function updateOrderCarrierStatusAction(payload: {
  orderId: string
  status: string
}): Promise<{ success: true } | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "edit", user)

  const nextStatus = String(payload.status || "").toLowerCase()
  if (!CARRIER_SHIPMENT_STATUSES.has(nextStatus)) {
    return { success: false, error: "Status de envio inválido." }
  }

  try {
    const supabase = getAdminClient()
    const [shipmentRes, orderRes] = await Promise.all([
      supabase
        .from("order_shipments")
        .select("id, status, paid_at")
        .eq("order_id", payload.orderId)
        .eq("partner_id", ctx.partnerId)
        .neq("kind", "return")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(
          "id, situation, delivery_status, order_number, buyer_id, store_id, delivery_departure_at, delivery_arrived_at, delivery_completed_at, delivery_breakdown",
        )
        .eq("id", payload.orderId)
        .eq("partner_id", ctx.partnerId)
        .maybeSingle(),
    ])

    const shipment = shipmentRes.data
    const order = orderRes.data

    if (!order) return { success: false, error: "Pedido não encontrado." }

    // Pedidos do ERP/PDV com entrega por transportadora gravam apenas o
    // delivery_breakdown (source = "superfrete"); a linha em order_shipments
    // só existe depois de gerar a etiqueta. Sem tolerar isso, alterar o status
    // manualmente falhava com "Este pedido não possui envio por transportadora".
    const isCarrierOrder =
      Boolean(shipment) || (order.delivery_breakdown as any)?.source === "superfrete"
    if (!isCarrierOrder) {
      return { success: false, error: "Este pedido não possui envio por transportadora." }
    }

    const nowIso = new Date().toISOString()

    if (shipment) {
      const shipmentPatch: Record<string, unknown> = { status: nextStatus }
      if (nextStatus === "released" && !shipment.paid_at) shipmentPatch.paid_at = nowIso
      if (nextStatus === "delivered") shipmentPatch.delivered_at = nowIso
      if (nextStatus === "cancelled") shipmentPatch.cancelled_at = nowIso

      const { error: shipErr } = await supabase
        .from("order_shipments")
        .update(shipmentPatch)
        .eq("id", shipment.id)
        .eq("partner_id", ctx.partnerId)
      if (shipErr) return { success: false, error: shipErr.message }
    }

    // Mantém o status de entrega do pedido em sincronia (mesmo mapa do webhook).
    if (order.situation !== "cancelled") {
      const mapped = SUPERFRETE_LABEL_STATUS_TO_DELIVERY_STATUS[nextStatus]
      if (mapped) {
        const orderPatch: Record<string, unknown> = { delivery_status: mapped }
        if (nextStatus === "posted" && !order.delivery_departure_at) {
          orderPatch.delivery_departure_at = nowIso
        }
        if (nextStatus === "delivered") {
          if (!order.delivery_arrived_at) orderPatch.delivery_arrived_at = nowIso
          if (!order.delivery_completed_at) orderPatch.delivery_completed_at = nowIso
        }
        const { error: orderErr } = await supabase
          .from("orders")
          .update(orderPatch)
          .eq("id", order.id)
          .eq("partner_id", ctx.partnerId)
        if (orderErr) return { success: false, error: orderErr.message }
      }
    }

    await logAuditEvent({
      partnerId: ctx.partnerId,
      actorUserId: user.id,
      entityType: "order",
      entityId: order.id,
      actionType: "shipping_status_updated",
      changeLines: [
        `Status de envio (transportadora) alterado para "${SUPERFRETE_LABEL_STATUS[nextStatus] || nextStatus}".`,
      ],
      source: "user",
      metadata: { from_status: shipment?.status ?? null, to_status: nextStatus, shipment_id: shipment?.id ?? null, manual: true },
    })
    await revalidateOrderHistory(order.id)

    // Avisa o cliente quando a encomenda é postada/entregue.
    if (
      order.situation !== "cancelled" &&
      order.buyer_id &&
      (nextStatus === "posted" || nextStatus === "delivered")
    ) {
      try {
        const { createNotification } = await import("@/lib/services/notification.service")
        const isDelivered = nextStatus === "delivered"
        const orderRef = order.order_number || order.id.slice(0, 8).toUpperCase()
        await createNotification({
          userId: order.buyer_id,
          type: isDelivered ? "order_delivered" : "order_shipped",
          title: isDelivered ? "Pedido entregue" : "Pedido enviado",
          message: isDelivered
            ? `Seu pedido #${orderRef} foi entregue.`
            : `Seu pedido #${orderRef} foi postado e está a caminho.`,
          entityType: "order",
          entityId: order.id,
          data: { audience: "customer", partner_id: ctx.partnerId, store_id: order.store_id },
          idempotencyKey: `carrier_status:${order.id}:${nextStatus}`,
          origin: "manual",
        })
      } catch (notifyErr) {
        console.error("[updateOrderCarrierStatusAction] notify failed:", notifyErr)
      }
    }

    revalidateOrders(ctx.partnerId)
    return { success: true }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "update_order_carrier_status",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao atualizar status de envio." }
  }
}

// Estado dos botões de etiqueta (Rastrear/Imprimir/Gerar) em UMA action:
// uma única cadeia de auth, consultas em paralelo e SEM chamada remota ao
// SuperFrete - o saldo é carregado à parte (getSuperFreteBalanceAction).
export async function getOrderCarrierLabelStateAction(payload: { orderId: string }): Promise<{
  success: true
  connected: boolean
  planAllowed: boolean
  shipment: OrderShipmentSummary | null
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  try {
    const supabase = getAdminClient()
    const [plan, integration, shipmentRes] = await Promise.all([
      getPartnerPlan(ctx.partnerId),
      getSuperFreteIntegration(supabase, ctx.partnerId),
      supabase
        .from("order_shipments")
        .select(
          "id, order_id, provider_slug, status, service_code, service_name, carrier, external_label_id, price, tracking_number, tracking_url, label_url, requested_at, paid_at, cancelled_at, created_at, payload",
        )
        .eq("order_id", payload.orderId)
        .eq("partner_id", ctx.partnerId)
        .eq("kind", "outbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      success: true,
      connected: integration?.status === "connected" && Boolean(integration?.access_token_encrypted),
      planAllowed: hasMinimumPlan(plan?.slug || "free", "escalar"),
      shipment: mapShipmentSummary(shipmentRes.data),
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_order_carrier_label_state",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao verificar frete." }
  }
}

// Saldo da carteira SuperFrete (chamada remota) - carregar em background,
// nunca bloquear a exibição dos botões de etiqueta.
export async function getSuperFreteBalanceAction(): Promise<{
  success: true
  balance: number | null
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  try {
    const supabase = getAdminClient()
    const integration = await getSuperFreteIntegration(supabase, ctx.partnerId)
    const connected = integration?.status === "connected" && Boolean(integration?.access_token_encrypted)
    const client = createClientFromIntegration(integration)
    if (!connected || !client) return { success: true, balance: null }
    try {
      const info = await client.getUserInfo()
      return { success: true, balance: Number(info?.balance ?? 0) }
    } catch (err) {
      captureError(err, {
        module: "shipping",
        action: "get_superfrete_balance",
        partnerId: ctx.partnerId,
      })
      return { success: true, balance: null }
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_superfrete_balance",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao consultar saldo." }
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
  checkout_price: number | null
  label_price: number | null
  price_mismatch: boolean
  tracking_number: string | null
  tracking_url: string | null
  label_url: string | null
  requested_at: string | null
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
  payload: Record<string, any> | null
}

// Deriva os campos de preço a partir do payload gravado (no checkout) para
// que a UI possa alertar quando o valor cobrado pela SuperFrete difere do
// valor que o comprador viu no checkout.
function mapShipmentSummary(row: any | null): OrderShipmentSummary | null {
  if (!row) return null
  const p = (row.payload as Record<string, any> | null) || {}
  const checkoutPrice = typeof p.checkout_price === "number" ? p.checkout_price : null
  const labelPrice = typeof p.label_price === "number" ? p.label_price : null
  return {
    id: row.id,
    order_id: row.order_id,
    provider_slug: row.provider_slug,
    status: row.status,
    service_code: row.service_code ?? null,
    service_name: row.service_name ?? null,
    carrier: row.carrier ?? null,
    external_label_id: row.external_label_id ?? null,
    price: typeof row.price === "number" ? row.price : null,
    checkout_price: checkoutPrice,
    label_price: labelPrice,
    price_mismatch: Boolean(p.price_mismatch),
    tracking_number: row.tracking_number ?? null,
    tracking_url: row.tracking_url ?? null,
    label_url: row.label_url ?? null,
    requested_at: row.requested_at ?? null,
    paid_at: row.paid_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    created_at: row.created_at,
    payload: row.payload ?? null,
  }
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
        "id, order_id, provider_slug, status, service_code, service_name, carrier, external_label_id, price, tracking_number, tracking_url, label_url, requested_at, paid_at, cancelled_at, created_at, payload",
      )
      .eq("order_id", payload.orderId)
      .eq("partner_id", ctx.partnerId)
      .eq("kind", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return { success: true, shipment: mapShipmentSummary(data) }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_order_shipment",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao carregar envio do pedido." }
  }
}

// ============================================================================
// Reverse logistics (kind = "return"): buyer -> store labels for returns
// ============================================================================

const RETURN_SHIPMENT_BLOCKED_STATUSES = ["RESOLVED", "REJECTED", "EXPIRED"]

async function loadReturnShippingRequest(returnRequestId: string, partnerId: string) {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from("return_requests")
    .select("id, partner_id, order_id, status")
    .eq("id", returnRequestId)
    .eq("partner_id", partnerId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!data) return { error: "Solicitação de devolução não encontrada." }
  if (RETURN_SHIPMENT_BLOCKED_STATUSES.includes(data.status)) {
    return { error: "Solicitação de devolução encerrada: não é possível gerar etiqueta." }
  }
  return { supabase, returnRequest: data }
}

export async function getReturnShippingStateAction(payload: {
  returnRequestId: string
}): Promise<{
  success: true
  shipment: OrderShipmentSummary | null
  canGenerate: boolean
  reason: string | null
} | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  try {
    const supabase = getAdminClient()
    const [returnRes, shipmentRes] = await Promise.all([
      supabase
        .from("return_requests")
        .select("id, status, orders!order_id(delivery_type)")
        .eq("id", payload.returnRequestId)
        .eq("partner_id", ctx.partnerId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("order_shipments")
        .select(
          "id, order_id, provider_slug, status, service_code, service_name, carrier, external_label_id, price, tracking_number, tracking_url, label_url, requested_at, paid_at, cancelled_at, created_at, payload",
        )
        .eq("return_request_id", payload.returnRequestId)
        .eq("partner_id", ctx.partnerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const returnRequest = returnRes.data
    if (!returnRequest) return { success: false, error: "Solicitação de devolução não encontrada." }

    const data = shipmentRes.data

    let canGenerate = true
    let reason: string | null = null

    if (RETURN_SHIPMENT_BLOCKED_STATUSES.includes(returnRequest.status)) {
      canGenerate = false
      reason = "Solicitação de devolução encerrada: não é possível gerar etiqueta."
    } else if (String((returnRequest as any).orders?.delivery_type || "").toLowerCase() === "pickup") {
      canGenerate = false
      reason = "Pedidos com retirada na loja não utilizam etiqueta de devolução."
    } else {
      const [plan, integration] = await Promise.all([
        getPartnerPlan(ctx.partnerId),
        getSuperFreteIntegration(supabase, ctx.partnerId),
      ])
      if (!hasMinimumPlan(plan?.slug || "free", "escalar")) {
        canGenerate = false
        reason = "Entrega nacional exige o plano Escalar."
      } else if (!integration || integration.status !== "connected" || !integration.access_token_encrypted) {
        canGenerate = false
        reason = "SuperFrete não conectado."
      }
    }

    return {
      success: true,
      shipment: mapShipmentSummary(data),
      canGenerate,
      reason,
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "get_return_shipping_state",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao carregar etiqueta de devolução." }
  }
}

// Prepara a cotação de frete reverso (comprador -> loja): contexto do pedido,
// endereços, cliente SuperFrete e cotações válidas. Usado pela geração da
// etiqueta e pela action de cotação (seletor de transportadora na UI).
type ReturnQuotePrepared =
  | { error: string }
  | {
    data: {
      context: {
        integration: any
        partner: any
        order: any
        config: any
        supabase: ReturnType<typeof getAdminClient>
      }
      buyerAddress: ResolvedShippingAddress
      storeAddress: ResolvedShippingAddress
      client: SuperFreteClient
      validQuotes: any[]
      fromPostalCode: string
      toPostalCode: string
    }
  }

async function prepareReturnShipmentQuote(
  partnerId: string,
  returnRequest: { id: string; order_id: string },
  opts?: { skipFreightQuote?: boolean },
): Promise<ReturnQuotePrepared> {
  const context = await loadShippingOrderContext(returnRequest.order_id, partnerId)
  if ("error" in context && context.error) return { error: (context as any).error }
  const { integration, partner, order, config, supabase } = context as any

  // Reverse route: buyer (from) -> store (to) - resolvidos em paralelo.
  const [buyerAddress, storeAddress] = await Promise.all([
    resolveDestinationAddress(supabase, order),
    resolveOriginAddress(supabase, order, partner, partnerId),
  ])

  if (!buyerAddress || !buyerAddress.postal_code) {
    return { error: "O pedido não tem endereço do comprador com CEP. Não é possível gerar a etiqueta de devolução." }
  }
  if (!buyerAddress.district) {
    return { error: "O endereço do comprador está incompleto (bairro, cidade, estado e CEP são obrigatórios)." }
  }
  if (!storeAddress || !storeAddress.postal_code || !storeAddress.district || !storeAddress.city || !storeAddress.state_abbr) {
    return { error: "Cadastre o endereço completo da loja (Ficha da Empresa) para gerar etiquetas de devolução." }
  }
  if (!storeAddress.document) {
    return { error: "Cadastre o CNPJ ou CPF da loja (Ficha da Empresa) para gerar etiquetas de devolução." }
  }

  const client = createClientFromIntegration(integration)
  if (!client) return { error: "SuperFrete não conectado." }

  const fromPostalCode = buyerAddress.postal_code
  const toPostalCode = (storeAddress.postal_code || config.originCep).replace(/\D/g, "")

  const services: SuperFreteServiceId[] =
    Array.isArray(config.services) && config.services.length > 0
      ? (config.services as SuperFreteServiceId[])
      : ([1, 2] as SuperFreteServiceId[])

  // Modal já cotou ao abrir (getReturnShippingQuotesAction): quando o serviço
  // vem escolhido, pula a cotação - 1 chamada de API a menos no clique.
  if (opts?.skipFreightQuote) {
    return {
      data: {
        context: { integration, partner, order, config, supabase },
        buyerAddress,
        storeAddress,
        client,
        validQuotes: [],
        fromPostalCode,
        toPostalCode,
      },
    }
  }

  const quotes = await client.calculateFreight({
    fromPostalCode,
    toPostalCode,
    services,
    package: buildVolumes(config, order),
    options: {
      own_hand: Boolean(config.ownHand),
      receipt: Boolean(config.receipt),
      insurance_value: Number(config.insuranceValue || 0),
      use_insurance_value: Number(config.insuranceValue || 0) > 0,
    },
  })

  const validQuotes = (Array.isArray(quotes) ? quotes : []).filter(
    (q: any) => q && !q.has_error && Number.isFinite(Number(q.price)),
  )
  if (validQuotes.length === 0) {
    return { error: "Nenhuma transportadora disponível para a devolução neste endereço." }
  }

  return {
    data: {
      context: { integration, partner, order, config, supabase },
      buyerAddress,
      storeAddress,
      client,
      validQuotes,
      fromPostalCode,
      toPostalCode,
    },
  }
}

// Cotações do frete reverso para o seletor de transportadora no modal de
// etiqueta de devolução (mesma lógica de preço/serviços da geração).
export async function getReturnShippingQuotesAction(payload: {
  returnRequestId: string
}): Promise<
  | {
    success: true
    quotes: { id: number; label: string; price: number; deliveryDays: number | null }[]
  }
  | { success: false; error: string }
> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "view", user)

  try {
    const [plan, loaded] = await Promise.all([
      getPartnerPlan(ctx.partnerId),
      loadReturnShippingRequest(payload.returnRequestId, ctx.partnerId),
    ])
    if (!hasMinimumPlan(plan?.slug || "free", "escalar")) {
      return { success: false, error: "Entrega nacional exige o plano Escalar." }
    }
    if ("error" in loaded && loaded.error) return { success: false, error: loaded.error }
    const { returnRequest } = loaded as { returnRequest: { id: string; order_id: string } }

    const prepared = await prepareReturnShipmentQuote(ctx.partnerId, returnRequest)
    if ("error" in prepared) return { success: false, error: prepared.error }

    const quotes = prepared.data.validQuotes
      .map((q: any) => ({
        id: Number(q.id),
        label: String(q.name || SERVICE_LABELS[Number(q.id)] || `Serviço ${q.id}`),
        price: Number(q.price),
        deliveryDays: q.delivery_range?.min ?? q.delivery_time ?? null,
      }))
      .sort((a, b) => a.price - b.price)

    return { success: true, quotes }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "quote_return_shipping",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao cotar o frete de devolução." }
  }
}

export async function createReturnShippingLabelAction(payload: {
  returnRequestId: string
  service?: SuperFreteServiceId
  freightPayer?: ReturnShippingPayer
}): Promise<
  | {
    success: true
    label: {
      id: string
      price: number
      status: string
      serviceId: number
      tracking: string | null
      labelUrl: string | null
    }
    paid: boolean
    paymentError?: string
    simulated?: boolean
  }
  | {
    success: false
    error: string
    code?: "incomplete_sender_name"
    currentSenderName?: string
  }
> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "orders", "edit", user)

  try {
    const [plan, loaded] = await Promise.all([
      getPartnerPlan(ctx.partnerId),
      loadReturnShippingRequest(payload.returnRequestId, ctx.partnerId),
    ])
    if (!hasMinimumPlan(plan?.slug || "free", "escalar")) {
      return { success: false, error: "Entrega nacional exige o plano Escalar." }
    }
    if ("error" in loaded && loaded.error) return { success: false, error: loaded.error }
    const { returnRequest } = loaded as { returnRequest: { id: string; order_id: string } }

    const prepared = await prepareReturnShipmentQuote(ctx.partnerId, returnRequest, {
      skipFreightQuote: Boolean(payload.service),
    })
    if ("error" in prepared) return { success: false, error: prepared.error }
    const { context, buyerAddress, storeAddress, client, validQuotes, fromPostalCode, toPostalCode } = prepared.data
    const { integration, config, order, supabase } = context

    const chosen = payload.service
      ? validQuotes.find((q: any) => Number(q.id) === Number(payload.service))
      : undefined
    const quote =
      chosen ||
      (validQuotes.length > 0
        ? validQuotes.reduce((a: any, b: any) => (Number(a.price) <= Number(b.price) ? a : b))
        : { id: Number(payload.service || 0), price: 0 })
    const serviceId = Number(quote.id) as SuperFreteServiceId
    if (!SUPERFRETE_SERVICE_IDS.includes(serviceId)) {
      return { success: false, error: "Serviço de transporte inválido." }
    }

    const senderName = resolveCompleteName(buyerAddress.nameCandidates ?? [buyerAddress.name], {
      role: "remetente",
      prefixIfSingle: "Cliente",
    })
    if (!senderName.ok) {
      return {
        success: false,
        error: senderName.error,
        code: "incomplete_sender_name",
        currentSenderName: buyerAddress.name !== "Destinatário" ? buyerAddress.name : undefined,
      }
    }
    const recipientName = resolveCompleteName(storeAddress.nameCandidates ?? [storeAddress.name], {
      role: "destinatário",
      prefixIfSingle: "Loja",
    })
    if (!recipientName.ok) return { success: false, error: recipientName.error }

    // Saldo buscado antes de criar a etiqueta: roda em paralelo com
    // createOrder em vez de esperar depois (1 espera a menos).
    const balancePromise = client.getUserInfo().then(
      (userInfo: any) => ({ userInfo, error: null as unknown }),
      (error: unknown) => ({ userInfo: undefined, error }),
    )

    const label = await client.createOrder({
      service: serviceId,
      from: buildFromAddressPayload(buyerAddress, senderName.name),
      to: buildToAddressPayload(storeAddress, recipientName.name),
      products: buildShippingProducts(order),
      volumes: buildVolumes(config, order),
      options: {
        insurance_value: Number(config.insuranceValue || 0),
        receipt: Boolean(config.receipt),
        own_hand: Boolean(config.ownHand),
        non_commercial: true,
      },
      tags: [{ tag: `Dudit devolução ${order.order_number || order.id}` }],
    })

    const labelServiceId = label.service_id || serviceId

    // Registra quem paga o frete da remessa reversa (escolhido na UI;
    // usado por syncReturnRequestAfterPayment após o pagamento).
    const freightPayer: ReturnShippingPayer | null =
      payload.freightPayer === "seller" ||
        payload.freightPayer === "customer" ||
        payload.freightPayer === "case_by_case"
        ? payload.freightPayer
        : null
    await Promise.all([
      supabase.from("order_shipments").insert({
        order_id: returnRequest.order_id,
        partner_id: ctx.partnerId,
        integration_id: integration.id,
        provider_slug: SUPERFRETE_PROVIDER,
        kind: "return",
        return_request_id: returnRequest.id,
        status: label.status || "pending",
        service_code: String(labelServiceId),
        service_name: SERVICE_LABELS[labelServiceId] || SERVICE_LABELS[serviceId],
        carrier: "SuperFrete",
        external_label_id: label.id,
        price: typeof label.price === "number" ? label.price : null,
        tracking_number: label.tracking || null,
        tracking_url: buildCarrierTrackingUrl(labelServiceId, label.tracking),
        label_url: label.print?.url || null,
        requested_at: new Date().toISOString(),
        payload: {
          kind: "return",
          return_request_id: returnRequest.id,
          service: serviceId,
          service_id: labelServiceId,
          response_status: label.status,
          from_postal_code: fromPostalCode,
          to_postal_code: toPostalCode,
        },
      }),
      supabase
        .from("return_requests")
        .update({ return_freight_payer: freightPayer, updated_at: new Date().toISOString() })
        .eq("id", returnRequest.id),
    ])

    // Histórico do pedido: registra a etiqueta de devolução gerada.
    const returnServiceName =
      SERVICE_LABELS[labelServiceId] || SERVICE_LABELS[serviceId] || "Transportadora"
    const returnPrice =
      typeof label.price === "number" && label.price > 0
        ? ` no valor de R$ ${label.price.toFixed(2).replace(".", ",")}`
        : ""
    const returnTracking = label.tracking ? ` - rastreio ${label.tracking}` : ""

    await logAuditEvent({
      partnerId: ctx.partnerId,
      actorUserId: user.id,
      entityType: "return_request",
      entityId: returnRequest.id,
      actionType: "return_shipping_label_created",
      changeLines: [
        `gerou a etiqueta de devolução (${returnServiceName})${returnPrice}${returnTracking}.`,
      ],
      metadata: {
        order_id: returnRequest.order_id,
        label_id: label.id,
        service_id: labelServiceId,
        price: typeof label.price === "number" ? label.price : null,
        freight_payer: freightPayer,
      },
      source: "user",
    })
    await revalidateOrderHistory(returnRequest.order_id)

    // One-click: paga a etiqueta logo em seguida (igual ao fluxo de ida).
    let paid = false
    let paymentError: string | undefined
    let simulated: boolean | undefined
    let paidTracking: string | null | undefined
    try {
      const payRes = await performLabelCheckout(supabase, integration, client, ctx.partnerId, label.id, balancePromise)
      if (payRes.success) {
        paid = true
        simulated = Boolean(payRes.result.simulated)
        paidTracking = payRes.result.tracking || null
        await syncReturnRequestAfterPayment(supabase, ctx.partnerId, label.id)
      } else {
        paymentError = payRes.error
      }
    } catch (payErr: any) {
      paymentError = payErr?.message || "Erro ao pagar a etiqueta de devolução."
    }

    revalidateOrders(ctx.partnerId)

    return {
      success: true,
      label: {
        id: label.id,
        price: typeof label.price === "number" ? label.price : Number(quote.price || 0),
        status: paid ? "released" : label.status,
        serviceId: labelServiceId,
        tracking: paidTracking ?? label.tracking ?? null,
        labelUrl: label.print?.url || null,
      },
      paid,
      paymentError,
      simulated,
    }
  } catch (err: any) {
    captureError(err, {
      module: "shipping",
      action: "create_return_shipping_label",
      partnerId: ctx.partnerId,
    })
    return { success: false, error: err?.message || "Erro ao criar etiqueta de devolução." }
  }
}

export async function saveOrderRecipientDocumentAction(payload: {
  partnerId: string
  orderId: string
  document: string
}): Promise<{ success: true; customerId: string } | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "edit", user)

  const digits = String(payload.document || "").replace(/\D/g, "")
  if (digits.length === 11) {
    if (!validateCPF(digits)) return { success: false, error: "CPF inválido." }
  } else if (digits.length === 14) {
    if (!validateCNPJ(digits)) return { success: false, error: "CNPJ inválido." }
  } else {
    return { success: false, error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." }
  }

  const supabase = getAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("customer_id, buyer_id")
    .eq("id", payload.orderId)
    .eq("partner_id", payload.partnerId)
    .maybeSingle()

  const candidateIds = [order?.buyer_id, order?.customer_id].filter(Boolean)
  let customerId: string | null = null
  for (const id of candidateIds) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("id", id)
      .maybeSingle()
    if (data) {
      customerId = data.id
      break
    }
  }
  if (!customerId) {
    return { success: false, error: "Pedido sem cliente vinculado. Cadastre o cliente do pedido e tente novamente." }
  }

  if (digits.length === 11) {
    const lookupHash = generateCpfLookupHash(digits)
    if (lookupHash) {
      const { data: duplicate } = await supabase
        .from("customers")
        .select("id")
        .eq("partner_id", payload.partnerId)
        .eq("cpf_lookup_hash", lookupHash)
        .is("deleted_at", null)
        .neq("id", customerId)
        .limit(1)
      if (duplicate && duplicate.length > 0) {
        return { success: false, error: "Já existe outro cliente cadastrado com este CPF." }
      }
    }
    const encrypted = await encryptCPF(digits)
    const { data: updated, error } = await supabase
      .from("customers")
      .update({ cpf: encrypted, cpf_lookup_hash: lookupHash })
      .eq("id", customerId)
      .select("id")
    if (error || !updated || updated.length === 0) {
      console.error("[SuperFrete] saveOrderRecipientDocument CPF failed:", error?.message || "no row updated")
      return { success: false, error: "Erro ao salvar o CPF do cliente." }
    }
  } else {
    const { data: updated, error } = await supabase
      .from("customers")
      .update({ cnpj: digits })
      .eq("id", customerId)
      .select("id")
    if (error || !updated || updated.length === 0) {
      console.error("[SuperFrete] saveOrderRecipientDocument CNPJ failed:", error?.message || "no row updated")
      return { success: false, error: "Erro ao salvar o CNPJ do cliente." }
    }
  }

  return { success: true, customerId }
}

export async function saveOrderRecipientNameAction(payload: {
  partnerId: string
  orderId: string
  name: string
}): Promise<{ success: true; name: string } | { success: false; error: string }> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(payload.partnerId, "orders", "edit", user)

  const normalized = truncateField(collapseSpaces(payload.name), 150)
  if (countWords(truncateField(normalized, 50)) < 2) {
    return { success: false, error: "Informe nome e sobrenome (ao menos duas palavras)." }
  }

  const supabase = getAdminClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, customer_id, buyer_id")
    .eq("id", payload.orderId)
    .eq("partner_id", payload.partnerId)
    .maybeSingle()

  if (!order) {
    return { success: false, error: "Pedido não encontrado." }
  }

  const { error: orderErr } = await supabase
    .from("orders")
    .update({ customer_name: normalized })
    .eq("id", payload.orderId)
    .eq("partner_id", payload.partnerId)

  if (orderErr) {
    console.error("[SuperFrete] saveOrderRecipientName order update failed:", orderErr.message)
    return { success: false, error: "Erro ao salvar o nome no pedido." }
  }

  const candidateIds = [order.buyer_id, order.customer_id].filter(Boolean)
  for (const id of candidateIds) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("id", id)
      .maybeSingle()
    if (customer) {
      const { error: customerErr } = await supabase
        .from("customers")
        .update({ name: normalized })
        .eq("id", customer.id)
      if (customerErr) {
        console.error("[SuperFrete] saveOrderRecipientName customer update failed:", customerErr.message)
      }
      break
    }
  }

  revalidateOrders(payload.partnerId)
  return { success: true, name: normalized }
}
