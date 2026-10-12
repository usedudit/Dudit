"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { RepeatIcon } from "@/lib/icons"
import { formatDate, formatCurrency } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { BadgeVariant } from "@/components/reusable/Badge"

export interface BillingRow {
  id: string
  order_number?: string | null
  customer_name?: string | null
  total_amount?: string | number | null
  situation?: string | null
  created_at?: string | null
  payment_method?: string | null
  recurring_subscription_id?: string | null
  recurring_execution_id?: string | null
}

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface BillingListRowProps {
  row: BillingRow
  columns: ColumnDef[]
  onOpen: (orderId: string) => void
  onOpenSubscription?: (subscriptionId: string) => void
}

export const getBillingStatusConfig = (situation?: string | null): { label: string; variant: BadgeVariant } => {
  switch (situation) {
    case "paid":
      return { label: "Pago", variant: "green" }
    case "cancelled":
      return { label: "Cancelado", variant: "red" }
    case "partially_paid":
      return { label: "Parcial", variant: "orange" }
    case "pending":
      return { label: "Pendente", variant: "orange" }
    default:
      return { label: situation || "Pendente", variant: "gray" }
  }
}

export const BillingListRow: React.FC<BillingListRowProps> = ({ row, columns, onOpen, onOpenSubscription }) => {
  const status = getBillingStatusConfig(row.situation)
  const isCreditOrder = row.payment_method === "Assinatura (Créditos)" || row.payment_method === "subscription_credits"
  const isManualCharge = row.situation === "pending" && row.payment_method === "A combinar"

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

  const renderCellContent = (colId: string) => {
    switch (colId) {
      case "order":
        return (
          <div className="flex flex-col text-left min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
              #{row.order_number || row.id.slice(0, 8)}
            </span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {isCreditOrder ? "Pedido por créditos" : "Cobrança de assinatura"}
            </span>
          </div>
        )
      case "customer":
        return (
          <div className="flex items-center gap-3 text-left min-w-0">
            <UserProfileImage
              fullName={row.customer_name || "Cliente"}
              className="w-10 h-10 text-[14px]"
            />
            <div className="flex flex-col text-left min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px]">
                {row.customer_name || "Cliente"}
              </span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {row.payment_method || "-"}
              </span>
            </div>
          </div>
        )
      case "date":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
            {row.created_at ? formatDate(row.created_at) : "-"}
          </span>
        )
      case "value":
        return <span className="font-semibold text-[13px] text-brand-dark dark:text-dark-heading">{formatCurrency(Number(row.total_amount || 0))}</span>
      case "status":
        return (
          <Badge variant={isManualCharge ? "orange" : status.variant}>
            {isManualCharge ? "Cobrança manual" : status.label}
          </Badge>
        )
      case "actions":
        return (
          <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown onView={() => onOpen(row.id)}>
              {onOpenSubscription && row.recurring_subscription_id && (
                <DropdownItem onClick={() => onOpenSubscription(row.recurring_subscription_id as string)}>
                  <RepeatIcon size={18} /> Ver assinatura
                </DropdownItem>
              )}
            </ActionsDropdown>
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
      onClick={() => onOpen(row.id)}
      className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
    >
      {columns.map((col, index) => (
        <td
          key={col.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)} ${index === 0 ? "pl-6" : ""} ${col.id === "actions" ? "pr-6" : ""}`}
        >
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>{renderCellContent(col.id)}</div>
        </td>
      ))}
    </motion.tr>
  )
}

export default BillingListRow
