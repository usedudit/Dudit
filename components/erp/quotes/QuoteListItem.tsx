'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { ClockIcon, FileIcon } from "@/lib/icons"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface QuoteListItemProps {
    quote: any
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (quote: any) => void
    onDelete: (quote: any) => void
    onDuplicate: (quote: any) => void
    onClick: (quote: any) => void
}

const QuoteListItem = React.memo(
    ({
        quote,
        columns,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onDuplicate,
        onClick,
    }: QuoteListItemProps) => {

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "quote_id":
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 flex items-center gap-1.5">
                                    <span className="truncate max-w-[200px]">{quote.displayId}</span>
                                </span>
                                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    Criado por {quote.user_profiles?.full_name || "Sistema"}
                                </span>
                            </div>
                        </div>
                    )

                case "total":
                    return (
                        <span className="text-[13px] font-bold text-brand-primary">
                            R$ {Number(quote.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                    )

                case "status":
                    return (
                        <div className="flex items-center justify-center">
                            <Badge variant={quote.statusColor}>
                                {quote.statusLabel}
                            </Badge>
                        </div>
                    )

                case "customer":
                    return (
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                                {quote.customer_name}
                            </span>
                        </div>
                    )

                case "issue_date":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {quote.formattedIssueDate}
                        </span>
                    )

                case "expiration_date":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {quote.formattedExpirationDate || "—"}
                        </span>
                    )

                case "actions":
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={() => onEdit(quote)}
                                onDuplicate={() => onDuplicate(quote)}
                                onDelete={() => onDelete(quote)}
                            />
                        </div>
                    )

                default:
                    return null
            }
        }

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center justify-center"
            if (align === "right") return "text-right justify-end"
            return "text-left justify-start"
        }

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onClick(quote)}
            >
                <td
                    className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(quote.originalId)} />
                </td>

                {columns.map((col) => (
                    <td
                        key={col.id}
                        className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
                    >
                        {renderCellContent(col.id)}
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.quote === next.quote &&
        prev.selected === next.selected &&
        prev.columns === next.columns
)

QuoteListItem.displayName = "QuoteListItem"

export default QuoteListItem
