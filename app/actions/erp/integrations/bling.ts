"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { encrypt } from "@/lib/cryptoService"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { captureError } from "@/lib/monitoring/sentry"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import {
  BLING_PROVIDER,
  findBlingIntegration,
  resolveBlingOAuthAppCredentials,
  syncBlingProductsToDudit,
  type BlingIntegrationConfig,
  type BlingIntegrationMetadata,
} from "@/lib/services/integrations/bling/bling-integration"

export interface BlingStatus {
  connected: boolean
  connectedAt?: string | null
  config?: BlingIntegrationConfig | null
  metadata?: BlingIntegrationMetadata | null
  webhookUrl?: string | null
  redirectUri?: string | null
  hasOAuthAppConfigured?: boolean
  usesCustomApp?: boolean
}

export async function getBlingStatusAction(): Promise<{
  success: boolean
  data?: BlingStatus
  error?: string
}> {
  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

    const supabase = getAdminClient()
    const integration = await findBlingIntegration(supabase, ctx.partnerId)

    const connected = integration?.status === "connected" && Boolean(integration.access_token_encrypted)
    const { clientId, clientSecret } = resolveBlingOAuthAppCredentials(integration)
    const creds = (integration?.credentials as Record<string, any>) || {}
    const usesCustomApp = Boolean(creds.client_id_encrypted && creds.client_secret_encrypted)

    const baseUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br").replace(/\/$/, "")
    const redirectUri = `${baseUrl}/api/integrations/bling/oauth/callback`

    let webhookUrl: string | null = null
    if (connected && integration) {
      let webhookSecret = (integration.config as BlingIntegrationConfig)?.webhook_secret
      if (!webhookSecret) {
        webhookSecret = crypto.randomUUID().replace(/-/g, "")
        await supabase
          .from("partner_integrations")
          .update({
            config: { ...((integration.config as any) || {}), webhook_secret: webhookSecret },
          })
          .eq("id", integration.id)
      }
      webhookUrl = `${baseUrl}/api/integrations/bling/webhook?partnerId=${ctx.partnerId}&token=${webhookSecret}`
    }

    return {
      success: true,
      data: {
        connected,
        connectedAt: integration?.connected_at || null,
        config: (integration?.config as BlingIntegrationConfig) || null,
        metadata: (integration?.metadata as BlingIntegrationMetadata) || null,
        webhookUrl,
        redirectUri,
        hasOAuthAppConfigured: Boolean(clientId && clientSecret),
        usesCustomApp,
      },
    }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: BLING_PROVIDER, action: "get_status" })
    return { success: false, error: err?.message || "Erro ao carregar status do Bling ERP" }
  }
}

/**
 * Salva Client ID e Client Secret de um Aplicativo Privado do Bling (opcional — para testes ou conta própria antes da homologação pública)
 */
export async function saveBlingCredentialsAction(payload: {
  clientId: string
  clientSecret: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const clientId = payload.clientId?.trim()
    const clientSecret = payload.clientSecret?.trim()
    if (!clientId || !clientSecret) {
      return { success: false, error: "Informe o Client ID e o Client Secret do aplicativo Bling." }
    }

    const supabase = getAdminClient()

    await supabase
      .from("integration_providers")
      .upsert(
        { slug: BLING_PROVIDER, category: "other", name: "Bling ERP", is_active: true, docs_url: "https://developer.bling.com.br" },
        { onConflict: "slug" }
      )

    const existing = await findBlingIntegration(supabase, ctx.partnerId)
    const now = new Date().toISOString()

    const { error } = await supabase
      .from("partner_integrations")
      .upsert(
        {
          partner_id: ctx.partnerId,
          provider_slug: BLING_PROVIDER,
          status: existing?.status || "disconnected",
          credentials: {
            ...((existing?.credentials as Record<string, any>) || {}),
            client_id_encrypted: encrypt(clientId, BLING_PROVIDER),
            client_secret_encrypted: encrypt(clientSecret, BLING_PROVIDER),
          },
          config: existing?.config || { sync_stock: true, auto_export_orders: true },
          updated_at: now,
        },
        { onConflict: "partner_id,provider_slug" }
      )

    if (error) return { success: false, error: error.message }

    revalidatePath("/erp/configuracoes")
    return { success: true }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: BLING_PROVIDER, action: "save_credentials" })
    return { success: false, error: err?.message || "Erro ao salvar credenciais do Bling" }
  }
}

export async function disconnectBlingAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

    const supabase = getAdminClient()
    const existing = await findBlingIntegration(supabase, ctx.partnerId)
    if (!existing) return { success: true }

    const creds = { ...((existing.credentials as Record<string, any>) || {}) }
    delete creds.refresh_token_encrypted
    delete creds.token_expires_at
    delete creds.client_id_encrypted
    delete creds.client_secret_encrypted

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        status: "disconnected",
        access_token_encrypted: null,
        credentials: creds,
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (error) return { success: false, error: error.message }

    revalidatePath("/erp/configuracoes")
    return { success: true }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: BLING_PROVIDER, action: "disconnect" })
    return { success: false, error: err?.message || "Erro ao desconectar Bling ERP" }
  }
}

export async function saveBlingConfigAction(payload: {
  syncStock?: boolean
  autoExportOrders?: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)

    const supabase = getAdminClient()
    const existing = await findBlingIntegration(supabase, ctx.partnerId)
    if (!existing) return { success: false, error: "Integração com Bling ERP não encontrada." }

    const nextConfig: BlingIntegrationConfig = {
      ...((existing.config as BlingIntegrationConfig) || {}),
      ...(payload.syncStock !== undefined ? { sync_stock: payload.syncStock } : {}),
      ...(payload.autoExportOrders !== undefined ? { auto_export_orders: payload.autoExportOrders } : {}),
    }

    const { error } = await supabase
      .from("partner_integrations")
      .update({
        config: nextConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (error) return { success: false, error: error.message }

    revalidatePath("/erp/configuracoes")
    return { success: true }
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: BLING_PROVIDER, action: "save_config" })
    return { success: false, error: err?.message || "Erro ao salvar configurações do Bling" }
  }
}

export async function syncBlingProductsAction(): Promise<{
  success: boolean
  totalProcessed?: number
  totalCreated?: number
  totalUpdated?: number
  errors?: string[]
  error?: string
}> {
  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx) return { success: false, error: "Contexto de ERP não encontrado" }
    await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_integrations", user)
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    const res = await syncBlingProductsToDudit({
      partnerId: ctx.partnerId,
      storeId: ctx.activeStoreId || null,
      maxPages: 5,
    })

    safeRevalidateTag(TAGS.products(ctx.partnerId))
    revalidatePath("/erp/produtos")
    revalidatePath("/erp/configuracoes")

    return res
  } catch (err: any) {
    captureError(err, { module: "integrations", provider: BLING_PROVIDER, action: "sync_products" })
    return { success: false, error: err?.message || "Erro ao sincronizar produtos do Bling" }
  }
}
