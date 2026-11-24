import { describe, it, expect, vi, beforeEach } from "vitest"

const mockPartnerAddonsState: Record<string, any> = {}
let mockPartnerPlanSlug = "crescer"

const mockCancelMpPreapproval = vi.fn().mockResolvedValue({ success: true })
const mockGetMpPlatformAccessToken = vi.fn().mockResolvedValue("mp-test-token")
const mockRecordAddonBundleCharge = vi.fn().mockResolvedValue({
  purchaseId: "purchase-1",
  paymentId: "pay-1",
  createdPurchase: true,
})

vi.mock("server-only", () => ({}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/services/subscription.service", () => ({
  getPartnerPlan: vi.fn(async () => ({ slug: mockPartnerPlanSlug })),
}))

vi.mock("@/lib/services/mercadopago/subscriptions", () => ({
  getMpPlatformAccessToken: (...args: any[]) => mockGetMpPlatformAccessToken(...args),
  getMpSubscriptionStatus: vi.fn(),
  cancelMpPreapproval: (...args: any[]) => mockCancelMpPreapproval(...args),
}))

vi.mock("@/lib/billing/record-addon-charge", () => ({
  recordAddonBundleCharge: (...args: any[]) => mockRecordAddonBundleCharge(...args),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === "partner_addons") {
        return {
          select: () => {
            const filters: Record<string, any> = {}
            const builder: any = {
              eq: (col: string, val: any) => {
                filters[col] = val
                return builder
              },
              or: () => builder,
              maybeSingle: async () => {
                const key = `${filters.partner_id}:${filters.addon_slug}`
                const row = mockPartnerAddonsState[key] || null
                return { data: row, error: null }
              },
              then: (resolve: any) => {
                const rows = Object.values(mockPartnerAddonsState).filter((r: any) => {
                  if (filters.partner_id && r.partner_id !== filters.partner_id) return false
                  if (filters.mp_preapproval_id && r.mp_preapproval_id !== filters.mp_preapproval_id) return false
                  return true
                })
                return Promise.resolve({ data: rows, error: null }).then(resolve)
              },
            }
            return builder
          },
          upsert: async (payload: any) => {
            const key = `${payload.partner_id}:${payload.addon_slug}`
            mockPartnerAddonsState[key] = { ...(mockPartnerAddonsState[key] || {}), ...payload }
            return { error: null }
          },
        }
      }

      if (table === "partners") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { business_info: {} }, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }
    },
  }),
}))

import {
  createAddonMpSubscription,
  cancelAddonMpSubscription,
  cancelPartnerAddonSubscriptionsForPlanInclusion,
  syncAddonSubscriptionFromMp,
} from "./addon.service"

