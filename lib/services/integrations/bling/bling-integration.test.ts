import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildBlingOrderParcelas, processBlingWebhook, syncDuditStockToBling } from "./bling-integration"

vi.mock("server-only", () => ({}))

const mockListProducts = vi.fn().mockResolvedValue([])
const mockUpdateProductStock = vi.fn().mockResolvedValue({})
const mockListDeposits = vi.fn().mockResolvedValue([{ id: 1, padrao: true }])

vi.mock("./bling-client", () => ({
  createBlingClient: vi.fn(() => ({
    listProducts: mockListProducts,
    updateProductStock: mockUpdateProductStock,
    listDeposits: mockListDeposits,
    getProductStocks: vi.fn().mockResolvedValue([]),
  })),
  refreshBlingAccessToken: vi.fn(),
}))

vi.mock("@/lib/cryptoService", () => ({
  encrypt: vi.fn((v: string) => v),
  decrypt: vi.fn((v: string) => v),
}))

let mockIntegrationRow: any = null

const mockFrom = vi.fn((table: string) => {
  if (table === "partner_integrations") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockIntegrationRow, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  }
  if (table === "product_variants") {
    return {
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: "var-1", product_id: "prod-1", sku: "CMB-M" }],
            error: null,
          }),
        }),
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { sku: "MISSING-VAR-SKU" }, error: null }),
          then: (resolve: any) => resolve({ data: [{ stock_quantity: 29, stock_reserved: 3 }], error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
  }
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { external_id: "9999", external_provider: "bling", sku: "PARENT-SKU" },
          error: null,
        }),
        is: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock("@/lib/cache/invalidation", () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(true),
}))

describe("Bling Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIntegrationRow = null
  })

  it("maps split payment (Pix + 2x Credit Card) + store credit into Bling parcelas with formaPagamento.id", () => {
    const blingMethods = [
      { id: 101, descricao: "Pix", tipoPagamento: 17, situacao: 1 },
      { id: 102, descricao: "Cartão de Crédito", tipoPagamento: 3, situacao: 1 },
      { id: 103, descricao: "Vale-Troca", tipoPagamento: 5, situacao: 1 },
    ]
    const parcelas = buildBlingOrderParcelas(
      {
        total_amount: 300,
        store_credit_amount: 50,
        payment_breakdown: [
          { method: "Pix", amount: 100, installmentNumber: 1 },
          { method: "Cartão de Crédito", amount: 150, installmentNumber: 2 },
        ],
        created_at: "2026-11-22T12:00:00Z",
      },
      blingMethods
    )

    expect(parcelas).toHaveLength(4)
    expect(parcelas[0].valor).toBe(100)
    expect(parcelas[0].formaPagamento).toEqual({ id: 101 })
    expect(parcelas[1].valor).toBe(75)
    expect(parcelas[1].formaPagamento).toEqual({ id: 102 })
    expect(parcelas[2].valor).toBe(75)
    expect(parcelas[2].formaPagamento).toEqual({ id: 102 })
    expect(parcelas[3].valor).toBe(50)
    expect(parcelas[3].observacoes).toBe("Crédito de Loja / Carteira")
    expect(parcelas[3].formaPagamento).toEqual({ id: 103 })
  })

  it("handles partially paid order with pending balance parcela", () => {
    const parcelas = buildBlingOrderParcelas({
      total_amount: 200,
      paid_amount: 80,
      payment_breakdown: [{ method: "Pix", amount: 80, installmentNumber: 1 }],
      created_at: "2026-11-22T12:00:00Z",
    })

    expect(parcelas).toHaveLength(2)
    expect(parcelas[0].valor).toBe(80)
    expect(parcelas[1].valor).toBe(120)
    expect(parcelas[1].observacoes).toBe("Saldo a Receber")
  })

  it("processes Bling stock webhook updating physical and reserved stock on variant", async () => {
    const res = await processBlingWebhook("partner-1", {
      event: "stock.updated",
      data: {
        produto: { id: 1001, codigo: "CMB-M" },
        saldoFisicoTotal: 29,
        saldoVirtualTotal: 26,
      },
    })

    expect(res.success).toBe(true)
    expect(res.event).toBe("stock.updated")
    expect(res.affectedCount).toBe(1)
  })

  it("skips Bling stock webhook when sync_stock is explicitly disabled", async () => {
    mockIntegrationRow = {
      id: "int-1",
      partner_id: "partner-1",
      provider_slug: "bling",
      status: "connected",
      config: { sync_stock: false },
    }

    const res = await processBlingWebhook("partner-1", {
      event: "stock.updated",
      data: {
        produto: { id: 1001, codigo: "CMB-M" },
        saldoFisicoTotal: 29,
        saldoVirtualTotal: 26,
      },
    })

    expect(res.success).toBe(true)
    expect(res.affectedCount).toBe(0)
    expect(res.details).toBe("sync_stock_disabled")
  })

  it("does NOT fall back to parent product when variant SKU is missing in Bling", async () => {
    mockIntegrationRow = {
      id: "int-1",
      partner_id: "partner-1",
      provider_slug: "bling",
      status: "connected",
      access_token_encrypted: "tok",
      config: { sync_stock: true, default_deposit_id: 1 },
      credentials: {},
      metadata: {},
    }
    mockListProducts.mockResolvedValueOnce([])

    const res = await syncDuditStockToBling({
      partnerId: "partner-1",
      productId: "prod-1",
      variantId: "var-missing",
      newStock: 7,
    })

    expect(res.success).toBe(false)
    expect(mockUpdateProductStock).not.toHaveBeenCalled()
  })
})
