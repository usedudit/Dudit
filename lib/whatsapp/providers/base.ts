import type { ProviderSendResult, SendTemplateInput, SendTextInput } from "../types"

export interface WhatsappProvider {
  readonly id: string
  sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult>
  sendText(input: SendTextInput): Promise<ProviderSendResult>
  verifyWebhook?(payload: {
    mode?: string
    token?: string
    challenge?: string
    signature?: string
    rawBody?: string
  }): Promise<{ valid: boolean; challenge?: string }>
}
