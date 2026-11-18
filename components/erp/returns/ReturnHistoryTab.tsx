"use client"

import { formatCurrency, resolveTimelineActorName, humanizeTimelineChangeLine, isDuditTeamActorName, type TimelineViewer } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import type { ReturnEvent } from "./types"
import { ThreeDotsLoader } from "@/components/reusable"

interface ReturnHistoryTabProps {
    events: ReturnEvent[]
    loading?: boolean
    /** Painel admin: revela qual membro da equipe Dudit executou a ação. */
    showAdminActor?: boolean
    viewer?: TimelineViewer
}

function getReturnStatusLabel(status: string) {
    switch (status) {
        case "PENDING_REVIEW": return "Pendente"
        case "UNDER_ANALYSIS": return "Em análise"
        case "APPROVED": return "Aprovada"
        case "REJECTED": return "Recusada"
        case "WAITING_CUSTOMER": return "Aguardando cliente"
        case "WAITING_ITEM_RETURN": return "Aguardando devolução do item"
        case "PROCESSING": return "Aprovada"
        case "RESOLVED": return "Concluída"
        case "EXPIRED": return "Expirada"
        case "ESCALATED": return "Escalada para moderação"
        default: return status || "Pendente"
    }
}

function getStatusActionLabel(actionType: string) {
    switch (actionType) {
        case "created": return "Solicitação criada"
        case "approved": return "Solicitação aprovada"
        case "rejected": return "Solicitação recusada"
        case "resolved": return "Solicitação resolvida"
        case "updated": return "Solicitação atualizada"
        case "mercadopago_refund_executed": return "Reembolso via Mercado Pago executado"
        default: return actionType || "Atualização"
    }
}

