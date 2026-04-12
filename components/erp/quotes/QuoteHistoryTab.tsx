"use client"

import React from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { ClockIcon } from "@/lib/icons"
import { formatDateTime } from "@/lib/utils"

export interface QuoteHistoryEntryRow {
    id: number
    actor_name: string
    change_lines: string[]
    created_at: string
}

interface QuoteHistoryTabProps {
    entries: QuoteHistoryEntryRow[]
    loading?: boolean
}

export function QuoteHistoryTab({ entries, loading = false }: QuoteHistoryTabProps) {
    return (
        <FadeIn>
            <div className="max-w-[1000px]">
                <div className="mb-6">
                    <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Histórico do orçamento</h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Registro de alterações e eventos deste orçamento.
                    </p>
                </div>

                {loading ? (
                    <div className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 text-sm text-brand-inactive-text dark:text-dark-body">
                        Carregando histórico...
                    </div>
                ) : entries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-6 text-sm text-brand-inactive-text dark:text-dark-body">
                        Nenhum histórico encontrado para este orçamento.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {entries.map((entry) => (
                            <div
                                key={entry.id}
                                className="rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5"
                            >
                                <div className="flex items-center gap-2 text-xs font-medium text-brand-inactive-text dark:text-dark-body mb-3">
                                    <ClockIcon size={14} />
                                    <span>{formatDateTime(entry.created_at)}</span>
                                </div>

                                <div className="space-y-2">
                                    {entry.change_lines.map((line, index) => (
                                        <p key={`${entry.id}-${index}`} className="text-sm text-brand-dark dark:text-dark-heading leading-6">
                                            <strong>{entry.actor_name}</strong> {line} em {formatDateTime(entry.created_at)}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </FadeIn>
    )
}
