import "server-only"

import type { WhatsappProvider } from "./base"
import type { ProviderSendResult, SendTemplateInput, SendTextInput } from "../types"
import { classifyMetaError } from "../errors"

const GRAPH_API = "https://graph.facebook.com/v21.0"

export function createMetaWhatsappProvider(config: {
  accessToken: string
  phoneNumberId: string
  webhookVerifyToken?: string | null
  webhookSecret?: string | null
}): WhatsappProvider {
  const { accessToken, phoneNumberId, webhookVerifyToken } = config

  async function graphPost(path: string, body: Record<string, unknown>): Promise<ProviderSendResult> {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = json?.error || {}
      throw classifyMetaError(err.code || res.status, err.message || res.statusText)
    }

    return {
      providerMessageId: String(json.messages?.[0]?.id || json.id || ""),
      raw: json,
    }
  }

  return {
    id: "meta",

    async sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult> {
      const components: Record<string, unknown>[] = []
      if (input.components?.length) {
        components.push({
          type: "body",
          parameters: input.components
            .filter((c) => c.type === "body")
            .flatMap((c) => c.parameters || []),
        })
      }

      const body: Record<string, unknown> = {
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode || "pt_BR" },
          ...(components.length ? { components } : {}),
        },
      }

      if (input.interactiveButtons?.length) {
        body.type = "interactive"
        body.interactive = {
          type: "button",
          body: { text: input.templateName },
          action: {
            buttons: input.interactiveButtons.slice(0, 3).map((btn) => ({
              type: "reply",
              reply: { id: btn.id, title: btn.title.slice(0, 20) },
            })),
          },
        }
        delete body.template
      }

      return graphPost("messages", body)
    },

    async sendText(input: SendTextInput): Promise<ProviderSendResult> {
      return graphPost("messages", {
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body },
      })
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
