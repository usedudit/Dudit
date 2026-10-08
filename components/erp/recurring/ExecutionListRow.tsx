"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, DropdownItem } from "@/components/reusable"
import { getRecurringExecutionStatusLabel } from "@/lib/types/recurring"
import { formatDate, formatDateTime } from "@/lib/utils"
import { EyeIcon, InfoIcon } from "@/lib/icons"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface ExecutionListRowProps {
  execution: any
  columns: ColumnDef[]
  onOpenOrder?: (orderId: string) => void
  onViewError?: (errorMessage: string) => void
}

const statusVariant = (status: string) => {
  if (status === "completed") return "green" as const
  if (status === "failed") return "red" as const
  if (status === "awaiting_payment") return "orange" as const
  return "gray" as const
}

export const ExecutionListRow: React.FC<ExecutionListRowProps> = ({
  execution,
  columns,
  onOpenOrder,
  onViewError,
}) => {
  const getAlignClass = (align?: string) => {
    if (align === "center") return "text-center"
    if (align === "right") return "text-right"
    return "text-left"
  }

  const getJustifyClass = (align?: string) => {
    if (align === "center") return "justify-center"
    if (align === "right") return "justify-end"
    return "justify-start"
  }

  const renderCellContent = (colId: string) => {
    switch (colId) {
      case "scheduled_for":
        return (
          <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
            {formatDate(execution.scheduled_for) || "—"}
          </span>
        )
      case "orders":
        return execution.orders?.order_number ? (
          <span className="text-[13px] font-bold text-brand-primary">#{execution.orders.order_number}</span>
        ) : (
          <span className="text-brand-inactive-text dark:text-dark-body">—</span>
        )
      case "completed_at":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
            {execution.completed_at ? formatDateTime(execution.completed_at) : "—"}
          </span>
        )
      case "actions":
        return (
          <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown>
              {execution.order_id && (
                <DropdownItem onClick={() => onOpenOrder?.(execution.order_id)}>
                  <EyeIcon size={18} /> Ver pedido
                </DropdownItem>
              )}
              {execution.error_message && (
                <DropdownItem onClick={() => onViewError?.(execution.error_message)}>
                  <InfoIcon size={18} /> Ver erro
                </DropdownItem>
              )}
            </ActionsDropdown>
          </div>
        )
      case "status":
        return (
          <Badge variant={statusVariant(execution.status)}>{getRecurringExecutionStatusLabel(execution.status)}</Badge>
        )
      default:
        return null
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background"
      onClick={() => (execution.order_id && onOpenOrder ? onOpenOrder(execution.order_id) : undefined)}
    >
      {columns.map((col, index) => (
        <td
          key={col.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)} ${index === 0 ? "pl-6" : ""} ${index === columns.length - 1 ? "pr-6" : ""}`}
        >
          <div className={`flex items-center w-full min-w-0 min-h-[40px] ${getJustifyClass(col.align)}`}>
            {renderCellContent(col.id)}
          </div>
        </td>
      ))}
    </motion.tr>
  )
}

export default ExecutionListRow
