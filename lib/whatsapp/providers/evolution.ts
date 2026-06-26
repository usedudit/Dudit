import "server-only"

import type { WhatsappProvider } from "./base"
import type {
  SendTemplateInput,
  SendTextInput,
  SendImageInput,
  SendDocumentInput,
  SendAudioInput,
  SendLocationInput,
  ConnectionStatusResult,
  InstanceInfoResult,
  ConnectResult,
  ProviderSendResult,
} from "../types"
import { EvolutionWhatsappClient } from "./evolution-client"

/**
 * Creates a WhatsappProvider backed by the Evolution API.
 *
 * The provider implements the full WhatsappProvider interface including
 * optional media, connection management, and webhook verification methods.
 *
 * Evolution doesn't support Meta-style templates natively, so sendTemplate
 * falls back to sending a plain text message with the template name/body.
 */
export function createEvolutionWhatsappProvider(config: {
  apiUrl: string
  apiKey: string
  instanceName: string
  webhookSecret?: string | null
}): WhatsappProvider {
  const client = new EvolutionWhatsappClient({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    instanceName: config.instanceName,
  })

  return {
    id: "evolution",

    // ─── Core messaging ────────────────────────────────────────────────

    async sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult> {
      // Evolution doesn't have native template support like Meta.
      // Map template sends to plain text messages.
      // When the user migrates to Meta Cloud API, real templates will be used.
      const bodyParts: string[] = []

      // Use template name as fallback body
      if (input.components?.length) {
        const bodyComponent = input.components.find((c) => c.type === "body")
        if (bodyComponent?.parameters?.length) {
          bodyParts.push(
            bodyComponent.parameters
              .map((p) => p.text || "")
              .filter(Boolean)
              .join(" | "),
          )
        }
      }

      const body = bodyParts.length > 0 ? bodyParts.join("\n") : input.templateName

      return client.sendText({ to: input.to, body })
    },

    async sendText(input: SendTextInput): Promise<ProviderSendResult> {
      return client.sendText(input)
    },

    // ─── Media messaging ───────────────────────────────────────────────

    async sendImage(input: SendImageInput): Promise<ProviderSendResult> {
      return client.sendImage(input)
    },

    async sendDocument(input: SendDocumentInput): Promise<ProviderSendResult> {
      return client.sendDocument(input)
    },

    async sendAudio(input: SendAudioInput): Promise<ProviderSendResult> {
      return client.sendAudio(input)
    },

    async sendLocation(input: SendLocationInput): Promise<ProviderSendResult> {
      return client.sendLocation(input)
    },

    // ─── Message management ────────────────────────────────────────────

    async markAsRead(messageId: string): Promise<void> {
      await client.markAsRead(messageId)
    },

    // ─── Connection management ─────────────────────────────────────────

    async getConnectionStatus(): Promise<ConnectionStatusResult> {
      return client.getConnectionStatus()
    },

    async getInstanceInfo(): Promise<InstanceInfoResult> {
      return client.getInstanceInfo()
    },

    async connect(): Promise<ConnectResult> {
      return client.connectInstance()
    },

    async disconnect(): Promise<void> {
      await client.disconnectInstance()
    },

    async testConnection(): Promise<boolean> {
      return client.testConnection()
    },

    // ─── Webhook verification ──────────────────────────────────────────

    async verifyWebhook(payload) {
      // Evolution uses a simple secret comparison for webhook validation
      if (!config.webhookSecret) return { valid: false }
      if (payload.token && payload.token === config.webhookSecret) {
        return { valid: true }
      }
      return { valid: false }
    },
  }
}
