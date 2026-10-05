"use client"

import React from "react"
import { Badge, Button } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon } from "@/lib/icons"
import type { RecurringSubscription } from "@/lib/types/recurring"
import { getRecurringStatusLabel, getRecurringFrequencyLabel, getRecurringShippingSourceLabel } from "@/lib/types/recurring"
import { formatFullDate, formatCurrency } from "@/lib/utils"

interface SubscriptionListRowProps {
  sub: RecurringSubscription & { plan?: any; customer?: any }
  columns: Array<{ id: string; label: string; align?: "left" | "center" | "right" }>
  canManage: boolean
  selectedId: string | null
  loadingExecutions: boolean
  executions: any[]
  onToggleHistory: (id: string) => void
  onRunAction: (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", id: string) => void
}

export const SubscriptionListRow: React.FC<SubscriptionListRowProps> = ({
  sub,
  columns,
  canManage,
  selectedId,
  loadingExecutions,
  executions,
  onToggleHistory,
  onRunAction
}) => {
  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "paused") return "orange" as const
    if (status === "pending") return "blue" as const
    if (status === "past_due") return "orange" as const
    if (status === "payment_failed") return "red" as const
    if (status === "cancelled") return "red" as const
    if (status === "awaiting_restock") return "red" as const
    if (status === "awaiting_customer_decision") return "orange" as const
    return "gray" as const
  }

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
            <Badge variant={statusVariant(sub.status)}>
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
              onClick={() => onToggleHistory(sub.id)}
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
    <>
      <tr
        onClick={() => onToggleHistory(sub.id)}
        className="group hover:bg-brand-gray/30 dark:hover:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background border-b border-brand-border dark:border-dark-border last:border-0"
      >
        {columns.map((col) => (
          <td
            key={col.id}
            className={`py-4 px-6 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
          >
            <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
              {renderCellContent(col.id)}
            </div>
          </td>
        ))}
      </tr>

      {/* Expanded row for history */}
      {selectedId === sub.id && (
        <tr className="bg-brand-gray/10 dark:bg-dark-border/5">
          <td colSpan={columns.length} className="py-4 px-8 border-b border-brand-border dark:border-dark-border">
            <div className="space-y-3">
              <h4 className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                Histórico de Execuções Recorrentes
              </h4>
              {loadingExecutions ? (
                <p className="text-xs text-brand-inactive-text animate-pulse">Carregando...</p>
              ) : executions.length === 0 ? (
                <p className="text-xs text-brand-inactive-text">Nenhuma execução registrada para esta assinatura.</p>
              ) : (
                <div className="grid gap-2">
                  {executions.map((exec) => (
                    <div
                      key={exec.id}
                      className="text-xs flex items-center justify-between bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-semibold">{formatFullDate(exec.scheduled_for)}</span>
                        {exec.orders?.order_number && (
                          <span className="text-brand-primary dark:text-dark-body">
                            Pedido #{exec.orders.order_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={exec.status === "completed" ? "green" : exec.status === "failed" ? "red" : "gray"}>
                          {exec.status}
                        </Badge>
                        {exec.error_message && (
                          <span className="text-brand-red font-medium">{exec.error_message}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default SubscriptionListRow
