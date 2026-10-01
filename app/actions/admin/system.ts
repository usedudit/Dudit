"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import {
  getMaintenanceConfig,
  updateMaintenanceConfig,
  getGlobalAnnouncementConfig,
  updateGlobalAnnouncementConfig,
  dispatchMaintenanceBroadcast,
} from "@/lib/services/system-settings.service"
import type {
  MaintenanceConfig,
  GlobalAnnouncementConfig,
  MaintenanceBroadcastInput,
  SystemSettingsState,
} from "@/lib/system/types"

const BYPASS_COOKIE_NAME = "ddt_maint_bypass"
const LEGACY_DEFAULT_BYPASS_TOKEN = "dudit_sec_bypass"

/**
 * Get all system settings for admin panel.
 */
export async function getSystemSettingsAdminAction(): Promise<{
  success: boolean
  data?: SystemSettingsState
  error?: string
}> {
  try {
    await requireAdminScope("system_settings", "admin")
    const [maintenance, announcement] = await Promise.all([
      getMaintenanceConfig(),
      getGlobalAnnouncementConfig(),
    ])

    return {
      success: true,
      data: {
        maintenance,
        announcement,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Acesso negado" }
  }
}

/**
 * Update Maintenance Mode.
 */
export async function updateMaintenanceModeAdminAction(
  data: Partial<MaintenanceConfig>
): Promise<{ success: boolean; config?: MaintenanceConfig; error?: string }> {
  try {
    const adminUser = await requireAdminScope("system_settings", "admin")
    const result = await updateMaintenanceConfig(data, adminUser)

    if (result.success) {
      revalidatePath("/", "layout")
      revalidatePath("/ddt-admin/system")
      revalidatePath("/manutencao")
    }

    return result
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar modo manutenção" }
  }
}

/**
 * Update Global Announcement Banner.
 */
export async function updateGlobalAnnouncementAdminAction(
  data: Partial<GlobalAnnouncementConfig>
): Promise<{ success: boolean; config?: GlobalAnnouncementConfig; error?: string }> {
  try {
    const adminUser = await requireAdminScope("system_settings", "admin")
    const result = await updateGlobalAnnouncementConfig(data, adminUser)

    if (result.success) {
      revalidatePath("/", "layout")
      revalidatePath("/ddt-admin/system")
      revalidatePath("/api/system/announcement")
    }

    return result
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar banner de aviso" }
  }
}

/**
 * Send Maintenance Broadcast (Push / In-App).
 */
export async function sendMaintenanceBroadcastAdminAction(
  data: MaintenanceBroadcastInput
): Promise<{ success: boolean; sentCount?: number; pushCount?: number; error?: string }> {
  try {
    const adminUser = await requireAdminScope("system_settings", "admin")
    const result = await dispatchMaintenanceBroadcast(data, adminUser)
    return result
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao disparar aviso de manutenção" }
  }
}

/**
 * Set Maintenance Bypass Cookie.
 * Used by admins to browse the platform during maintenance.
 */
export async function setBypassCookieAction(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminScope("system_settings", "admin")
    const config = await getMaintenanceConfig()
    if (!config.allow_admin_bypass) {
      return { success: false, error: "Bypass de manutenção está desativado pelo sistema." }
    }

    if (!token || token.trim() === LEGACY_DEFAULT_BYPASS_TOKEN || token.trim() !== config.bypass_token.trim()) {
      return { success: false, error: "Chave de bypass inválida." }
    }

    const cookieStore = await cookies()
    cookieStore.set({
      name: BYPASS_COOKIE_NAME,
      value: token.trim(),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao autenticar bypass" }
  }
}

/**
 * Clear Maintenance Bypass Cookie.
 */
export async function clearBypassCookieAction(): Promise<{ success: boolean }> {
  try {
    const cookieStore = await cookies()
    cookieStore.delete(BYPASS_COOKIE_NAME)
    return { success: true }
  } catch {
    return { success: true }
  }
}
