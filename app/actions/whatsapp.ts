"use server"

import { randomBytes } from "crypto"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireUser, requirePartnerRouteAccess, requireMinimumPlan } from "@/lib/auth/authorization"
import { decrypt } from "@/lib/cryptoService"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import {
    upsertWhatsappConnection,
    deactivateWhatsappConnection,
    setWhatsappConnectionActive,
    getActiveWhatsappConnection,
    findActiveConnectionByPhoneNumberId,
    syncWhatsappTemplates,
    upsertEvolutionConnection,
    getWebhookUrl,
    getEvolutionServerConfig,
    generateEvolutionInstanceName,
    EVOLUTION_WEBHOOK_EVENTS,
} from "@/lib/services/whatsapp-connection.service"
import { EvolutionWhatsappClient } from "@/lib/whatsapp/providers/evolution-client"
import { createWhatsappProviderFromConnection } from "@/lib/whatsapp/providers"
import { exchangeMetaAuthorizationCode } from "@/lib/meta/graph-client"
import { MetaWhatsappManagementClient } from "@/lib/whatsapp/providers/meta-management-client"
import { generateWhatsappOAuthState, validateWhatsappOAuthState } from "@/lib/security/whatsapp-oauth-state"
import { dispatchWhatsappAutomation } from "@/lib/services/whatsapp-automation.service"
import { processWhatsappMessageById, queueWhatsappMessage } from "@/lib/services/whatsapp-dispatch.service"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import type { ActionResponse } from "@/lib/types/action-response"
import type { PartnerWhatsappConnection, WhatsappProviderId } from "@/lib/whatsapp/types"
import { revalidatePath } from "next/cache"

/** Extract a human-readable message from any thrown value (Error, Supabase PostgrestError, plain object, string). */
function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === "string") return error
    if (error && typeof error === "object") {
        // Supabase PostgrestError has { message, code, details, hint }
        const obj = error as Record<string, unknown>
        if (typeof obj.message === "string") return obj.message
        if (typeof obj.error === "string") return obj.error
        try { return JSON.stringify(error) } catch { return "Erro desconhecido (objeto)" }
    }
    return "Erro desconhecido"
}

type WhatsappMessageRow = {
    id: string
    phone_number: string
    template_name: string | null
    status: string
    error_message: string | null
    sent_at: string | null
    created_at: string
    message_type: string
}

export type WhatsappConnectionView = {
    id: string
    provider: WhatsappProviderId
    phoneNumber: string | null
    phoneNumberId: string | null
    businessAccountId: string | null
    connectionSource: string
    wabaName: string | null
    lastSyncedAt: string | null
    status: string
    isActive: boolean
    connectedAt: string | null
    hasToken: boolean
    // Evolution-specific fields
    instanceName: string | null
    apiUrl: string | null
    hasApiKey: boolean
    webhookUrl: string | null
}

export type WhatsappTemplateView = {
    id: string
    templateName: string
    language: string
    category: string
    approvalStatus: string | null
    isActive: boolean
}

export type WhatsappMessageView = {
    id: string
    phoneNumber: string
    templateName: string | null
    status: string
    errorMessage: string | null
    sentAt: string | null
    createdAt: string
    messageType: string
}

async function requireIntegrationsAccess(partnerId: string) {
    const user = await requireUser()
    await requirePartnerRouteAccess(partnerId, "settings_integrations", {
        specificPermission: "can_manage_integrations",
    })
    await requireMinimumPlan(partnerId, "escalar")
    return user
}

export async function getWhatsappIntegrationAction(): Promise<
    ActionResponse<{
        connection: WhatsappConnectionView | null
        allConnections: WhatsappConnectionView[]
        messages: WhatsappMessageView[]
        templates: WhatsappTemplateView[]
    }>
> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const admin = getAdminClient()
        const { data: connections } = await admin
            .from("partner_whatsapp_connections")
            .select("*")
            .eq("partner_id", context.partnerId)
            .order("updated_at", { ascending: false })

        const rows = (connections || []) as PartnerWhatsappConnection[]
        const active = rows.find((c: PartnerWhatsappConnection) => c.is_active) || rows[0]

        const { data: messages } = await admin
            .from("whatsapp_messages")
            .select("id, phone_number, template_name, status, error_message, sent_at, created_at, message_type")
            .eq("partner_id", context.partnerId)
            .order("created_at", { ascending: false })
            .limit(50)

        const { data: templateRows } = await admin
            .from("whatsapp_templates")
            .select("id, template_name, language, category, variables, is_active")
            .eq("partner_id", context.partnerId)
            .eq("provider", "meta")
            .order("template_name", { ascending: true })

        const connection: WhatsappConnectionView | null = active
            ? {
                id: active.id,
                provider: active.provider,
                phoneNumber: active.phone_number,
                phoneNumberId: active.phone_number_id,
                businessAccountId: active.business_account_id,
                connectionSource: active.connection_source || "manual",
                wabaName: active.waba_name,
                lastSyncedAt: active.last_synced_at,
                status: active.status,
                isActive: active.is_active,
                connectedAt: active.connected_at,
                hasToken: !!active.access_token_encrypted,
                instanceName: active.instance_name,
                apiUrl: active.api_url,
                hasApiKey: !!active.api_key_encrypted,
                webhookUrl: active.provider === "evolution"
                    ? getWebhookUrl("evolution", active.id, active.evolution_webhook_secret || undefined)
                    : getWebhookUrl("meta"),
            }
            : null

        // Also build views for all connections (for UI provider switching)
        const allConnectionViews: WhatsappConnectionView[] = rows.map((c: PartnerWhatsappConnection) => ({
            id: c.id,
            provider: c.provider,
            phoneNumber: c.phone_number,
            phoneNumberId: c.phone_number_id,
            businessAccountId: c.business_account_id,
            connectionSource: c.connection_source || "manual",
            wabaName: c.waba_name,
            lastSyncedAt: c.last_synced_at,
            status: c.status,
            isActive: c.is_active,
            connectedAt: c.connected_at,
            hasToken: !!c.access_token_encrypted,
            instanceName: c.instance_name,
            apiUrl: c.api_url,
            hasApiKey: !!c.api_key_encrypted,
            webhookUrl: c.provider === "evolution"
                ? getWebhookUrl("evolution", c.id, c.evolution_webhook_secret || undefined)
                : getWebhookUrl("meta"),
        }))

        return {
            success: true,
            data: {
                connection,
                allConnections: allConnectionViews,
                templates: (templateRows || []).map((t: any) => {
                    const vars = (t.variables || {}) as Record<string, unknown>
                    return {
                        id: t.id,
                        templateName: t.template_name,
                        language: t.language,
                        category: t.category,
                        approvalStatus: typeof vars.meta_status === "string" ? vars.meta_status : null,
                        isActive: t.is_active,
                    }
                }),
                messages: ((messages || []) as WhatsappMessageRow[]).map((m) => ({
                    id: m.id,
                    phoneNumber: m.phone_number,
                    templateName: m.template_name,
                    status: m.status,
                    errorMessage: m.error_message,
                    sentAt: m.sent_at,
                    createdAt: m.created_at,
                    messageType: m.message_type,
                })),
            },
        }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] getWhatsappIntegrationAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function connectWhatsappAction(input: {
    provider: WhatsappProviderId
    accessToken: string
    phoneNumberId: string
    businessAccountId?: string
    phoneNumber?: string
}): Promise<ActionResponse<{ connectionId: string; webhookVerifyToken: string }>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        if (!input.accessToken?.trim() || !input.phoneNumberId?.trim()) {
            return { success: false, error: "Token e Phone Number ID são obrigatórios" }
        }

        const connection = await upsertWhatsappConnection({
            partnerId: context.partnerId,
            provider: input.provider,
            accessToken: input.accessToken.trim(),
            phoneNumberId: input.phoneNumberId.trim(),
            businessAccountId: input.businessAccountId?.trim(),
            phoneNumber: input.phoneNumber?.trim(),
            activate: true,
            connectionSource: "manual",
        })

        revalidatePath("/erp/integrations/whatsapp")

        return {
            success: true,
            data: {
                connectionId: connection.id,
                webhookVerifyToken: connection.webhook_verify_token || "",
            },
        }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] connectWhatsappAction error:", msg, error)
        return { success: false, error: `Erro ao conectar WhatsApp: ${msg}` }
    }
}

