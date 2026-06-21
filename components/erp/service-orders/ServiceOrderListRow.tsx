"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { WrenchIcon, UserIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { r2PublicConfig } from "@/lib/r2/r2-public"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
}

interface ServiceOrderListRowProps {
  order: any
  columns: ColumnDef[]
  selected: boolean
  onSelect: (id: string) => void
  onDetails: () => void
  onEdit?: () => void
  onDelete?: () => void
  statusColor: string
  statusLabel: string
}

const ServiceOrderListRow = React.memo(
  ({
    order,
    columns,
    selected,
    onSelect,
    onDetails,
    onEdit,
    onDelete,
    statusColor,
    statusLabel,
  }: ServiceOrderListRowProps) => {
    const formatDate = (d: string) => {
      if (!d) return "-"
      return new Date(d).toLocaleDateString("pt-BR")
    }

    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "order_number":
          return (
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                <WrenchIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                  {order.order_number}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {formatDate(order.created_at)}
                </span>
              </div>
            </div>
          )

        case "title":
          return (
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate max-w-[220px] block">
              {order.title}
            </span>
          )

        case "customer":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[180px] block">
              {order.customer_snapshot?.name || "—"}
            </span>
          )

        case "assigned":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate block">
              {order.assigned_user_id ? "Atribuído" : "—"}
            </span>
          )

        case "date":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {order.expected_completion_date ? formatDate(order.expected_completion_date) : "—"}
            </span>
          )

        case "total":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {formatCurrency(order.total_amount || 0)}
            </span>
          )

        case "status":
          return (
            <div className="flex justify-center">
              <Badge variant={statusColor as any}>
                {statusLabel}
              </Badge>
            </div>
          )

        case "actions":
          return (
            <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
              <ActionsDropdown
                onView={onDetails}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          )

        default:
          return null
      }
    }

    return (
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/50 dark:hover:bg-dark-border/50 cursor-pointer transition-colors ${
          selected ? "bg-brand-gray/80 dark:bg-dark-border/80" : ""
        }`}
        onClick={onDetails}
      >
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelect(order.id)}
            />
            <div className="flex-1" />
          </div>
        </td>
        {columns.map((col) => (
          <td
            key={col.id}
            className={`px-4 py-3 text-${col.align || "left"}`}
            style={{ width: col.width, minWidth: col.width }}
          >
            {renderCellContent(col.id)}
          </td>
        ))}
      </motion.tr>
    )
  },
)

ServiceOrderListRow.displayName = "ServiceOrderListRow"
export default ServiceOrderListRow
