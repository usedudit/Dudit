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
  }: StockMovementListItemProps) => {

    const renderCellContent = (colId: string) => {
      switch (colId) {

        case "movement":
          return (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                <Package className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] leading-tight mb-0.5">
                  {movement.displayId}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                  {movement.items_count} {movement.items_count === 1 ? 'item' : 'itens'}
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
          return (
            <div className="flex justify-start">
              <Badge variant={movement.type === 'in' ? "green" : "red"} icon={movement.type === 'in' ? <ChevronDownIcon /> : <ChevronUpIcon />} className="w-fit whitespace-nowrap">
                {movement.type === 'in' ? "Entrada" : "Saída"}
              </Badge>
            </div>
          )

        case "actions":
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
        onClick={() => onDetails(movement.id)}
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
            className={`py-2 px-4 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
          >
            {renderCellContent(col.id)}
          </td>
        ))}
      </motion.tr>
    )
  },
  (prev, next) =>
    prev.movement === next.movement &&
    prev.selected === next.selected &&
    prev.columns === next.columns
)

StockMovementListItem.displayName = "StockMovementListItem"

export default StockMovementListItem
