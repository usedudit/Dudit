"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Tooltip, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { BlockedIcon, PlayIcon, RepeatIcon, AlertTriangleIcon, ClockIcon } from "@/lib/icons"
import type { RecurringSubscription } from "@/lib/types/recurring"
import {
  getRecurringStatusLabel,
  getRecurringFrequencyLabel,
  getRecurringStatusVariant,
} from "@/lib/types/recurring"
import { formatDate, formatCurrency } from "@/lib/utils"
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
  const customerLabel = sub.customer?.name || sub.customerId || "Cliente"

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
        <UserProfileImage
          fullName={customerLabel}
          imageUrl={sub.customer?.image_url || sub.customer?.avatar_url}
          className="w-12 h-12 text-lg"
        />

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

          {/* Linha 3: Recorrência */}
          {sub.plan && (
            <div className="text-xs text-brand-primary font-medium mt-0.5 truncate">
              Recorrência: {getRecurringFrequencyLabel(
                sub.plan.frequencyType ?? sub.plan.frequency_type,
                sub.plan.frequencyInterval ?? sub.plan.frequency_interval,
              )}
            </div>
          )}
        </div>
      </div>

      {/* Área do Rodapé */}
      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        {/* Linha A: Próxima Execução e Frete */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Próxima Execução</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {formatDate(sub.nextExecutionAt) || "-"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Frete</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {formatCurrency(Number(sub.shippingAmount || 0))}
            </span>
          </div>
        </div>

        {/* Linha B: Modalidade e Ações */}
        <div className="flex items-end justify-between mt-1">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Modalidade</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
              {sub.deliveryType === "delivery" ? "Entrega" : "Retirada no local"}
            </span>
          </div>

          {/* Botão de Ações */}
          <div
            className="shrink-0"
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
        </div>
      </div>
    </motion.div>
  )
}

export default SubscriptionGridCard
