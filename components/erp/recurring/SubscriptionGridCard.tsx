"use client"

import React from "react"
import { Badge, Button, Tooltip } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon } from "@/lib/icons"
import type { RecurringSubscription } from "@/lib/types/recurring"
import { getRecurringStatusLabel, getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

interface SubscriptionGridCardProps {
  sub: RecurringSubscription & { plan?: any; customer?: any }
  canManage: boolean
  selectedId: string | null
  loadingExecutions: boolean
  executions: any[]
  onToggleHistory: (id: string) => void
  onRunAction: (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", id: string) => void
}

export const SubscriptionGridCard: React.FC<SubscriptionGridCardProps> = ({
  sub,
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
    return "gray" as const
  }

  return (
    <div
      className="border border-brand-border dark:border-dark-border rounded-xl p-5 bg-white dark:bg-dark-surface shadow-sm flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
            {sub.plan?.name || "Plano"}
          </h3>
          <Tooltip text={`Status: ${getRecurringStatusLabel(sub.status)}`}>
            <Badge variant={statusVariant(sub.status)} />
          </Tooltip>
        </div>
        
        <p className="text-xs text-brand-inactive-text dark:text-dark-body font-semibold mb-3">
          {sub.customer?.name || sub.customerId}
        </p>

        <div className="text-xs text-brand-inactive-text dark:text-dark-body space-y-1 mb-4">
          <div>Próxima Execução: {formatFullDate(sub.nextExecutionAt).slice(0, 10)}</div>
          {sub.plan && (
            <div className="font-medium text-brand-primary">
              Recorrência: {getRecurringFrequencyLabel(sub.plan.frequency_type, sub.plan.frequency_interval)}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-brand-border dark:border-dark-border pt-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9"
            onClick={() => onToggleHistory(sub.id)}
          >
            <ClockIcon size={14} className="mr-1" /> Histórico
          </Button>

          {canManage && sub.status === "active" && (
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => onRunAction("pause", sub.id)}>
              <BlockedIcon size={14} className="mr-1 text-brand-orange" /> Pausar
            </Button>
          )}

          {canManage && sub.status === "paused" && (
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => onRunAction("resume", sub.id)}>
              <PlayIcon size={14} className="mr-1 text-brand-green" /> Reativar
            </Button>
          )}

          {canManage && sub.status === "awaiting_restock" && (
            <Button variant="outline" size="sm" className="flex-1 h-9 border-brand-green text-brand-green hover:bg-green-50" onClick={() => onRunAction("resolve_stock", sub.id)}>
              <PlayIcon size={14} className="mr-1 text-brand-green" /> Repor Estoque
            </Button>
          )}
        </div>

        {canManage && sub.mpPreapprovalId && (
          <Button variant="outline" size="sm" className="w-full h-9 text-brand-primary" onClick={() => onRunAction("sync", sub.id)}>
            Sincronizar com Mercado Pago
          </Button>
        )}

        {canManage && sub.status !== "cancelled" && sub.status !== "expired" && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 border-brand-red text-brand-red hover:bg-red-50"
            onClick={() => onRunAction("cancel", sub.id)}
          >
            Cancelar Assinatura
          </Button>
        )}
      </div>

      {/* Expandable History inline in Grid Card */}
      {selectedId === sub.id && (
        <div className="mt-4 border-t border-brand-border dark:border-dark-border pt-3 space-y-2">
          <h4 className="text-xs font-bold text-brand-dark dark:text-dark-heading">Histórico de execuções</h4>
          {loadingExecutions ? (
            <p className="text-xs text-brand-inactive-text animate-pulse">Carregando...</p>
          ) : executions.length === 0 ? (
            <p className="text-xs text-brand-inactive-text">Nenhuma execução registrada.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
              {executions.map((exec) => (
                <div key={exec.id} className="text-xs flex flex-col gap-1 border-b border-brand-border dark:border-dark-border pb-1.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{formatFullDate(exec.scheduled_for).slice(0, 10)}</span>
                    <Tooltip text={`Status: ${exec.status}`}>
                      <Badge variant={exec.status === "completed" ? "green" : exec.status === "failed" ? "red" : "gray"} />
                    </Tooltip>
                  </div>
                  {exec.orders?.order_number && (
                    <div className="text-[11px] text-brand-inactive-text">Pedido #{exec.orders.order_number}</div>
                  )}
                  {exec.error_message && (
                    <div className="text-[11px] text-brand-red font-medium">{exec.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SubscriptionGridCard
