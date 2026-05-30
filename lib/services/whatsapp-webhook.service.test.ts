import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  handleWhatsappWebhookPayload,
  resolveAppointmentAction,
  verifyMetaWebhookSignature,
} from "./whatsapp-webhook.service"
import { createHmac } from "crypto"

const { getAdminClientMock, auditMock } = vi.hoisted(() => ({
  getAdminClientMock: vi.fn(),
  auditMock: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: getAdminClientMock,
}))

vi.mock("./timeline.service", () => ({
  logAuditEvent: auditMock,
}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

function createAdminMock(options?: { duplicateKeys?: Set<string> }) {
  const connections: Record<string, any> = {
    phone_a: { id: "conn_a", partner_id: "partner_a", phone_number_id: "phone_a", is_active: true },
    phone_b: { id: "conn_b", partner_id: "partner_b", phone_number_id: "phone_b", is_active: true },
  }
  const webhookKeys = new Set<string>()
  const duplicateKeys = options?.duplicateKeys || new Set<string>()
  const messageUpdates: any[] = []
  const appointmentUpdates: any[] = []

  function makeChain(table: string) {
    const filters: Record<string, unknown> = {}
    let updatePayload: any

    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((key: string, value: unknown) => {
        filters[key] = value
        return chain
      }),
      not: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      update: vi.fn((payload: any) => {
        updatePayload = payload
        return chain
      }),
      insert: vi.fn((payload: any) => {
        if (table !== "processed_webhook_events") return { error: null }
        const key = String(payload.idempotency_key)
        if (duplicateKeys.has(key) || webhookKeys.has(key)) {
          return { error: { code: "23505", message: "duplicate key value violates unique constraint" } }
        }
        webhookKeys.add(key)
        return { error: null }
      }),
      maybeSingle: vi.fn(() => {
        if (table === "partner_whatsapp_connections") {
          return { data: connections[String(filters.phone_number_id)] || null, error: null }
        }
        if (table === "whatsapp_messages") {
          return { data: { appointment_id: "appointment_1" }, error: null }
        }
        return { data: null, error: null }
      }),
      then: undefined,
    }

    chain.eq = vi.fn((key: string, value: unknown) => {
      filters[key] = value
      if (table === "whatsapp_messages" && updatePayload && filters.provider_message_id) {
        messageUpdates.push({ filters: { ...filters }, updates: updatePayload })
      }
      if (table === "appointments" && updatePayload && filters.partner_id) {
        appointmentUpdates.push({ filters: { ...filters }, updates: updatePayload })
      }
      return chain
    })

    return chain
  }

  const admin = {
    from: vi.fn((table: string) => makeChain(table)),
    __messageUpdates: messageUpdates,
    __appointmentUpdates: appointmentUpdates,
    __webhookKeys: webhookKeys,
  }

  return admin
}

describe("WhatsApp webhook service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("validates Meta webhook signatures", () => {
    const rawBody = JSON.stringify({ hello: "world" })
    const secret = "app-secret"
    const digest = createHmac("sha256", secret).update(rawBody).digest("hex")

    expect(verifyMetaWebhookSignature(rawBody, `sha256=${digest}`, secret)).toBe(true)
    expect(verifyMetaWebhookSignature(rawBody, "sha256=bad", secret)).toBe(false)
  })

  it("routes all entries and changes to the correct tenant by phone_number_id", async () => {
    const admin = createAdminMock()
    getAdminClientMock.mockReturnValue(admin)

    const result = await handleWhatsappWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "phone_a" },
                statuses: [{ id: "wamid_a", status: "delivered", timestamp: "1" }],
              },
            },
            {
              value: {
                metadata: { phone_number_id: "phone_b" },
                statuses: [{ id: "wamid_b", status: "read", timestamp: "2" }],
              },
            },
          ],
        },
      ],
    })

    expect(result.processed).toBe(2)
    expect(admin.__messageUpdates).toEqual([
      expect.objectContaining({
        filters: expect.objectContaining({ partner_id: "partner_a", provider_message_id: "wamid_a" }),
        updates: expect.objectContaining({ status: "delivered" }),
      }),
      expect.objectContaining({
        filters: expect.objectContaining({ partner_id: "partner_b", provider_message_id: "wamid_b" }),
        updates: expect.objectContaining({ status: "read" }),
      }),
    ])
  })

  it("deduplicates repeated webhook status events before updating local state", async () => {
    const admin = createAdminMock()
    getAdminClientMock.mockReturnValue(admin)
    const payload = {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "phone_a" },
            statuses: [{ id: "wamid_dup", status: "delivered", timestamp: "1" }],
          },
        }],
      }],
    }

    const first = await handleWhatsappWebhookPayload(payload)
    const second = await handleWhatsappWebhookPayload(payload)

    expect(first.processed).toBe(1)
    expect(second.duplicates).toBe(1)
    expect(admin.__messageUpdates).toHaveLength(1)
  })

  it("updates the tenant appointment for interactive button replies", async () => {
    const admin = createAdminMock()
    getAdminClientMock.mockReturnValue(admin)

    const result = await handleWhatsappWebhookPayload({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "phone_a" },
            messages: [{
              id: "inbound_1",
              from: "5511999999999",
              type: "interactive",
              context: { id: "wamid_original" },
              interactive: { button_reply: { id: "confirm_appointment", title: "Confirmar" } },
            }],
          },
        }],
      }],
    })

    expect(result.processed).toBe(1)
    expect(admin.__appointmentUpdates).toEqual([
      expect.objectContaining({
        filters: expect.objectContaining({ id: "appointment_1", partner_id: "partner_a" }),
        updates: expect.objectContaining({ status: "Confirmado" }),
      }),
    ])
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      partnerId: "partner_a",
      actionType: "whatsapp_appointment_confirmed",
    }))
  })

  it("resolves quick reply button text for approved template buttons", () => {
    expect(resolveAppointmentAction("", "Confirmar")).toBe("confirm")
    expect(resolveAppointmentAction("", "Cancelar")).toBe("cancel")
    expect(resolveAppointmentAction("", "Falar com a empresa")).toBe("talk")
  })
})