/** Public Embedded Signup config for the browser (app id + config id are not secrets). */
export async function getWhatsappEmbeddedSignupClientConfigAction(): Promise<
    ActionResponse<{
        appId: string
        configId: string
        graphVersion: string
        configured: boolean
    }>
> {
    try {
        await requireUser()
        const appId =
            process.env.NEXT_PUBLIC_META_APP_ID?.trim() || process.env.META_APP_ID?.trim() || ""
        const configId =
            process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ||
            process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ||
            ""
        const graphVersion =
            process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION?.trim() ||
            process.env.META_GRAPH_API_VERSION?.trim() ||
            "v21.0"

        return {
            success: true,
            data: {
                appId,
                configId,
                graphVersion,
                configured: Boolean(appId && configId),
            },
        }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        return { success: false, error: msg }
    }
}

export async function prepareWhatsappEmbeddedSignupAction(): Promise<ActionResponse<void>> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)
        const user = await requireUser()
        await generateWhatsappOAuthState(context.partnerId, user.id)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] prepareWhatsappEmbeddedSignupAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function completeWhatsappEmbeddedSignupAction(input: {
    code: string
    wabaId: string
    phoneNumberId: string
}): Promise<ActionResponse<{ connectionId: string }>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const user = await requireUser()
        const stateValidation = await validateWhatsappOAuthState(user.id)
        if (!stateValidation.valid) {
            return { success: false, error: stateValidation.error || "Sessão de conexão inválida ou expirada" }
        }
        if (stateValidation.partnerId !== context.partnerId) {
            return { success: false, error: "Contexto do parceiro não confere com a sessão" }
        }

        const code = input.code?.trim()
        const wabaId = input.wabaId?.trim()
        const phoneNumberId = input.phoneNumberId?.trim()
        if (!code || !wabaId || !phoneNumberId) {
            return { success: false, error: "Dados incompletos retornados pela Meta" }
        }

        const conflict = await findActiveConnectionByPhoneNumberId(phoneNumberId, context.partnerId)
        if (conflict) {
            return {
                success: false,
                error: "Este número WhatsApp já está conectado a outra conta Dudit",
            }
        }

        const accessToken = await exchangeMetaAuthorizationCode(code)
        const management = new MetaWhatsappManagementClient(accessToken)

        const waba = await management.getWaba(wabaId)
        const wabaName = typeof waba.name === "string" ? waba.name : null

        const phones = await management.getPhoneNumbers(wabaId)
        const phoneList = phones.data || []
        const matchedPhone =
            phoneList.find((p) => String(p.id) === phoneNumberId) || phoneList[0]
        const displayPhone =
            typeof matchedPhone?.display_phone_number === "string"
                ? matchedPhone.display_phone_number
                : null

        if (!phoneList.some((p) => String(p.id) === phoneNumberId)) {
            return { success: false, error: "Número não encontrado na conta WhatsApp selecionada" }
        }

        await management.subscribeAppToWaba(wabaId)

        const connection = await upsertWhatsappConnection({
            partnerId: context.partnerId,
            provider: "meta",
            accessToken,
            phoneNumberId,
            businessAccountId: wabaId,
            phoneNumber: displayPhone || undefined,
            connectionSource: "embedded_signup",
            wabaName: wabaName || undefined,
            activate: true,
        })

        await syncWhatsappTemplates({
            partnerId: context.partnerId,
            accessToken,
            wabaId,
        })

        revalidatePath("/erp/integrations/whatsapp")
        revalidatePath("/erp/settings")

        return { success: true, data: { connectionId: connection.id } }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] completeWhatsappEmbeddedSignupAction error:", msg, error)
        return { success: false, error: `Erro ao conectar WhatsApp: ${msg}` }
    }
}

