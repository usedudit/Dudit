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
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    return (
        <FadeIn>
            <HistoryTimeline
                entries={entries}
                title="Histórico do Pedido"
                subtitle="Acompanhe todas as movimentações e alterações realizadas neste pedido."
                emptyMessage="Nenhum histórico encontrado para este pedido."
            />
        </FadeIn>
    )
}
