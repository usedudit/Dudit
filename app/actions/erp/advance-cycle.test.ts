import { describe, it, expect, vi, beforeEach } from "vitest"
import { advanceRecurringSubscriptionCycleAction } from "./recurring-subscriptions"

const mockRequireRateLimit = vi.fn().mockResolvedValue(undefined)
const mockRequirePermission = vi.fn()
const mockGetSupabaseServerClient = vi.fn()
const mockGetAdminClient = vi.fn()
const mockLogAuditEvent = vi.fn().mockResolvedValue(undefined)
const mockRevalidateTag = vi.fn()

vi.mock("@/lib/security/require-rate-limit", () => ({
  requireRateLimit: (...args: any[]) => mockRequireRateLimit(...args),
}))

vi.mock("@/lib/permissions/access", () => ({
  requirePermission: (...args: any[]) => mockRequirePermission(...args),
}))

vi.mock("@/lib/supabase/request-client", () => ({
  getSupabaseServerClient: () => mockGetSupabaseServerClient(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockGetAdminClient(),
}))

vi.mock("@/lib/services/timeline.service", () => ({
  logAuditEvent: (...args: any[]) => mockLogAuditEvent(...args),
}))

vi.mock("next/cache", () => ({
  revalidateTag: (...args: any[]) => mockRevalidateTag(...args),
}))

describe("advanceRecurringSubscriptionCycleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("blocks non-owners and non-admins (e.g. manager) from anticipating cycle", async () => {
    mockRequirePermission.mockResolvedValue({
      partnerId: "partner-1",
      userId: "user-manager",
      roleId: "manager",
      permissions: {},
    })

    const res = await advanceRecurringSubscriptionCycleAction("partner-1", "sub-123")

    expect(res.success).toBe(false)
    expect(res.error).toBe("Apenas Proprietários e Administradores podem antecipar o ciclo da assinatura.")
    expect(mockGetAdminClient).not.toHaveBeenCalled()
  })

  it("blocks operator and delivery roles from anticipating cycle", async () => {
    mockRequirePermission.mockResolvedValue({
      partnerId: "partner-1",
      userId: "user-op",
      roleId: "operator",
      permissions: {},
    })

    const res = await advanceRecurringSubscriptionCycleAction("partner-1", "sub-123")

    expect(res.success).toBe(false)
    expect(res.error).toBe("Apenas Proprietários e Administradores podem antecipar o ciclo da assinatura.")
  })

  it("rejects when subscription is not found", async () => {
    mockRequirePermission.mockResolvedValue({
      partnerId: "partner-1",
      userId: "user-owner",
      roleId: "owner",
      permissions: {},
    })

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    mockGetSupabaseServerClient.mockResolvedValue({ from: mockFrom })

    const res = await advanceRecurringSubscriptionCycleAction("partner-1", "sub-missing")

    expect(res.success).toBe(false)
    expect(res.error).toBe("Assinatura não encontrada.")
  })

  it("rejects when subscription is not active (e.g. paused or cancelled)", async () => {
    mockRequirePermission.mockResolvedValue({
      partnerId: "partner-1",
      userId: "user-owner",
      roleId: "owner",
      permissions: {},
    })

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sub-1", status: "paused", partner_id: "partner-1" }, error: null }),
    })
    mockGetSupabaseServerClient.mockResolvedValue({ from: mockFrom })

    const res = await advanceRecurringSubscriptionCycleAction("partner-1", "sub-1")

    expect(res.success).toBe(false)
    expect(res.error).toBe("Apenas assinaturas ativas podem ter o ciclo antecipado.")
  })

  it("succeeds for OWNER and invokes advance_recurring_subscription_cycle RPC", async () => {
    mockRequirePermission.mockResolvedValue({
      partnerId: "partner-1",
      userId: "user-owner",
      roleId: "owner",
      permissions: {},
    })

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sub-1", status: "active", partner_id: "partner-1" }, error: null }),
    })
    mockGetSupabaseServerClient.mockResolvedValue({ from: mockFrom })

    const mockRpc = vi.fn().mockResolvedValue({
      data: { execution_id: "exec-new", credits_granted: 3, next_execution_at: "2026-12-11T00:00:00Z" },
      error: null,
    })
    mockGetAdminClient.mockReturnValue({ rpc: mockRpc })

    const res = await advanceRecurringSubscriptionCycleAction("partner-1", "sub-1")

    expect(res.success).toBe(true)
    expect(res.message).toContain("Ciclo antecipado com sucesso!")
    expect(mockRpc).toHaveBeenCalledWith("advance_recurring_subscription_cycle", {
      p_subscription_id: "sub-1",
      p_actor_user_id: "user-owner",
    })
    expect(mockLogAuditEvent).toHaveBeenCalled()
    expect(mockRevalidateTag).toHaveBeenCalledWith("partner-stats-partner-1", "max")
  })

  it("succeeds for ADMIN and invokes advance_recurring_subscription_cycle RPC", async () => {
    mockRequirePermission.mockResolvedValue({
      partnerId: "partner-1",
      userId: "user-admin",
      roleId: "admin",
      permissions: {},
    })

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sub-2", status: "active", partner_id: "partner-1" }, error: null }),
    })
    mockGetSupabaseServerClient.mockResolvedValue({ from: mockFrom })

    const mockRpc = vi.fn().mockResolvedValue({
      data: { execution_id: "exec-admin", credits_granted: 5 },
      error: null,
    })
    mockGetAdminClient.mockReturnValue({ rpc: mockRpc })

    const res = await advanceRecurringSubscriptionCycleAction("partner-1", "sub-2")

    expect(res.success).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith("advance_recurring_subscription_cycle", {
      p_subscription_id: "sub-2",
      p_actor_user_id: "user-admin",
    })
  })
})

