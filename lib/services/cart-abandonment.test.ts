import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildNotificationContent, buildWhatsappMessage } from "@/lib/notifications/templates"
import { getNotificationHref } from "@/lib/notifications/navigation"

const mockRecordAddonEvent = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: vi.fn(),
}))
vi.mock("@/lib/services/addon.service", () => ({
  checkIsAddonActive: vi.fn().mockResolvedValue(true),
  recordAddonEvent: (...args: any[]) => mockRecordAddonEvent(...args),
}))

import {
  recordCartAbandonmentClick,
  recordCartAbandonmentConversion,
} from "@/lib/services/cart-abandonment.service"

function createMockSupabase(responses: Array<{ data: any[] }>) {
  let callIndex = 0
  const makeChain = () => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(responses[callIndex++] ?? { data: [] })),
    }
    return chain
  }
  return {
    from: vi.fn(() => makeChain()),
  } as any
}

describe("Cart Abandonment Templates", () => {
  describe("buildNotificationContent - cart_abandoned", () => {
    it("builds notification with a single product and store name", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {
        storeName: "Dudit Store",
        itemCount: 1,
        productNames: ["Camiseta Dudit"],
      })

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho em Dudit Store com Camiseta Dudit está te esperando. Volte e finalize sua compra!")
    })

    it("builds notification with 2 products", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {
        storeName: "Loja Exemplo",
        itemCount: 2,
        productNames: ["Camiseta", "Boné"],
      })

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho em Loja Exemplo com Camiseta e Boné está te esperando. Volte e finalize sua compra!")
    })

    it("builds notification with 3 products", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {
        storeName: "Loja Exemplo",
        itemCount: 3,
        productNames: ["Camiseta", "Boné", "Meia"],
      })

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho em Loja Exemplo com Camiseta, Boné e Meia está te esperando. Volte e finalize sua compra!")
    })

    it("builds notification with more than 3 products", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {
        storeName: "Loja Exemplo",
        itemCount: 5,
        productNames: ["Camiseta", "Boné", "Meia"],
      })

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho em Loja Exemplo com Camiseta e mais 4 itens está te esperando. Volte e finalize sua compra!")
    })

    it("falls back to generic store when storeName is not provided", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {
        itemCount: 1,
        productNames: ["Tênis Esportivo"],
      })

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho na nossa loja com Tênis Esportivo está te esperando. Volte e finalize sua compra!")
    })

    it("builds notification when product names are empty but itemCount is present", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {
        storeName: "Dudit",
        itemCount: 2,
      })

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho em Dudit com 2 itens está te esperando. Volte e finalize sua compra!")
    })

    it("builds notification when context is empty", () => {
      const result = buildNotificationContent("cart_abandoned", "customer", {})

      expect(result.title).toBe("🛒 Carrinho te esperando!")
      expect(result.message).toBe("Seu carrinho na nossa loja está te esperando. Volte e finalize sua compra!")
    })
  })

  describe("buildWhatsappMessage - cart_abandoned", () => {
    it("builds friendly WhatsApp message with store name and customer", () => {
      const msg = buildWhatsappMessage("cart_abandoned", {
        customer_name: "Maria",
        store_name: "Loja Moda",
      })

      expect(msg).toContain("🛒 *Seu carrinho está te esperando!*")
      expect(msg).toContain("Olá, Maria! Seu carrinho em Loja Moda ainda está te esperando.")
      expect(msg).toContain("Volte e finalize sua compra enquanto os itens ainda estão disponíveis! ✨")
    })

    it("builds friendly WhatsApp message with fallbacks when store and customer are missing", () => {
      const msg = buildWhatsappMessage("cart_abandoned", {})

      expect(msg).toContain("🛒 *Seu carrinho está te esperando!*")
      expect(msg).toContain("Olá, cliente! Seu carrinho na nossa loja ainda está te esperando.")
      expect(msg).toContain("Volte e finalize sua compra enquanto os itens ainda estão disponíveis! ✨")
    })
  })
})

