"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"

interface XmlImportHistoryTabProps {
    events: HistoryEntry[]
    loading?: boolean
}

export function XmlImportHistoryTab({ events, loading = false }: XmlImportHistoryTabProps) {
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
                entries={events}
                title="Histórico da Importação"
                emptyMessage="Não foram encontrados eventos para esta importação."
            />
        </FadeIn>
    )
}
