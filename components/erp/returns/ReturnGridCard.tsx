"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Tooltip, Checkbox } from "@/components/reusable"
import { formatDateTime } from "@/lib/utils"
import { ReturnIcon } from "@/lib/icons"
import { ReturnRequest } from "./types"
import { getReturnStatusMeta } from "./ReturnListRow"
import { getReturnResolutionLabel } from "@/lib/returns/types"

interface ReturnGridCardProps {
  returnRequest: ReturnRequest
  onDetails: () => void
  onEdit?: () => void
  onPrint?: () => void
  onDelete?: () => void
  canManage: boolean
  /** Permite editar mesmo em status finalizados (painel admin). */
  canEditLocked?: boolean
  selected?: boolean
  onSelect?: () => void
}

const ReturnGridCard = React.memo(({ returnRequest, onDetails, onEdit, onPrint, onDelete, canManage, canEditLocked, selected, onSelect }: ReturnGridCardProps) => {
  const statusMeta = getReturnStatusMeta(returnRequest.status)
  const resolutionLabel = getReturnResolutionLabel(returnRequest.approvedResolution || returnRequest.desiredResolution || returnRequest.refundType || "refund")
  const totalQuantity = returnRequest.items.reduce((acc, item) => acc + Number(item.quantity || 0), 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
      onClick={onDetails}
    >
      <div className="absolute top-4 right-4 z-10 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected || false}
          onChange={onSelect}
        />
      </div>
      <div className="flex gap-4 mb-2">
        {/* Return Visual Indicator */}
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
          <ReturnIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: ID + Status Badge */}
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                title={`DVL-${returnRequest.id.slice(0, 6).toUpperCase()}`}
              >
                {`DVL-${returnRequest.id.slice(0, 6).toUpperCase()}`}
              </h3>
              <Tooltip text={`Status: ${statusMeta.label}`}>
                <Badge variant={statusMeta.variant} className="whitespace-nowrap">
                  {statusMeta.label}
                </Badge>
              </Tooltip>
            </div>
          </div>

          {/* Row 2: Pedido • Resolução */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-brand-primary">
              #{returnRequest.orderNumber}
            </span>
            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {resolutionLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Info Rows */}
      <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        {/* Row 1: Cliente & Data */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                {returnRequest.customerName}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-0.5 items-end shrink-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Data</span>
            <div className="flex flex-col items-end text-right">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                {formatDateTime(returnRequest.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Loja (painel admin) */}
        {returnRequest.storeName && (
          <div className="flex justify-between items-end gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Loja</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                {returnRequest.storeName}
              </span>
            </div>
          </div>
        )}

        {/* Row 2: Quantidade & Actions */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Itens</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                {totalQuantity} {totalQuantity === 1 ? "item" : "itens"}
              </span>
            </div>
          </div>

          {/* Actions button at same height as Items info */}
          <div
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsDropdown
              onPrint={onPrint}
              onEdit={canManage && (canEditLocked || !["RESOLVED", "REJECTED", "EXPIRED"].includes(returnRequest.status)) ? onEdit : undefined}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
})

ReturnGridCard.displayName = "ReturnGridCard"

export default ReturnGridCard