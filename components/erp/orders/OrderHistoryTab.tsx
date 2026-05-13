"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { HistoryTimeline, type HistoryEntry } from "@/components/erp/shared/HistoryTimeline"

interface OrderHistoryTabProps {
    entries: HistoryEntry[]
    loading?: boolean
}

export function OrderHistoryTab({ entries, loading = false }: OrderHistoryTabProps) {
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
                title="Histórico do Pedido"
                subtitle="Acompanhe todas as movimentações e alterações realizadas neste pedido."
                emptyMessage="Nenhum histórico encontrado para este pedido."
            />
        </FadeIn>
    )
}
