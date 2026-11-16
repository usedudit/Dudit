'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { ClockIcon, FileIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils";

interface QuoteGridCardProps {
    quote: any
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onDuplicate: () => void
    onPrint?: () => void
    onShare?: () => void
    onStatus?: () => void
    onClick?: () => void
    onPrefetchMouseEnter?: React.MouseEventHandler<HTMLDivElement>
    onPrefetchMouseLeave?: React.MouseEventHandler<HTMLDivElement>
    onPrefetchTouchStart?: React.TouchEventHandler<HTMLDivElement>
}

const QuoteGridCard = React.memo(
    ({
        quote,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onDuplicate,
        onPrint,
        onShare,
        onStatus,
        onClick,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: QuoteGridCardProps) => {

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onClick}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="flex gap-4 mb-2">
                    {/* Visual Indicator */}
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <FileIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Row 1: ID + Badge + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            {/* Nome do Item (ID) e Badge Lado a Lado */}
                            <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                                <h3
                                    className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                                    title={quote.displayId}
                                >
                                    {quote.displayId}
                                </h3>
                                {(quote.metadata?.origin === "marketplace" || quote.origin === "marketplace") && (
                                    <Badge variant="blue" className="text-[10px] py-0 px-1 font-bold shrink-0">
                                        Vitrine
                                    </Badge>
                                )}
                                <div className="flex items-center shrink-0">
                                    <Tooltip text={`Status: ${quote.statusLabel}`}>
                                        <Badge
                                            variant={quote.statusColor}
                                            icon={quote.statusIcon ?? undefined}
                                            className="whitespace-nowrap scale-90 shrink-0"
                                        />
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Checkbox */}
                            <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Row 2: Stats (Items • Total) */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                {quote.items_count || 0} {quote.items_count === 1 ? 'item' : 'itens'}
                            </span>
                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                            <span className="text-sm font-bold text-brand-primary">
                                {formatCurrency(quote.total_amount)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Info Rows */}
                <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                    {/* Row Vendedor (Admin) */}
                    {(quote.store_name || quote.stores?.name || quote.partner_name) && (
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Vendedor</span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {quote.store_name || quote.stores?.name || quote.partner_name}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Row 1: Cliente & Emissão */}
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {quote.customer_name}
                            </span>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end shrink-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Emissão</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {quote.formattedIssueDate}
                            </span>
                        </div>
                    </div>

                    {/* Row 2: Validade & Actions */}
                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Validade</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {quote.formattedExpirationDate || "Não definida"}
                            </span>
                        </div>

                        {/* Botão de Ações */}
                        <div
                            className="shrink-0"
                            onClick={(e) => {
                                e.stopPropagation()
                            }}
                        >
                            <ActionsDropdown
                                onEdit={onEdit}
                                onDuplicate={onDuplicate}
                                onDelete={onDelete}
                                onPrint={onPrint}
                                onShare={onShare}
                                onStatus={onStatus}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.quote === next.quote
)

QuoteGridCard.displayName = "QuoteGridCard"

export default QuoteGridCard
