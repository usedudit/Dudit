import "server-only"

import type { WhatsappProvider } from "./base"
import type { SendTemplateInput, SendTextInput } from "../types"
import { MetaWhatsappMessagingClient } from "./meta-messaging-client"

export function createMetaWhatsappProvider(config: {
  accessToken: string
  phoneNumberId: string
  webhookVerifyToken?: string | null
  webhookSecret?: string | null
}): WhatsappProvider {
  const { accessToken, phoneNumberId, webhookVerifyToken } = config
  const messagingClient = new MetaWhatsappMessagingClient(accessToken, phoneNumberId)

  return {
    id: "meta",

    async sendTemplate(input: SendTemplateInput) {
      // Approved Meta templates must stay as `type: template` so they work outside
      // the 24-hour customer-service window. Freeform interactive buttons are only
      // valid inside an open conversation, so callers must opt into that explicitly.
      if (input.interactiveButtons?.length) {
        return messagingClient.sendReplyButtons({
          to: input.to,
          body: input.templateName,
          buttons: input.interactiveButtons,
        })
      }

      return messagingClient.sendTemplate(input)
    },

    async sendText(input: SendTextInput) {
      return messagingClient.sendText(input)
    },

    async verifyWebhook(payload) {
      if (payload.mode === "subscribe" && payload.token && webhookVerifyToken) {
        return {
          valid: payload.token === webhookVerifyToken,
          challenge: payload.challenge,
        }
      }
      return { valid: false }
    },
  }
}
