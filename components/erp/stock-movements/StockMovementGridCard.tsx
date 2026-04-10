'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Checkbox } from "@/components/reusable"
import { ChevronDownIcon, ChevronUpIcon, Package } from "@/lib/icons"

interface StockMovementGridCardProps {
    movement: any
    selected?: boolean
    onSelect?: (id: string) => void
    onUndo: (id: string) => void
    onDetails: (id: string) => void
}

const StockMovementGridCard = React.memo(
    ({
        movement,
        selected,
        onSelect,
        onUndo,
        onDetails
    }: StockMovementGridCardProps) => {

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-dark/90 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={() => onDetails(movement.id)}
            >
                <div className="flex gap-4 mb-2">
                    {/* Movement Icon */}
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <Package className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: ID + Badge + Checkbox */}
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <h3
                                    className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                                    title={movement.displayId}
                                >
                                    {movement.displayId}
                                </h3>

                                <Badge
                                    variant={movement.type === 'in' ? "green" : "red"}
                                    icon={movement.type === 'in' ? <ChevronDownIcon /> : <ChevronUpIcon />}
                                    className="whitespace-nowrap scale-90"
                                >
                                    {movement.type === 'in' ? "Entrada" : "Saída"}
                                </Badge>
                            </div>

                            {onSelect && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                        checked={selected || false}
                                        onChange={() => onSelect(movement.id)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Linha 2: Items count */}
                        <div className="flex items-center">
                            <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                <span>{movement.items_count} {movement.items_count === 1 ? 'item' : 'itens'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Motivo */}
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Motivo</span>
                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                            {movement.reason || '-'}
                        </span>
                    </div>

                    {/* Data e Ações */}
                    <div className="flex items-end justify-between mt-1">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{movement.date.split(',')[0]}</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{movement.date.split(',')[1]}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <div
                                className="shrink-0"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <ActionsDropdown
                                    onUndo={() => onUndo(movement.id)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.movement === next.movement &&
        prev.selected === next.selected
)

StockMovementGridCard.displayName = "StockMovementGridCard"

export default StockMovementGridCard
