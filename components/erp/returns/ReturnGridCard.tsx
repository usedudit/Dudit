"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatDate } from "@/lib/utils"
import { ReturnRequest } from "./types"
import { getReturnStatusMeta } from "./ReturnListRow"
import { getReturnResolutionLabel } from "@/lib/returns/types"

interface ReturnGridCardProps {
  returnRequest: ReturnRequest
  onDetails: () => void
  onEdit?: () => void
  onDelete?: () => void
  canManage: boolean
}

const ReturnGridCard = React.memo(({ returnRequest, onDetails, onEdit, onDelete, canManage }: ReturnGridCardProps) => {
  const statusMeta = getReturnStatusMeta(returnRequest.status)
  const totalQuantity = returnRequest.items.reduce((acc, item) => acc + (item.quantity || 0), 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
      onClick={onDetails}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
            {`RET-${returnRequest.id.slice(0, 6).toUpperCase()}`}
          </h3>
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
            {returnRequest.customerName}
          </p>
        </div>
        <Tooltip text={`Status: ${statusMeta.label}`}>
          <Badge variant={statusMeta.variant} />
        </Tooltip>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 flex-1">
        <div>
          <p className="text-xs text-brand-inactive-text">Pedido</p>
          <p className="font-bold text-brand-dark dark:text-dark-heading truncate">{returnRequest.orderNumber}</p>
        </div>
        <div>
          <p className="text-xs text-brand-inactive-text">Resolucao</p>
          <p className="font-bold text-brand-dark dark:text-dark-heading">{getReturnResolutionLabel(returnRequest.approvedResolution || returnRequest.desiredResolution || returnRequest.refundType || "refund")}</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-brand-inactive-text">Quantidade / Data</p>
          <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
            {totalQuantity} item(ns)
          </p>
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
            {formatDate(returnRequest.createdAt)}
          </p>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ActionsDropdown 
            onView={onDetails}
            onEdit={canManage && !["RESOLVED", "REJECTED", "EXPIRED"].includes(returnRequest.status) ? onEdit : undefined}
          />
        </div>
      </div>
    </motion.div>
  )
})

ReturnGridCard.displayName = "ReturnGridCard"

export default ReturnGridCard
