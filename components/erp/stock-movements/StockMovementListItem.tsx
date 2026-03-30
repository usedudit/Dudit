'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { ThreeDotsIcon, RotateIcon, ChevronUpIcon, ChevronDownIcon } from "@/lib/icons"

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
}

const StockMovementListItem = React.memo(
  ({
    movement,
    columns,
    selected,
    onSelect,
    onUndo,
    onDetails,
  }: StockMovementListItemProps) => {

    const renderCellContent = (colId: string) => {
      switch (colId) {

        case "product":
          return (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border flex-shrink-0 overflow-hidden">
                <img
                  src={movement.product.image || "https://img.dudit.com.br/static/Placeholder.png"}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                  loading="lazy"
                />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                  {movement.product.name}
                </span>
                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {movement.product.sku}
                </span>
              </div>
            </div>
          )

        case "quantity":
          return (
            <span className={`text-[13px] font-bold ${movement.type === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {movement.type === 'in' ? "+" : "-"}{movement.quantity}
            </span>
          )

        case "currentStock":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {movement.product.currentStock}
            </span>
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
              <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
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
                <DropdownItem onClick={() => onUndo(movement.id)}>
                  <RotateIcon className="w-4 h-4 mr-2" /> Desfazer movimentação
                </DropdownItem>
              </Dropdown>
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
        <td
          className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onChange={() => onSelect(movement.id)} />
        </td>

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
