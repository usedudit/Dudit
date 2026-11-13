import { describe, it, expect } from "vitest"
import { buildNotificationContent, buildWhatsappMessage } from "@/lib/notifications/templates"

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

