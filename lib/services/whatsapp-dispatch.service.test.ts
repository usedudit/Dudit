import { describe, expect, it } from "vitest"
import { buildTemplateComponentsFromPayload } from "./whatsapp-dispatch.service"

describe("WhatsApp dispatch template component mapping", () => {
  it("maps automation variables into Meta body parameters in insertion order", () => {
    const components = buildTemplateComponentsFromPayload({
      variables: {
        customer_name: "Maria",
        service_name: "Corte",
        date: "30/05/2026",
      },
    })

    expect(components).toEqual([{
      type: "body",
      parameters: [
        { type: "text", text: "Maria" },
        { type: "text", text: "Corte" },
        { type: "text", text: "30/05/2026" },
      ],
    }])
  })

  it("preserves explicit Meta components when callers provide them", () => {
    const explicit = [{
      type: "body" as const,
      parameters: [{ type: "text", text: "custom" }],
    }]

    expect(buildTemplateComponentsFromPayload({ components: explicit })).toBe(explicit)
  })
})