function mapReturnEventToHistoryEntry(
    event: ReturnEvent,
    showAdminActor = false,
    viewer: TimelineViewer = showAdminActor ? "admin" : "seller"
): HistoryEntry {
    const changeLines: string[] = []
    const metadata = event.metadata || {}
    const actionType = event.event_type || "updated"
    const isCustomerEvent = actionType === "created" || Boolean(metadata.is_buyer || event.source === "marketplace")

    const actorName = resolveTimelineActorName({
        entry: {
            actor_user_id: event.changed_by || null,
            actor_name: event.actor_name || null,
            metadata: {
                ...metadata,
                is_buyer: isCustomerEvent,
                admin_actor_name: metadata.admin_actor_name,
            },
            source: event.source || null,
            entry_type: actionType === "created" ? "return_created" : actionType,
        },
        viewer,
        orderCustomerName: event.actor_name || null,
    })

    const isErpAction = event.source === "erp" || metadata?.source === "erp"
    const isDuditAction = !isErpAction && Boolean(
        metadata.dudit_action ||
        event.source === "admin" ||
        metadata?.is_admin_action ||
        isDuditTeamActorName(event.actor_name) ||
        isDuditTeamActorName(actorName)
    )

    if (actionType === "created") {
        changeLines.push("Solicitação de troca/devolução criada.")
    } else if (event.previous_status && event.new_status && event.previous_status !== event.new_status) {
        changeLines.push(humanizeTimelineChangeLine(`alterou status: ${getReturnStatusLabel(event.previous_status)} → ${getReturnStatusLabel(event.new_status)}`))
    }

    if (Array.isArray(event.change_lines) && event.change_lines.length > 0) {
        for (const rawLine of event.change_lines) {
            const line = humanizeTimelineChangeLine(rawLine)
            if (line && !changeLines.includes(line)) {
                changeLines.push(line)
            }
        }
    } else if (event.notes) {
        const line = humanizeTimelineChangeLine(event.notes)
        if (line && !changeLines.includes(line)) {
            changeLines.push(line)
        }
    }

    if (metadata.reason && !changeLines.some(l => l.includes(metadata.reason))) {
        changeLines.push(`Motivo: "${metadata.reason}"`)
    }

    // Informações financeiras e detalhes adicionais (mostrados apenas quando aprovado/resolvido)
    const isApprovedOrResolved = event.new_status === "APPROVED" || event.new_status === "RESOLVED" || event.new_status === "PROCESSING" || actionType === "approved" || actionType === "resolved"
    const isRejectedEvent = event.new_status === "REJECTED" || actionType === "rejected" || metadata.to_status === "REJECTED"

    if (!isRejectedEvent && isApprovedOrResolved && metadata.refund_amount && Number(metadata.refund_amount) > 0) {
        changeLines.push(`Valor do reembolso: ${formatCurrency(Number(metadata.refund_amount))}`)
        if (metadata.refund_status) {
            changeLines.push(`Status do reembolso: ${metadata.refund_status}`)
        }
        if (metadata.refund_payment_method) {
            changeLines.push(`Método de reembolso: ${metadata.refund_payment_method}`)
        }
    }

    if (!isRejectedEvent && isApprovedOrResolved && metadata.store_credit_amount && Number(metadata.store_credit_amount) > 0) {
        changeLines.push(`Vale-compra gerado: ${formatCurrency(Number(metadata.store_credit_amount))}`)
    }

    if (!isRejectedEvent && isApprovedOrResolved && metadata.exchange_order_id) {
        changeLines.push(`Pedido de troca criado: #${String(metadata.exchange_order_id).slice(0, 8).toUpperCase()}`)
    }
    if (!isRejectedEvent && isApprovedOrResolved && Number(metadata.exchange_shortfall_amount || 0) > 0) {
        changeLines.push(`Diferença complementar cobrada: ${formatCurrency(Number(metadata.exchange_shortfall_amount))}`)
    }
    if (!isRejectedEvent && isApprovedOrResolved && Number(metadata.exchange_surplus_amount || 0) > 0) {
        changeLines.push(`Crédito excedente gerado: ${formatCurrency(Number(metadata.exchange_surplus_amount))}`)
    }
    if (!isRejectedEvent && isApprovedOrResolved && metadata.exchange_balance_resolution) {
        const dest = metadata.exchange_balance_resolution === "store_credit" ? "vale-compra" : "reembolso"
        changeLines.push(`Saldo da troca enviado para: ${dest}`)
    }

    if (metadata.stock_movement_id) {
        changeLines.push("Itens restaurados ao estoque físico")
    }

    if (metadata.resolution) {
        const resolLabel = metadata.resolution === "refund" ? "Reembolso" :
            metadata.resolution === "exchange" ? "Troca" :
                metadata.resolution === "store_credit" ? "Vale-compra" : metadata.resolution
        changeLines.push(`Resolução desejada: ${resolLabel}`)
    }

    if (metadata.items && Array.isArray(metadata.items) && metadata.items.length > 0) {
        changeLines.push("Itens na solicitação:")
        metadata.items.forEach((item: any) => {
            const name = item.productName || item.product_name || `Item ${String(item.order_item_id || "").slice(0, 6)}`
            const qty = item.quantity || 1
            const conditionRaw = String(item.condition || "").toLowerCase()
            const cond = conditionRaw === "sealed" || conditionRaw === "lacrado" ? "Lacrado" : conditionRaw === "damaged" || conditionRaw === "danificado" ? "Danificado" : "Aberto"
            changeLines.push(`  ${name} (${qty}x) - Condição: ${cond}`)
        })
    }

    if (metadata.mpRefundId) {
        changeLines.push(`Refund ID do Mercado Pago: ${metadata.mpRefundId}`)
    }

    if (changeLines.length === 0) {
        changeLines.push(getStatusActionLabel(actionType) + ".")
    }

    return {
        id: event.id,
        actor_name: actorName,
        change_lines: changeLines,
        created_at: event.created_at,
        entry_type: "return_event",
        highlight: isDuditAction,
    }
}

export function ReturnHistoryTab({
    events,
    loading = false,
    showAdminActor = false,
    viewer = showAdminActor ? "admin" : "seller",
}: ReturnHistoryTabProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    const entries = (events || []).map((event) => mapReturnEventToHistoryEntry(event, showAdminActor, viewer))

    return (
        <FadeIn>
            <HistoryTimeline
                entries={entries}
                title="Histórico da Devolução"
                emptyMessage="Não foram encontrados eventos para esta devolução."
            />
        </FadeIn>
    )
}
