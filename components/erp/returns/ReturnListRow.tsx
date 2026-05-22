"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown } from "@/components/reusable"
import { formatDate } from "@/lib/utils"
import { ReturnIcon } from "@/lib/icons"
import { ReturnRequest } from "./types"

interface ReturnListRowProps {
  returnRequest: ReturnRequest
  columns: Array<{ id: string; align?: "left" | "center" | "right" }>
  onDetails: (returnRequest: ReturnRequest) => void
  onEdit?: (returnRequest: ReturnRequest) => void
  onDelete?: (returnRequest: ReturnRequest) => void
  canManage: boolean
}

function getAlignClass(align?: string) {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

function getJustifyClass(align?: string) {
  if (align === "center") return "justify-center"
  if (align === "right") return "justify-end"
  return "justify-start"
}

export function getReturnStatusMeta(status: ReturnRequest["status"]) {
  switch (status) {
    case "approved":
      return { label: "Aprovado", variant: "green" as const }
    case "rejected":
      return { label: "Recusado", variant: "red" as const }
    case "pending":
    default:
      return { label: "Pendente", variant: "orange" as const }
  }
}

export function getRefundTypeLabel(refundType: ReturnRequest["refundType"]) {
  switch (refundType) {
    case "pix":
      return "Pix"
    case "credit_card":
      return "Cartão de Crédito"
    case "store_credit":
      return "Vale-compra"
    case "other":
    default:
      return "Outro"
  }
}

const ReturnListRow = React.memo(({ returnRequest, columns, onDetails, onEdit, onDelete, canManage }: ReturnListRowProps) => {
  const statusMeta = getReturnStatusMeta(returnRequest.status)
  
  const totalQuantity = returnRequest.items.reduce((acc, item) => acc + (item.quantity || 0), 0)

  const renderCell = (id: string) => {
    switch (id) {
      case "id":
        return (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
              <ReturnIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                {`RET-${returnRequest.id.slice(0, 6).toUpperCase()}`}
              </span>
              <Badge variant={statusMeta.variant} className="w-fit mt-0.5 text-[10px] py-0 px-1.5">
                {statusMeta.label}
              </Badge>
            </div>
          </div>
        )
      case "order_number":
        return (
          <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
            {returnRequest.orderNumber}
          </span>
        )
      case "customer":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
            {returnRequest.customerName}
          </span>
        )
      case "date":
        return (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
            {formatDate(returnRequest.createdAt)}
          </span>
        )
      case "refund_type":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
            {getRefundTypeLabel(returnRequest.refundType)}
          </span>
        )
      case "quantity":
        return (
          <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
            {totalQuantity}
          </span>
        )
      case "actions":
        return (
          <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown 
              onView={() => onDetails(returnRequest)}
              onEdit={canManage && returnRequest.status === "pending" ? () => onEdit?.(returnRequest) : undefined}
              onDelete={canManage ? () => onDelete?.(returnRequest) : undefined}
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
      className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
      onClick={() => onDetails(returnRequest)}
    >
      {columns.map((col) => (
        <td key={col.id} className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}>
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>{renderCell(col.id)}</div>
        </td>
      ))}
    </motion.tr>
  )
})

ReturnListRow.displayName = "ReturnListRow"

export default ReturnListRow
