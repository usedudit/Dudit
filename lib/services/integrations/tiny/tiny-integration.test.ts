import { describe, it, expect, vi, beforeEach } from "vitest"
import { processTinyWebhook, mapPaymentMethodToTiny, buildTinyOrderPayments } from "./tiny-integration"

vi.mock("server-only", () => ({}))

const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
const mockSelect = vi.fn()
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null })

const mockFrom = vi.fn((table: string) => {
  if (table === "product_variants") {
    return {
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: "var-1",
                product_id: "prod-1",
                sku: "CMB-M",
                stock_quantity: 0,
              },
            ],
            error: null,
          }),
        }),
        eq: vi.fn().mockResolvedValue({
          data: [{ stock_quantity: 100 }],
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
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

vi.mock("@/lib/cache/invalidation", () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(true),
}))

vi.mock("@/lib/services/timeline.service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(true),
}))

describe("Tiny Webhook Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should process stock update webhook for product variants", async () => {
    const payload = {
      evento: "atualizacao_estoque",
      produtos: [
        {
          id: 335740556,
          sku: "CMB-M",
          saldo: 100,
        },
      ],
    }

    const result = await processTinyWebhook("partner-123", payload)
    expect(result.success).toBe(true)
    expect(result.event).toBe("atualizacao_estoque")
    expect(result.affectedCount).toBe(1)
  })
})

describe("Tiny Order Payment Mapping (buildTinyOrderPayments)", () => {
  it("maps credit card with 3 installments correctly", () => {
    const order = {
      total_amount: 150,
      paid_amount: 150,
      payment_method: "Cartão de Crédito",
      payment_breakdown: [
        {
          method: "Cartão de Crédito",
          amount: 150,
          installmentNumber: 3,
        },
      ],
      created_at: "2026-11-20T10:00:00Z",
    }

    const res = buildTinyOrderPayments(order)
    expect(res.forma_pagamento).toBe("credito")
    expect(res.condicao_pagamento).toBe("3x")
    expect(res.parcelas).toBeDefined()
    expect(res.parcelas?.length).toBe(3)
    expect(res.parcelas?.[0].parcela.valor).toBe(50)
    expect(res.parcelas?.[0].parcela.dias).toBe(30)
    expect(res.parcelas?.[1].parcela.valor).toBe(50)
    expect(res.parcelas?.[1].parcela.dias).toBe(60)
    expect(res.parcelas?.[2].parcela.valor).toBe(50)
    expect(res.parcelas?.[2].parcela.dias).toBe(90)
  })

  it("maps split payment with Pix and 2x Credit Card correctly", () => {
    const order = {
      total_amount: 250,
      paid_amount: 250,
      payment_breakdown: [
        {
          method: "Pix",
          amount: 100,
          installmentNumber: 1,
        },
        {
          method: "Cartão de Crédito",
          amount: 150,
          installmentNumber: 2,
        },
      ],
      created_at: "2026-11-20T10:00:00Z",
    }

    const res = buildTinyOrderPayments(order)
    expect(res.forma_pagamento).toBe("multiplas")
    expect(res.condicao_pagamento).toBe("Múltiplas Formas")
    expect(res.parcelas?.length).toBe(3)
    // Parcela 1: Pix R$ 100
    expect(res.parcelas?.[0].parcela.forma_pagamento).toBe("pix")
    expect(res.parcelas?.[0].parcela.valor).toBe(100)
    expect(res.parcelas?.[0].parcela.dias).toBe(0)
    // Parcela 2 e 3: Cartão 2x R$ 75
    expect(res.parcelas?.[1].parcela.forma_pagamento).toBe("credito")
    expect(res.parcelas?.[1].parcela.valor).toBe(75)
    expect(res.parcelas?.[1].parcela.dias).toBe(30)
    expect(res.parcelas?.[2].parcela.forma_pagamento).toBe("credito")
    expect(res.parcelas?.[2].parcela.valor).toBe(75)
    expect(res.parcelas?.[2].parcela.dias).toBe(60)
  })

  it("maps store credit together with other payment method", () => {
    const order = {
      total_amount: 200,
      paid_amount: 200,
      store_credit_amount: 50,
      payment_breakdown: [
        {
          method: "Pix",
          amount: 150,
        },
      ],
      created_at: "2026-11-20T10:00:00Z",
    }

    const res = buildTinyOrderPayments(order)
    expect(res.forma_pagamento).toBe("multiplas")
    expect(res.parcelas?.length).toBe(2)
    // Parcela Pix
    expect(res.parcelas?.[0].parcela.forma_pagamento).toBe("pix")
    expect(res.parcelas?.[0].parcela.valor).toBe(150)
    // Parcela Crédito de Loja
    expect(res.parcelas?.[1].parcela.forma_pagamento).toBe("crediario")
    expect(res.parcelas?.[1].parcela.valor).toBe(50)
    expect(res.parcelas?.[1].parcela.obs).toBe("Crédito de Loja / Carteira")
  })

  it("handles partially paid orders with pending balance", () => {
    const order = {
      total_amount: 300,
      paid_amount: 100,
      payment_breakdown: [
        {
          method: "Dinheiro",
          amount: 100,
        },
      ],
      created_at: "2026-11-20T10:00:00Z",
    }

    const res = buildTinyOrderPayments(order)
    expect(res.forma_pagamento).toBe("multiplas")
    expect(res.condicao_pagamento).toBe("Entrada + Saldo Pendente")
    expect(res.parcelas?.length).toBe(2)
    expect(res.parcelas?.[0].parcela.forma_pagamento).toBe("dinheiro")
    expect(res.parcelas?.[0].parcela.valor).toBe(100)
    expect(res.parcelas?.[1].parcela.valor).toBe(200)
    expect(res.parcelas?.[1].parcela.obs).toBe("Saldo a Receber")
  })

  it("attaches exchange return request note", () => {
    const order = {
      total_amount: 50,
      paid_amount: 50,
      payment_method: "Pix",
      exchange_return_request_id: "ret-999",
      created_at: "2026-11-20T10:00:00Z",
    }

    const res = buildTinyOrderPayments(order)
    expect(res.obsExtra).toContain("Troca ref. Devolução #ret-999")
  })
})
