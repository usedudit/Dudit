import { describe, it, expect, vi } from "vitest"
import { fulfillMarketplaceOrder } from "./marketplace-checkout-fulfillment"

describe("fulfillMarketplaceOrder", () => {
  it("skips non-marketplace orders (manual orders) without creating any appointments or fulfillments", async () => {
    const mockOrder = {
      id: "order_manual_123",
      partner_id: "partner_1",
      store_id: "store_1",
      situation: "paid",
      customer_id: "cust_1",
      checkout_fulfillment: null,
      order_source: "Manual",
      finance_account_id: "acc_1",
      customer_name: "Cliente Manual",
      delivery_type: "pickup",
      delivery_address: null,
      payment_method: "Pix",
      paid_amount: 150,
      amount_paid: 150,
      total_amount: 150,
      delivery_fee: 0,
      delivery_breakdown: null,
      seller_partner_user_id: null,
      created_at: new Date().toISOString(),
    }

    const mockInsert = vi.fn()
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return { select: mockSelect }
        }
        if (table === "appointments") {
          return {
            insert: mockInsert,
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        if (table === "checkout_fulfillments") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: mockInsert,
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          insert: mockInsert,
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as any

    const result = await fulfillMarketplaceOrder(mockSupabase, "order_manual_123")

    expect(result).toEqual({ success: true, skipped: true })
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
