"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import type { ReturnEvent } from "./types"

interface ReturnHistoryTabProps {
    events: ReturnEvent[]
    loading?: boolean
}

function mapReturnEventToHistoryEntry(event: ReturnEvent): HistoryEntry {
    const changeLines: string[] = []

    if (event.previous_status && event.new_status && event.previous_status !== event.new_status) {
        changeLines.push(`alterou status: ${event.previous_status} → ${event.new_status}`)
    }

    if (event.notes) {
        changeLines.push(event.notes)
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
            <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 text-sm text-brand-inactive-text dark:text-dark-body">
                Carregando histórico...
            </div>
        )
    }

    const entries = (events || []).map(mapReturnEventToHistoryEntry)

    return (
        <FadeIn>
            <HistoryTimeline
                entries={entries}
                title="Histórico da Devolução"
                subtitle="Acompanhe todas as movimentações e alterações realizadas nesta solicitação."
                emptyMessage="Nenhum histórico encontrado para esta devolução."
            />
        </FadeIn>
    )
}
