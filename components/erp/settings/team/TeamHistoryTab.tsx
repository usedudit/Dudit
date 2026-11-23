"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { ThreeDotsLoader } from "@/components/reusable"

interface TeamHistoryTabProps {
    entries: HistoryEntry[]
    loading?: boolean
}

export function TeamHistoryTab({ entries, loading = false }: TeamHistoryTabProps) {
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
                title="Histórico da Equipe"
                emptyMessage="Nenhum registro de histórico encontrado para esta equipe."
                disableDuditHighlight
            />
        </FadeIn>
    )
}
