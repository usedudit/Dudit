import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock state (hoisted so vi.mock factories can reference it) ──────────────
const { mockUpdate, mockMaybeSingle, chain, mockAdmin } = vi.hoisted(() => {
  const mockUpdate = vi.fn()
  const mockMaybeSingle = vi.fn()

  // Singleton chain: `from()` always returns the same chain so `.update().eq()`
  // resolves correctly and call assertions are shared across all branches.
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = mockMaybeSingle
  chain.update = mockUpdate.mockReturnValue(chain)

  const mockAdmin = { from: vi.fn().mockReturnValue(chain) }
  return { mockUpdate, mockMaybeSingle, chain, mockAdmin }
})

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockAdmin,
}))

vi.mock("@/lib/services/subscription.service", () => ({
  getPlanById: vi.fn(),
  invalidatePartnerPlanCache: vi.fn(),
}))

vi.mock("./subscription-period", () => ({
  computeSubscriptionPeriods: vi.fn(),
}))

vi.mock("./audit", () => ({
  logBillingAudit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("./sync-subscription", () => ({
  syncSubscriptionToBilling: vi.fn().mockResolvedValue({ purchaseId: null, created: false }),
}))

vi.mock("@/lib/services/mercadopago/subscriptions", () => ({
  cancelMpPreapproval: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/services/subscription-archiver.service", () => ({
  enforcePlanLimitsAndArchiveExcess: vi.fn().mockResolvedValue(undefined),
}))

import {
  hasScheduledPlanChange,
  scheduledChangeKind,
  isScheduledPlanChangeDue,
  shouldKeepScheduledAccess,
  applyScheduledPlanChange,
} from "./plan-change"
import { getPlanById } from "@/lib/services/subscription.service"
import { computeSubscriptionPeriods } from "@/lib/billing/subscription-period"

// ── Fixed fixtures (avoid Date.now() timing races) ──────────────────────────

const PERIOD_END_RUNNING = "2099-12-31T23:59:59.000Z" // still running today
const PERIOD_END_EXPIRED = "1999-01-01T00:00:00.000Z" // already ended today
const NOW = new Date("2025-06-01T00:00:00.000Z")

function makeSub(overrides: Record<string, any> = {}) {
  return {
    id: "sub-1",
    partner_id: "partner-1",
    plan_id: "plan-crescer",
    status: "active",
    cancel_at_period_end: false,
    pending_plan_id: null,
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: PERIOD_END_RUNNING,
    mercado_pago_subscription_id: "preapproval-123",
    ...overrides,
  }
}

function loadSubscription(row: Record<string, any>) {
  mockMaybeSingle.mockResolvedValue({ data: row, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Pure helpers ────────────────────────────────────────────────────────────

describe("hasScheduledPlanChange", () => {
  it("returns true when pending_plan_id is set", () => {
    expect(hasScheduledPlanChange({ pending_plan_id: "plan-1", cancel_at_period_end: false })).toBe(true)
  })

  it("returns true when cancel_at_period_end is set", () => {
    expect(hasScheduledPlanChange({ pending_plan_id: null, cancel_at_period_end: true })).toBe(true)
  })

  it("returns false when neither is set", () => {
    expect(hasScheduledPlanChange({ pending_plan_id: null, cancel_at_period_end: false })).toBe(false)
  })
})

describe("scheduledChangeKind", () => {
  it("returns plan_change when pending_plan_id is set", () => {
    expect(scheduledChangeKind({ pending_plan_id: "plan-1", cancel_at_period_end: false })).toBe("plan_change")
  })

  it("returns cancellation when only cancel_at_period_end is set", () => {
    expect(scheduledChangeKind({ pending_plan_id: null, cancel_at_period_end: true })).toBe("cancellation")
  })

  it("returns null when nothing is scheduled", () => {
    expect(scheduledChangeKind({ pending_plan_id: null, cancel_at_period_end: false })).toBe(null)
  })
})

describe("isScheduledPlanChangeDue", () => {
  it("returns true when the period ended", () => {
    const sub = makeSub({ current_period_end: PERIOD_END_EXPIRED, pending_plan_id: "plan-free" })
    expect(isScheduledPlanChangeDue(sub, NOW)).toBe(true)
  })

  it("returns false when the period is still running", () => {
    const sub = makeSub({ current_period_end: PERIOD_END_RUNNING, pending_plan_id: "plan-free" })
    expect(isScheduledPlanChangeDue(sub, NOW)).toBe(false)
  })

  it("returns false when nothing is scheduled", () => {
    const sub = makeSub({ current_period_end: PERIOD_END_EXPIRED })
    expect(isScheduledPlanChangeDue(sub, NOW)).toBe(false)
  })

  it("returns false for past_due rows", () => {
    const sub = makeSub({ status: "past_due", current_period_end: PERIOD_END_EXPIRED, pending_plan_id: "plan-free" })
    expect(isScheduledPlanChangeDue(sub, NOW)).toBe(false)
  })
})

describe("shouldKeepScheduledAccess", () => {
  it("returns false when the target is not cancelled", () => {
    expect(shouldKeepScheduledAccess(makeSub(), "active", NOW)).toBe(false)
  })

  it("returns false when there is no scheduled change", () => {
    expect(shouldKeepScheduledAccess(makeSub({ current_period_end: PERIOD_END_RUNNING }), "cancelled", NOW)).toBe(false)
  })

  it("returns true when cancelled event arrives and the paid cycle is still running", () => {
    const sub = makeSub({ cancel_at_period_end: true, current_period_end: PERIOD_END_RUNNING })
    expect(shouldKeepScheduledAccess(sub, "cancelled", NOW)).toBe(true)
  })

  it("returns false when the cycle already ended", () => {
    const sub = makeSub({ cancel_at_period_end: true, current_period_end: PERIOD_END_EXPIRED })
    expect(shouldKeepScheduledAccess(sub, "cancelled", NOW)).toBe(false)
  })

  it("returns true for pending_plan_id downgrade whose cycle still runs", () => {
    const sub = makeSub({ pending_plan_id: "plan-free", current_period_end: PERIOD_END_RUNNING })
    expect(shouldKeepScheduledAccess(sub, "cancelled", NOW)).toBe(true)
  })
})

// ── applyScheduledPlanChange ─────────────────────────────────────────────────

describe("applyScheduledPlanChange", () => {
  it("is a no-op when the scheduled change is not yet due", async () => {
    const row = makeSub({ pending_plan_id: "plan-escalar", current_period_end: PERIOD_END_RUNNING })
    loadSubscription(row)

    const result = await applyScheduledPlanChange("sub-1", NOW)

    expect(result.applied).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("does nothing when the subscription is not found", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "not found" } })

    const result = await applyScheduledPlanChange("sub-1", NOW)

    expect(result.applied).toBe(false)
    expect(result.kind).toBe(null)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rotates the plan on the SAME row for a paid → paid downgrade (keeps MP id)", async () => {
    const nextPlan = {
      id: "plan-escalar",
      name: "Escalar",
      slug: "escalar",
      price: 49.9,
      is_active: true,
      limits_json: {},
      features_json: [],
      sort_order: 2,
    }
    vi.mocked(getPlanById).mockResolvedValue(nextPlan as any)
    vi.mocked(computeSubscriptionPeriods).mockReturnValue({
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-01T00:00:00.000Z"),
      nextStart: new Date("2026-11-01T00:00:00.000Z"),
      nextEnd: new Date("2026-12-01T00:00:00.000Z"),
    })

    const row = makeSub({
      pending_plan_id: "plan-escalar",
      current_period_end: PERIOD_END_EXPIRED,
    })
    loadSubscription(row)

    const result = await applyScheduledPlanChange("sub-1", NOW)

    expect(result.applied).toBe(true)
    expect(result.kind).toBe("plan_change")
    expect(result.nextPlanId).toBe("plan-escalar")

    const updateCall = mockUpdate.mock.calls[0]
    expect(updateCall[0].plan_id).toBe("plan-escalar")
    expect(updateCall[0].pending_plan_id).toBeNull()
    expect(updateCall[0].cancel_at_period_end).toBe(false)
    // Same row keeps the preapproval id (paid target): the field is intentionally
    // NOT in the update payload, so Supabase leaves the existing value untouched.
    expect(updateCall[0].mercado_pago_subscription_id).toBeUndefined()
    // Targeted the right subscription.
    const lastEq = chain.eq.mock.calls.at(-1)
    expect(lastEq).toEqual(["id", "sub-1"])
  })

  it("clears the MP id when rotating to a free plan", async () => {
    const nextPlan = {
      id: "plan-free",
      name: "Começar",
      slug: "free",
      price: 0,
      is_active: true,
      limits_json: {},
      features_json: [],
      sort_order: 0,
    }
    vi.mocked(getPlanById).mockResolvedValue(nextPlan as any)
    vi.mocked(computeSubscriptionPeriods).mockReturnValue({
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-11-01T00:00:00.000Z"),
      nextStart: new Date("2026-11-01T00:00:00.000Z"),
      nextEnd: new Date("2026-12-01T00:00:00.000Z"),
    })

    const row = makeSub({
      pending_plan_id: "plan-free",
      current_period_end: PERIOD_END_EXPIRED,
    })
    loadSubscription(row)

    const result = await applyScheduledPlanChange("sub-1", NOW)

    expect(result.applied).toBe(true)
    expect(result.kind).toBe("plan_change")
    expect(result.nextPlanId).toBe("plan-free")

    const updateCall = mockUpdate.mock.calls[0]
    // Free target detaches the preapproval.
    expect(updateCall[0].mercado_pago_subscription_id).toBeNull()
    expect(updateCall[0].plan_id).toBe("plan-free")
  })

  it("applies a cancellation (no pending plan) and flips to cancelled", async () => {
    const row = makeSub({
      pending_plan_id: null,
      cancel_at_period_end: true,
      current_period_end: PERIOD_END_EXPIRED,
    })
    loadSubscription(row)

    const result = await applyScheduledPlanChange("sub-1", NOW)

    expect(result.applied).toBe(true)
    expect(result.kind).toBe("cancellation")
    expect(result.nextPlanId).toBe(null)

    const updateCall = mockUpdate.mock.calls[0]
    expect(updateCall[0].status).toBe("cancelled")
    expect(updateCall[0].cancel_at_period_end).toBe(false)
    expect(updateCall[0].ended_at).toBeTruthy()
    const lastEq = chain.eq.mock.calls.at(-1)
    expect(lastEq).toEqual(["id", "sub-1"])
  })

  it("does not update the row when the scheduled plan is unavailable", async () => {
    vi.mocked(getPlanById).mockResolvedValue(null as any)

    const row = makeSub({
      pending_plan_id: "plan-gone",
      current_period_end: PERIOD_END_EXPIRED,
    })
    loadSubscription(row)

    const result = await applyScheduledPlanChange("sub-1", NOW)

    expect(result.applied).toBe(false)
    expect(result.kind).toBe("plan_change")
    expect(result.nextPlanId).toBe("plan-gone")
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
