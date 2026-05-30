import { describe, expect, it } from "vitest"
import { buildMetaTemplatePayloadForTest } from "./meta-messaging-client"

describe("Meta WhatsApp template payloads", () => {
  it("sends approved templates using Meta's official template structure", () => {
    const payload = buildMetaTemplatePayloadForTest({
      to: "5511999999999",
      templateName: "appointment_reminder",
      languageCode: "pt_BR",
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: "Maria" },
          { type: "text", text: "Corte" },
        ],
      }],
    })

    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "5511999999999",
      type: "template",
      template: {
        name: "appointment_reminder",
        language: { code: "pt_BR" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: "Maria" },
            { type: "text", text: "Corte" },
          ],
        }],
      },
    })
  })

  it("preserves button components for templates that define approved quick replies", () => {
    const payload = buildMetaTemplatePayloadForTest({
      to: "5511999999999",
      templateName: "appointment_created",
      components: [{
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [{ type: "payload", payload: "confirm_appointment" }],
      }],
    })

    expect(payload).toMatchObject({
      type: "template",
      template: {
        components: [{
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: "confirm_appointment" }],
        }],
      },
    })
  })
})
