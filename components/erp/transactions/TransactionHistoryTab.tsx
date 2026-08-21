"use client"

import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"
import { ThreeDotsLoader } from "@/components/reusable"

interface TransactionHistoryTabProps {
    entries: HistoryEntry[]
    loading?: boolean
}

export function TransactionHistoryTab({ entries, loading = false }: TransactionHistoryTabProps) {
    if (loading) {
        return (
            <ThreeDotsLoader />
        )
    }

    return (
        <FadeIn>
            <HistoryTimeline
                entries={entries}
                title="Histórico da Transação"
                emptyMessage="Não foram encontrados eventos para esta transação."
            />
        </FadeIn>
    )
}
