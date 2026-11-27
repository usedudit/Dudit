import { describe, it, expect, vi, beforeEach } from "vitest"
import { processTinyWebhook, mapPaymentMethodToTiny, buildTinyOrderPayments, syncDuditStockToTiny, updateTinyOrderStatus } from "./tiny-integration"

vi.mock("server-only", () => ({}))

const mockTinySearchProducts = vi.fn().mockResolvedValue({ produtos: [] })
const mockTinyUpdateProductStock = vi.fn().mockResolvedValue({ status: "OK" })
const mockTinyUpdateOrderStatus = vi.fn().mockResolvedValue(true)
const mockTinyLaunchOrderStock = vi.fn().mockResolvedValue({ launched: true })
const mockTinyReverseOrderStock = vi.fn().mockResolvedValue({ reversed: true })

vi.mock("./tiny-client", () => ({
  createTinyClient: vi.fn(() => ({
    searchProducts: mockTinySearchProducts,
    updateProductStock: mockTinyUpdateProductStock,
    updateOrderStatus: mockTinyUpdateOrderStatus,
    launchOrderStock: mockTinyLaunchOrderStock,
    reverseOrderStock: mockTinyReverseOrderStock,
  })),
}))

vi.mock("@/lib/cryptoService", () => ({
  encrypt: vi.fn((v: string) => v),
  decrypt: vi.fn((v: string) => v),
}))

let mockTinyIntegrationRow: any = null
let mockTinyProductRow: any = { external_id: "9999", external_provider: "bling", sku: "SIMPLE-SKU" }

const mockVariantUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
const mockProductUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })

const mockFrom = vi.fn((table: string) => {
  if (table === "orders") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "ord-1",
              partner_id: "partner-123",
              external_order_id: "777888",
              external_provider: "tiny",
              external_sync_status: "synced",
            },
            error: null,
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
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTinyIntegrationRow, error: null }),
          }),
        }),
      }),
    }
  }
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
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { sku: "MISSING-VAR-SKU" }, error: null }),
          then: (resolve: any) => resolve({ data: [{ stock_quantity: 100, stock_reserved: 4 }], error: null }),
        }),
      }),
      update: mockVariantUpdate,
    }
  }

  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: mockTinyProductRow, error: null }),
        is: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          ilike: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }),
    update: mockProductUpdate,
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
    mockTinyIntegrationRow = null
    mockTinyProductRow = { external_id: "9999", external_provider: "bling", sku: "SIMPLE-SKU" }
  })

  it("should process stock update webhook for product variants including saldoReservado", async () => {
    const payload = {
      evento: "atualizacao_estoque",
      produtos: [
        {
          id: 335740556,
          sku: "CMB-M",
          saldo: 100,
          saldoReservado: 4,
        },
      ],
    }

    const result = await processTinyWebhook("partner-123", payload)
    expect(result.success).toBe(true)
    expect(result.event).toBe("atualizacao_estoque")
    expect(result.affectedCount).toBe(1)
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stock_quantity: 100, stock_reserved: 4 })
    )
    expect(mockProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stock_quantity: 100, stock_reserved: 4 })
    )
  })

  it("skips Tiny stock webhook when sync_stock is disabled", async () => {
    mockTinyIntegrationRow = {
      id: "int-tiny",
      partner_id: "partner-123",
      provider_slug: "tiny",
      status: "connected",
      config: { sync_stock: false },
    }

    const result = await processTinyWebhook("partner-123", {
      evento: "atualizacao_estoque",
      produtos: [{ id: 335740556, sku: "CMB-M", saldo: 50 }],
    })

    expect(result.success).toBe(true)
    expect(result.affectedCount).toBe(0)
    expect(result.details).toBe("sync_stock_disabled")
  })

  it("does NOT fall back to parent product when variant SKU is missing in Tiny", async () => {
    mockTinyIntegrationRow = {
      id: "int-tiny",
      partner_id: "partner-123",
      provider_slug: "tiny",
      status: "connected",
      access_token_encrypted: "tok",
      config: { sync_stock: true, default_deposit: "Geral" },
    }
    mockTinySearchProducts.mockResolvedValueOnce({ produtos: [] })

    const res = await syncDuditStockToTiny({
      partnerId: "partner-123",
      productId: "prod-1",
      variantId: "var-missing",
      newStock: 3,
    })

    expect(res.success).toBe(false)
    expect(mockTinyUpdateProductStock).not.toHaveBeenCalled()
  })

  it("ignores Bling external_id and resolves by SKU + forwards default_deposit in Tiny", async () => {
    mockTinyIntegrationRow = {
      id: "int-tiny",
      partner_id: "partner-123",
      provider_slug: "tiny",
      status: "connected",
      access_token_encrypted: "tok",
      config: { sync_stock: true, default_deposit: "Deposito Principal" },
    }
    mockTinyProductRow = { external_id: "8888", external_provider: "bling", sku: "SIMPLE-SKU" }
    mockTinySearchProducts.mockResolvedValueOnce({
      produtos: [{ produto: { id: 4444, codigo: "SIMPLE-SKU" } }],
    })

    const res = await syncDuditStockToTiny({
      partnerId: "partner-123",
      productId: "prod-1",
      newStock: 18,
      reason: "Teste depósito",
    })

    expect(res.success).toBe(true)
    expect(mockTinyUpdateProductStock).toHaveBeenCalledWith(4444, 18, {
      tipo: "B",
      deposito: "Deposito Principal",
      observacoes: "Teste depósito",
    })
  })

  it("launches order stock (releasing saldoReservado) when updating Tiny order status to entregue", async () => {
    mockTinyIntegrationRow = {
      id: "int-tiny",
      partner_id: "partner-123",
      provider_slug: "tiny",
      status: "connected",
      access_token_encrypted: "tok",
      config: { sync_stock: true },
    }

    const res = await updateTinyOrderStatus({ orderId: "ord-1", situacao: "entregue" })

    expect(res.success).toBe(true)
    expect(res.stockLaunched).toBe(true)
    expect(mockTinyLaunchOrderStock).toHaveBeenCalledWith("777888")
    expect(mockTinyUpdateOrderStatus).toHaveBeenCalledWith("777888", "entregue")
  })

  it("reverses order stock before cancelling Tiny order", async () => {
    mockTinyIntegrationRow = {
      id: "int-tiny",
      partner_id: "partner-123",
      provider_slug: "tiny",
      status: "connected",
      access_token_encrypted: "tok",
      config: { sync_stock: true },
    }

    const res = await updateTinyOrderStatus({ orderId: "ord-1", situacao: "cancelado" })

    expect(res.success).toBe(true)
    expect(res.stockReversed).toBe(true)
    expect(mockTinyReverseOrderStock).toHaveBeenCalledWith("777888")
    expect(mockTinyUpdateOrderStatus).toHaveBeenCalledWith("777888", "cancelado")
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
