import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  getMaintenanceConfig,
  updateMaintenanceConfig,
  getGlobalAnnouncementConfig,
  updateGlobalAnnouncementConfig,
  clearSystemSettingsMemoryCache,
} from "./system-settings.service"
import type { AdminUser } from "@/lib/admin/types"

const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn().mockResolvedValue("OK")

vi.mock("@/lib/redis", () => ({
  redis: {
    get: (...args: any[]) => mockRedisGet(...args),
    set: (...args: any[]) => mockRedisSet(...args),
  },
}))

const mockSupabaseMaybeSingle = vi.fn()
const mockSupabaseUpsert = vi.fn()

const mockSupabaseClient = {
  from: vi.fn().mockImplementation(() => {
    const chain: any = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.upsert = mockSupabaseUpsert.mockReturnValue(Promise.resolve({ error: null }))
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = mockSupabaseMaybeSingle
    return chain
  }),
}

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => mockSupabaseClient,
}))

const mockAdminAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/admin/audit", () => ({
  adminAuditLog: (...args: any[]) => mockAdminAuditLog(...args),
}))

const fakeAdminUser: AdminUser = {
  userId: "admin-user-uuid",
  role: "super_admin",
  email: "admin@dudit.com.br",
  isProtected: true,
  scopes: ["system_settings"],
}

describe("SystemSettingsService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSystemSettingsMemoryCache()
  })

  describe("getMaintenanceConfig", () => {
    it("returns parsed config from Redis when available", async () => {
      mockRedisGet.mockResolvedValueOnce(
        JSON.stringify({
          enabled: true,
          message: "Manutenção de Teste",
          estimated_end: "2026-09-01T00:00:00Z",
          allow_admin_bypass: true,
          bypass_token: "secret_123",
        })
      )

      const result = await getMaintenanceConfig()
      expect(result.enabled).toBe(true)
      expect(result.message).toBe("Manutenção de Teste")
      expect(result.bypass_token).toBe("secret_123")
    })

    it("falls back to Supabase DB when Redis returns null", async () => {
      mockRedisGet.mockResolvedValueOnce(null)
      mockSupabaseMaybeSingle.mockResolvedValueOnce({
        data: {
          value: {
            enabled: true,
            message: "Banco de Dados Manutenção",
            estimated_end: null,
            allow_admin_bypass: true,
            bypass_token: "db_token",
          },
          updated_at: "2026-08-31T12:00:00Z",
          updated_by: "user_123",
        },
        error: null,
      })

      const result = await getMaintenanceConfig()
      expect(result.enabled).toBe(true)
      expect(result.message).toBe("Banco de Dados Manutenção")
      expect(result.bypass_token).toBe("db_token")
    })

    it("returns default config when both Redis and DB are empty", async () => {
      mockRedisGet.mockResolvedValueOnce(null)
      mockSupabaseMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const result = await getMaintenanceConfig()
      expect(result.enabled).toBe(false)
      expect(result.bypass_token).toBeDefined()
    })
  })

  describe("updateMaintenanceConfig", () => {
    it("updates DB, syncs to Redis, and writes audit log", async () => {
      mockRedisGet.mockResolvedValueOnce(null)
      mockSupabaseMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await updateMaintenanceConfig(
        {
          enabled: true,
          message: "Atualizando servidores...",
        },
        fakeAdminUser
      )

      expect(res.success).toBe(true)
      expect(res.config.enabled).toBe(true)
      expect(res.config.message).toBe("Atualizando servidores...")
      expect(mockSupabaseUpsert).toHaveBeenCalled()
      expect(mockRedisSet).toHaveBeenCalled()
      expect(mockAdminAuditLog).toHaveBeenCalled()
    })
  })

  describe("getGlobalAnnouncementConfig", () => {
    it("returns active announcement if not expired", async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString()
      mockRedisGet.mockResolvedValueOnce({
        active: true,
        id: "ann_1",
        title: "Aviso",
        message: "Site em atualização hoje às 22h",
        type: "warning",
        closable: true,
        expires_at: futureDate,
      })

      const result = await getGlobalAnnouncementConfig()
      expect(result.active).toBe(true)
      expect(result.title).toBe("Aviso")
    })

    it("deactivates announcement automatically if expires_at is in the past", async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000).toISOString()
      mockRedisGet.mockResolvedValueOnce({
        active: true,
        id: "ann_1",
        title: "Aviso Passado",
        message: "Manutenção de ontem",
        type: "warning",
        closable: true,
        expires_at: pastDate,
      })

      const result = await getGlobalAnnouncementConfig()
      expect(result.active).toBe(false)
    })
  })

  describe("updateGlobalAnnouncementConfig", () => {
    it("persists global announcement changes and logs audit", async () => {
      mockRedisGet.mockResolvedValueOnce(null)
      mockSupabaseMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

      const res = await updateGlobalAnnouncementConfig(
        {
          active: true,
          title: "Novo Aviso",
          message: "Mensagem importante para todos",
          type: "urgent",
        },
        fakeAdminUser
      )

      expect(res.success).toBe(true)
      expect(res.config.active).toBe(true)
      expect(res.config.title).toBe("Novo Aviso")
      expect(mockAdminAuditLog).toHaveBeenCalled()
    })
  })
})
