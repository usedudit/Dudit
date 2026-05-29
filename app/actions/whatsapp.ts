"use server"

import { randomBytes } from "crypto"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireUser, requirePartnerRouteAccess } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import {
  upsertWhatsappConnection,
  deactivateWhatsappConnection,
  setWhatsappConnectionActive,
  getActiveWhatsappConnection,
  getWebhookUrl,
} from "@/lib/services/whatsapp-connection.service"
import { dispatchWhatsappAutomation } from "@/lib/services/whatsapp-automation.service"
import { processWhatsappMessageById, queueWhatsappMessage } from "@/lib/services/whatsapp-dispatch.service"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import type { ActionResponse } from "@/lib/types/action-response"
import type { PartnerWhatsappConnection, WhatsappProviderId } from "@/lib/whatsapp/types"
import { revalidatePath } from "next/cache"

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
  status: string
  isActive: boolean
  connectedAt: string | null
  webhookUrl: string
  webhookVerifyToken: string | null
  hasToken: boolean
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
  return user
}

export async function getWhatsappIntegrationAction(): Promise<
  ActionResponse<{ connection: WhatsappConnectionView | null; messages: WhatsappMessageView[] }>
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

    const connection: WhatsappConnectionView | null = active
      ? {
          id: active.id,
          provider: active.provider,
          phoneNumber: active.phone_number,
          phoneNumberId: active.phone_number_id,
          businessAccountId: active.business_account_id,
          status: active.status,
          isActive: active.is_active,
          connectedAt: active.connected_at,
          webhookUrl: getWebhookUrl(),
          webhookVerifyToken: active.webhook_verify_token,
          hasToken: !!active.access_token_encrypted,
        }
      : null

    return {
      success: true,
      data: {
        connection,
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
    return { success: false, error: error instanceof Error ? error.message : "Erro ao carregar integração" }
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
    return { success: false, error: error instanceof Error ? error.message : "Erro ao conectar WhatsApp" }
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
    return { success: false, error: error instanceof Error ? error.message : "Erro ao desconectar" }
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
    return { success: false, error: error instanceof Error ? error.message : "Erro ao atualizar status" }
  }
}

export async function sendWhatsappTestMessageAction(phone: string): Promise<ActionResponse<{ messageId: string | null }>> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const context = await getCurrentPartnerContext()
    if (!context) return { success: false, error: "Contexto ERP não encontrado" }
    await requireIntegrationsAccess(context.partnerId)

    const connection = await getActiveWhatsappConnection(context.partnerId)
    if (!connection?.is_active) {
      return { success: false, error: "Integração WhatsApp não está ativa" }
    }

    const result = await queueWhatsappMessage({
      partnerId: context.partnerId,
      phoneNumber: phone,
      messageType: "template",
      templateName: "hello_world",
      payload: { triggerType: "test_message" },
      triggerType: "test_message",
      idempotencyKey: `test:${context.partnerId}:${phone}:${Date.now()}`,
    })

    if (result.messageId) {
      await processWhatsappMessageById(result.messageId)
    }

    revalidatePath("/erp/integrations/whatsapp")
    return { success: true, data: { messageId: result.messageId } }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : "Erro ao enviar teste" }
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
    return { success: false, error: error instanceof Error ? error.message : "Erro ao reenviar" }
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
    return { success: false, error: error instanceof Error ? error.message : "Erro ao disparar automação" }
  }
}
