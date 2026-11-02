"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { ThreeDotsLoader } from "@/components/reusable"

interface QuoteHistoryTabProps {
    entries: HistoryEntry[]
    loading?: boolean
}

export function QuoteHistoryTab({ entries, loading = false }: QuoteHistoryTabProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    return (
        <FadeIn>
            <HistoryTimeline
                entries={entries}
                title="Histórico do Orçamento"
                emptyMessage="Não foram encontrados eventos para este orçamento."
            />
        </FadeIn>
    )
}
