"use client"

import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MoneyIcon, ClockIcon, FileIcon, BlockedIcon, InfoIcon, CheckCircleIcon, RouteIcon } from "@/lib/icons"
import { formatDateTime, cn, humanizeTimelineChangeLine } from "@/lib/utils"
import { IconPlaceholder } from "@/components/reusable"

export interface HistoryEntry {
    id: string | number
    actor_name: string
    change_lines: string[]
    created_at: string
    metadata?: Record<string, any> | null
    entry_type?: string
    /** Destaca a entrada (ex.: ação feita pela equipe Dudit). */
    highlight?: boolean
}

interface HistoryTimelineProps {
    entries: HistoryEntry[]
    emptyMessage?: string
    title?: string
    subtitle?: string
    /** Disable Dudit/admin highlighting (green icon circle) - use for standard audit logs like appointment history */
    disableDuditHighlight?: boolean
}

/**
 * Determines the most appropriate icon based on the entry type or change content.
 */
function getEntryIcon(entry: HistoryEntry) {
    const type = (entry.entry_type || "").toLowerCase()
    const content = entry.change_lines.join(" ").toLowerCase()

    // Priority 1: Cancellation, Failure or Rejection
    if (
        type.includes("cancel") || content.includes("cancel") ||
        type.includes("failed") || content.includes("falh") ||
        type.includes("reject") || content.includes("rejeit")
    ) {
        return BlockedIcon
    }

    // Priority 2: Delivered / Completed
    if (type.includes("delivered") || content.includes("entregue com sucesso") || content.includes("pedido entregue")) {
        return CheckCircleIcon
    }

    // Priority 3: Delivery route / Driver assignment / Picked up
    if (
        type.includes("delivery") || type.includes("driver") || type.includes("sent") || type.includes("picked_up") ||
        content.includes("entregador") || content.includes("rota") || content.includes("saiu para entrega") ||
        content.includes("retirou o pedido") || content.includes("aceitou a entrega")
    ) {
        return RouteIcon
    }

    // Priority 4: Money / Payment related
    if (
        type.includes("paid") || type.includes("payment") || type.includes("price") ||
        type.includes("money") || type.includes("total") || type.includes("discount") ||
        type.includes("shipping") || content.includes("valor") || content.includes("pago") ||
        content.includes("preço") || content.includes("desconto") || content.includes("frete") ||
        content.includes("pagamento")
    ) {
        return MoneyIcon
    }

    // Priority 5: Time / Duration related
    if (type.includes("duration") || type.includes("date") || type.includes("time") || content.includes("duração") || content.includes("data") || content.includes("horário")) {
        return ClockIcon
    }

    // Priority 6: Notes / Observations
    if (type.includes("note") || type.includes("internal_notes") || type.includes("observation") || content.includes("nota") || content.includes("observação")) {
        return FileIcon
    }

    return InfoIcon
}

export function HistoryTimeline({
    entries,
    emptyMessage = "Nenhum histórico encontrado.",
    title,
    subtitle,
    disableDuditHighlight
}: HistoryTimelineProps) {
    if (entries.length === 0) {
        return (
            <IconPlaceholder icon={ClockIcon} title="Nenhum histórico encontrado" subtitle={emptyMessage} />
        )
    }

    return (
        <div className="max-w-[1000px] py-4">
            {(title || subtitle) && (
                <div className="mb-8">
                    {title && <h2 className="text-md lg:text-xl font-medium text-brand-dark dark:text-dark-heading mb-6">{title}</h2>}
                    {subtitle && <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">{subtitle}</p>}
                </div>
            )}

            <div className="relative space-y-0">
                {entries.map((entry, index) => {
                    const Icon = getEntryIcon(entry)
                    const isSystem = entry.actor_name?.toLowerCase() === "sistema"
                    const isErp = (entry as any).source === "erp" || entry.metadata?.source === "erp"
                    const isDudit = !disableDuditHighlight && !isErp && Boolean(
                        entry.highlight ||
                        entry.actor_name?.toLowerCase().includes("dudit") ||
                        entry.metadata?.dudit_action ||
                        (entry.metadata as any)?.is_admin_action ||
                        entry.metadata?.admin_actor_name
                    )
                    const actorDisplayName = (isErp && entry.actor_name && entry.actor_name.toLowerCase().includes("dudit"))
                        ? "Vendedor"
                        : entry.actor_name
                    const isDriver = Boolean(
                        entry.actor_name?.toLowerCase().includes("entregador") ||
                        entry.metadata?.is_driver ||
                        entry.metadata?.driver_id ||
                        (entry.metadata as any)?.driver_action ||
                        (entry as any).source === "delivery_driver_app" ||
                        (entry as any).source === "delivery_driver"
                    )

                    return (
                        <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="relative pl-14 pb-8 last:pb-0 group"
                        >
                            {/* Icon Circle */}
                            <div className={cn(
                                "absolute left-0 top-0 w-10 h-10 rounded-full flex border items-center justify-center shrink-0 transition-colors",
                                isDudit
                                    ? "bg-brand-green/20 border-brand-green text-brand-green dark:bg-brand-green/25 dark:border-brand-green"
                                    : isDriver
                                        ? "bg-brand-orange/15 border-brand-orange/40 text-brand-orange dark:bg-brand-orange/20 dark:border-brand-orange/50"
                                        : "bg-brand-slate dark:bg-dark-border/50 border-brand-border dark:border-dark-border"
                            )}>
                                <Icon
                                    size={16}
                                    className={cn(
                                        isDudit
                                            ? "text-brand-green"
                                            : isDriver
                                                ? "text-brand-orange"
                                                : "text-brand-dark dark:text-dark-heading"
                                    )}
                                />
                            </div>

                            {/* Connecting Line to next item */}
                            {index < entries.length - 1 && (
                                <div className="absolute left-[19.5px] top-10 bottom-0 w-[1px] bg-brand-border dark:bg-dark-border" />
                            )}

                            {/* Content */}
                            <div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className={cn(
                                        "font-bold text-[15px]",
                                        isDudit ? "text-brand-green" : isDriver ? "text-brand-orange" : "text-brand-dark dark:text-dark-heading"
                                    )}>
                                        {actorDisplayName}
                                    </span>
                                    <span className="text-[14px] text-brand-inactive-text dark:text-dark-body">
                                        • {formatDateTime(entry.created_at)}
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
                                            {humanizeTimelineChangeLine(line)}
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