describe("Cart Abandonment Navigation & Metrics Tracking", () => {
  beforeEach(() => {
    mockRecordAddonEvent.mockReset()
  })

  it("appends cart_abandoned tracking params to notification href", () => {
    expect(
      getNotificationHref({
        type: "cart_abandoned",
        entityType: "cart",
        entityId: null,
        data: { partner_id: "partner-1" },
        audience: "customer",
      }),
    ).toBe("/sacola?from=cart_abandoned&partner=partner-1")

    expect(
      getNotificationHref({
        type: "cart_abandoned",
        entityType: "cart",
        entityId: null,
        data: {},
        audience: "customer",
      }),
    ).toBe("/sacola?from=cart_abandoned")
  })

  it("records a clicked event when a recent sent event exists and no click was recorded yet", async () => {
    const mockClient = createMockSupabase([
      {
        data: [
          {
            id: "sent-1",
            partner_id: "partner-1",
            metadata: { customerName: "Maria", itemCount: 2 },
            created_at: "2026-11-27T10:00:00.000Z",
          },
        ],
      },
      { data: [] },
    ])

    const recorded = await recordCartAbandonmentClick(
      { userId: "user-1", partnerId: "partner-1", notificationId: "notif-1" },
      mockClient,
    )

    expect(recorded).toBe(true)
    expect(mockRecordAddonEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordAddonEvent).toHaveBeenCalledWith({
      partnerId: "partner-1",
      addonSlug: "cart_abandonment",
      eventType: "clicked",
      entityType: "cart",
      entityId: "user-1",
      metadata: {
        customerName: "Maria",
        itemCount: 2,
        notificationId: "notif-1",
        sentEventId: "sent-1",
      },
    })
  })

  it("deduplicates repeated clicks for the same sent reminder", async () => {
    const mockClient = createMockSupabase([
      {
        data: [
          {
            id: "sent-1",
            partner_id: "partner-1",
            metadata: { customerName: "Maria", itemCount: 2 },
            created_at: "2026-11-27T10:00:00.000Z",
          },
        ],
      },
      { data: [{ id: "click-1" }] },
    ])

    const recorded = await recordCartAbandonmentClick(
      { userId: "user-1", partnerId: "partner-1" },
      mockClient,
    )

    expect(recorded).toBe(false)
    expect(mockRecordAddonEvent).not.toHaveBeenCalled()
  })

  it("records a converted event with revenue when a paid order matches a recent sent reminder", async () => {
    const mockClient = createMockSupabase([
      { data: [] },
      {
        data: [
          {
            id: "sent-1",
            metadata: { customerName: "Maria", itemCount: 3 },
            created_at: "2026-11-27T10:00:00.000Z",
          },
        ],
      },
    ])

    const recorded = await recordCartAbandonmentConversion(
      {
        partnerId: "partner-1",
        buyerId: "user-1",
        orderId: "order-1",
        amount: 149.9,
        customerName: "Maria Silva",
        orderCreatedAt: "2026-11-27T12:00:00.000Z",
      },
      mockClient,
    )

    expect(recorded).toBe(true)
    expect(mockRecordAddonEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordAddonEvent).toHaveBeenCalledWith({
      partnerId: "partner-1",
      addonSlug: "cart_abandonment",
      eventType: "converted",
      entityType: "order",
      entityId: "order-1",
      metadata: {
        orderId: "order-1",
        buyerId: "user-1",
        amount: 149.9,
        customerName: "Maria Silva",
        itemCount: 3,
        sentEventId: "sent-1",
      },
    })
  })

  it("deduplicates conversion if the order was already recorded as converted", async () => {
    const mockClient = createMockSupabase([{ data: [{ id: "conv-1" }] }])

    const recorded = await recordCartAbandonmentConversion(
      {
        partnerId: "partner-1",
        buyerId: "user-1",
        orderId: "order-1",
        amount: 149.9,
      },
      mockClient,
    )

    expect(recorded).toBe(false)
    expect(mockRecordAddonEvent).not.toHaveBeenCalled()
  })

  it("does not record conversion when no sent reminder exists in the attribution window", async () => {
    const mockClient = createMockSupabase([{ data: [] }, { data: [] }])

    const recorded = await recordCartAbandonmentConversion(
      {
        partnerId: "partner-1",
        buyerId: "user-1",
        orderId: "order-2",
        amount: 99.0,
      },
      mockClient,
    )

    expect(recorded).toBe(false)
    expect(mockRecordAddonEvent).not.toHaveBeenCalled()
  })
})

