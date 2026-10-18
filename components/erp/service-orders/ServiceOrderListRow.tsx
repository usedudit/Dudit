"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { WrenchIcon } from "@/lib/icons"
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
  onStatus?: () => void
  onShare?: () => void
  onPrint?: () => void
  onDelete?: () => void
  statusColor: string
  statusLabel: string
  teamMembers?: any[]
  /** Prefetch handlers for hover/touch-based entity preloading */
  onPrefetchMouseEnter?: () => void
  onPrefetchMouseLeave?: () => void
  onPrefetchTouchStart?: () => void
}

const ServiceOrderListRow = React.memo(
  ({
    order,
    columns,
    selected,
    onSelect,
    onDetails,
    onEdit,
    onStatus,
    onShare,
    onPrint,
    onDelete,
    statusColor,
    statusLabel,
    teamMembers = [],
    onPrefetchMouseEnter,
    onPrefetchMouseLeave,
    onPrefetchTouchStart,
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
              {order.customer_snapshot?.name || "-"}
            </span>
          )

        case "assigned": {
          const assignedMember = teamMembers.find(m => m.userId === order.assigned_user_id)
          const assignedName = order.assigned_user_name
            || (assignedMember ? (assignedMember.fullName || assignedMember.name) : null)
            || "-"
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate block">
              {assignedName}
            </span>
          )
        }

        case "date":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {order.expected_completion_date ? formatDate(order.expected_completion_date) : "-"}
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
                onEdit={onEdit}
                onStatus={onStatus}
                onShare={onShare}
                onPrint={onPrint}
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
        className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        onClick={onDetails}
        onMouseEnter={onPrefetchMouseEnter}
        onMouseLeave={onPrefetchMouseLeave}
        onTouchStart={onPrefetchTouchStart}
      >
        <td
          className="py-2 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onCheckedChange={() => onSelect(order.id)} />
        </td>
        {columns.map((col) => (
          <td
            key={col.id}
            className={`p-2 border-b border-brand-border dark:border-dark-border ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
              }`}
            style={{ width: col.width, minWidth: col.width }}
          >
            <div className={`flex items-center w-full min-w-0 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"
              }`}>
              {renderCellContent(col.id)}
            </div>
          </td>
        ))}
      </motion.tr>
    )
  },
)

ServiceOrderListRow.displayName = "ServiceOrderListRow"
export default ServiceOrderListRow
