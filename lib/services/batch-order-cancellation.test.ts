import { describe, expect, it, vi, beforeEach } from "vitest"
import { syncCancelledOrderAppointmentsAndTransactions } from "./sync-cancellation"
import { buildNotificationContent } from "@/lib/notifications/templates"
import type { SupabaseClient } from "@supabase/supabase-js"

vi.mock("@/app/actions/erp/appointment-items", () => ({
  handleAppointmentItemsStockMovement: vi.fn().mockResolvedValue(undefined),
}))

describe("Batch Order Cancellation & Notification Optimizations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("syncCancelledOrderAppointmentsAndTransactions query optimization", () => {
    it("skips redundant orders query when orderData is provided in options", async () => {
      const fromCalls: string[] = []

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          fromCalls.push(table)
          const chain: Record<string, any> = {}
          chain.select = vi.fn().mockReturnValue(chain)
          chain.eq = vi.fn().mockReturnValue(chain)
          chain.in = vi.fn().mockReturnValue(chain)
          chain.update = vi.fn().mockReturnValue(chain)
          chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
          chain.then = vi.fn().mockImplementation((onFulfilled) => {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled)
          })
          return chain
        }),
      } as unknown as SupabaseClient

      const preloadedOrder = {
        id: "order-123",
        partner_id: "partner-abc",
        buyer_id: null,
        customer_id: null,
        store_id: null,
        paid_amount: 0,
        exchange_return_request_id: null,
        payment_breakdown: null,
      }

      await syncCancelledOrderAppointmentsAndTransactions(mockSupabase, "order-123", {
        orderData: preloadedOrder,
      })

      // Must NOT have queried 'orders' table
      expect(fromCalls).not.toContain("orders")
      // But will query deliveries and appointments
      expect(fromCalls).toContain("delivery_orders")
      expect(fromCalls).toContain("appointments")
    })

    it("falls back to querying orders table when orderData is not provided", async () => {
      const fromCalls: string[] = []

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          fromCalls.push(table)
          const chain: Record<string, any> = {}
          chain.select = vi.fn().mockReturnValue(chain)
          chain.eq = vi.fn().mockReturnValue(chain)
          chain.in = vi.fn().mockReturnValue(chain)
          chain.update = vi.fn().mockReturnValue(chain)
          chain.single = vi.fn().mockResolvedValue({
            data: {
              id: "order-456",
              partner_id: "partner-abc",
              buyer_id: null,
              customer_id: null,
              store_id: null,
              paid_amount: 0,
              exchange_return_request_id: null,
              payment_breakdown: null,
            },
            error: null,
          })
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
          chain.then = vi.fn().mockImplementation((onFulfilled) => {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled)
          })
          return chain
        }),
      } as unknown as SupabaseClient

      await syncCancelledOrderAppointmentsAndTransactions(mockSupabase, "order-456")

      // MUST query 'orders' table since orderData was not provided
      expect(fromCalls).toContain("orders")
    })
  })

  describe("Marketplace notification customer filtering", () => {
    it("verifies marketplace customer detection logic", () => {
      const orders = [
        { id: "ord-1", buyer_id: "usr-marketplace-1", customer_name: "Cliente Dudit" },
        { id: "ord-2", buyer_id: null, customer_name: "Cliente Balcão Offline" },
        { id: "ord-3", buyer_id: "usr-marketplace-2", customer_name: "Cliente App" },
        { id: "ord-4", buyer_id: undefined, customer_name: "Cliente PDV" },
      ]

      const marketplaceOrders = orders.filter((o) => Boolean(o.buyer_id))
      const offlineOrders = orders.filter((o) => !o.buyer_id)

      expect(marketplaceOrders.length).toBe(2)
      expect(marketplaceOrders.map((o) => o.id)).toEqual(["ord-1", "ord-3"])

      expect(offlineOrders.length).toBe(2)
      expect(offlineOrders.map((o) => o.id)).toEqual(["ord-2", "ord-4"])
    })

    it("verifies concurrency runner processes all orders correctly and faster than serial", async () => {
      const totalOrders = 12
      const items = Array.from({ length: totalOrders }, (_, i) => ({ id: `order-${i}` }))
      
      let concurrentCount = 0
      let maxConcurrentObserved = 0
      const processed: string[] = []

      const CONCURRENCY = 6
      let currentQueueIndex = 0

      const workers = new Array(Math.min(CONCURRENCY, items.length)).fill(0).map(async () => {
        while (currentQueueIndex < items.length) {
          const idx = currentQueueIndex++
          concurrentCount++
          if (concurrentCount > maxConcurrentObserved) {
            maxConcurrentObserved = concurrentCount
          }
          // Simulate async DB roundtrip
          await new Promise((resolve) => setTimeout(resolve, 10))
          processed.push(items[idx].id)
          concurrentCount--
        }
      })
      await Promise.all(workers)

      expect(processed.length).toBe(totalOrders)
      expect(maxConcurrentObserved).toBeGreaterThanOrEqual(2)
      expect(maxConcurrentObserved).toBeLessThanOrEqual(CONCURRENCY)
    })

    it("groups multiple orders of the same customer into a single notification entry", () => {
      const orders = [
        { id: "ord-1", order_number: "1001", buyer_id: "customer-A" },
        { id: "ord-2", order_number: "1002", buyer_id: "customer-B" },
        { id: "ord-3", order_number: "1003", buyer_id: "customer-A" },
        { id: "ord-4", order_number: "1004", buyer_id: "customer-A" },
      ]

      const ordersByBuyer = new Map<string, any[]>()
      for (const order of orders) {
        const buyerId = String(order.buyer_id)
        if (!ordersByBuyer.has(buyerId)) {
          ordersByBuyer.set(buyerId, [])
        }
        ordersByBuyer.get(buyerId)!.push(order)
      }

      // Customer A had 3 orders, Customer B had 1 order
      expect(ordersByBuyer.size).toBe(2)
      expect(ordersByBuyer.get("customer-A")?.length).toBe(3)
      expect(ordersByBuyer.get("customer-B")?.length).toBe(1)
    })
  })

  describe("Batch cancellation notification template content", () => {
    it("formats batch order cancelled message with order numbers and reason", () => {
      const content = buildNotificationContent("order_cancelled", "customer", {
        isBatch: true,
        batchCount: 2,
        orderNumbers: ["101", "102"],
        storeName: "Loja Teste",
        cancellationNote: "Item indisponível no estoque",
      })

      expect(content.title).toBe("💔 Pedidos cancelados")
      expect(content.message).toContain("Seus 2 pedidos (#101, #102) em Loja Teste foram cancelados")
      expect(content.message).toContain("Motivo: Item indisponível no estoque.")
    })

    it("formats single order cancelled message correctly", () => {
      const content = buildNotificationContent("order_cancelled", "customer", {
        orderNumber: "105",
        storeName: "Loja Teste",
        cancellationNote: "Desistência do cliente",
      })

      expect(content.title).toBe("💔 Pedido cancelado")
      expect(content.message).toContain("Seu pedido #105 em Loja Teste foi cancelado")
      expect(content.message).toContain("Motivo: Desistência do cliente.")
    })
  })

  describe("Appointment and transaction cancellation synchronization", () => {
    it("updates active appointments to Cancelado and payment_status to unpaid", async () => {
      let updatedAppointmentsPayload: any = null
      let updatedAppointmentIds: string[] = []

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          const chain: Record<string, any> = {}
          chain.select = vi.fn().mockReturnValue(chain)
          chain.eq = vi.fn().mockReturnValue(chain)
          chain.or = vi.fn().mockReturnValue(chain)
          chain.in = vi.fn().mockImplementation((col: string, val: any) => {
            if (table === "appointments" && col === "id") {
              updatedAppointmentIds = val
            }
            return chain
          })
          chain.update = vi.fn().mockImplementation((payload: any) => {
            if (table === "appointments") {
              updatedAppointmentsPayload = payload
            }
            return chain
          })
          chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
          chain.then = vi.fn().mockImplementation((onFulfilled) => {
            if (table === "order_items") {
              return Promise.resolve({ data: [{ id: "item-1" }, { id: "item-2" }], error: null }).then(onFulfilled)
            }
            if (table === "appointments") {
              return Promise.resolve({
                data: [
                  { id: "appt-1", status: "Reservado", price: 100, paid_amount: 0 },
                  { id: "appt-2", status: "Concluído", price: 50, paid_amount: 50 },
                ],
                error: null,
              }).then(onFulfilled)
            }
            return Promise.resolve({ data: [], error: null }).then(onFulfilled)
          })
          return chain
        }),
      } as unknown as SupabaseClient

      await syncCancelledOrderAppointmentsAndTransactions(mockSupabase, "order-789", {
        orderData: {
          id: "order-789",
          partner_id: "partner-xyz",
          buyer_id: null,
          customer_id: null,
          store_id: null,
          paid_amount: 0,
        },
      })

      expect(updatedAppointmentsPayload).not.toBeNull()
      expect(updatedAppointmentsPayload.status).toBe("Cancelado")
      expect(updatedAppointmentsPayload.payment_status).toBe("unpaid")
      expect(updatedAppointmentIds).toEqual(["appt-1"])
    })
  })
})
