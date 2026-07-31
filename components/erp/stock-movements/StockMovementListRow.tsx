'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Checkbox } from "@/components/reusable"
import { ThreeDotsIcon, ChevronUpIcon, ChevronDownIcon, Package } from "@/lib/icons"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface StockMovementListItemProps {
    movement: any
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onUndo: (id: string) => void
    onDetails: (id: string) => void
    showCheckbox?: boolean
    /** Quando false, oculta a coluna de ações (ex.: parcelas no detalhe da transação). */
    showActions?: boolean
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const StockMovementListItem = React.memo(
    ({
        movement,
        columns,
        selected,
        onSelect,
        onUndo,
        onDetails,
        showCheckbox = true,
        showActions = true,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: StockMovementListItemProps) => {

        const renderCellContent = (colId: string) => {
            switch (colId) {

                case "movement":
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <Package className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                            </div>
                            <div className="flex flex-col text-left min-w-0">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                                    {movement.displayId ? movement.displayId.slice(0, 8) : movement.id.slice(0, 8)}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                    {movement.parcelSubtitle != null && String(movement.parcelSubtitle).length > 0
                                        ? String(movement.parcelSubtitle)
                                        : `${movement.items_count} ${movement.items_count === 1 ? "item" : "itens"}`}
                                </span>
                            </div>
                        </div>
                    )

                case "reason":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body max-w-[200px] truncate block">
                            {movement.reason || "-"}
                        </span>
                    )
                case "reference":
                    return (
                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                            {movement.reference || "-"}
                        </span>
                    )

                case "date":
                    return (
                        <div className="flex flex-col text-left">
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                {movement.date.split(',')[0]}
                            </span>
                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                {movement.date.split(',')[1]}
                            </span>
                        </div>
                    )

                case "type":
                    if (movement.statusTag) {
                        const st = movement.statusTag as { label: string; variant: "green" | "red" | "orange" | "blue" | "cyan" | "purple" | "gray" }
                        return (
                            <div className={`flex ${getJustifyClass(columns.find(c => c.id === "type")?.align)}`}>
                                <Badge variant={st.variant} icon={null} className="w-fit whitespace-nowrap">
                                    {st.label}
                                </Badge>
                            </div>
                        )
                    }
                    return (
                        <div className={`flex ${getJustifyClass(columns.find(c => c.id === 'type')?.align)}`}>
                            <Badge variant={movement.type === 'in' ? "green" : "red"} icon={movement.type === 'in' ? <ChevronDownIcon /> : <ChevronUpIcon />} className="w-fit whitespace-nowrap">
                                {movement.type === 'in' ? "Entrada" : "Saída"}
                            </Badge>
                        </div>
                    )

                case "actions":
                    if (movement.actionsSlot) {
                        return (
                            <div
                                className="flex justify-center action-btn"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {movement.actionsSlot}
                            </div>
                        )
                    }
                    if (!showActions) {
                        return <span className="text-brand-inactive-text dark:text-dark-body text-xs"> </span>
                    }
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onUndo={() => onUndo(movement.id)}
                            />
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
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onDetails(movement.id)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                {showCheckbox && (
                    <td
                        className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Checkbox checked={selected} onChange={() => onSelect(movement.id)} />
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
        prev.movement === next.movement &&
        prev.selected === next.selected &&
        prev.columns === next.columns &&
        prev.showActions === next.showActions
)

StockMovementListItem.displayName = "StockMovementListItem"

export default StockMovementListItem
