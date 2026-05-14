"use client"

import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MoneyIcon, ClockIcon, FileIcon, BlockedIcon, InfoIcon } from "@/lib/icons"
import { formatDateTime, cn } from "@/lib/utils"

export interface HistoryEntry {
    id: string | number
    actor_name: string
    change_lines: string[]
    created_at: string
    metadata?: Record<string, any> | null
    entry_type?: string
}

interface HistoryTimelineProps {
    entries: HistoryEntry[]
    emptyMessage?: string
    title?: string
    subtitle?: string
}

/**
 * Determines the most appropriate icon based on the entry type or change content.
 */
function getEntryIcon(entry: HistoryEntry) {
    const type = (entry.entry_type || "").toLowerCase()
    const content = entry.change_lines.join(" ").toLowerCase()

    // If more than one change, use InfoIcon
    if (entry.change_lines.length > 1) return InfoIcon

    // Priority 1: Cancellation/Rejection
    if (type.includes("cancel") || content.includes("cancel") || type.includes("reject") || content.includes("rejeit")) {
        return BlockedIcon
    }

    // Priority 2: Money related
    if (
        type.includes("paid") || type.includes("payment") || type.includes("price") ||
        type.includes("money") || type.includes("total") || type.includes("discount") ||
        type.includes("shipping") || content.includes("valor") || content.includes("pago") ||
        content.includes("preço") || content.includes("desconto") || content.includes("frete")
    ) {
        return MoneyIcon
    }

    // Priority 3: Time/Duration related
    if (type.includes("duration") || type.includes("date") || type.includes("time") || content.includes("duração") || content.includes("data") || content.includes("horário")) {
        return ClockIcon
    }

    // Priority 4: Notes/Observations
    if (type.includes("note") || type.includes("internal_notes") || type.includes("observation") || content.includes("nota") || content.includes("observação")) {
        return FileIcon
    }

    return InfoIcon
}

export function HistoryTimeline({
    entries,
    emptyMessage = "Nenhum histórico encontrado.",
    title,
    subtitle
}: HistoryTimelineProps) {
    if (entries.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-8 text-center text-sm text-brand-inactive-text dark:text-dark-body">
                {emptyMessage}
            </div>
        )
    }

    return (
        <div className="max-w-[1000px] py-4">
            {(title || subtitle) && (
                <div className="mb-8">
                    {title && <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h2>}
                    {subtitle && <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{subtitle}</p>}
                </div>
            )}

            <div className="relative space-y-0">
                {/* Vertical Line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-px bg-brand-border dark:bg-dark-border" />

                {entries.map((entry, index) => {
                    const Icon = getEntryIcon(entry)
                    const isSystem = entry.actor_name.toLowerCase() === "sistema"

                    return (
                        <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="relative pl-12 pb-10 last:pb-0 group"
                        >
                            {/* Icon Circle */}
                            <div className={cn(
                                "w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-dark-border/90 transition-colors"
                            )}>
                                <Icon
                                    size={18}
                                    className="text-brand-dark dark:text-dark-heading"
                                />
                            </div>

                            {/* Content */}
                            <div className="pt-1.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                                    <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading">
                                        {entry.actor_name}
                                    </span>
                                    <span className="text-[14px] text-brand-inactive-text dark:text-dark-body">
                                        {formatDateTime(entry.created_at)}
                                    </span>
                                    <span className="text-[13px] font-medium text-brand-inactive-text/60 dark:text-dark-body/60">
                                        • {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: ptBR })}
                                    </span>
                                </div>

                                <div className="space-y-1.5">
                                    {entry.change_lines.map((line, lIdx) => (
                                        <p
                                            key={`${entry.id}-line-${lIdx}`}
                                            className="text-[14px] leading-relaxed text-brand-dark/90 dark:text-dark-body"
                                        >
                                            {line}
                                        </p>
                                    ))}
                                </div>

                                {/* Optional Card-like metadata display if needed in future */}
                                {/* {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                                    <div className="mt-3 p-3 rounded-lg bg-brand-gray dark:bg-dark-border/30 border border-brand-border dark:border-dark-border">
                                        ...
                                    </div>
                                )} */}
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}
