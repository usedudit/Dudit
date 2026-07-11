"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ForbiddenError } from "@/lib/auth/authorization"

const ACTION_LABELS: Record<string, string> = {
  created: "Criou",
  updated: "Atualizou",
  deleted: "Removeu",
  paid: "Pagou",
  received: "Recebeu",
  cancelled: "Cancelou",
  refunded: "Reembolsou",
  settled: "Quitou",
  opened: "Abriu",
  closed: "Fechou",
  movement: "Movimentou",
}

function formatActionType(actionType: string): string {
  const normalized = actionType.toLowerCase().replace(/_/g, " ")
  return ACTION_LABELS[actionType] || normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export async function getAuditLogsAction() {
  const user = await requireUser()
  const context = await getCurrentPartnerContext()
  if (!context) throw new ForbiddenError("Sem acesso")

  const roleId = context.roleId
  if (roleId !== "owner" && roleId !== "admin") {
    throw new ForbiddenError("Sem acesso aos logs")
  }

  const supabase = getAdminClient()
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, actor_user_id, entity_type, entity_id, action_type, change_lines, metadata, source, created_at")
    .eq("partner_id", context.partnerId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    return { success: false as const, error: "Erro ao carregar logs" }
  }

  const actorIds = Array.from(
    new Set(
      (logs || [])
        .map((l: any) => l.actor_user_id)
        .filter(Boolean)
    )
  )

  let namesByUserId = new Map<string, string>()
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds)

    if (profiles) {
      namesByUserId = new Map(
        profiles.map((p: any) => [p.user_id, p.full_name?.trim() || "Usuário"])
      )
    }
  }

  const formatted = (logs || []).map((log: any) => {
    const lines = (log.change_lines || ["Ação registrada."]) as string[]
    return {
      id: log.id,
      actor: log.actor_user_id
        ? (namesByUserId.get(log.actor_user_id) || "Usuário")
        : "Sistema",
      entityType: log.entity_type || "-",
      entityId: log.entity_id || "-",
      actionType: formatActionType(log.action_type || "unknown"),
      actionRaw: log.action_type || "unknown",
      lines,
      source: log.source || "system",
      createdAt: log.created_at,
    }
  })

  return { success: true as const, data: formatted }
}
