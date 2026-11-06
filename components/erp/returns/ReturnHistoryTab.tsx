"use client"

import { formatCurrency } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import type { ReturnEvent } from "./types"
import { ThreeDotsLoader } from "@/components/reusable"

interface ReturnHistoryTabProps {
    events: ReturnEvent[]
    loading?: boolean
    /** Painel admin: revela qual membro da equipe Dudit executou a ação. */
    showAdminActor?: boolean
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

function mapReturnEventToHistoryEntry(event: ReturnEvent, showAdminActor = false): HistoryEntry {
    const changeLines: string[] = []
    const metadata = event.metadata || {}
    const actionType = event.event_type || "updated"
    const isDuditAction = Boolean(metadata.dudit_action) || event.source === "admin"
    const actorName = isDuditAction
        ? (showAdminActor && metadata.admin_actor_name
            ? String(metadata.admin_actor_name)
            : "Equipe Dudit")
        : (event.actor_name || "Sistema")

    if (event.previous_status && event.new_status && event.previous_status !== event.new_status) {
        changeLines.push(`alterou status: ${getReturnStatusLabel(event.previous_status)} → ${getReturnStatusLabel(event.new_status)}`)
    }

    if (event.notes) {
        changeLines.push(event.notes)
    }

    if (metadata.refund_amount && Number(metadata.refund_amount) > 0) {
        changeLines.push(`Valor do reembolso: ${formatCurrency(Number(metadata.refund_amount))}`)
        if (metadata.refund_status) {
            changeLines.push(`Status do reembolso: ${metadata.refund_status}`)
        }
        if (metadata.refund_payment_method) {
            changeLines.push(`Método de reembolso: ${metadata.refund_payment_method}`)
        }
    }

    if (metadata.store_credit_amount && Number(metadata.store_credit_amount) > 0) {
        changeLines.push(`Vale-compra gerado: ${formatCurrency(Number(metadata.store_credit_amount))}`)
    }

    if (metadata.exchange_order_id) {
        changeLines.push(`Pedido de troca criado: #${String(metadata.exchange_order_id).slice(0, 8).toUpperCase()}`)
    }
    if (Number(metadata.exchange_shortfall_amount || 0) > 0) {
        changeLines.push(`Diferença complementar cobrada: ${formatCurrency(Number(metadata.exchange_shortfall_amount))}`)
    }
    if (Number(metadata.exchange_surplus_amount || 0) > 0) {
        changeLines.push(`Crédito excedente gerado: ${formatCurrency(Number(metadata.exchange_surplus_amount))}`)
    }
    if (metadata.exchange_balance_resolution) {
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

export function ReturnHistoryTab({ events, loading = false, showAdminActor = false }: ReturnHistoryTabProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    const entries = (events || []).map((event) => mapReturnEventToHistoryEntry(event, showAdminActor))

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
