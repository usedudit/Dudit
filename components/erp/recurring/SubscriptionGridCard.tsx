"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button, Tooltip, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon, RepeatIcon, AlertTriangleIcon } from "@/lib/icons"
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
  const canCancel = canManage && sub.status !== "cancelled" && sub.status !== "expired"
  const customerLabel = sub.customer?.name || sub.customerId || ""

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => onOpen(sub.id)}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      <div className="flex gap-4 mb-2">
        {/* Avatar do cliente */}
        <div className="w-18 h-18 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden flex items-center justify-center border border-brand-border dark:border-dark-border">
          <span className="text-lg font-bold text-brand-inactive-text dark:text-dark-body uppercase">
            {customerLabel.trim().slice(0, 2) || "?"}
          </span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {/* Linha 1: Plano + badges */}
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                title={sub.plan?.name || "Plano"}
              >
                <span className="truncate">{sub.plan?.name || "Plano"}</span>
              </h3>
              <Tooltip text={`Status: ${getRecurringStatusLabel(sub.status)}`}>
                <Badge
                  variant={getRecurringStatusVariant(sub.status)}
                  className="whitespace-nowrap scale-90 shrink-0"
                />
              </Tooltip>
            </div>
            {priceChangePending && (
              <Badge variant="blue" className="text-[10px] shrink-0">Mudança pendente</Badge>
            )}
          </div>

          {/* Linha 2: Cliente */}
          <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
            {customerLabel}
          </div>

          {/* Linha 3: Próxima execução e recorrência */}
          <div className="text-xs text-brand-inactive-text dark:text-dark-body space-y-1 mt-1.5">
            <div>Próxima execução: {formatFullDate(sub.nextExecutionAt).slice(0, 10)}</div>
            {sub.plan && (
              <div className="font-medium text-brand-primary">
                Recorrência: {getRecurringFrequencyLabel(sub.plan.frequency_type, sub.plan.frequency_interval)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Frete</span>
          <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
            {formatCurrency(Number(sub.shippingAmount || 0))}
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body ml-1">
              · {getRecurringShippingSourceLabel(sub.shippingSource || "pickup")}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => onOpen(sub.id, "history")}
          >
            <ClockIcon size={14} className="mr-1" /> Histórico
          </Button>

          <ActionsDropdown
            onView={() => onOpen(sub.id)}
            onCancel={canCancel ? () => onRunAction("cancel", sub.id) : undefined}
            cancelLabel="Cancelar assinatura"
          >
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
      </div>
    </motion.div>
  )
}

export default SubscriptionGridCard