export async function syncWhatsappTemplatesAction(): Promise<ActionResponse<{ synced: number }>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const connection = await getActiveWhatsappConnection(context.partnerId, "meta")
        if (!connection?.access_token_encrypted || !connection.business_account_id) {
            return { success: false, error: "WhatsApp não está conectado" }
        }

        const accessToken = decrypt(connection.access_token_encrypted, "whatsapp")
        const result = await syncWhatsappTemplates({
            partnerId: context.partnerId,
            accessToken,
            wabaId: connection.business_account_id,
        })

        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: result }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] syncWhatsappTemplatesAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function disconnectWhatsappAction(
    provider: WhatsappProviderId = "meta",
): Promise<ActionResponse<void>> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)
        await deactivateWhatsappConnection(context.partnerId, provider)
        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] disconnectWhatsappAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function toggleWhatsappActiveAction(
    isActive: boolean,
    provider: WhatsappProviderId = "meta",
): Promise<ActionResponse<void>> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)
        await setWhatsappConnectionActive(context.partnerId, isActive, provider)
        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] toggleWhatsappActiveAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function sendWhatsappTestMessageAction(phone: string): Promise<ActionResponse<{ messageId: string | null }>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const connection = await getActiveWhatsappConnection(context.partnerId, "meta")
        if (!connection?.is_active) {
            return { success: false, error: "Integração WhatsApp não está ativa" }
        }

        const result = await queueWhatsappMessage({
            partnerId: context.partnerId,
            phoneNumber: phone,
            messageType: "template",
            templateName: "hello_world",
            payload: { triggerType: "test_message", languageCode: "en_US" },
            triggerType: "test_message",
            idempotencyKey: `test:${context.partnerId}:${phone}:${Date.now()}`,
        })

        if (result.messageId) {
            await processWhatsappMessageById(result.messageId)

            // Re-read the message to check if sending actually succeeded
            const admin = getAdminClient()
            const { data: updatedMsg } = await admin
                .from("whatsapp_messages")
                .select("status, error_message")
                .eq("id", result.messageId)
                .single()

            if (updatedMsg && updatedMsg.status === "failed") {
                revalidatePath("/erp/integrations/whatsapp")
                return { success: false, error: updatedMsg.error_message || "Falha ao enviar mensagem de teste" }
            }
            if (updatedMsg && updatedMsg.status === "pending" && updatedMsg.error_message) {
                revalidatePath("/erp/integrations/whatsapp")
                return { success: false, error: updatedMsg.error_message }
            }
        }

        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: { messageId: result.messageId } }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] sendWhatsappTestMessageAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function resendWhatsappMessageAction(messageId: string): Promise<ActionResponse<void>> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const supabase = await getSupabaseServerClient()
        const { data: msg } = await supabase
            .from("whatsapp_messages")
            .select("id, partner_id, status")
            .eq("id", messageId)
            .eq("partner_id", context.partnerId)
            .single()

        if (!msg) return { success: false, error: "Mensagem não encontrada" }

        const admin = getAdminClient()
        await admin
            .from("whatsapp_messages")
            .update({
                status: "pending",
                error_message: null,
                retry_count: 0,
                next_retry_at: null,
                idempotency_key: `resend:${messageId}:${randomBytes(4).toString("hex")}`,
            })
            .eq("id", messageId)

        await processWhatsappMessageById(messageId)
        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] resendWhatsappMessageAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function dispatchWhatsappAutomationAction(params: {
    trigger: "payment_reminder"
    orderId: string
    phone: string
}): Promise<ActionResponse<void>> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requirePartnerRouteAccess(context.partnerId, "orders")

        await dispatchWhatsappAutomation({
            partnerId: context.partnerId,
            trigger: params.trigger,
            entityType: "order",
            entityId: params.orderId,
            orderId: params.orderId,
            phone: params.phone,
        })

        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] dispatchWhatsappAutomationAction error:", msg, error)
        return { success: false, error: msg }
    }
}

// ─── Evolution API Actions ───────────────────────────────────────────────────

