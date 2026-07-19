import { beforeEach, describe, expect, it, vi } from "vitest"
import { AccountDeletionService } from "./account-deletion.service"
import { ForbiddenError } from "@/lib/auth/authorization"

// Setup complete mocks for E2E validation
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockNot = vi.fn()
const mockIn = vi.fn()

const mockSingleChain: any = {}
mockSingleChain.select = vi.fn().mockReturnValue(mockSingleChain)
mockSingleChain.insert = mockInsert.mockReturnValue(mockSingleChain)
mockSingleChain.update = mockUpdate.mockReturnValue(mockSingleChain)
mockSingleChain.delete = mockDelete.mockReturnValue(mockSingleChain)
mockSingleChain.eq = mockEq.mockReturnValue(mockSingleChain)
mockSingleChain.not = mockNot.mockReturnValue(mockSingleChain)
mockSingleChain.in = mockIn.mockReturnValue(mockSingleChain)
mockSingleChain.single = mockSingle
mockSingleChain.maybeSingle = mockMaybeSingle

const mockSupabaseClient = {
  from: vi.fn().mockReturnValue(mockSingleChain),
  rpc: vi.fn(),
  auth: {
    admin: {
      getUserById: vi.fn(),
      deleteUser: vi.fn(),
    }
  }
}

// Module Mocks
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockSupabaseClient,
}))

vi.mock("@/lib/services/mercadopago/subscriptions", () => ({
  cancelMpSubscription: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}))

vi.mock("@/lib/security/audit-logger", () => ({
  auditLog: vi.fn().mockResolvedValue(true),
}))

vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: vi.fn().mockImplementation(() => {
      const chain: any = {}
      chain.del = vi.fn().mockReturnValue(chain)
      chain.zrem = vi.fn().mockReturnValue(chain)
      chain.exec = vi.fn().mockResolvedValue([])
      return chain
    }),
    incr: vi.fn().mockResolvedValue(1),
  }
}))

describe("Account Deletion E2E Integration Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSingle.mockReset()
    mockMaybeSingle.mockReset()
  })

  // 1. COMPLETE CYCLE & STATE TRANSITIONS
  it("E2E Scenario: Full deletion cycle and linear state transitions", async () => {
    // Stage 1: Request Deletion (Fase I)
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "partner-123", user_id: "user-123" }, error: null }) // partner lookup
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null }) // no active platform subscription
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null }) // no active deletions
    mockSingle.mockResolvedValueOnce({ data: { id: "deletion-123" }, error: null }) // insert deletion
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "sub-123" }, error: null }) // platform sub lookup

    const reqResult = await AccountDeletionService.requestDeletion(
      "user-123",
      "LGPD Request",
      "192.168.0.1",
      "Safari",
      "BR"
    )
    expect(reqResult.success).toBe(true)

    // Stage 2: Database Purge (Fase II)
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 150, error: null }) // execute_account_deletion_db
    const purgeRows = await AccountDeletionService.purgeDatabase("partner-123", "user-123")
    expect(purgeRows).toBe(150)
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith("execute_account_deletion_db", {
      p_user_id: "user-123",
      p_partner_id: "partner-123"
    })

    // Stage 3: Auth Deletion (Last Step)
    mockSupabaseClient.auth.admin.deleteUser.mockResolvedValueOnce({ data: {}, error: null })
    await AccountDeletionService.deleteAuthUser("user-123")
    expect(mockSupabaseClient.auth.admin.deleteUser).toHaveBeenCalledWith("user-123")
  })

  // 2. IDEMPOTENCY & RESTORE (CANCEL DURING GRACE PERIOD)
  it("E2E Scenario: Grace period cancellation is disabled", async () => {
    const cancelResult = await AccountDeletionService.cancelDeletion("user-123")
    expect(cancelResult.success).toBe(false)
    expect(cancelResult.error).toContain("Cancelamento de exclusão indisponível")
  })

  // 3. CONCURRENT REQUESTS (RACE CONDITIONS)
  it("E2E Scenario: Prevent race conditions on multiple simultaneous deletion requests", async () => {
    // First lookup partner
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "partner-123", user_id: "user-123" }, error: null })
    // Mock active subscription check (none)
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // Simulate another request has just inserted a deletion record in between
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "deletion-123", status: "deleting_storage" }, error: null })

    const res = await AccountDeletionService.requestDeletion("user-123", null, "127.0.0.1", null, "BR")
    expect(res.success).toBe(true)
    expect(res.currentStatus).toBe("deleting_storage")
  })

  // 4. ERP MUTATIONS LOCKING DURING GRACE PERIOD
  it("E2E Scenario: Assert mutations are blocked during active deletion", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { status: "deleting_storage" }, error: null })

    await expect(AccountDeletionService.assertNotLocked("partner-123")).rejects.toThrow(ForbiddenError)
  })

  // 5. DOUBLE EXECUTION IDEMPOTENCY
  it("E2E Scenario: DB purge is idempotent on subsequent runs", async () => {
    // If the database has already been purged, execute_account_deletion_db returns 0 affected rows but completes successfully
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 0, error: null })

    const purgeRows = await AccountDeletionService.purgeDatabase("partner-123", "user-123")
    expect(purgeRows).toBe(0)
  })
})
