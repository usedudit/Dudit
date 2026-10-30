import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSubscriptionStatusAction } from "./subscriptions"

// ── Mock do cliente supabase ───────────────────────────────────────────────
const mockMaybeSingle = vi.fn()
const mockAdmin = {
  from: vi.fn().mockImplementation(() => {
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(chain)
    chain.or = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.single = vi.fn()
    chain.maybeSingle = mockMaybeSingle
    return chain
  }),
  rpc: vi.fn(),
}

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockAdmin,
}))

vi.mock("@/lib/auth/authorization", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  requirePartner: vi.fn().mockResolvedValue({ id: "partner-1" }),
}))

vi.mock("@/lib/services/subscription.service", () => ({
  getPartnerPlan: vi.fn(),
  getPartnerSubscription: vi.fn(),
  getUsageCounters: vi.fn(),
}))

vi.mock("@/lib/billing/subscription-period", () => ({
  computeSubscriptionPeriods: vi.fn(),
}))

vi.mock("@/lib/services/mercadopago/subscriptions", () => ({
  createMpSubscription: vi.fn(),
  cancelMpSubscription: vi.fn(),
  updateMpSubscription: vi.fn(),
  getMpSubscriptionStatus: vi.fn(),
}))

vi.mock("@/lib/services/discord-general-webhook.service", () => ({
  sendPlanChanged: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import mocked modules so we can set their return values.
import { getPartnerPlan, getPartnerSubscription, getUsageCounters } from "@/lib/services/subscription.service"
import { computeSubscriptionPeriods } from "@/lib/billing/subscription-period"
import { getMpSubscriptionStatus } from "@/lib/services/mercadopago/subscriptions"

const PENDING_PURCHASE = {
  id: "purchase-1",
  status: "pending",
  billing_period_start: "2026-10-30T03:00:00.000Z",
  billing_period_end: "2026-11-30T03:00:00.000Z",
  total_amount: 19.9,
  billing_invoices: [
    {
      id: "invoice-1",
      invoice_number: "INV-2026-000030",
      status: "issued",
    },
  ],
}

describe("getSubscriptionStatusAction — pending subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getPartnerPlan).mockResolvedValue({
      id: "plan-crescer",
      name: "Crescer",
      slug: "crescer",
      price: 19.9,
      limits_json: {},
      features_json: ["mercado_pago_checkout"],
      is_active: true,
      sort_order: 1,
    } as any)

    vi.mocked(getPartnerSubscription).mockResolvedValue({
      id: "sub-pending",
      status: "pending",
      billing_email: "partner@example.com",
      current_period_start: "2026-10-30T03:00:00.000Z",
      current_period_end: "2026-11-30T03:00:00.000Z",
      cancel_at_period_end: false,
      pending_plan_id: null,
      trial_end: null,
      payment_provider: "mercado_pago",
      mercado_pago_subscription_id: "preapproval-123",
      plan: { id: "plan-crescer", name: "Crescer", slug: "crescer", price: 19.9 },
    } as any)

    vi.mocked(getUsageCounters).mockResolvedValue({} as any)

    vi.mocked(computeSubscriptionPeriods).mockReturnValue({
      periodStart: new Date("2026-10-30T03:00:00.000Z"),
      periodEnd: new Date("2026-11-30T03:00:00.000Z"),
      nextStart: new Date("2026-11-30T03:00:00.000Z"),
      nextEnd: new Date("2026-12-30T03:00:00.000Z"),
    })

    // The preapproval hasn't authorized the payment yet: status pending,
    // but MP still exposes the checkout init_point.
    vi.mocked(getMpSubscriptionStatus).mockResolvedValue({
      status: "pending",
      init_point: "https://mp.test/checkout/preapproval-123",
    })

    mockMaybeSingle.mockResolvedValue({
      data: PENDING_PURCHASE,
      error: null,
    })
  })

  it("exposes the pending invoice (next_invoice) for a pending subscription", async () => {
    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.subscription.status).toBe("pending")
    expect(res.data.next_invoice).not.toBeNull()
    expect(res.data.next_invoice.invoice_number).toBe("INV-2026-000030")
    expect(res.data.next_invoice.status).toBe("pending")
    expect(res.data.next_invoice.amount).toBe(19.9)
    expect(res.data.next_invoice.period_start).toBe("2026-10-30T03:00:00.000Z")
    expect(res.data.next_invoice.period_end).toBe("2026-11-30T03:00:00.000Z")
  })

  it("surfaces payment_url (MP preapproval checkout) so the UI can re-open the payment flow", async () => {
    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.subscription.payment_url).toBe("https://mp.test/checkout/preapproval-123")
  })

  it("does not surface payment_url when the subscription has no MP preapproval", async () => {
    vi.mocked(getPartnerSubscription).mockResolvedValue({
      id: "sub-pending",
      status: "pending",
      billing_email: "partner@example.com",
      current_period_start: "2026-10-30T03:00:00.000Z",
      current_period_end: "2026-11-30T03:00:00.000Z",
      cancel_at_period_end: false,
      pending_plan_id: null,
      trial_end: null,
      payment_provider: "manual",
      mercado_pago_subscription_id: null,
      plan: { id: "plan-crescer", name: "Crescer", slug: "crescer", price: 19.9 },
    } as any)

    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.subscription.payment_url).toBeFalsy()
  })
})
