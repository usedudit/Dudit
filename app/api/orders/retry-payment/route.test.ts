import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mocks
vi.mock("@/lib/security/require-rate-limit", () => ({
  checkRateLimitForAPI: vi.fn().mockResolvedValue({ limited: false }),
}))

vi.mock("@/lib/auth/authorization", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-buyer-1", email: "buyer@dudit.com" }),
  requirePartnerAccess: vi.fn().mockResolvedValue({ roleId: "owner", userId: "user-partner-1" }),
}))

const mockOrder = {
  id: "order-boleto-123",
  buyer_id: "user-buyer-1",
  partner_id: "partner-1",
  situation: "pending",
  total_amount: 150.00,
  paid_amount: 0,
  mp_payment_id: "mp-pay-999",
  payment_provider: "Mercado Pago",
  payment_method: "Boleto",
  order_number: "DDT-1001",
  stores: { name: "Loja Teste" },
  order_items: [],
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(() => Promise.resolve({ data: mockOrder, error: null })),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  }),
}))

vi.mock("@/lib/mercadopago/token-manager", () => ({
  getValidMercadoPagoAccessToken: vi.fn().mockResolvedValue("APP_USR-test-token"),
}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  captureError: vi.fn(),
}))

import { POST } from "./route"

describe("POST /api/orders/retry-payment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("preserves Boleto payment data and does NOT convert to Pix", async () => {
    const mockMpBoletoResponse = {
      id: "mp-pay-999",
      status: "pending",
      transaction_amount: 150.00,
      payment_method_id: "bolbradesco",
      payment_type_id: "ticket",
      barcode: {
        content: "23793381286008301352856000063307789120000015000",
      },
      transaction_details: {
        external_resource_url: "https://www.mercadopago.com.br/payments/999/ticket",
      },
    }

    vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes("api.mercadopago.com/v1/payments/mp-pay-999")) {
        return new Response(JSON.stringify(mockMpBoletoResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response("Not found", { status: 404 })
    })

    const req = new NextRequest("http://localhost:3000/api/orders/retry-payment", {
      method: "POST",
      body: JSON.stringify({ orderId: "order-boleto-123" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.boletoData).not.toBeNull()
    expect(data.boletoData.barcode).toBe("23793381286008301352856000063307789120000015000")
    expect(data.boletoData.ticketUrl).toBe("https://www.mercadopago.com.br/payments/999/ticket")
    expect(data.pixData).toBeNull()
  })

  it("correctly returns Pix data when payment is Pix", async () => {
    const mockMpPixResponse = {
      id: "mp-pay-888",
      status: "pending",
      transaction_amount: 150.00,
      payment_method_id: "pix",
      payment_type_id: "bank_transfer",
      point_of_interaction: {
        transaction_data: {
          qr_code: "00020126580014br.gov.bcb.pix...",
          qr_code_base64: "iVBORw0KGgoAAAANSUhEUgAA...",
          ticket_url: "https://www.mercadopago.com.br/payments/888/ticket",
        },
      },
    }

    vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      return new Response(JSON.stringify(mockMpPixResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    })

    const req = new NextRequest("http://localhost:3000/api/orders/retry-payment", {
      method: "POST",
      body: JSON.stringify({ orderId: "order-boleto-123" }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.success).toBe(true)
    expect(data.pixData).not.toBeNull()
    expect(data.pixData.qrCode).toBe("00020126580014br.gov.bcb.pix...")
    expect(data.pixData.qrCodeBase64).toBe("iVBORw0KGgoAAAANSUhEUgAA...")
    expect(data.boletoData).toBeNull()
  })
})
