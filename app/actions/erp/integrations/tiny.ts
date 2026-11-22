"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { encrypt } from "@/lib/cryptoService"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { createTinyClient } from "@/lib/services/integrations/tiny/tiny-client"
import {
  TINY_PROVIDER,
  findTinyIntegration,
  syncTinyProductsToDudit,
  type TinyIntegrationConfig,
  type TinyIntegrationMetadata,
} from "@/lib/services/integrations/tiny/tiny-integration"
import {
  recordIntegrationConnected,
  recordIntegrationDisconnected,
} from "@/lib/services/compliance/integration-history"

export interface TinyStatus {
  connected: boolean
  connectedAt?: string | null
  config?: TinyIntegrationConfig | null
  metadata?: TinyIntegrationMetadata | null
  webhookUrl?: string | null
}

/**
 * Obtém o status da integração com Tiny ERP para o parceiro logado
 */
export async function getTinyStatusAction(): Promise<{
  success: boolean
  data?: TinyStatus
  error?: string
}> {
  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

    const supabase = getAdminClient()
    const integration = await findTinyIntegration(supabase, ctx.partnerId)

    const connected = integration?.status === "connected" && Boolean(integration.access_token_encrypted)
    let webhookUrl: string | null = null

    if (connected && integration) {
      let webhookSecret = (integration.config as TinyIntegrationConfig)?.webhook_secret
      if (!webhookSecret) {
        webhookSecret = crypto.randomUUID().replace(/-/g, "")
        const updatedConfig = {
          ...((integration.config as any) || {}),
          webhook_secret: webhookSecret,
        }
        await supabase
          .from("partner_integrations")
          .update({ config: updatedConfig })
          .eq("id", integration.id)
      }
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"
      webhookUrl = `${baseUrl}/api/integrations/tiny/webhook?partnerId=${ctx.partnerId}&token=${webhookSecret}`
    }

    return {
      success: true,
      data: {
        connected,
        connectedAt: integration?.connected_at || null,
        config: (integration?.config as TinyIntegrationConfig) || null,
        metadata: (integration?.metadata as TinyIntegrationMetadata) || null,
        webhookUrl,
      },
    }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: "tiny", action: "get_status" })
    return { success: false, error: err?.message || "Erro ao carregar status do Tiny ERP" }
  }
}

/**
 * Conecta ou atualiza o token do Tiny ERP
 */
export async function connectTinyAction(payload: {
  token: string
  syncStock?: boolean
  autoExportOrders?: boolean
}): Promise<{
  success: boolean
  error?: string
}> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const token = payload.token?.trim()
  if (!token) {
    return { success: false, error: "Token de API do Tiny é obrigatório." }
  }

  addMonitoringBreadcrumb({
    domain: "integrations",
    message: "tiny.connect.started",
    metadata: { partnerId: ctx.partnerId },
  })

  // Testa o token antes de salvar
  const client = createTinyClient(token)
  const testRes = await client.testConnection()
  if (!testRes.valid) {
    return {
      success: false,
      error: `Token inválido ou não autorizado no Tiny: ${testRes.message}`,
    }
  }

  const supabase = getAdminClient()

  try {
    const existing = await findTinyIntegration(supabase, ctx.partnerId)
    const existingConfig = (existing?.config as Record<string, any> | null) || {}

    const encryptedToken = encrypt(token, "tiny")
    const webhookSecret = existingConfig.webhook_secret || crypto.randomUUID().replace(/-/g, "")

    const nextConfig: TinyIntegrationConfig = {
      ...existingConfig,
      webhook_secret: webhookSecret,
      sync_stock: payload.syncStock ?? existingConfig.sync_stock ?? true,
      auto_export_orders: payload.autoExportOrders ?? existingConfig.auto_export_orders ?? true,
    }

    const connectedAt = new Date().toISOString()
    const { error } = await supabase.from("partner_integrations").upsert(
      {
        partner_id: ctx.partnerId,
        provider_slug: TINY_PROVIDER,
        status: "connected",
        access_token_encrypted: encryptedToken,
        connected_at: connectedAt,
        disconnected_at: null,
        config: nextConfig,
      },
      { onConflict: "partner_id,provider_slug" }
    )

    if (error) {
      return { success: false, error: error.message }
    }

    await recordIntegrationConnected(supabase, {
      partnerId: ctx.partnerId,
      providerSlug: TINY_PROVIDER,
      connectedAt,
    })

    await safeRevalidateTag(TAGS.partner(ctx.partnerId))
    revalidatePath("/erp/configuracoes")

    return { success: true }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: "tiny", action: "connect" })
    return { success: false, error: err?.message || "Falha ao conectar com Tiny ERP" }
  }
}

/**
 * Desconecta a integração com Tiny ERP
 */
export async function disconnectTinyAction(): Promise<{
  success: boolean
  error?: string
}> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const supabase = getAdminClient()

  try {
    const disconnectedAt = new Date().toISOString()

    await recordIntegrationDisconnected(supabase, {
      partnerId: ctx.partnerId,
      providerSlug: TINY_PROVIDER,
      disconnectedAt,
    })

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        disconnected_at: disconnectedAt,
        updated_at: disconnectedAt,
      })
      .eq("partner_id", ctx.partnerId)
      .eq("provider_slug", TINY_PROVIDER)

    if (error) {
      return { success: false, error: error.message }
    }

    await safeRevalidateTag(TAGS.partner(ctx.partnerId))
    revalidatePath("/erp/configuracoes")

    return { success: true }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: "tiny", action: "disconnect" })
    return { success: false, error: err?.message || "Falha ao desconectar Tiny ERP" }
  }
}

/**
 * Executa a sincronização dos produtos do Tiny para o catálogo da Dudit
 */
export async function syncTinyProductsAction(maxPages = 5): Promise<{
  success: boolean
  totalProcessed?: number
  totalCreated?: number
  totalUpdated?: number
  errors?: string[]
  error?: string
}> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "products", "products_manage", user)

  try {
    const res = await syncTinyProductsToDudit({
      partnerId: ctx.partnerId,
      storeId: ctx.activeStoreId,
      maxPages,
    })

    revalidatePath("/erp/produtos")
    revalidatePath("/erp/configuracoes")

    return res
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: "tiny", action: "sync_products" })
    return { success: false, error: err?.message || "Erro na sincronização de produtos" }
  }
}

/**
 * Salva apenas as preferências de configuração do Tiny (ex: auto_export_orders)
 */
export async function saveTinyConfigAction(config: TinyIntegrationConfig): Promise<{
  success: boolean
  error?: string
}> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  const user = await requireUser()
  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

  const supabase = getAdminClient()

  try {
    const existing = await findTinyIntegration(supabase, ctx.partnerId)
    const existingConfig = (existing?.config as Record<string, any> | null) || {}

    const nextConfig: TinyIntegrationConfig = {
      ...existingConfig,
      ...config,
    }

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        config: nextConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("partner_id", ctx.partnerId)
      .eq("provider_slug", TINY_PROVIDER)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath("/erp/configuracoes")
    return { success: true }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: "tiny", action: "save_config" })
    return { success: false, error: err?.message || "Erro ao salvar configurações" }
  }
}
