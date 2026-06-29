"use server"

import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import type { NotificationPageCursor } from "@/lib/notifications/types"
import {
  fetchNotificationsPage,
  getUnreadCountForUser,
  markAllNotificationsReadForUser,
  markNotificationsReadForUser,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/lib/services/notification.service"

export async function getNotificationsAction(params?: {
  cursor?: NotificationPageCursor | null
}) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  const page = await fetchNotificationsPage({
    userId: user.id,
    cursor: params?.cursor ?? null,
  })

  return { success: true as const, data: page }
}

export async function getUnreadNotificationCountAction() {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const, count: 0 }

  const count = await getUnreadCountForUser(user.id)
  return { success: true as const, count }
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  const updated = await markAllNotificationsReadForUser(user.id)
  return { success: true as const, updated }
}

export async function markNotificationsReadAction(notificationIds: string[]) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return { success: true as const, updated: 0 }
  }

  const uniqueIds = [...new Set(notificationIds.filter((id) => typeof id === "string" && id.length > 0))]
  const updated = await markNotificationsReadForUser(user.id, uniqueIds.slice(0, 100))
  return { success: true as const, updated }
}

export async function registerPushSubscriptionAction(params: {
  fcmToken: string
  deviceName?: string | null
  deviceFingerprint?: string | null
}) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  await requireRateLimit(RateLimitCategory.API_GENERAL)

  if (!params.fcmToken || params.fcmToken.length < 20) {
    return { error: "Token FCM inválido" as const }
  }

  const result = await registerPushSubscription({
    userId: user.id,
    fcmToken: params.fcmToken,
    deviceName: params.deviceName,
    deviceFingerprint: params.deviceFingerprint,
  })

  if (!result.success) return { error: result.error || "Falha ao registrar push" }
  return { success: true as const }
}

export async function unregisterPushSubscriptionAction(fcmToken: string) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" as const }

  await unregisterPushSubscription({ userId: user.id, fcmToken })
  return { success: true as const }
}
