import "server-only"

import { randomBytes } from "crypto"
import { getAdminClient } from "@/lib/supabase/admin"
import { redis } from "@/lib/redis"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType, type AdminUser } from "@/lib/admin/types"
import type {
  MaintenanceConfig,
  GlobalAnnouncementConfig,
  MaintenanceBroadcastInput,
} from "@/lib/system/types"
import { sendPushToUser } from "./fcm.service"
import { createNotification } from "./notification.service"

const REDIS_KEY_MAINTENANCE = "system:maintenance"
const REDIS_KEY_ANNOUNCEMENT = "system:announcement"
const LEGACY_DEFAULT_BYPASS_TOKEN = "dudit_sec_bypass"

const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: false,
  message: "Estamos realizando uma manutenção programada para trazer melhorias na plataforma Dudit. Voltaremos em breve!",
  estimated_end: null,
  allow_admin_bypass: true,
  // Must be provisioned through MAINTENANCE_BYPASS_TOKEN or the admin flow.
  // Never ship a known bypass credential as a fallback.
  bypass_token: process.env.MAINTENANCE_BYPASS_TOKEN || "",
}

const DEFAULT_ANNOUNCEMENT_CONFIG: GlobalAnnouncementConfig = {
  active: false,
  id: "announcement_default",
  title: "Aviso Importante",
  message: "",
  type: "warning",
  closable: true,
  expires_at: null,
  link_url: null,
  link_text: null,
}

let memoryMaintenanceConfig: { config: MaintenanceConfig; expiresAt: number } | null = null
let memoryAnnouncementConfig: { config: GlobalAnnouncementConfig; expiresAt: number } | null = null
const SETTINGS_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes in-memory cache

export function clearSystemSettingsMemoryCache(): void {
  memoryMaintenanceConfig = null
  memoryAnnouncementConfig = null
}

// ─── Maintenance Mode ────────────────────────────────────────────────────────

/**
 * Get current maintenance configuration.
 * Reads from in-memory cache first, then Redis, falling back to Supabase DB.
 */
export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const now = Date.now()
  if (memoryMaintenanceConfig && memoryMaintenanceConfig.expiresAt > now) {
    return memoryMaintenanceConfig.config
  }

  try {
    const cached = await redis.get<MaintenanceConfig | string>(REDIS_KEY_MAINTENANCE)
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached
      if (typeof parsed === "object" && parsed !== null && "enabled" in parsed) {
        const full = {
          ...DEFAULT_MAINTENANCE_CONFIG,
          ...parsed,
        }
        memoryMaintenanceConfig = { config: full, expiresAt: now + SETTINGS_MEMORY_CACHE_TTL_MS }
        return full
      }
    }
  } catch (err) {
    console.warn("[system-settings] Failed to read maintenance from Redis, falling back to DB:", err)
  }

  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from("system_settings")
      .select("value, updated_at, updated_by")
      .eq("key", "maintenance")
      .maybeSingle()

    if (!error && data?.value) {
      const config: MaintenanceConfig = {
        ...DEFAULT_MAINTENANCE_CONFIG,
        ...(data.value as Partial<MaintenanceConfig>),
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      }

      memoryMaintenanceConfig = { config, expiresAt: now + SETTINGS_MEMORY_CACHE_TTL_MS }

      // Sync back to Redis asynchronously
      try {
        const p = redis.set(REDIS_KEY_MAINTENANCE, JSON.stringify(config))
        if (p && typeof (p as any).catch === "function") (p as any).catch(() => {})
      } catch {}
      return config
    }
  } catch (err) {
    console.error("[system-settings] Failed to fetch maintenance config from DB:", err)
  }

  memoryMaintenanceConfig = { config: DEFAULT_MAINTENANCE_CONFIG, expiresAt: now + SETTINGS_MEMORY_CACHE_TTL_MS }
  return DEFAULT_MAINTENANCE_CONFIG
}

/**
 * Update maintenance configuration.
 * Updates Postgres, synchronizes Redis, and writes an audit log.
 */
