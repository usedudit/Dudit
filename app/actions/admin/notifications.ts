"use server"

import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { broadcastAdminAnnouncement } from "@/lib/services/notification-automation.service"

export async function sendAdminAnnouncementAction(params: {
  title: string
  message: string
  url?: string
  target: "all" | "sellers" | "customers"
}) {
  let admin
  try {
    admin = await requireAdmin("admin")
  } catch {
    return { error: "Não autorizado" }
  }

  const title = params.title?.trim()
  const message = params.message?.trim()
  if (!title || !message) return { error: "Título e mensagem são obrigatórios" }

  const announcementId = randomUUID()

  await broadcastAdminAnnouncement({
    title,
    message,
    url: params.url?.trim() || undefined,
    target: params.target,
    announcementId,
  })

  await adminAuditLog({
    adminUserId: admin.userId,
    actionType: AdminActionType.ANNOUNCEMENT_SEND,
    targetType: "system",
    targetId: announcementId,
    metadata: {
      title,
      target: params.target,
      url: params.url || null,
    },
  })

  return { success: true, announcementId }
}
