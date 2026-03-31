'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Button } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import { ThreeDotsIcon, EditIcon, TrashIcon, EyeIcon, StoreIcon } from "@/lib/icons"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface OrderListItemProps {
  order: any
  columns: ColumnDef[]
  selected: boolean
  onSelect: (id: string) => void
  onEdit: (order: any) => void
  onDelete: (order: any) => void
  onDetails: (order: any) => void
}

const OrderListItem = React.memo(
  ({
    order,
    columns,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onDetails,
  }: OrderListItemProps) => {

    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "order_id":
          return (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-primary flex-shrink-0" />
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px]">
                {order.displayId}
              </span>
            </div>
          )

        case "total":
          return (
            <span className="text-[13px] font-bold text-brand-primary">
              R$ {Number(order.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )

        case "status":
          return (
            <div className="flex items-center gap-2">
              <Badge variant={order.statusColor}>
                {order.statusLabel}
              </Badge>
              {order.isUnfulfilled && (
                <Badge variant="gray" className="opacity-70">
                  Pendente
                </Badge>
              )}
            </div>
          )

        case "customer":
          return (
            <div className="flex items-center gap-2">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                {order.customer_name}
              </span>
              {order.customer_id && (
                <Badge variant="gray" className="text-[10px] h-4 px-1">
                  {order.customer_id}
                </Badge>
              )}
            </div>
          )

        case "date":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {order.formattedDate}
            </span>
          )

        case "channel":
          return (
            <div className="flex items-center gap-2 text-brand-inactive-text dark:text-dark-body">
              <StoreIcon size={14} />
              <span className="text-[13px] font-medium truncate max-w-[120px]">
                {order.store_name || "Loja"}
              </span>
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
                <DropdownItem onClick={() => onDetails(order)}>
                  <EyeIcon className="w-4 h-4 mr-2" /> Ver Detalhes
                </DropdownItem>
                <DropdownItem onClick={() => onEdit(order)}>
                  <EditIcon className="w-4 h-4 mr-2" /> Editar
                </DropdownItem>
                <DropdownItem
                  onClick={() => onDelete(order)}
                  className="text-brand-red focus:text-brand-red focus:bg-red-50 dark:focus:bg-red-900/10"
                >
                  <TrashIcon className="w-4 h-4 mr-2" /> Excluir
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
        onClick={() => onDetails(order)}
      >
        <td
          className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onChange={() => onSelect(order.originalId)} />
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
    prev.order === next.order &&
    prev.selected === next.selected &&
    prev.columns === next.columns
)

OrderListItem.displayName = "OrderListItem"

export default OrderListItem