export async function updateMaintenanceConfig(
  newConfig: Partial<MaintenanceConfig>,
  adminUser: AdminUser
): Promise<{ success: boolean; config: MaintenanceConfig; error?: string }> {
  try {
    const current = await getMaintenanceConfig()
    const requestedBypassToken = newConfig.bypass_token?.trim()
    const currentBypassToken = current.bypass_token?.trim()
    const bypassToken = requestedBypassToken && requestedBypassToken !== LEGACY_DEFAULT_BYPASS_TOKEN
      ? requestedBypassToken
      : currentBypassToken && currentBypassToken !== LEGACY_DEFAULT_BYPASS_TOKEN
        ? currentBypassToken
        : process.env.MAINTENANCE_BYPASS_TOKEN || `dudit_${randomBytes(24).toString("hex")}`

    const merged: MaintenanceConfig = {
      ...current,
      ...newConfig,
      bypass_token: bypassToken,
      updated_at: new Date().toISOString(),
      updated_by: adminUser.userId,
    }

    const admin = getAdminClient()

    // 1. Upsert in Postgres
    const { error: dbError } = await admin
      .from("system_settings")
      .upsert({
        key: "maintenance",
        value: merged,
        description: "Configurações do Modo Manutenção Geral da plataforma",
        is_public: false,
        updated_at: merged.updated_at,
        updated_by: merged.updated_by,
      })

    if (dbError) {
      console.error("[system-settings] DB update failed for maintenance:", dbError)
      return { success: false, config: current, error: dbError.message }
    }

    // 2. Sync to Redis and invalidate local memory caches
    clearSystemSettingsMemoryCache()
    try {
      await redis.set(REDIS_KEY_MAINTENANCE, JSON.stringify(merged))
      const { clearMaintenanceMemoryCache } = await import("@/lib/system/maintenance-guard")
      clearMaintenanceMemoryCache()
    } catch (redisErr) {
      console.warn("[system-settings] Redis sync failed for maintenance:", redisErr)
    }

    // 3. Write Audit Log
    await adminAuditLog({
      adminUserId: adminUser.userId,
      actionType: AdminActionType.SYSTEM_MAINTENANCE_TOGGLE,
      targetType: "system",
      targetId: "maintenance",
      metadata: {
        previous_enabled: current.enabled,
        new_enabled: merged.enabled,
        estimated_end: merged.estimated_end,
        message: merged.message,
      },
    })

    return { success: true, config: merged }
  } catch (err: any) {
    console.error("[system-settings] Error in updateMaintenanceConfig:", err)
    return { success: false, config: DEFAULT_MAINTENANCE_CONFIG, error: err.message || "Erro desconhecido" }
  }
}

// ─── Global Announcements ───────────────────────────────────────────────────

/**
 * Get active global announcement banner configuration.
 * Checks for expiration timestamp and uses in-memory caching to prevent continuous Redis GETs on layout render.
 */
export async function getGlobalAnnouncementConfig(): Promise<GlobalAnnouncementConfig> {
  const now = Date.now()
  if (memoryAnnouncementConfig && memoryAnnouncementConfig.expiresAt > now) {
    const config = memoryAnnouncementConfig.config
    if (config.active && config.expires_at && new Date(config.expires_at) < new Date()) {
      return { ...config, active: false }
    }
    return config
  }

  try {
    const cached = await redis.get<GlobalAnnouncementConfig | string>(REDIS_KEY_ANNOUNCEMENT)
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached
      if (typeof parsed === "object" && parsed !== null && "active" in parsed) {
        const config = { ...DEFAULT_ANNOUNCEMENT_CONFIG, ...parsed }
        if (config.active && config.expires_at && new Date(config.expires_at) < new Date()) {
          return { ...config, active: false }
        }
        memoryAnnouncementConfig = { config, expiresAt: now + SETTINGS_MEMORY_CACHE_TTL_MS }
        return config
      }
    }
  } catch (err) {
    console.warn("[system-settings] Failed to read announcement from Redis, falling back to DB:", err)
  }

  try {
    const admin = getAdminClient()
    const { data, error } = await admin
      .from("system_settings")
      .select("value, updated_at, updated_by")
      .eq("key", "global_announcement")
      .maybeSingle()

    if (!error && data?.value) {
      const config: GlobalAnnouncementConfig = {
        ...DEFAULT_ANNOUNCEMENT_CONFIG,
        ...(data.value as Partial<GlobalAnnouncementConfig>),
        updated_at: data.updated_at,
        updated_by: data.updated_by,
      }

      // Check expiration
      if (config.active && config.expires_at && new Date(config.expires_at) < new Date()) {
        config.active = false
      }

      memoryAnnouncementConfig = { config, expiresAt: now + SETTINGS_MEMORY_CACHE_TTL_MS }

      // Sync back to Redis asynchronously
      try {
        const p = redis.set(REDIS_KEY_ANNOUNCEMENT, JSON.stringify(config))
        if (p && typeof (p as any).catch === "function") (p as any).catch(() => {})
      } catch {}
      return config
    }
  } catch (err) {
    console.error("[system-settings] Failed to fetch announcement from DB:", err)
  }

  memoryAnnouncementConfig = { config: DEFAULT_ANNOUNCEMENT_CONFIG, expiresAt: now + SETTINGS_MEMORY_CACHE_TTL_MS }
  return DEFAULT_ANNOUNCEMENT_CONFIG
}

/**
 * Update global announcement banner.
 */
