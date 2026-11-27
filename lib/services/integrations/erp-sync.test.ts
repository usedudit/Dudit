import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  syncStockToConnectedErps,
  syncItemsStockToConnectedErps,
  exportOrderToConnectedErps,
  updateOrderStatusOnConnectedErps,
} from "./erp-sync"

vi.mock("server-only", () => ({}))

const mockExportTiny = vi.fn()
const mockUpdateTinyStatus = vi.fn()
const mockSyncTinyStock = vi.fn()
const mockExportBling = vi.fn()
const mockUpdateBlingStatus = vi.fn()
const mockSyncBlingStock = vi.fn()

vi.mock("./tiny/tiny-integration", () => ({
  TINY_PROVIDER: "tiny",
  exportDuditOrderToTiny: (...args: any[]) => mockExportTiny(...args),
  updateTinyOrderStatus: (...args: any[]) => mockUpdateTinyStatus(...args),
  syncDuditStockToTiny: (...args: any[]) => mockSyncTinyStock(...args),
}))

vi.mock("./bling/bling-integration", () => ({
  BLING_PROVIDER: "bling",
  exportDuditOrderToBling: (...args: any[]) => mockExportBling(...args),
  updateBlingOrderStatus: (...args: any[]) => mockUpdateBlingStatus(...args),
  syncDuditStockToBling: (...args: any[]) => mockSyncBlingStock(...args),
}))

let mockConnectedProviders: string[] = ["tiny", "bling"]
let mockOrderRow: any = null
let mockAuditLogs: any[] = []
let mockProductStock: Record<string, number> = { "prod-1": 12 }
let mockVariantStock: Record<string, number> = { "var-1": 5 }

const mockFrom = vi.fn((table: string) => {
  if (table === "audit_logs") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockAuditLogs, error: null }),
            }),
          }),
        }),
      }),
    }
  }
  if (table === "partner_integrations") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: mockConnectedProviders.map((provider_slug) => ({ provider_slug })),
              error: null,
            }),
          }),
        }),
      }),
    }
  }
  if (table === "orders") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: mockOrderRow, error: null }),
        }),
      }),
    }
  }
  if (table === "products") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn((_col: string, id: string) => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: id in mockProductStock ? { stock_quantity: mockProductStock[id] } : null,
            error: null,
          }),
        })),
      }),
    }
  }
  if (table === "product_variants") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn((_col: string, id: string) => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: id in mockVariantStock ? { stock_quantity: mockVariantStock[id] } : null,
            error: null,
          }),
        })),
      }),
    }
  }
  return {}
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

describe("erp-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectedProviders = ["tiny", "bling"]
    mockOrderRow = null
    mockAuditLogs = []
    mockProductStock = { "prod-1": 12 }
    mockVariantStock = { "var-1": 5 }
    mockSyncTinyStock.mockResolvedValue({ success: true })
    mockSyncBlingStock.mockResolvedValue({ success: true })
    mockUpdateTinyStatus.mockResolvedValue({ success: true, stockLaunched: true })
    mockUpdateBlingStatus.mockResolvedValue({ success: true })
  })

  it("deduplicates items and syncs current DB stock to both Tiny and Bling", async () => {
    await syncItemsStockToConnectedErps({
      partnerId: "partner-1",
      items: [
        { productId: "prod-1" },
        { productId: "prod-1" }, // duplicate
        { productId: "prod-1", variantId: "var-1" },
      ],
      reason: "Teste lote",
    })

    expect(mockSyncTinyStock).toHaveBeenCalledTimes(2)
    expect(mockSyncBlingStock).toHaveBeenCalledTimes(2)
    expect(mockSyncTinyStock).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: "partner-1", productId: "prod-1", variantId: undefined, newStock: 12 })
    )
    expect(mockSyncBlingStock).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: "partner-1", productId: "prod-1", variantId: "var-1", newStock: 5 })
    )
  })

  it("still syncs stock for deducted orders even when auto_export_orders is disabled", async () => {
    mockOrderRow = {
      partner_id: "partner-1",
      order_number: "PED-100",
      delivery_status: "delivered",
      inventory_deducted: true,
      external_provider: null,
      external_sync_status: "pending",
      external_order_id: null,
      order_items: [{ product_id: "prod-1", variant_id: "var-1" }],
    }
    mockExportTiny.mockResolvedValue({
      success: false,
      error: "Exportação automática desativada nas configurações.",
    })
    mockExportBling.mockResolvedValue({
      success: true,
      blingOrderId: 999,
    })

    await exportOrderToConnectedErps("order-1")

    // Bling exported the order (which handles its own stock sync), Tiny skipped export so fallback stock sync runs ONLY for Tiny
    expect(mockSyncTinyStock).toHaveBeenCalledTimes(1)
    expect(mockSyncTinyStock).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: "partner-1", productId: "prod-1", variantId: "var-1", newStock: 5 })
    )
    expect(mockSyncBlingStock).not.toHaveBeenCalled()
  })

  it("does nothing when no ERP is connected", async () => {
    mockConnectedProviders = []
    await syncStockToConnectedErps({
      partnerId: "partner-1",
      productId: "prod-1",
      newStock: 10,
    })
    expect(mockSyncTinyStock).not.toHaveBeenCalled()
    expect(mockSyncBlingStock).not.toHaveBeenCalled()
  })

  it("updates BOTH Tiny and Bling statuses even when Bling overwrote orders.external_provider", async () => {
    mockOrderRow = {
      partner_id: "partner-1",
      external_provider: "bling",
      external_order_id: "27532801518",
    }
    mockAuditLogs = [
      { action_type: "bling_order_exported", metadata: { blingOrderId: 27532801518 } },
      { action_type: "tiny_order_exported", metadata: { tinyOrderId: 34 } },
    ]

    const res = await updateOrderStatusOnConnectedErps({
      orderId: "order-multi-1",
      situacao: "entregue",
    })

    expect(mockUpdateTinyStatus).toHaveBeenCalledWith({
      orderId: "order-multi-1",
      situacao: "entregue",
      externalOrderId: "34",
    })
    expect(mockUpdateBlingStatus).toHaveBeenCalledWith({
      orderId: "order-multi-1",
      situacao: "entregue",
      externalOrderId: "27532801518",
    })
    expect(res.stockHandledProviders).toEqual(["tiny"])
  })
})