describe("Consolidated Add-on Billing & Escalar Cancellation", () => {
  const partnerId = "11111111-1111-1111-1111-111111111111"
  const futurePeriodEnd = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString()

  beforeEach(() => {
    for (const k of Object.keys(mockPartnerAddonsState)) {
      delete mockPartnerAddonsState[k]
    }
    mockPartnerPlanSlug = "crescer"
    mockCancelMpPreapproval.mockClear()
    mockRecordAddonBundleCharge.mockClear()
    vi.restoreAllMocks()
  })

  it("creates 1 consolidated MP preapproval for the 1st add-on (R$ 4.99)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "mp-bundle-1",
        status: "pending",
        init_point: "https://mp.test/checkout/1",
      }),
    } as any)

    const res = await createAddonMpSubscription(partnerId, "cart_abandonment", "owner@test.com")

    expect(res.success).toBe(true)
    expect(res.initPoint).toBe("https://mp.test/checkout/1")
    expect(res.mpPreapprovalId).toBe("mp-bundle-1")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.mercadopago.com/preapproval")
    expect(init?.method).toBe("POST")
    const body = JSON.parse(String(init?.body))
    expect(body.external_reference).toBe(`addon_bundle:${partnerId}`)
    expect(body.auto_recurring.transaction_amount).toBe(4.99)
  })

  it("updates the existing MP preapproval via PUT to R$ 9.98 when adding a 2nd add-on", async () => {
    mockPartnerAddonsState[`${partnerId}:cart_abandonment`] = {
      partner_id: partnerId,
      addon_slug: "cart_abandonment",
      is_enabled: true,
      subscription_status: "active",
      mp_preapproval_id: "mp-bundle-1",
      billing_email: "owner@test.com",
      current_period_start: new Date().toISOString(),
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
    }

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "mp-bundle-1", status: "authorized" }),
    } as any)

    const res = await createAddonMpSubscription(partnerId, "order_bump", "owner@test.com")

    expect(res.success).toBe(true)
    expect(res.addedToExistingBundle).toBe(true)
    expect(res.newMonthlyTotal).toBe(9.98)
    expect(res.mpPreapprovalId).toBe("mp-bundle-1")
    expect(res.initPoint).toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.mercadopago.com/preapproval/mp-bundle-1")
    expect(init?.method).toBe("PUT")
    const body = JSON.parse(String(init?.body))
    expect(body.auto_recurring.transaction_amount).toBe(9.98)

    expect(mockPartnerAddonsState[`${partnerId}:order_bump`].subscription_status).toBe("active")
    expect(mockPartnerAddonsState[`${partnerId}:order_bump`].mp_preapproval_id).toBe("mp-bundle-1")
  })

  it("reduces MP preapproval amount to R$ 4.99 when cancelling 1 of 2 add-ons (without cancelling MP preapproval)", async () => {
    mockPartnerAddonsState[`${partnerId}:cart_abandonment`] = {
      partner_id: partnerId,
      addon_slug: "cart_abandonment",
      is_enabled: true,
      subscription_status: "active",
      mp_preapproval_id: "mp-bundle-1",
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
    }
    mockPartnerAddonsState[`${partnerId}:order_bump`] = {
      partner_id: partnerId,
      addon_slug: "order_bump",
      is_enabled: true,
      subscription_status: "active",
      mp_preapproval_id: "mp-bundle-1",
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
    }

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "mp-bundle-1" }),
    } as any)

    const res = await cancelAddonMpSubscription(partnerId, "order_bump")

    expect(res.success).toBe(true)
    expect(mockCancelMpPreapproval).not.toHaveBeenCalled()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.mercadopago.com/preapproval/mp-bundle-1")
    expect(init?.method).toBe("PUT")
    expect(JSON.parse(String(init?.body)).auto_recurring.transaction_amount).toBe(4.99)

    // Cancelled add-on is detached from bundle, other add-on remains active
    expect(mockPartnerAddonsState[`${partnerId}:order_bump`].subscription_status).toBe("cancelled")
    expect(mockPartnerAddonsState[`${partnerId}:order_bump`].mp_preapproval_id).toBeNull()
    expect(mockPartnerAddonsState[`${partnerId}:cart_abandonment`].subscription_status).toBe("active")
  })

  it("cancels the MP preapproval when cancelling the last active add-on", async () => {
    mockPartnerAddonsState[`${partnerId}:cart_abandonment`] = {
      partner_id: partnerId,
      addon_slug: "cart_abandonment",
      is_enabled: true,
      subscription_status: "active",
      mp_preapproval_id: "mp-bundle-1",
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
    }

    const res = await cancelAddonMpSubscription(partnerId, "cart_abandonment")

    expect(res.success).toBe(true)
    expect(mockCancelMpPreapproval).toHaveBeenCalledTimes(1)
    expect(mockCancelMpPreapproval).toHaveBeenCalledWith("mp-bundle-1")
  })

  it("cancels add-on preapprovals immediately on Escalar upgrade and ignores late cancelled webhook echo", async () => {
    mockPartnerAddonsState[`${partnerId}:cart_abandonment`] = {
      partner_id: partnerId,
      addon_slug: "cart_abandonment",
      is_enabled: true,
      subscription_status: "active",
      mp_preapproval_id: "mp-bundle-1",
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
    }
    mockPartnerAddonsState[`${partnerId}:order_bump`] = {
      partner_id: partnerId,
      addon_slug: "order_bump",
      is_enabled: true,
      subscription_status: "active",
      mp_preapproval_id: "mp-bundle-1",
      current_period_end: futurePeriodEnd,
      cancel_at_period_end: false,
    }

    const res = await cancelPartnerAddonSubscriptionsForPlanInclusion(partnerId)

    expect(res.cancelledCount).toBe(2)
    expect(res.cancelledPreapprovalIds).toEqual(["mp-bundle-1"])
    expect(mockCancelMpPreapproval).toHaveBeenCalledTimes(1)
    expect(mockCancelMpPreapproval).toHaveBeenCalledWith("mp-bundle-1")
    expect(mockPartnerAddonsState[`${partnerId}:cart_abandonment`].is_enabled).toBe(true)
    expect(mockPartnerAddonsState[`${partnerId}:cart_abandonment`].mp_preapproval_id).toBeNull()

    // Simulate late Mercado Pago "cancelled" webhook echo
    await syncAddonSubscriptionFromMp({
      mpPreapprovalId: "mp-bundle-1",
      externalReference: `addon_bundle:${partnerId}`,
      mpStatus: "cancelled",
    })

    // Add-ons must remain enabled for the Escalar plan
    expect(mockPartnerAddonsState[`${partnerId}:cart_abandonment`].is_enabled).toBe(true)
    expect(mockPartnerAddonsState[`${partnerId}:order_bump`].is_enabled).toBe(true)
  })
})
