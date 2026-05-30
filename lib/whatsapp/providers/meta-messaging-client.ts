import "server-only"

import { MetaGraphClient } from "@/lib/meta/graph-client"
import type { ProviderSendResult, SendTemplateInput, SendTextInput, WhatsappTemplateComponent } from "../types"
import { classifyMetaError } from "../errors"
import { MetaGraphError } from "@/lib/meta/graph-client"

function toMetaTemplateComponent(component: WhatsappTemplateComponent): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    type: component.type,
  }

  if (component.sub_type) mapped.sub_type = component.sub_type
  if (component.index) mapped.index = component.index
  if (component.parameters?.length) mapped.parameters = component.parameters

  return mapped
}

function buildTemplatePayload(input: SendTemplateInput): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.languageCode || "pt_BR" },
      ...(input.components?.length
        ? { components: input.components.map(toMetaTemplateComponent) }
        : {}),
    },
  }
}

export class MetaWhatsappMessagingClient {
  private readonly graph: MetaGraphClient

  constructor(
    accessToken: string,
    private readonly phoneNumberId: string,
    graphVersion?: string,
  ) {
    this.graph = new MetaGraphClient(accessToken, graphVersion)
  }

  async sendTemplate(input: SendTemplateInput): Promise<ProviderSendResult> {
    return this.graphPost("messages", buildTemplatePayload(input))
  }

  async sendText(input: SendTextInput): Promise<ProviderSendResult> {
    return this.graphPost("messages", {
      messaging_product: "whatsapp",
      to: input.to,
      type: "text",
      text: { body: input.body },
    })
  }

  async sendReplyButtons(input: {
    to: string
    body: string
    buttons: Array<{ id: string; title: string }>
  }): Promise<ProviderSendResult> {
    return this.graphPost("messages", {
      messaging_product: "whatsapp",
      to: input.to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: input.body },
        action: {
          buttons: input.buttons.slice(0, 3).map((btn) => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title.slice(0, 20) },
          })),
        },
      },
    })
  }

  private async graphPost(path: string, body: Record<string, unknown>): Promise<ProviderSendResult> {
    try {
      const json = await this.graph.request<Record<string, any>>(`/${this.phoneNumberId}/${path}`, {
        method: "POST",
        body,
      })

      return {
        providerMessageId: String(json.messages?.[0]?.id || json.id || ""),
        raw: json,
      }
    } catch (error) {
      if (error instanceof MetaGraphError) {
        throw classifyMetaError(error.code, error.message)
      }
      throw error
    }
  }
}

export function buildMetaTemplatePayloadForTest(input: SendTemplateInput): Record<string, unknown> {
  return buildTemplatePayload(input)
}
