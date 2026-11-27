import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mockRequireUser = vi.fn()
const mockRequirePermission = vi.fn()
const mockRequireStorePermission = vi.fn()
const mockCreateAdminClient = vi.fn()
const mockFulfillMarketplaceOrder = vi.fn()
const mockCreateFinancialTransactions = vi.fn()
const mockSyncReceivableForOrder = vi.fn()
const mockLogAuditEvent = vi.fn()
const mockRevalidatePath = vi.fn()
const mockRevalidateOrderHistory = vi.fn()

vi.mock("@/lib/auth/authorization", () => ({
  requireUser: () => mockRequireUser(),
  requireStorePermission: (...args: any[]) => mockRequireStorePermission(...args),
}))

vi.mock("@/lib/permissions/access", () => ({
  requirePermission: (...args: any[]) => mockRequirePermission(...args),
}))

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => mockCreateAdminClient(),
}))

vi.mock("@/lib/services/marketplace-checkout-fulfillment", () => ({
  fulfillMarketplaceOrder: (...args: any[]) => mockFulfillMarketplaceOrder(...args),
}))

vi.mock("@/app/actions/erp/orders", () => ({
  createFinancialTransactionsForReceivedAmount: (...args: any[]) => mockCreateFinancialTransactions(...args),
}))

vi.mock("@/lib/services/transaction.service", () => ({
  syncReceivableForOrder: (...args: any[]) => mockSyncReceivableForOrder(...args),
}))

vi.mock("@/lib/services/timeline.service", () => ({
  logAuditEvent: (...args: any[]) => mockLogAuditEvent(...args),
}))

vi.mock("@/lib/utils/revalidation", () => ({
  revalidateOrderHistory: (...args: any[]) => mockRevalidateOrderHistory(...args),
}))

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  captureError: vi.fn(),
}))

import { POST } from "./route"

describe("POST /api/orders/confirm-deposit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUser.mockResolvedValue({ id: "user_1" })
    mockRequirePermission.mockResolvedValue(undefined)
    mockRequireStorePermission.mockResolvedValue(undefined)
    mockFulfillMarketplaceOrder.mockResolvedValue({
      success: true,
      result: { appointmentIds: ["appt_1"] },
    })
    mockCreateFinancialTransactions.mockResolvedValue(undefined)
    mockSyncReceivableForOrder.mockResolvedValue(undefined)
    mockLogAuditEvent.mockResolvedValue(undefined)
    mockRevalidateOrderHistory.mockResolvedValue(undefined)
  })

  it("triggers marketplace fulfillment (appointment creation) when manually confirming a pending deposit", async () => {
    const order = {
      id: "order_1",
      order_number: "PED-100",
      situation: "pending",
      partner_id: "partner_1",
      store_id: "store_1",
      total_amount: 200,
      paid_amount: 0,
      amount_paid: 0,
      payment_breakdown: [],
      checkout_fulfillment: {
        depositCheckout: {
          usesDeposit: true,
          payDepositOnly: true,
          depositAmount: 50,
          initialChargeAmount: 50,
          depositStatus: "pending",
          sinalPaid: false,
        },
        lines: [
          {
            itemType: "service_booking",
            serviceId: "svc_1",
            unitPrice: 200,
            quantity: 1,
            payDepositOnly: true,
            depositAmount: 50,
            bookingMetadata: {
              serviceName: "Corte",
              staffId: "staff_1",
              staffName: "Ana",
              date: "2026-12-01",
              time: "10:00",
              durationMinutes: 60,
            },
          },
        ],
      },
      payment_expires_at: null,
      mp_payment_id: "mp_123",
      payment_method: "Pix (Mercado Pago)",
      payment_provider: "Mercado Pago",
      customer_id: "cust_1",
      buyer_id: "buyer_1",
      customer_name: "João",
      finance_account_id: "acc_1",
      order_source: "Vitrine Online",
    }

    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: order, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: mockUpdateEq,
            }),
          }
        }
        return {}
      }),
    }
    mockCreateAdminClient.mockReturnValue(mockAdminClient)

    const request = new NextRequest("http://localhost/api/orders/confirm-deposit", {
      method: "POST",
      body: JSON.stringify({ orderId: "order_1" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.alreadyConfirmed).toBe(false)
    expect(json.situation).toBe("partially_paid")
    expect(json.paidAmount).toBe(50)
    expect(mockFulfillMarketplaceOrder).toHaveBeenCalledWith(mockAdminClient, "order_1", { force: true })
    expect(mockSyncReceivableForOrder).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/erp/agendamentos")
  })

  it("ensures fulfillment runs idempotently when deposit was already confirmed", async () => {
    const order = {
      id: "order_2",
      order_number: "PED-200",
      situation: "partially_paid",
      partner_id: "partner_1",
      store_id: null,
      total_amount: 200,
      paid_amount: 50,
      amount_paid: 50,
      payment_breakdown: [],
      checkout_fulfillment: {
        depositCheckout: {
          usesDeposit: true,
          payDepositOnly: true,
          depositAmount: 50,
          initialChargeAmount: 50,
          depositStatus: "paid",
          sinalPaid: true,
        },
      },
      payment_expires_at: null,
      mp_payment_id: "mp_456",
      payment_method: "Pix (Mercado Pago)",
      payment_provider: "Mercado Pago",
      customer_id: "cust_1",
      buyer_id: "buyer_1",
      customer_name: "Maria",
      finance_account_id: "acc_1",
      order_source: "Vitrine Online",
    }

    const mockAdminClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: order, error: null }),
          }),
        }),
      })),
    }
    mockCreateAdminClient.mockReturnValue(mockAdminClient)

    const request = new NextRequest("http://localhost/api/orders/confirm-deposit", {
      method: "POST",
      body: JSON.stringify({ orderId: "order_2" }),
      headers: { "Content-Type": "application/json" },
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.alreadyConfirmed).toBe(true)
    expect(mockFulfillMarketplaceOrder).toHaveBeenCalledWith(mockAdminClient, "order_2")
  })
})