/**
 * Checks if Evolution API is configured on the server (env vars present).
 * Used by the UI to show/hide the Evolution tab.
 */
export async function isEvolutionConfiguredAction(): Promise<ActionResponse<{ configured: boolean }>> {
    try {
        await requireUser()
        const config = getEvolutionServerConfig()
        return { success: true, data: { configured: config !== null } }
    } catch (error: unknown) {
        return { success: false, error: extractErrorMessage(error) }
    }
}

/**
 * Zero-input Evolution connection flow:
 * 1. Reads EVOLUTION_API_URL + EVOLUTION_API_KEY from env vars
 * 2. Reuses existing instance_name from DB or generates a new one
 * 3. Checks if instance exists on Evolution server
 * 4. Creates instance (with inline webhook) if missing, or connects existing one
 * 5. Returns QR Code for the frontend to display
 */
export async function connectEvolutionAction(): Promise<
    ActionResponse<{ connectionId: string; status: string; qrCode: string | null }>
> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        // 1. Read server config from env vars
        const serverConfig = getEvolutionServerConfig()
        if (!serverConfig) {
            return { success: false, error: "Evolution API não configurada no servidor. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY." }
        }

        // 2. Check for existing connection (active or inactive) or generate new instance name
        const admin = getAdminClient()
        const { data: existingConnection } = await admin
            .from("partner_whatsapp_connections")
            .select("instance_name")
            .eq("partner_id", context.partnerId)
            .eq("provider", "evolution")
            .maybeSingle()

        const instanceName = (existingConnection as { instance_name: string | null } | null)?.instance_name || generateEvolutionInstanceName()

        // 3. Save/update connection in DB
        const connection = await upsertEvolutionConnection({
            partnerId: context.partnerId,
            apiUrl: serverConfig.apiUrl,
            apiKey: serverConfig.apiKey,
            instanceName,
            activate: true,
        })

        // 4. Build webhook URL and create Evolution client
        const webhookUrl = getWebhookUrl("evolution", connection.id)
        const webhookEvents = [...EVOLUTION_WEBHOOK_EVENTS]
        const webhookHeaders = connection.evolution_webhook_secret
            ? { "x-evolution-signature": connection.evolution_webhook_secret }
            : undefined

        const client = new EvolutionWhatsappClient({
            apiUrl: serverConfig.apiUrl,
            apiKey: serverConfig.apiKey,
            instanceName,
        })

        // 5. Check if instance already exists on Evolution server
        let result: { status: string; qrCode: string | null }

        const alreadyExists = await client.instanceExists()

        if (alreadyExists) {
            // Instance exists - ensure webhook is configured, then connect to get QR
            try {
                await client.setWebhook(webhookUrl, webhookEvents, webhookHeaders)
            } catch {
                // Non-fatal: webhook may already be set
            }

            // Check if already connected
            const status = await client.getConnectionStatus()
            if (status.status === "connected") {
                result = { status: "connected", qrCode: null }
            } else {
                // Not connected - get QR code
                const connectResult = await client.connectInstance()
                result = { status: connectResult.status, qrCode: connectResult.qrCode || null }
            }
        } else {
            // Instance doesn't exist - create with inline webhook + QR
            const createResult = await client.createInstance(webhookUrl, webhookEvents, webhookHeaders)
            result = { status: createResult.status, qrCode: createResult.qrCode || null }

            // Some Evolution versions don't register webhook inline during creation.
            // Always call setWebhook as a safety net to guarantee registration.
            try {
                await client.setWebhook(webhookUrl, webhookEvents, webhookHeaders)
            } catch {
                // Non-fatal: if creation already registered it, this is a no-op
            }

            // Some Evolution versions don't return QR inline during creation.
            // If no QR was returned, explicitly request it via connect endpoint.
            if (!result.qrCode && result.status !== "connected") {
                const connectResult = await client.connectInstance()
                result = {
                    status: connectResult.status,
                    qrCode: connectResult.qrCode || null,
                }
            }
        }

        // 6. Update DB status
        const updateData: Record<string, unknown> = {
            status: result.status,
            updated_at: new Date().toISOString(),
        }
        if (result.status === "connected") {
            updateData.connected_at = new Date().toISOString()
        }
        await admin
            .from("partner_whatsapp_connections")
            .update(updateData)
            .eq("id", connection.id)

        revalidatePath("/erp/integrations/whatsapp")

        return {
            success: true,
            data: {
                connectionId: connection.id,
                status: result.status,
                qrCode: result.qrCode,
            },
        }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] connectEvolutionAction error:", msg, error)
        return { success: false, error: `Erro ao conectar Evolution: ${msg}` }
    }
}

