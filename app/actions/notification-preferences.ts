"use server"

import { requireUser } from "@/lib/auth/authorization"
import type { NotificationType } from "@/lib/notifications/types"
import type { NotificationPreferenceInput } from "@/lib/notifications/preferences-types"
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
  seedDefaultPreferences,
} from "@/lib/services/notification-preferences.service"

export async function getNotificationPreferencesAction() {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  await seedDefaultPreferences(user.id)
  const preferences = await getNotificationPreferences(user.id)
  return { success: true as const, data: preferences }
}

export async function updateNotificationPreferencesAction(
  inputs: NotificationPreferenceInput[],
) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { success: true as const }
  }

  const validTypes = new Set<string>(await import("@/lib/notifications/types").then(m => m.NOTIFICATION_TYPES))
  const sanitized = inputs.filter(
    (i): i is NotificationPreferenceInput =>
      typeof i.type === "string" &&
      validTypes.has(i.type) &&
      typeof i.enabled === "boolean" &&
      typeof i.push_enabled === "boolean",
  )

  const result = await upsertNotificationPreferences(user.id, sanitized)
  if (!result.success) return { error: result.error || "Falha ao salvar preferências" }
  return { success: true as const }
}
