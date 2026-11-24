import { beforeEach, describe, expect, it, vi } from "vitest"
import { StoreDeletionService } from "./store-deletion.service"

const mockRpc = vi.fn()
const mockPipelineDel = vi.fn()
const mockPipelineZrem = vi.fn()
const mockPipelineExec = vi.fn().mockResolvedValue([])
const mockAuditLog = vi.fn().mockResolvedValue(true)
const mockProcessR2Batch = vi.fn().mockResolvedValue({
  claimed: 2,
  deleted: 2,
  failed: 0,
  persistenceErrors: 0,
})
const mockCountActiveStoreRecurring = vi.fn().mockResolvedValue(0)
const mockInvalidateStoreCache = vi.fn().mockResolvedValue(undefined)
const mockRemoveFromExploreRedis = vi.fn().mockResolvedValue(true)
const mockRevalidateExploreSearch = vi.fn().mockResolvedValue(undefined)

type TableMockResult = { data?: any; count?: number | null; error?: any }
let tableResults: Record<string, TableMockResult> = {}

const mockAdminClient = {
  from: vi.fn((table: string) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve(tableResults[table] ?? { data: null, error: null })),
      then: (resolve: any, reject: any) =>
        Promise.resolve(tableResults[table] ?? { data: [], count: 0, error: null }).then(resolve, reject),
    }
    return chain
  }),
  rpc: mockRpc,
}

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockAdminClient,
}))

