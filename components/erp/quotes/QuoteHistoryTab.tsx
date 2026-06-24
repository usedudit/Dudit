"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"

interface QuoteHistoryTabProps {
    entries: HistoryEntry[]
    loading?: boolean
}

export function QuoteHistoryTab({ entries, loading = false }: QuoteHistoryTabProps) {
    if (loading) {
        return (
            <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 text-sm text-brand-inactive-text dark:text-dark-body">
                Carregando histórico...
            </div>
        )
    }

    return (
        <FadeIn>
            <HistoryTimeline
                entries={entries}
                title="Histórico do Orçamento"
                subtitle="Acompanhe todas as movimentações e alterações realizadas neste orçamento."
                emptyMessage="Nenhum histórico encontrado para este orçamento."
            />
        </FadeIn>
    )
}
