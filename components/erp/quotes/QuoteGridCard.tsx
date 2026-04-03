'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { ThreeDotsIcon, EditIcon, TrashIcon, CopyIcon, ClockIcon, FileIcon } from "@/lib/icons"

interface QuoteGridCardProps {
    quote: any
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onDuplicate: () => void
    onClick?: () => void
}

const QuoteGridCard = React.memo(
    ({
        quote,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onDuplicate,
        onClick
    }: QuoteGridCardProps) => {

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`group relative bg-white dark:bg-dark-surface rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full ${selected ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-brand-border dark:border-dark-border hover:border-brand-primary/50'}`}
                onClick={onClick}
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary"></div>

                <div className="flex gap-4 mb-2 p-4 pb-0 pt-5">
                    {/* Visual Indicator */}
                    <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center">
                        <FileIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading" />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* ID + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex flex-col min-w-0 pr-1 gap-1">
                                <h3
                                    className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate"
                                    title={quote.displayId}
                                >
                                    <span className="truncate">{quote.displayId}</span>
                                </h3>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge variant={quote.statusColor}>
                                        {quote.statusLabel}
                                    </Badge>
                                </div>
                            </div>

                            {/* Checkbox */}
                            <div className="flex-shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Rows */}
                <div className="mt-4 flex flex-col gap-3 px-4">
                    <div className="flex flex-col gap-0.5 text-left">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                {quote.customer_name}
                            </span>
                            {quote.customer_id && (
                                <Badge variant="gray" className="text-[9px] h-3.5 px-0.5">
                                    {quote.customer_id}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Area */}
                <div className="mt-auto pt-3 px-4 pb-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-0.5 text-left">
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Total</span>
                            <span className="text-[14px] font-bold text-brand-primary">
                                R$ {Number(quote.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Emissão</span>
                            <div className="flex items-center gap-1 justify-end">
                                <ClockIcon size={12} className="text-brand-inactive-text" />
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                    {quote.formattedIssueDate}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between mt-1">
                        <div className="text-xs text-brand-inactive-text italic">
                            {quote.formattedExpirationDate ? `Validade: ${quote.formattedExpirationDate}` : ""}
                        </div>

                        {/* Dropdown Button */}
                        <div
                            className="flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Dropdown
                                align="right"
                                showChevron={false}
                                trigger={
                                    <Button
                                        variant="outline"
                                        className="w-[34px] h-[34px] rounded-full border-brand-border hover:bg-white dark:hover:bg-dark-surface p-0 flex items-center justify-center"
                                    >
                                        <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                                    </Button>
                                }
                            >
                                <DropdownItem onClick={onEdit}>
                                    <EditIcon className="w-4 h-4 mr-2" /> Editar
                                </DropdownItem>
                                <DropdownItem onClick={onDuplicate}>
                                    <CopyIcon className="w-4 h-4 mr-2" /> Duplicar
                                </DropdownItem>
                                <DropdownItem
                                    onClick={onDelete}
                                    className="text-brand-red focus:text-brand-red focus:bg-red-50 dark:focus:bg-red-900/10"
                                >
                                    <TrashIcon className="w-4 h-4 mr-2" /> Excluir
                                </DropdownItem>
                            </Dropdown>
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
