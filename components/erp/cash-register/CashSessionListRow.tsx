'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, Checkbox } from "@/components/reusable"
import { ClockIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { usePartnerTimezone } from "@/lib/store-context"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface CashSessionListItemProps {
    session: any
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onDetails: (id: string) => void
    showCheckbox?: boolean
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const CashSessionListItem = React.memo(
    ({
        session,
        columns,
        selected,
        onSelect,
        onDetails,
        showCheckbox = false,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: CashSessionListItemProps) => {

        const tz = usePartnerTimezone()

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "session":
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <ClockIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </div>
                            <div className="flex flex-col text-left min-w-0">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                                    Sessão {session.id.slice(0, 8).toUpperCase()}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {session.user_name}
                                </span>
                            </div>
                        </div>
                    )

                case "open_date":
                    return (
                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                            {new Date(session.opened_at).toLocaleString("pt-BR", { timeZone: tz })}
                        </span>
                    )

                case "close_date":
                    return (
                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                            {session.closed_at ? new Date(session.closed_at).toLocaleString("pt-BR", { timeZone: tz }) : "-"}
                        </span>
                    )
                
                case "initial_amount":
                    return (
                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(Number(session.initial_amount || 0))}
                        </span>
                    )

                case "received_total":
                    return (
                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(Number(session.total_received_amount || 0))}
                        </span>
                    )

                case "expected_total":
                    return (
                        <span className="text-[13px] font-bold text-brand-primary">
                            {formatCurrency(Number(session.expected_drawer_total || 0))}
                        </span>
                    )

                case "status":
                    return (
                        <div className={`flex ${getJustifyClass(columns.find(c => c.id === 'status')?.align)}`}>
                            <Badge variant={session.status === 'open' ? "green" : "gray"} className="w-fit whitespace-nowrap">
                                {session.status === 'open' ? "Aberto" : "Fechado"}
                            </Badge>
                        </div>
                    )

                default:
                    return null
            }
        }

        const getJustifyClass = (align?: string) => {
            if (align === "center") return "justify-center"
            if (align === "right") return "justify-end"
            return "justify-start"
        }

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center"
            if (align === "right") return "text-right"
            return "text-left"
        }

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onDetails(session.id)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                {showCheckbox && (
                    <td
                        className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Checkbox checked={selected} onChange={() => onSelect(session.id)} />
                    </td>
                )}

                {columns.map((col) => (
                    <td
                        key={col.id}
                        className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
                    >
                        <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                            {renderCellContent(col.id)}
                        </div>
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.session === next.session &&
        prev.selected === next.selected &&
        prev.columns === next.columns
)

CashSessionListItem.displayName = "CashSessionListItem"

export default CashSessionListItem
