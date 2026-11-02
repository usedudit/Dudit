"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { ThreeDotsLoader } from "@/components/reusable"

interface OrderHistoryTabProps {
    entries: HistoryEntry[]
    loading?: boolean
}

export function OrderHistoryTab({ entries, loading = false }: OrderHistoryTabProps) {
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
                title="Histórico do Pedido"
                emptyMessage="Não foram encontrados eventos para este pedido."
            />
        </FadeIn>
    )
}
