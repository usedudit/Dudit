"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import type { ReturnEvent } from "./types"
import { ThreeDotsLoader } from "@/components/reusable"

interface ReturnHistoryTabProps {
    events: ReturnEvent[]
    loading?: boolean
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

function mapReturnEventToHistoryEntry(event: ReturnEvent): HistoryEntry {
    const changeLines: string[] = []

    if (event.previous_status && event.new_status && event.previous_status !== event.new_status) {
        changeLines.push(`alterou status: ${getReturnStatusLabel(event.previous_status)} → ${getReturnStatusLabel(event.new_status)}`)
    }

    if (event.notes) {
        changeLines.push(event.notes)
    }

    // Enrich from metadata
    const metadata = (event as any).metadata || {}

    // 1. Items listed during creation or edits
    if (metadata.items && Array.isArray(metadata.items) && metadata.items.length > 0) {
        changeLines.push("Itens na solicitação:")
        metadata.items.forEach((item: any) => {
            const name = item.productName || item.product_name || `Item ${String(item.order_item_id || "").slice(0, 6)}`
            const qty = item.quantity || 1
            const conditionRaw = String(item.condition || "").toLowerCase()
            const cond = conditionRaw === "sealed" || conditionRaw === "lacrado" ? "Lacrado" : conditionRaw === "damaged" || conditionRaw === "danificado" ? "Danificado" : "Aberto"
            changeLines.push(`• ${name} (${qty}x) - Condição: ${cond}`)
        })
    }

    // 2. Financial outcomes / Exchange orders / Stock movement
    if (metadata.exchange_order_id) {
        changeLines.push(`Pedido de troca criado: #${String(metadata.exchange_order_id).slice(0, 8).toUpperCase()}`)
    }
    if (Number(metadata.exchange_shortfall_amount || 0) > 0) {
        changeLines.push(`Diferença complementar cobrada: R$ ${Number(metadata.exchange_shortfall_amount).toFixed(2)}`)
    }
    if (Number(metadata.exchange_surplus_amount || 0) > 0) {
        changeLines.push(`Crédito excedente gerado: R$ ${Number(metadata.exchange_surplus_amount).toFixed(2)}`)
    }
    if (metadata.refund_id || metadata.transaction_id) {
        changeLines.push(`Transação de reembolso registrada`)
    }
    if (metadata.store_credit_id || metadata.credit_transaction_id) {
        changeLines.push(`Vale-compra gerado com sucesso`)
    }
    if (metadata.return_to_inventory) {
        changeLines.push("Itens restaurados ao estoque físico")
    }

    if (changeLines.length === 0) {
        changeLines.push("atualizou a solicitação.")
    }

    return {
        id: event.id,
        actor_name: event.actor_name || "Sistema",
        change_lines: changeLines,
        created_at: event.created_at,
        entry_type: "return_event",
    }
}

export function ReturnHistoryTab({ events, loading = false }: ReturnHistoryTabProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    const entries = (events || []).map(mapReturnEventToHistoryEntry)

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
