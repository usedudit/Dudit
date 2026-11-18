import { describe, it, expect, vi, beforeEach } from "vitest"
import { processTinyWebhook } from "./tiny-integration"

// Mock server-only
vi.mock("server-only", () => ({}))

// Mock Supabase
const createChainableQuery = () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    is: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
  }
  return chain
}

const mockSupabase = {
  from: vi.fn(() => createChainableQuery()),
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mockSupabase,
}))

// Mock Sentry
vi.mock("@/lib/monitoring/sentry", () => ({
  captureError: vi.fn(),
  addMonitoringBreadcrumb: vi.fn(),
}))

// Mock Timeline
vi.mock("@/lib/services/timeline.service", () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

// Mock Cache invalidation
vi.mock("@/lib/cache/invalidation", () => ({
  invalidateProductCache: vi.fn().mockResolvedValue(undefined),
}))

// Mock Revalidation
vi.mock("@/lib/utils/revalidation", () => ({
  revalidateOrders: vi.fn().mockResolvedValue(undefined),
}))

// Mock Crypto
vi.mock("@/lib/cryptoService", () => ({
  encrypt: vi.fn((val) => `enc_${val}`),
  decrypt: vi.fn((val) => val.replace(/^enc_/, "")),
}))

describe("Tiny Integration Webhooks", () => {
  const fakePartnerId = "partner-123"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should process atualizacao_estoque and update product stock", async () => {
    const payload = {
      evento: "atualizacao_estoque",
      produtos: [
        {
          id: 999111,
          sku: "CAM-01",
          saldo: 25,
        },
      ],
    }

    const res = await processTinyWebhook(fakePartnerId, payload)
    expect(res.success).toBe(true)
    expect(res.event).toBe("atualizacao_estoque")
  })

  it("should process envio_nota_fiscal and register nfe details", async () => {
    const payload = {
      evento: "envio_nota_fiscal",
      notas: [
        {
          id: 888222,
          numero: "001234",
          serie: "1",
          chave_acesso: "35240512345678901234550010000123451234567890",
          danfe_url: "https://cdn.tiny.com.br/danfe/test.pdf",
          xml_url: "https://cdn.tiny.com.br/xml/test.xml",
          pedido_id: 555333,
          pedido_numero: "PED-99",
        },
      ],
    }

    const res = await processTinyWebhook(fakePartnerId, payload)
    expect(res.success).toBe(true)
    expect(res.event).toBe("envio_nota_fiscal")
  })

  it("should process atualizacao_situacao_pedido for faturado/enviado", async () => {
    const payload = {
      evento: "atualizacao_situacao_pedido",
      pedidos: [
        {
          id: 555333,
          numero: "PED-99",
          situacao_atual: "enviado",
        },
      ],
    }

    const res = await processTinyWebhook(fakePartnerId, payload)
    expect(res.success).toBe(true)
    expect(res.event).toBe("atualizacao_situacao_pedido")
  })
})
