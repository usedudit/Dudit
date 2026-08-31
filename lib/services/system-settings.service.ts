import "server-only"

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

const DEFAULT_MAINTENANCE_CONFIG: MaintenanceConfig = {
  enabled: false,
  message: "Estamos realizando uma manutenção programada para trazer melhorias na plataforma Dudit. Voltaremos em breve!",
  estimated_end: null,
  allow_admin_bypass: true,
  bypass_token: "dudit_sec_bypass",
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

// ─── Maintenance Mode ────────────────────────────────────────────────────────

/**
 * Get current maintenance configuration.
 * Reads from Redis first for low latency, falling back to Supabase DB.
 */
export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  try {
    const cached = await redis.get<MaintenanceConfig | string>(REDIS_KEY_MAINTENANCE)
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached
      if (typeof parsed === "object" && parsed !== null && "enabled" in parsed) {
        return {
          ...DEFAULT_MAINTENANCE_CONFIG,
          ...parsed,
        }
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
    const merged: MaintenanceConfig = {
      ...current,
      ...newConfig,
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
        is_public: true,
        updated_at: merged.updated_at,
        updated_by: merged.updated_by,
      })

    if (dbError) {
      console.error("[system-settings] DB update failed for maintenance:", dbError)
      return { success: false, config: current, error: dbError.message }
    }

    // 2. Sync to Redis
    try {
      await redis.set(REDIS_KEY_MAINTENANCE, JSON.stringify(merged))
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
 * Checks for expiration timestamp.
 */
export async function getGlobalAnnouncementConfig(): Promise<GlobalAnnouncementConfig> {
  try {
    const cached = await redis.get<GlobalAnnouncementConfig | string>(REDIS_KEY_ANNOUNCEMENT)
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached
      if (typeof parsed === "object" && parsed !== null && "active" in parsed) {
        const config = { ...DEFAULT_ANNOUNCEMENT_CONFIG, ...parsed }
        if (config.active && config.expires_at && new Date(config.expires_at) < new Date()) {
          return { ...config, active: false }
        }
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

    // 2. Sync to Redis
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

      userIds = Array.from(new Set(partnerUsers?.map(p => p.user_id).filter(Boolean) || []))
    } else if (input.targetAudience === "customers") {
      const { data: profiles } = await adminDb
        .from("user_profiles")
        .select("user_id")
        .limit(1000)

      userIds = Array.from(new Set(profiles?.map(p => p.user_id).filter(Boolean) || []))
    } else {
      // All active users
      const { data: profiles } = await adminDb
        .from("user_profiles")
        .select("user_id")
        .limit(2000)

      userIds = Array.from(new Set(profiles?.map(p => p.user_id).filter(Boolean) || []))
    }

    const batchId = `maint_broadcast_${Date.now()}`

    for (const userId of userIds) {
      try {
        if (input.sendInApp) {
          const idempotencyKey = `${batchId}_${userId}`
          const created = await createNotification({
            userId,
            type: "system_announcement",
            title: input.title,
            message: input.message,
            idempotencyKey,
            data: {
              audience: input.targetAudience === "partners" ? "partner" : "customer",
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
              type: "system_announcement",
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
