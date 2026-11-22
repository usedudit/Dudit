import type { HistoryEntry } from "@/components/erp/shared/HistoryTimeline"

const ACTION_TITLES: Record<string, string> = {
    "user.ban": "Banimento de Usuário",
    "user.unban": "Desbanimento de Usuário",
    "partner.suspend": "Suspensão de Parceiro",
    "partner.unsuspend": "Reativação de Parceiro",
    "partner.suspend_store": "Suspensão de Loja",
    "partner.unsuspend_store": "Reativação de Loja",
    "partner.disable_erp": "Desativação de Acesso ao ERP",
    "partner.enable_erp": "Reativação de Acesso ao ERP",
    "partner.disable_showcase": "Desativação de Vitrine Online",
    "partner.enable_showcase": "Reativação de Vitrine Online",
    "partner.disable_all_showcases": "Desativação de Vitrine Online (ERP Inteiro)",
    "partner.enable_all_showcases": "Reativação de Vitrine Online (ERP Inteiro)",
    "moderation.risk_score": "Ajuste de Score de Risco",
    "moderation.approve": "Moderação: Aprovado",
    "moderation.reject": "Moderação: Rejeitado",
    "moderation.reprocess": "Moderação: Reprocessado",
    "moderation.edit_field": "Moderação: Edição de Campo",
    "moderation.remove_image": "Moderação: Imagem Removida",
    "moderation.hide_review": "Moderação: Avaliação Ocultada",
    "moderation.edit_review": "Moderação: Avaliação Editada",
    "report.validate": "Validação de Denúncia",
    "report.dismiss": "Descarte de Denúncia",
    "report.spam": "Denúncia Marcada como Spam",
    "report.revert": "Reversão de Denúncia",
    "product.soft_delete": "Exclusão de Produto",
    "service.soft_delete": "Exclusão de Serviço",
    "recurring_plan.delete": "Exclusão de Plano Recorrente",
    "review.delete": "Exclusão de Avaliação",
    "subscription.cancel": "Cancelamento de Assinatura",
    "order.update": "Atualização de Pedido (Admin)",
    "return.update": "Atualização de Devolução (Admin)",
    "service_order.update": "Atualização de Ordem de Serviço (Admin)",
    "service_order.delete": "Exclusão de Ordem de Serviço (Admin)",
    "quote.update": "Atualização de Orçamento (Admin)",
    "quote.delete": "Exclusão de Orçamento (Admin)",
    "notification.announcement_send": "Envio de Comunicado",
}

function formatExpirationPtBr(iso: string): string {
    try {
        return new Date(iso).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
        })
    } catch {
        return iso
    }
}

function resolveActionTitle(actionType: string, meta: Record<string, any>): string {
    // suspendStore / unsuspendStore historically logged action_type = partner.suspend / partner.unsuspend with meta.storeId
    if (actionType === "partner.suspend" && meta?.storeId) {
        return "Suspensão de Loja"
    }
    if (actionType === "partner.unsuspend" && meta?.storeId) {
        return "Reativação de Loja"
    }
    return ACTION_TITLES[actionType] || actionType.replace(/[._]/g, " ")
}

function resolveEntryType(actionType: string): string {
    const a = (actionType || "").toLowerCase()
    if (
        a.includes("unban") ||
        a.includes("unsuspend") ||
        a.includes("enable") ||
        a.includes("approve") ||
        a.includes("activate") ||
        a.includes("validate")
    ) {
        return "approved"
    }
    if (
        a.includes("ban") ||
        a.includes("suspend") ||
        a.includes("disable") ||
        a.includes("reject") ||
        a.includes("delete") ||
        a.includes("cancel")
    ) {
        return "rejected"
    }
    if (a.includes("risk_score")) {
        return "note"
    }
    return actionType || "admin_action"
}

export function formatAdminAuditLogToHistoryEntry(
    ev: Record<string, any>,
    actorName?: string | null
): HistoryEntry {
    const meta: Record<string, any> =
        (ev.metadata && typeof ev.metadata === "object" ? ev.metadata : null) ||
        (ev.details && typeof ev.details === "object" ? ev.details : null) ||
        {}

    const actionType = String(ev.action_type || "")
    const title = resolveActionTitle(actionType, meta)
    const changeLines: string[] = [`Ação: ${title}`]

    if (meta.storeName) {
        changeLines.push(`Loja: ${meta.storeName}`)
    }

    if (meta.reason && typeof meta.reason === "string" && meta.reason.trim()) {
        changeLines.push(`Motivo: ${meta.reason.trim()}`)
    }

    if (meta.case_id) {
        changeLines.push(`Protocolo: ${meta.case_id}`)
    }

    const untilIso = meta.bannedUntil || meta.suspendedUntil || null
    if (meta.durationDays === "permanent") {
        changeLines.push("Vigência: Permanente")
    } else if (typeof meta.durationDays === "number" && meta.durationDays > 0) {
        const untilSuffix = untilIso ? ` (até ${formatExpirationPtBr(untilIso)})` : ""
        changeLines.push(
            `Vigência: ${meta.durationDays} ${meta.durationDays === 1 ? "dia" : "dias"}${untilSuffix}`
        )
    } else if (untilIso) {
        changeLines.push(`Vigência até: ${formatExpirationPtBr(untilIso)}`)
    }

    if (meta.oldScore !== undefined && meta.newScore !== undefined) {
        changeLines.push(`Score de risco: ${meta.oldScore} → ${meta.newScore}`)
    } else if (meta.riskScore !== undefined && meta.riskScore !== null) {
        changeLines.push(`Score de risco definido para: ${meta.riskScore}`)
    }

    if (Array.isArray(meta.changedFields) && meta.changedFields.length > 0) {
        changeLines.push(`Campos alterados: ${meta.changedFields.join(", ")}`)
    }

    const resolvedActor =
        (actorName && actorName.trim()) ||
        (ev.actor_name && String(ev.actor_name).trim()) ||
        (ev.admin_name && String(ev.admin_name).trim()) ||
        (meta.adminName && String(meta.adminName).trim()) ||
        "Equipe Dudit"

    return {
        id: ev.id || `${ev.created_at}-${actionType}`,
        actor_name: resolvedActor,
        change_lines: changeLines,
        created_at: ev.created_at,
        entry_type: resolveEntryType(actionType),
        highlight: true,
        metadata: {
            ...meta,
            is_admin_action: true,
            action_type: actionType,
        },
    }
}

export function formatAdminAuditLogsToHistoryEntries(
    events: Record<string, any>[],
    actorNameMap?: Map<string, string>
): HistoryEntry[] {
    if (!Array.isArray(events) || events.length === 0) return []
    return events.map((ev) => {
        const mappedName = ev.admin_user_id ? actorNameMap?.get(ev.admin_user_id) : undefined
        return formatAdminAuditLogToHistoryEntry(ev, mappedName)
    })
}
