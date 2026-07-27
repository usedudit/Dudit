export type WhatsappProviderId = "meta" | "evolution" | "twilio"

export type WhatsappConnectionSource = "manual" | "embedded_signup" | "evolution_manual"

export type WhatsappConnectionStatus = "disconnected" | "pending" | "connected" | "error" | "qr_pending" | "connecting"

export type WhatsappMessageStatus = "pending" | "queued" | "sent" | "delivered" | "read" | "failed" | "failed_permanently"

export type WhatsappAutomationTrigger =
  | "appointment_created"
  | "appointment_confirmed"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "appointment_reminder_24h"
  | "appointment_reminder_2h"
  | "order_created"
  | "order_payment_approved"
  | "order_preparing"
  | "order_ready_pickup"
  | "order_shipped"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "order_refunded"
  | "delivery_route_started"
  | "delivery_in_progress"
  | "delivery_delivered"
  | "delivery_failed"
  | "quote_shared"
  | "quote_reminder"
  | "payment_reminder"
  | "test_message"
  | "manual_resend"

export interface WhatsappTemplateComponent {
  type: "body" | "header" | "button"
  sub_type?: string
  index?: string
  parameters?: Array<{ type: string; text?: string; payload?: string }>
}

export interface SendTemplateInput {
  to: string
  templateName: string
  languageCode?: string
  components?: WhatsappTemplateComponent[]
  interactiveButtons?: Array<{
    id: string
    title: string
  }>
}

export interface SendTextInput {
  to: string
  body: string
}

export interface SendImageInput {
  to: string
  imageUrl: string
  caption?: string
}

export interface SendDocumentInput {
  to: string
  documentUrl: string
  filename: string
  caption?: string
}

export interface SendAudioInput {
  to: string
  audioUrl: string
}

export interface SendLocationInput {
  to: string
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface ProviderSendResult {
  providerMessageId: string
  raw?: unknown
}

export interface ConnectionStatusResult {
  status: WhatsappConnectionStatus
  qrCode?: string | null
  instanceName?: string | null
  phoneNumber?: string | null
}

export interface InstanceInfoResult {
  instanceName: string
  phoneNumber: string | null
  status: WhatsappConnectionStatus
  platform?: string | null
  profilePictureUrl?: string | null
}

export interface ConnectResult {
  status: WhatsappConnectionStatus
  qrCode?: string | null
}

export interface PartnerWhatsappConnection {
  id: string
  partner_id: string
  provider: WhatsappProviderId
  store_id: string | null
  phone_number: string | null
  phone_number_id: string | null
  business_account_id: string | null
  access_token_encrypted: string | null
  webhook_verify_token: string | null
  webhook_secret: string | null
  connection_source: WhatsappConnectionSource
  waba_name: string | null
  last_synced_at: string | null
  status: WhatsappConnectionStatus
  is_active: boolean
  connected_at: string | null
  // Evolution-specific fields (isolated from Meta fields)
  instance_name: string | null
  api_url: string | null
  api_key_encrypted: string | null
  evolution_webhook_secret: string | null
}

export interface WhatsappTemplateView {
  id: string
  templateName: string
  language: string
  category: string
  approvalStatus: string | null
  isActive: boolean
}

export type WhatsappExecutionResultStatus =
  | "sent"
  | "queued"
  | "skipped_no_phone"
  | "skipped_no_connection"
  | "skipped_disabled"
  | "skipped_invalid_phone"
  | "skipped_duplicate"
  | "skipped_cancelled"
  | "skipped_unavailable"
  | "failed_send"
  | "failed_provider"
  | "failed_unknown"

export interface WhatsappExecutionResult {
  success: boolean
  resultStatus: WhatsappExecutionResultStatus
  reason: string | null
  messageId: string | null
  providerMessageId: string | null
}

export interface QueueMessageInput {
  partnerId: string
  storeId?: string | null
  customerId?: string | null
  orderId?: string | null
  appointmentId?: string | null
  quoteId?: string | null
  deliveryId?: string | null
  phoneNumber: string
  templateName?: string
  messageType: "template" | "text" | "interactive"
  payload: Record<string, unknown>
  triggerType: WhatsappAutomationTrigger
  idempotencyKey: string
  scheduledAt?: Date | null
}