export async function disconnectEvolutionAction(): Promise<ActionResponse<void>> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        // Try to disconnect from Evolution API before deactivating
        const connection = await getActiveWhatsappConnection(context.partnerId, "evolution")
        if (connection) {
            try {
                const provider = createWhatsappProviderFromConnection(connection)
                if (provider.disconnect) {
                    await provider.disconnect()
                }
            } catch {
                // Continue even if disconnect call fails
            }
        }

        await deactivateWhatsappConnection(context.partnerId, "evolution")
        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] disconnectEvolutionAction error:", msg, error)
        return { success: false, error: msg }
    }
}

export async function getEvolutionStatusAction(): Promise<
    ActionResponse<{
        status: string
        qrCode: string | null
        instanceName: string | null
        phoneNumber: string | null
    }>
> {
    try {
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const connection = await getActiveWhatsappConnection(context.partnerId, "evolution")
        if (!connection) {
            return {
                success: true,
                data: { status: "disconnected", qrCode: null, instanceName: null, phoneNumber: null },
            }
        }

        try {
            const provider = createWhatsappProviderFromConnection(connection)
            if (provider.getConnectionStatus) {
                const result = await provider.getConnectionStatus()
                let status = result.status

                // If API is close (disconnected) but DB is in a pairing state, preserve the pairing state
                if (result.status === "disconnected" && (connection.status === "qr_pending" || connection.status === "connecting")) {
                    status = connection.status
                }

                return {
                    success: true,
                    data: {
                        status,
                        qrCode: result.qrCode ?? null,
                        instanceName: result.instanceName ?? null,
                        phoneNumber: result.phoneNumber ?? null,
                    },
                }
            }
        } catch {
            // If API call fails, return DB status
        }

        return {
            success: true,
            data: {
                status: connection.status,
                qrCode: null,
                instanceName: connection.instance_name,
                phoneNumber: connection.phone_number,
            },
        }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        return { success: false, error: msg }
    }
}

export async function testEvolutionConnectionAction(phone: string): Promise<ActionResponse<{ messageId: string | null }>> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto ERP não encontrado" }
        await requireIntegrationsAccess(context.partnerId)

        const connection = await getActiveWhatsappConnection(context.partnerId, "evolution")
        if (!connection?.is_active) {
            return { success: false, error: "Integração Evolution não está ativa" }
        }

        const result = await queueWhatsappMessage({
            partnerId: context.partnerId,
            phoneNumber: phone,
            messageType: "text",
            payload: { body: "✅ Mensagem de teste do Dudit via Evolution API", triggerType: "test_message" },
            triggerType: "test_message",
            idempotencyKey: `test:evolution:${context.partnerId}:${phone}:${Date.now()}`,
        })

        if (result.messageId) {
            await processWhatsappMessageById(result.messageId)

            const admin = getAdminClient()
            const { data: updatedMsg } = await admin
                .from("whatsapp_messages")
                .select("status, error_message")
                .eq("id", result.messageId)
                .single()

            if (updatedMsg && updatedMsg.status === "failed") {
                revalidatePath("/erp/integrations/whatsapp")
                return { success: false, error: updatedMsg.error_message || "Falha ao enviar mensagem de teste" }
            }
        }

        revalidatePath("/erp/integrations/whatsapp")
        return { success: true, data: { messageId: result.messageId } }
    } catch (error: unknown) {
        const msg = extractErrorMessage(error)
        console.error("[WhatsApp] testEvolutionConnectionAction error:", msg, error)
        return { success: false, error: msg }
    }
}