vi.mock("@/lib/secure-logger", () => ({
  SecureLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("@/lib/security/audit-logger", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}))

vi.mock("@/lib/redis", () => ({
  redis: {
    pipeline: () => ({
      del: (...args: any[]) => {
        mockPipelineDel(...args)
        return { del: mockPipelineDel, zrem: mockPipelineZrem, exec: mockPipelineExec }
      },
      zrem: (...args: any[]) => {
        mockPipelineZrem(...args)
        return { del: mockPipelineDel, zrem: mockPipelineZrem, exec: mockPipelineExec }
      },
      exec: mockPipelineExec,
    }),
  },
}))

vi.mock("@/lib/services/recurring/limits", () => ({
  countActiveStoreRecurringSubscriptions: (...args: any[]) => mockCountActiveStoreRecurring(...args),
  cancelStoreMarketplaceSubscriptions: vi.fn().mockResolvedValue({ cancelled: 0, failed: 0 }),
}))

vi.mock("@/lib/r2/cleanup-queue", () => ({
  processR2CleanupBatch: (...args: any[]) => mockProcessR2Batch(...args),
}))

vi.mock("@/lib/cache/invalidation", () => ({
  invalidateStoreCache: (...args: any[]) => mockInvalidateStoreCache(...args),
}))

vi.mock("@/lib/redis-sync", () => ({
  removeFromExploreRedis: (...args: any[]) => mockRemoveFromExploreRedis(...args),
}))

vi.mock("@/lib/utils/revalidation", () => ({
  revalidateExploreSearch: (...args: any[]) => mockRevalidateExploreSearch(...args),
  revalidateProducts: vi.fn().mockResolvedValue(undefined),
  revalidateServices: vi.fn().mockResolvedValue(undefined),
  revalidateOrders: vi.fn().mockResolvedValue(undefined),
  revalidateCustomers: vi.fn().mockResolvedValue(undefined),
  revalidateSuppliers: vi.fn().mockResolvedValue(undefined),
  revalidateQuotes: vi.fn().mockResolvedValue(undefined),
  revalidateTransactions: vi.fn().mockResolvedValue(undefined),
  revalidateCoupons: vi.fn().mockResolvedValue(undefined),
  revalidateStockMovements: vi.fn().mockResolvedValue(undefined),
  revalidateReports: vi.fn().mockResolvedValue(undefined),
  revalidateMarketplace: vi.fn().mockResolvedValue(undefined),
  revalidateUserAccess: vi.fn().mockResolvedValue(undefined),
  safeRevalidateTag: vi.fn().mockResolvedValue(undefined),
  safeRevalidatePath: vi.fn().mockResolvedValue(undefined),
}))

describe("StoreDeletionService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableResults = {}
    mockCountActiveStoreRecurring.mockResolvedValue(0)
    mockRpc.mockResolvedValue({ data: 42, error: null })
  })

  describe("validateStoreDeletable", () => {
    it("blocks deletion of the headquarters store", async () => {
      tableResults.stores = {
        data: [
          { id: "store-hq", name: "Matriz", slug: "matriz", is_headquarters: true, is_active: true },
          { id: "store-branch", name: "Filial 1", slug: "filial-1", is_headquarters: false, is_active: true },
        ],
        error: null,
      }

      const res = await StoreDeletionService.validateStoreDeletable("partner-1", "store-hq")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("matriz")
    })

    it("blocks deletion when it is the only store", async () => {
      tableResults.stores = {
        data: [
          { id: "store-only", name: "Única", slug: "unica", is_headquarters: false, is_active: true },
        ],
        error: null,
      }

      const res = await StoreDeletionService.validateStoreDeletable("partner-1", "store-only")
      expect(res.valid).toBe(false)
      expect(res.error).toContain("única loja")
    })

    it("allows deletion of a branch and returns headquarters as fallback", async () => {
      tableResults.stores = {
        data: [
          { id: "store-hq", name: "Matriz", slug: "matriz", is_headquarters: true, is_active: true },
          { id: "store-branch", name: "Filial 1", slug: "filial-1", is_headquarters: false, is_active: true },
        ],
        error: null,
      }

      const res = await StoreDeletionService.validateStoreDeletable("partner-1", "store-branch")
      expect(res.valid).toBe(true)
      expect(res.store?.id).toBe("store-branch")
      expect(res.fallbackStoreId).toBe("store-hq")
    })
  })

  describe("executeStoreDeletion", () => {
    it("blocks deletion if the store still has active recurring subscriptions", async () => {
      tableResults.stores = {
        data: [
          { id: "store-hq", name: "Matriz", slug: "matriz", is_headquarters: true, is_active: true },
          { id: "store-branch", name: "Filial 1", slug: "filial-1", is_headquarters: false, is_active: true },
        ],
        error: null,
      }
      mockCountActiveStoreRecurring.mockResolvedValue(3)

      await expect(
        StoreDeletionService.executeStoreDeletion({
          storeId: "store-branch",
          partnerId: "partner-1",
          actorUserId: "user-1",
          reason: "Fechando unidade",
        }),
      ).rejects.toThrow(/3 assinatura/)

      expect(mockRpc).not.toHaveBeenCalled()
    })

    it("runs full store-scoped purge: RPC, R2 cleanup, Redis/cache invalidation, and audit log", async () => {
      tableResults.stores = {
        data: [
          { id: "store-hq", name: "Matriz", slug: "matriz", is_headquarters: true, is_active: true },
          { id: "store-branch", name: "Filial Sul", slug: "filial-sul", is_headquarters: false, is_active: true },
        ],
        error: null,
      }
      tableResults.products = { data: [{ id: "prod-1" }, { id: "prod-2" }], error: null }
      tableResults.services = { data: [{ id: "serv-1" }], error: null }
      tableResults.store_members = { data: [{ partner_users: { user_id: "member-1" } }], error: null }
      tableResults.partner_whatsapp_connections = { data: [], error: null }

      const result = await StoreDeletionService.executeStoreDeletion({
        storeId: "store-branch",
        partnerId: "partner-1",
        actorUserId: "owner-1",
        reason: "Encerramento da filial",
      })

      expect(result).toEqual({
        storeId: "store-branch",
        storeName: "Filial Sul",
        dbRowsDeleted: 42,
        whatsappDisconnected: 0,
        r2CleanupDeleted: 2,
        r2CleanupFailed: 0,
        fallbackStoreId: "store-hq",
      })

      expect(mockRpc).toHaveBeenCalledWith("execute_store_deletion_db", {
        p_store_id: "store-branch",
        p_partner_id: "partner-1",
        p_actor_user_id: "owner-1",
      })
      expect(mockProcessR2Batch).toHaveBeenCalledWith(100)
      expect(mockPipelineDel).toHaveBeenCalledWith("data:v2:loja:store-branch")
      expect(mockPipelineDel).toHaveBeenCalledWith("data:v2:produto:prod-1")
      expect(mockPipelineDel).toHaveBeenCalledWith("data:v2:servico:serv-1")
      expect(mockInvalidateStoreCache).toHaveBeenCalledWith("store-branch", "partner-1", "filial-sul", { silent: false })
      expect(mockRemoveFromExploreRedis).toHaveBeenCalledWith("store-branch", "loja", false)
      expect(mockRevalidateExploreSearch).toHaveBeenCalledWith({ silent: false })
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "store.deleted",
          actorUserId: "owner-1",
          partnerId: "partner-1",
          metadata: expect.objectContaining({
            storeId: "store-branch",
            storeName: "Filial Sul",
            reason: "Encerramento da filial",
            dbRowsDeleted: 42,
          }),
        }),
      )
    })
  })
})
