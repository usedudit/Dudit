import { beforeEach, describe, expect, it, vi } from "vitest"
import { AccountDeletionService } from "./account-deletion.service"
import { ForbiddenError } from "@/lib/auth/authorization"

// Create standard mock functions
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockNot = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()

const mockSupabaseClient = {
  from: vi.fn().mockImplementation(() => {
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = mockInsert.mockReturnValue(chain)
    chain.update = mockUpdate.mockReturnValue(chain)
    chain.delete = mockDelete.mockReturnValue(chain)
    chain.eq = mockEq.mockReturnValue(chain)
    chain.not = mockNot.mockReturnValue(chain)
    chain.in = mockIn.mockReturnValue(chain)
    chain.order = mockOrder.mockReturnValue(chain)
    chain.limit = mockLimit.mockReturnValue(chain)
    chain.single = mockSingle
    chain.maybeSingle = mockMaybeSingle
    return chain
  }),
  rpc: vi.fn(),
  auth: {
    admin: {
      getUserById: vi.fn(),
      deleteUser: vi.fn(),
    }
  }
}

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

describe("AccountDeletionService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSingle.mockReset()
    mockMaybeSingle.mockReset()
  })

  describe("assertNotLocked", () => {
    it("throws ForbiddenError if deletion is pending or in progress", async () => {
      mockMaybeSingle.mockResolvedValue({ data: { status: "waiting_grace_period" }, error: null })

      await expect(AccountDeletionService.assertNotLocked("partner-123")).rejects.toThrow(ForbiddenError)
    })

    it("does not throw if no active deletion is found", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null })

      await expect(AccountDeletionService.assertNotLocked("partner-123")).resolves.not.toThrow()
    })
  })

  describe("requestDeletion", () => {
    it("initiates grace period and cancels subscription", async () => {
      // 1. Mock partner lookup
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: "partner-123", user_id: "user-123" }, error: null })
      // 2. Mock existing deletion check (none)
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
      // 3. Mock insert deletion tracking
      mockSingle.mockResolvedValueOnce({ data: { id: "deletion-123" }, error: null })
      // 4. Mock subscription lookup
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: "sub-123", mercado_pago_subscription_id: "mp-sub-123" }, error: null })

      const res = await AccountDeletionService.requestDeletion(
        "user-123",
        "Reason for leaving",
        "127.0.0.1",
        "Mozilla/5.0",
        "BR"
      )

      expect(res.success).toBe(true)
      expect(res.gracePeriodEndsAt).toBeDefined()
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: "user-123",
        partner_id: "partner-123",
        status: "pending_deletion",
      }))
    })

    it("fails early if deletion request is already pending", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: "partner-123", user_id: "user-123" }, error: null })
      mockMaybeSingle.mockResolvedValueOnce({ data: { id: "deletion-123", status: "waiting_grace_period" }, error: null })

      const res = await AccountDeletionService.requestDeletion(
        "user-123",
        null,
        "127.0.0.1",
        null,
        "BR"
      )

      expect(res.success).toBe(false)
      expect(res.error).toContain("Já existe uma solicitação")
    })
  })

  describe("cancelDeletion", () => {
    it("deletes active deletion record within grace period", async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "deletion-123", partner_id: "partner-123", status: "waiting_grace_period", trigger_run_id: null },
        error: null
      })

      const res = await AccountDeletionService.cancelDeletion("user-123")

      expect(res.success).toBe(true)
      expect(mockDelete).toHaveBeenCalled()
    })

    it("fails if deletion is already past the grace period", async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "deletion-123", partner_id: "partner-123", status: "deleting_storage", trigger_run_id: null },
        error: null
      })

      const res = await AccountDeletionService.cancelDeletion("user-123")

      expect(res.success).toBe(false)
      expect(res.error).toContain("já entrou em fase de processamento final")
    })
  })

  describe("purgeDatabase", () => {
    it("invokes the execute_account_deletion_db database RPC", async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({ data: 42, error: null })

      const rows = await AccountDeletionService.purgeDatabase("partner-123", "user-123")

      expect(rows).toBe(42)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith("execute_account_deletion_db", {
        p_user_id: "user-123",
        p_partner_id: "partner-123",
      })
    })
  })
})
