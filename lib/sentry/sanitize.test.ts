import { describe, expect, it } from "vitest"
import type { ErrorEvent } from "@sentry/core"
import {
  sanitizeBreadcrumb,
  sanitizeEvent,
  sanitizeMonitoringData,
  SENTRY_REDACTED_VALUE,
} from "./sanitize"

describe("Sentry privacy sanitization", () => {
  it("removes request PII and credentials from events", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: "Failure for maria@example.com CPF 123.456.789-09",
      user: { email: "maria@example.com", username: "Maria" },
      request: {
        method: "POST",
        url: "https://dudit.example/api/orders/123?cpf=12345678909",
        headers: { authorization: "Bearer secret-token", cookie: "session=secret" },
        cookies: { session: "secret" },
        data: { card_number: "4111 1111 1111 1111" },
      },
      extra: {
        mercado_pago_payload: { payer: { email: "maria@example.com" } },
        safe_number: 42,
      },
      breadcrumbs: [
        {
          category: "http",
          data: { url: "https://dudit.example/api/orders/123?token=secret" },
        },
      ],
    }

    const sanitized = sanitizeEvent(event)

    expect(sanitized.user).toBeUndefined()
    expect(sanitized.request).toEqual({
      method: "POST",
      url: "https://dudit.example/api/orders/[Filtered]",
    })
    expect(sanitized.extra?.mercado_pago_payload).toBe(SENTRY_REDACTED_VALUE)
    expect(sanitized.message).not.toContain("maria@example.com")
    expect(sanitized.message).not.toContain("123.456.789-09")
    expect(sanitized.breadcrumbs?.[0]?.data?.url).toBe(
      "https://dudit.example/api/orders/[Filtered]",
    )
  })

  it("drops sensitive breadcrumbs", () => {
    expect(sanitizeBreadcrumb({ category: "payment", message: "card used" })).toBeNull()
    expect(
      sanitizeBreadcrumb({ category: "ui.click", message: "email=a@example.com" })?.message,
    ).toBe(`email=${SENTRY_REDACTED_VALUE}`)
  })

  it("sanitizes centralized monitoring metadata", () => {
    expect(
      sanitizeMonitoringData({
        partnerId: "partner-safe-ref",
        cpf: "123.456.789-09",
        authorization: "Bearer secret-token",
        paymentPayload: { card_number: "4111 1111 1111 1111" },
      }),
    ).toEqual({
      partnerId: "partner-safe-ref",
      cpf: SENTRY_REDACTED_VALUE,
      authorization: SENTRY_REDACTED_VALUE,
      paymentPayload: SENTRY_REDACTED_VALUE,
    })
  })
})
