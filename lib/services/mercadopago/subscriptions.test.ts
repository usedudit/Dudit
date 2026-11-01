import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Global fetch mock + DB chain (hoisted for vi.mock factories) ────────────
const { fetchMock, mockUpdate, mockMaybeSingle, mockInsert, chain, mockAdmin } = vi.hoisted(() => {
  const fetchMock = vi.fn()

  const mockUpdate = vi.fn()
  const mockMaybeSingle = vi.fn()
  const mockInsert = vi.fn()

  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = mockMaybeSingle
  chain.update = mockUpdate.mockReturnValue(chain)
  chain.insert = mockInsert.mockReturnValue(chain)

  const mockAdmin = { from: vi.fn().mockReturnValue(chain) }

  return { fetchMock, mockUpdate, mockMaybeSingle, mockInsert, chain, mockAdmin }
})

global.fetch = fetchMock as any

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockAdmin,
}))

vi.mock("@/lib/services/subscription.service", () => ({
  getPartnerSubscription: vi.fn(),
  getPlanById: vi.fn(),
  invalidatePartnerPlanCache: vi.fn(),
  getFreePlan: vi.fn(),
}))

vi.mock("@/lib/subscription/plan-tier", () => ({
  planTierIndex: (slug: string) => ["free", "crescer", "escalar"].indexOf(slug),
}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/security/audit-logger", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/billing/audit", () => ({
  logBillingAudit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/billing/sync-subscription", () => ({
  syncSubscriptionToBilling: vi.fn().mockResolvedValue({ purchaseId: null, created: false }),
}))

vi.mock("@/lib/services/subscription-archiver.service", () => ({
  enforcePlanLimitsAndArchiveExcess: vi.fn().mockResolvedValue(undefined),
}))

import { updateMpSubscription } from "./subscriptions"
import { getPartnerSubscription, getPlanById } from "@/lib/services/subscription.service"

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUTURE_END = new Date(Date.now() + 30 * 86_400_000).toISOString()

function resetFetch() {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  } as any)
}

function makeCurrentSub(planSlug: string, price: number) {
  return {
    id: "sub-escalar",
    partner_id: "partner-1",
    status: "active",
    plan_id: "plan-" + planSlug,
    billing_email: "partner@example.com",
    current_period_end: FUTURE_END,
    cancel_at_period_end: false,
    pending_plan_id: null,
    mercado_pago_subscription_id: "preapp-123",
    plan: {
      id: "plan-" + planSlug,
      name: planSlug === "escalar" ? "Escalar" : "Crescer",
      slug: planSlug,
      price,
      limits_json: {},
      features_json: [],
      is_active: true,
      sort_order: planSlug === "escalar" ? 2 : 1,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Empty client id forces the platform token to be a placeholder (no token fetch).
  process.env.MP_SUBSCRIPTION_CLIENT_ID = ""
  process.env.MP_SUBSCRIPTION_CLIENT_SECRET = ""
  resetFetch()
})

afterEach(() => {
  delete process.env.MP_SUBSCRIPTION_CLIENT_ID
  delete process.env.MP_SUBSCRIPTION_CLIENT_SECRET
})

/** Find the update payload written for `updateMpSubscription`'s final DB write,
 *  i.e. the one carrying `pending_plan_id === newPlanId`. */
function findFinalUpdate(newPlanId: string): Record<string, any> {
  const updateCalls = mockUpdate.mock.calls.filter(
    (c: any[]) => c[0]?.pending_plan_id === newPlanId,
  )
  expect(updateCalls.length).toBeGreaterThan(0)
  return updateCalls[0][0] as Record<string, any>
}

/** Find the PUT sent to the Mercado Pago preapproval endpoint. */
function findPreapprovalPut() {
  const call = fetchMock.mock.calls.find(
    (c: any[]) => String(c[0]).includes("/preapproval/preapp-123"),
  )
  expect(call).toBeDefined()
  return call as any[]
}

// ── Downgrade, paid → paid (future period) ──────────────────────────────────

describe("updateMpSubscription — downgrade paid → paid", () => {
  it("PUTs the new amount on the preapproval and schedules on the same row", async () => {
    const currentSub = makeCurrentSub("escalar", 49.9)
    const newPlan = {
      id: "plan-crescer",
      name: "Crescer",
      slug: "crescer",
      price: 19.9,
      is_active: true,
      limits_json: {},
      features_json: [],
      sort_order: 1,
    }

    vi.mocked(getPartnerSubscription).mockResolvedValue(currentSub as any)
    vi.mocked(getPlanById).mockResolvedValue(newPlan as any)

    const result = await updateMpSubscription("partner-1", "plan-crescer", "user-1")

    expect(result.success).toBe(true)
    expect(result.type).toBe("downgrade")

    // The preapproval amount was updated via PUT (not a new preapproval).
    const putCall = findPreapprovalPut()
    expect(putCall[1].method).toBe("PUT")
    const body = JSON.parse(putCall[1].body)
    expect(body.auto_recurring.transaction_amount).toBe(19.9)
    expect(body.auto_recurring.currency_id).toBe("BRL")

    // The SAME preapproval id is kept on the row (no cancellation happened).
    const update = findFinalUpdate("plan-crescer")
    expect(update.pending_plan_id).toBe("plan-crescer")
    expect(update.cancel_at_period_end).toBe(false)
    expect(update.status).toBeUndefined() // row stays active
  })
})

// ── Downgrade, paid → free (future period) ──────────────────────────────────

describe("updateMpSubscription — downgrade paid → free", () => {
  it("cancels the preapproval and writes cancel_at_period_end: true", async () => {
    const currentSub = makeCurrentSub("crescer", 19.9)
    const newPlan = {
      id: "plan-free",
      name: "Começar",
      slug: "free",
      price: 0,
      is_active: true,
      limits_json: {},
      features_json: [],
      sort_order: 0,
    }

    vi.mocked(getPartnerSubscription).mockResolvedValue(currentSub as any)
    vi.mocked(getPlanById).mockResolvedValue(newPlan as any)
    // cancelMpSubscription reads the sub back from the DB layer.
    mockMaybeSingle.mockResolvedValue({ data: currentSub, error: null })

    const result = await updateMpSubscription("partner-1", "plan-free", "user-1")

    expect(result.success).toBe(true)
    expect(result.type).toBe("downgrade")

    // The preapproval was cancelled (status: cancelled), not re-priced.
    const putCall = findPreapprovalPut()
    expect(putCall[1].method).toBe("PUT")
    const body = JSON.parse(putCall[1].body)
    expect(body.status).toBe("cancelled")

    // The final scheduling update marks the contract to end at period end.
    const update = findFinalUpdate("plan-free")
    expect(update.pending_plan_id).toBe("plan-free")
    expect(update.cancel_at_period_end).toBe(true)
  })
})
