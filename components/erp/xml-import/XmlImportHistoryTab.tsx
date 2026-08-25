"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { ThreeDotsLoader } from "@/components/reusable"

interface XmlImportHistoryTabProps {
    events: HistoryEntry[]
    loading?: boolean
}

export function XmlImportHistoryTab({ events, loading = false }: XmlImportHistoryTabProps) {
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
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
