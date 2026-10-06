"use client"

import React from "react"
import { Badge, Button } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon } from "@/lib/icons"
import type { RecurringSubscription } from "@/lib/types/recurring"
import {
  getRecurringStatusLabel,
  getRecurringFrequencyLabel,
  getRecurringShippingSourceLabel,
  getRecurringStatusVariant,
} from "@/lib/types/recurring"
import { formatFullDate, formatCurrency } from "@/lib/utils"

export type SubscriptionRowTab = "general" | "history"

interface SubscriptionListRowProps {
  sub: RecurringSubscription & { plan?: any; customer?: any }
  columns: Array<{ id: string; label: string; align?: "left" | "center" | "right" }>
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
          <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
            {sub.customer?.name || sub.customerId}
          </span>
        )
      case "plan":
        return (
          <div className="flex flex-col">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
              {sub.plan?.name || "Plano"}
            </span>
            {sub.plan && (
              <span className="text-xs text-brand-inactive-text dark:text-dark-body">
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
          <div className="flex flex-col">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5">
              {formatCurrency(Number(sub.shippingAmount || 0))}
            </span>
            <span className="text-xs text-brand-inactive-text dark:text-dark-body">
              {getRecurringShippingSourceLabel(sub.shippingSource || "pickup")}
            </span>
          </div>
        )
      case "actions":
        return (
          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpen(sub.id, "history")}
              className="h-8 px-3.5"
            >
              <ClockIcon size={14} className="mr-1" /> Histórico
            </Button>

            {canManage && sub.mpPreapprovalId && (
              <Button variant="outline" size="sm" className="h-8 px-3.5 text-brand-primary" onClick={() => onRunAction("sync", sub.id)}>
                Sincronizar
              </Button>
            )}

            {canManage && sub.status === "active" && (
              <Button variant="outline" size="sm" className="h-8 px-3.5" onClick={() => onRunAction("pause", sub.id)}>
                <BlockedIcon size={14} className="mr-1 text-brand-orange" /> Pausar
              </Button>
            )}

            {canManage && sub.status === "paused" && (
              <Button variant="outline" size="sm" className="h-8 px-3.5" onClick={() => onRunAction("resume", sub.id)}>
                <PlayIcon size={14} className="mr-1 text-brand-green" /> Reativar
              </Button>
            )}

            {canManage && sub.status === "awaiting_restock" && (
              <Button variant="outline" size="sm" className="h-8 px-3.5 border-brand-green text-brand-green hover:bg-green-50" onClick={() => onRunAction("resolve_stock", sub.id)}>
                <PlayIcon size={14} className="mr-1 text-brand-green" /> Resolver Estoque
              </Button>
            )}

            {canManage && sub.status !== "cancelled" && sub.status !== "expired" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3.5 border-brand-red text-brand-red hover:bg-red-50"
                onClick={() => onRunAction("cancel", sub.id)}
              >
                Cancelar
              </Button>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <tr
      onClick={() => onOpen(sub.id)}
      className="group hover:bg-brand-green-light/30 dark:hover:bg-dark-border/20 transition-colors cursor-pointer"
    >
      {columns.map((col) => (
        <td
          key={col.id}
          className={`py-4 pr-4 border-b border-brand-border dark:border-dark-border text-[14px] text-brand-dark dark:text-dark-heading ${getAlignClass(col.align)}`}
        >
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
            {renderCellContent(col.id)}
          </div>
        </td>
      ))}
    </tr>
  )
}

export default SubscriptionListRow
