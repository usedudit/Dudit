"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon, RepeatIcon, AlertTriangleIcon } from "@/lib/icons"
import type { RecurringSubscription } from "@/lib/types/recurring"
import {
  getRecurringStatusLabel,
  getRecurringFrequencyLabel,
  getRecurringShippingSourceLabel,
  getRecurringStatusVariant,
} from "@/lib/types/recurring"
import { formatFullDate, formatCurrency } from "@/lib/utils"

export type SubscriptionRowTab = "general" | "history"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface SubscriptionListRowProps {
  sub: RecurringSubscription & { plan?: any; customer?: any }
  columns: ColumnDef[]
  canManage: boolean
  onOpen: (id: string, tab?: SubscriptionRowTab) => void
  onRunAction: (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", id: string) => void
}

export const SubscriptionListRow: React.FC<SubscriptionListRowProps> = ({
  sub,
  columns,
  canManage,
  onOpen,
  onRunAction
}) => {
  const priceChangePending = !!sub.priceChangeRequestedAt && !sub.priceChangeDecision
  const canCancel = canManage && sub.status !== "cancelled" && sub.status !== "expired"

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
      case "customer":
        return (
          <div className="flex items-center gap-3 text-left min-w-0">
            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
              <span className="text-[13px] font-bold text-brand-inactive-text dark:text-dark-body uppercase">
                {(sub.customer?.name || sub.customerId || "?").trim().slice(0, 2)}
              </span>
            </div>
            <div className="flex flex-col text-left min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px]">
                {sub.customer?.name || sub.customerId}
              </span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {sub.deliveryType === "delivery" ? "Entrega" : "Retirada no local"}
              </span>
            </div>
          </div>
        )
      case "plan":
        return (
          <div className="flex flex-col text-left min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
              {sub.plan?.name || "Plano"}
            </span>
            {sub.plan && (
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {getRecurringFrequencyLabel(sub.plan.frequency_type, sub.plan.frequency_interval)}
              </span>
            )}
          </div>
        )
      case "status":
        return (
          <div className="flex flex-col items-start gap-1.5">
            <Badge variant={getRecurringStatusVariant(sub.status)}>
              {getRecurringStatusLabel(sub.status)}
            </Badge>
            {priceChangePending && (
              <Badge variant="blue">Mudança pendente</Badge>
            )}
          </div>
        )
      case "nextExecution":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
            {formatFullDate(sub.nextExecutionAt).slice(0, 10)}
          </span>
        )
      case "shipping":
        return (
          <div className="flex flex-col text-left min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
              {formatCurrency(Number(sub.shippingAmount || 0))}
            </span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {getRecurringShippingSourceLabel(sub.shippingSource || "pickup")}
            </span>
          </div>
        )
      case "actions":
        return (
          <div
            className="flex justify-center action-btn"
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsDropdown
              onView={() => onOpen(sub.id)}
              onCancel={canCancel ? () => onRunAction("cancel", sub.id) : undefined}
              cancelLabel="Cancelar assinatura"
            >
              <DropdownItem onClick={() => onOpen(sub.id, "history")}>
                <ClockIcon size={18} /> Histórico
              </DropdownItem>
              {canManage && sub.mpPreapprovalId && (
                <DropdownItem onClick={() => onRunAction("sync", sub.id)}>
                  <RepeatIcon size={18} /> Sincronizar com MP
                </DropdownItem>
              )}
              {canManage && sub.status === "active" && (
                <DropdownItem onClick={() => onRunAction("pause", sub.id)}>
                  <BlockedIcon size={18} /> Pausar
                </DropdownItem>
              )}
              {canManage && sub.status === "paused" && (
                <DropdownItem onClick={() => onRunAction("resume", sub.id)}>
                  <PlayIcon size={18} /> Reativar
                </DropdownItem>
              )}
              {canManage && sub.status === "awaiting_restock" && (
                <DropdownItem onClick={() => onRunAction("resolve_stock", sub.id)}>
                  <AlertTriangleIcon size={18} /> Resolver estoque
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
      onClick={() => onOpen(sub.id)}
      className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
    >
      {columns.map((col, index) => (
        <td
          key={col.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)} ${index === 0 ? "pl-6" : ""} ${col.id === "actions" ? "pr-6" : ""}`}
        >
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
            {renderCellContent(col.id)}
          </div>
        </td>
      ))}
    </motion.tr>
  )
}

export default SubscriptionListRow
