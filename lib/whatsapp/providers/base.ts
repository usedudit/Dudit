import type {
  ProviderSendResult,
  SendTemplateInput,
  SendTextInput,
  SendImageInput,
  SendDocumentInput,
  SendAudioInput,
  SendLocationInput,
  ConnectionStatusResult,
  InstanceInfoResult,
  ConnectResult,
} from "../types"

export interface WhatsappProvider {
  readonly id: string

  // ─── Core messaging (required) ──────────────────────────────────────────────
  sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult>
  sendText(input: SendTextInput): Promise<ProviderSendResult>

  // ─── Media messaging (optional - provider-specific) ─────────────────────────
  sendImage?(input: SendImageInput): Promise<ProviderSendResult>
  sendDocument?(input: SendDocumentInput): Promise<ProviderSendResult>
  sendAudio?(input: SendAudioInput): Promise<ProviderSendResult>
  sendLocation?(input: SendLocationInput): Promise<ProviderSendResult>

  // ─── Message management (optional) ──────────────────────────────────────────
  markAsRead?(messageId: string): Promise<void>

  // ─── Connection management (optional) ───────────────────────────────────────
  getConnectionStatus?(): Promise<ConnectionStatusResult>
  getInstanceInfo?(): Promise<InstanceInfoResult>
  connect?(): Promise<ConnectResult>
  disconnect?(): Promise<void>
  testConnection?(): Promise<boolean>

  // ─── Webhook verification (optional) ────────────────────────────────────────
  verifyWebhook?(payload: {
    mode?: string
    token?: string
    challenge?: string
    signature?: string
    rawBody?: string
  }): Promise<{ valid: boolean; challenge?: string }>
}

