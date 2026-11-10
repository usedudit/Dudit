import { describe, it, expect, vi, beforeEach } from "vitest"
import { getSubscriptionStatusAction, getSubscriptionPaymentUrlAction } from "./subscriptions"

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
  PAST_DUE_GRACE_PERIOD_DAYS: 3,
}))

vi.mock("@/lib/billing/subscription-period", () => ({
  computeSubscriptionPeriods: vi.fn(),
}))

vi.mock("@/lib/services/mercadopago/subscriptions", () => ({
  createMpSubscription: vi.fn(),
  cancelMpSubscription: vi.fn(),
  cancelPendingPlanChangeAttempts: vi.fn(),
  ensurePendingInvoiceForCheckout: vi.fn().mockResolvedValue(undefined),
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
      price: 29.9,
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
      plan: { id: "plan-crescer", name: "Crescer", slug: "crescer", price: 29.9 },
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
    expect(res.data.next_invoice.amount).toBe(29.9)
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
      plan: { id: "plan-crescer", name: "Crescer", slug: "crescer", price: 29.9 },
    } as any)

    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.subscription.payment_url).toBeFalsy()
  })
})

describe("getSubscriptionStatusAction — pending plan change", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Effective plan stays the current paid one until the change is paid.
    vi.mocked(getPartnerPlan).mockResolvedValue({
      id: "plan-crescer",
      name: "Crescer",
      slug: "crescer",
      price: 29.9,
      limits_json: {},
      features_json: ["mercado_pago_checkout"],
      is_active: true,
      sort_order: 1,
    } as any)

    vi.mocked(getPartnerSubscription).mockResolvedValue({
      id: "sub-active",
      status: "active",
      billing_email: "partner@example.com",
      current_period_start: "2026-10-30T03:00:00.000Z",
      current_period_end: "2026-11-30T03:00:00.000Z",
      cancel_at_period_end: false,
      pending_plan_id: null,
      trial_end: null,
      payment_provider: "mercado_pago",
      mercado_pago_subscription_id: null,
      plan: { id: "plan-crescer", name: "Crescer", slug: "crescer", price: 29.9 },
    } as any)

    vi.mocked(getUsageCounters).mockResolvedValue({} as any)
    vi.mocked(computeSubscriptionPeriods).mockReturnValue({
      periodStart: new Date("2026-10-30T03:00:00.000Z"),
      periodEnd: new Date("2026-11-30T03:00:00.000Z"),
      nextStart: new Date("2026-11-30T03:00:00.000Z"),
      nextEnd: new Date("2026-12-30T03:00:00.000Z"),
    })
  })

  it("surfaces the latest unfinished upgrade as pending_change without touching the active plan", async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({
        data: {
          id: "sub-pending",
          plan_id: "plan-escalar",
          status: "pending",
          created_at: new Date().toISOString(),
          billing_email: "partner@example.com",
          mercado_pago_subscription_id: null,
          plan: { id: "plan-escalar", name: "Escalar", slug: "escalar", price: 49.9 },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "purchase-pending",
          status: "pending",
          billing_period_start: "2026-10-31T03:00:00.000Z",
          billing_period_end: "2026-11-30T03:00:00.000Z",
          total_amount: 49.9,
          invoice_id: "invoice-pending",
          billing_invoices: [
            { id: "invoice-pending", invoice_number: "INV-2026-000042", status: "issued" },
          ],
        },
        error: null,
      })

    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.subscription.status).toBe("active")
    expect(res.data.pending_change).not.toBeNull()
    expect(res.data.pending_change.plan_name).toBe("Escalar")
    expect(res.data.pending_change.amount).toBe(49.9)
    expect(res.data.pending_change.status).toBe("pending")
    expect(res.data.pending_change.invoice.invoice_number).toBe("INV-2026-000042")
    expect(res.data.pending_change.invoice.amount).toBe(49.9)
  })

  it("never reports a free plan as a pending payment", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "sub-pending-free",
        plan_id: "plan-free",
        status: "pending",
        created_at: "2026-10-31T12:00:00.000Z",
        billing_email: "partner@example.com",
        mercado_pago_subscription_id: null,
        plan: { id: "plan-free", name: "Começar", slug: "free", price: 0 },
      },
      error: null,
    })

    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.pending_change).toBeNull()
  })

  it("auto-cancels a pending upgrade attempt that has been abandoned for more than 3 days", async () => {
    const staleDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "sub-stale-pending",
        plan_id: "plan-escalar",
        status: "pending",
        created_at: staleDate,
        billing_email: "partner@example.com",
        plan: { id: "plan-escalar", name: "Escalar", slug: "escalar", price: 49.9 },
      },
      error: null,
    })

    const res: any = await getSubscriptionStatusAction()

    expect(res.success).toBe(true)
    expect(res.data.pending_change).toBeNull()
    const { cancelPendingPlanChangeAttempts } = await import("@/lib/services/mercadopago/subscriptions")
    expect(cancelPendingPlanChangeAttempts).toHaveBeenCalledWith("partner-1")
  })
})

describe("getSubscriptionPaymentUrlAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getPartnerPlan).mockResolvedValue({ id: "plan-1", name: "Crescer", slug: "crescer", price: 29.9, sort_order: 1 } as any)
    vi.mocked(getPartnerSubscription).mockResolvedValue(null as any)
    vi.mocked(getUsageCounters).mockResolvedValue({} as any)
    vi.mocked(computeSubscriptionPeriods).mockReturnValue({
      periodStart: new Date("2026-10-30T03:00:00.000Z"),
      periodEnd: new Date("2026-11-30T03:00:00.000Z"),
      nextStart: new Date("2026-11-30T03:00:00.000Z"),
      nextEnd: new Date("2026-12-30T03:00:00.000Z"),
    })

    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "sub-1",
        status: "pending",
        cancel_at_period_end: false,
        mercado_pago_subscription_id: "preapproval-123",
      },
      error: null,
    })
  })

  it("returns the MP checkout init_point for a pending subscription with preapproval", async () => {
    vi.mocked(getMpSubscriptionStatus).mockResolvedValue({
      status: "pending",
      init_point: "https://mp.test/checkout/p123",
    } as any)

    const res: any = await getSubscriptionPaymentUrlAction("sub-1")

    expect(res.success).toBe(true)
    expect(res.data.payment_url).toBe("https://mp.test/checkout/p123")
  })

  it("returns null payment_url when the subscription has no MP preapproval", async () => {
    vi.mocked(getMpSubscriptionStatus).mockResolvedValue({ status: "pending" } as any)
    mockMaybeSingle.mockResolvedValue({
      data: { id: "sub-1", status: "pending", cancel_at_period_end: false, mercado_pago_subscription_id: null },
      error: null,
    })

    const res: any = await getSubscriptionPaymentUrlAction("sub-1")

    expect(res.success).toBe(true)
    expect(res.data.payment_url).toBeNull()
  })

  it("returns null payment_url when the subscription is scheduled to cancel", async () => {
    vi.mocked(getMpSubscriptionStatus).mockResolvedValue({ status: "active", init_point: "https://mp.test/x" } as any)
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "sub-1",
        status: "active",
        cancel_at_period_end: true,
        mercado_pago_subscription_id: "preapproval-123",
      },
      error: null,
    })

    const res: any = await getSubscriptionPaymentUrlAction("sub-1")

    expect(res.success).toBe(true)
    expect(res.data.payment_url).toBeNull()
  })

  it("returns null payment_url for a cancelled plan-change attempt", async () => {
    vi.mocked(getMpSubscriptionStatus).mockResolvedValue({ status: "cancelled", init_point: "https://mp.test/x" } as any)
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "sub-1",
        status: "cancelled",
        cancel_at_period_end: false,
        mercado_pago_subscription_id: "preapproval-123",
      },
      error: null,
    })

    const res: any = await getSubscriptionPaymentUrlAction("sub-1")

    expect(res.success).toBe(true)
    expect(res.data.payment_url).toBeNull()
  })
})