export async function updateGlobalAnnouncementConfig(
  newConfig: Partial<GlobalAnnouncementConfig>,
  adminUser: AdminUser
): Promise<{ success: boolean; config: GlobalAnnouncementConfig; error?: string }> {
  try {
    const current = await getGlobalAnnouncementConfig()
    const newId = newConfig.message && newConfig.message !== current.message
      ? `ann_${Date.now()}`
      : current.id || `ann_${Date.now()}`

    const merged: GlobalAnnouncementConfig = {
      ...current,
      ...newConfig,
      id: newId,
      updated_at: new Date().toISOString(),
      updated_by: adminUser.userId,
    }

    const admin = getAdminClient()

    // 1. Upsert in Postgres
    const { error: dbError } = await admin
      .from("system_settings")
      .upsert({
        key: "global_announcement",
        value: merged,
        description: "Banner de aviso global no topo do site",
        is_public: true,
        updated_at: merged.updated_at,
        updated_by: merged.updated_by,
      })

    if (dbError) {
      console.error("[system-settings] DB update failed for announcement:", dbError)
      return { success: false, config: current, error: dbError.message }
    }

    // 2. Sync to Redis and invalidate local memory cache
    clearSystemSettingsMemoryCache()
    try {
      await redis.set(REDIS_KEY_ANNOUNCEMENT, JSON.stringify(merged))
    } catch (redisErr) {
      console.warn("[system-settings] Redis sync failed for announcement:", redisErr)
    }

    // 3. Write Audit Log
    await adminAuditLog({
      adminUserId: adminUser.userId,
      actionType: AdminActionType.SYSTEM_ANNOUNCEMENT_UPDATE,
      targetType: "system",
      targetId: "global_announcement",
      metadata: {
        previous_active: current.active,
        new_active: merged.active,
        title: merged.title,
        message: merged.message,
        type: merged.type,
      },
    })

    return { success: true, config: merged }
  } catch (err: any) {
    console.error("[system-settings] Error in updateGlobalAnnouncementConfig:", err)
    return { success: false, config: DEFAULT_ANNOUNCEMENT_CONFIG, error: err.message || "Erro desconhecido" }
  }
}

// ─── Broadcast Notifications ────────────────────────────────────────────────

/**
 * Dispatch maintenance broadcast notifications (in-app and push).
 */
export async function dispatchMaintenanceBroadcast(
  input: MaintenanceBroadcastInput,
  adminUser: AdminUser
): Promise<{ success: boolean; sentCount: number; pushCount: number; error?: string }> {
  try {
    const adminDb = getAdminClient()
    let sentCount = 0
    let pushCount = 0

    // Fetch target user IDs
    let userIds: string[] = []

    if (input.targetAudience === "partners") {
      const { data: partnerUsers } = await adminDb
        .from("partner_users")
        .select("user_id")
        .eq("is_active", true)

      userIds = Array.from(new Set((partnerUsers as Array<{ user_id: string | null }> | null)?.map(p => p.user_id).filter(Boolean) || [])) as string[]
    } else if (input.targetAudience === "customers") {
      const { data: profiles } = await adminDb
        .from("user_profiles")
        .select("user_id")
        .limit(1000)

      userIds = Array.from(new Set((profiles as Array<{ user_id: string | null }> | null)?.map(p => p.user_id).filter(Boolean) || [])) as string[]
    } else {
      // All active users
      const { data: profiles } = await adminDb
        .from("user_profiles")
        .select("user_id")
        .limit(2000)

      userIds = Array.from(new Set((profiles as Array<{ user_id: string | null }> | null)?.map(p => p.user_id).filter(Boolean) || [])) as string[]
    }

    const batchId = `maint_broadcast_${Date.now()}`

    for (const userId of userIds) {
      try {
        if (input.sendInApp) {
          const idempotencyKey = `${batchId}_${userId}`
          const created = await createNotification({
            userId,
            type: "admin_announcement",
            title: input.title,
            message: input.message,
            idempotencyKey,
            data: {
              audience: input.targetAudience === "partners" ? "partner" : "customer",
              scope: "platform",
              isMaintenanceWarning: true,
              estimatedEnd: input.estimatedEnd || null,
            },
          })

          if (created.created) {
            sentCount++
          }

          if (input.sendPush && created.notification) {
            const pushResult = await sendPushToUser({
              userId,
              notificationId: created.notification.id,
              title: input.title,
              body: input.message,
              href: "/",
              type: "admin_announcement",
              entityType: null,
              entityId: null,
            })
            if (pushResult.sent > 0) {
              pushCount += pushResult.sent
            }
          }
        }
      } catch (userErr) {
        console.warn(`[system-settings] Failed to send broadcast to user ${userId}:`, userErr)
      }
    }

    // Write Audit Log
    await adminAuditLog({
      adminUserId: adminUser.userId,
      actionType: AdminActionType.SYSTEM_NOTIFICATION_BROADCAST,
      targetType: "system",
      targetId: batchId,
      metadata: {
        title: input.title,
        message: input.message,
        audience: input.targetAudience,
        inAppSent: sentCount,
        pushSent: pushCount,
      },
    })

    return { success: true, sentCount, pushCount }
  } catch (err: any) {
    console.error("[system-settings] Error in dispatchMaintenanceBroadcast:", err)
    return { success: false, sentCount: 0, pushCount: 0, error: err.message || "Erro ao disparar notificações" }
  }
}
