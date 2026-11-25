import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildBlingOrderParcelas, processBlingWebhook } from "./bling-integration"

vi.mock("server-only", () => ({}))

const mockFrom = vi.fn((table: string) => {
  if (table === "product_variants") {
    return {
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: "var-1", product_id: "prod-1" }],
            error: null,
          }),
        }),
        eq: vi.fn().mockResolvedValue({
          data: [{ stock_quantity: 29, stock_reserved: 3 }],
          error: null,
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
        is: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
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
})
