import { describe, it, expect } from "vitest"
import { canStoreAcceptOrders, isStoreShowcaseActive, INACTIVE_SHOWCASE_ERROR, STORE_CLOSED_ERROR } from "./store-showcase"

describe("canStoreAcceptOrders", () => {
  const schedule = {
    monday: { enabled: true, from: "09:00", to: "18:00" },
    tuesday: { enabled: true, from: "09:00", to: "18:00" },
    wednesday: { enabled: true, from: "09:00", to: "18:00" },
    thursday: { enabled: true, from: "09:00", to: "18:00" },
    friday: { enabled: true, from: "09:00", to: "18:00" },
    saturday: { enabled: false, from: "09:00", to: "13:00" },
    sunday: { enabled: false, from: "09:00", to: "13:00" },
  }

  const createMockClient = (storeData: any, partnerData: any = null) => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "stores" ? storeData : partnerData,
            error: null,
          }),
        }),
      }),
    }),
  })

  it("allows orders when showcase is active and accept_orders_when_closed is true (default)", async () => {
    const mockClient = createMockClient({
      id: "store-1",
      is_active: true,
      is_showcase_active: true,
      accept_orders_when_closed: true,
      opening_hours: schedule,
      timezone: "America/Sao_Paulo",
    })

    // Domingo às 12:00 (loja fechada, mas aceitando pedidos quando fechada)
    const sundayNoon = new Date("2026-09-20T12:00:00-03:00")
    const result = await canStoreAcceptOrders(mockClient as any, {
      storeId: "store-1",
      nowDate: sundayNoon,
    })

    expect(result.allowed).toBe(true)
  })

  it("blocks orders when accept_orders_when_closed is false and store is closed", async () => {
    const mockClient = createMockClient({
      id: "store-1",
      is_active: true,
      is_showcase_active: true,
      accept_orders_when_closed: false,
      opening_hours: schedule,
      timezone: "America/Sao_Paulo",
    })

    // Domingo às 12:00 (loja fechada e bloqueando pedidos fora do horário)
    const sundayNoon = new Date("2026-09-20T12:00:00-03:00")
    const result = await canStoreAcceptOrders(mockClient as any, {
      storeId: "store-1",
      nowDate: sundayNoon,
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("store_closed")
    expect(result.message).toBe(STORE_CLOSED_ERROR)
  })

  it("allows orders when accept_orders_when_closed is false but store is OPEN", async () => {
    const mockClient = createMockClient({
      id: "store-1",
      is_active: true,
      is_showcase_active: true,
      accept_orders_when_closed: false,
      opening_hours: schedule,
      timezone: "America/Sao_Paulo",
    })

    // Segunda-feira às 14:00 (loja aberta)
    const mondayAfternoon = new Date("2026-09-14T14:00:00-03:00")
    const result = await canStoreAcceptOrders(mockClient as any, {
      storeId: "store-1",
      nowDate: mondayAfternoon,
    })

    expect(result.allowed).toBe(true)
  })

  it("blocks orders when showcase is inactive", async () => {
    const mockClient = createMockClient({
      id: "store-1",
      is_active: true,
      is_showcase_active: false,
      accept_orders_when_closed: true,
      opening_hours: schedule,
      timezone: "America/Sao_Paulo",
    })

    const mondayAfternoon = new Date("2026-09-14T14:00:00-03:00")
    const result = await canStoreAcceptOrders(mockClient as any, {
      storeId: "store-1",
      nowDate: mondayAfternoon,
    })

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("showcase_inactive")
    expect(result.message).toBe(INACTIVE_SHOWCASE_ERROR)
  })
})
