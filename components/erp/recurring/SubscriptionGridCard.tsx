"use client"

import React from "react"
import { Badge, Button, Tooltip } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon } from "@/lib/icons"
import type { RecurringSubscription } from "@/lib/types/recurring"
import {
  getRecurringStatusLabel,
  getRecurringFrequencyLabel,
  getRecurringShippingSourceLabel,
  getRecurringStatusVariant,
} from "@/lib/types/recurring"
import { formatFullDate, formatCurrency } from "@/lib/utils"
import type { SubscriptionRowTab } from "./SubscriptionListRow"

interface SubscriptionGridCardProps {
  sub: RecurringSubscription & { plan?: any; customer?: any }
  canManage: boolean
  onOpen: (id: string, tab?: SubscriptionRowTab) => void
  onRunAction: (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", id: string) => void
}

export const SubscriptionGridCard: React.FC<SubscriptionGridCardProps> = ({
  sub,
  canManage,
  onOpen,
  onRunAction
}) => {
  const priceChangePending = !!sub.priceChangeRequestedAt && !sub.priceChangeDecision

  return (
    <div
      onClick={() => onOpen(sub.id)}
      className="border border-brand-border dark:border-dark-border rounded-[24px] p-6 bg-white dark:bg-dark-surface flex flex-col justify-between cursor-pointer hover:border-brand-green/60 transition-colors"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
            {sub.plan?.name || "Plano"}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {priceChangePending && (
              <Badge variant="blue" className="text-[10px]">Mudança pendente</Badge>
            )}
            <Tooltip text={`Status: ${getRecurringStatusLabel(sub.status)}`}>
              <Badge variant={getRecurringStatusVariant(sub.status)} />
            </Tooltip>
          </div>
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
          <div>
            Frete: <span className="font-medium text-brand-dark dark:text-dark-heading">
              {formatCurrency(Number(sub.shippingAmount || 0))}
            </span>
            <span className="text-brand-inactive-text"> · {getRecurringShippingSourceLabel(sub.shippingSource || "pickup")}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div
        className="border-t border-brand-border dark:border-dark-border pt-4 flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-9"
            onClick={() => onOpen(sub.id, "history")}
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
    </div>
  )
}

export default SubscriptionGridCard
