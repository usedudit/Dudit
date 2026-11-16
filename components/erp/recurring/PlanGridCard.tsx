"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel, getRecurringBillingModeLabel } from "@/lib/types/recurring"
import { formatDate } from "@/lib/utils"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

interface PlanGridCardProps {
  plan: RecurringPlan
  selected: boolean
  onSelect: () => void
  canManage: boolean
  onEdit: (plan: RecurringPlan) => void
  onDelete: (plan: RecurringPlan) => void
  onShare?: (plan: RecurringPlan) => void
  onDetails: (plan: RecurringPlan) => void
}

export const PlanGridCard: React.FC<PlanGridCardProps> = ({
  plan,
  selected,
  onSelect,
  canManage,
  onEdit,
  onDelete,
  onShare,
  onDetails
}) => {
  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "inactive") return "orange" as const
    return "gray" as const
  }

  const statusLabel = (status: string) => {
    if (status === "active") return "Ativo"
    if (status === "inactive") return "Inativo"
    return "Arquivado"
  }

  const imageUrl = plan.images?.[0]
    ? getR2ImageUrl(plan.images[0], "thumbnail")
    : PLACEHOLDER_IMAGE

  const billingLabel = plan.billingMode === "auto_mercado_pago" ? "Automático (MP)" : getRecurringBillingModeLabel(plan.billingMode)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
      onClick={() => onDetails(plan)}
    >
      <div className="flex gap-4 mb-2">
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden flex items-center justify-center border border-brand-border dark:border-dark-border">
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover rounded-full"
            loading="lazy"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center min-w-0 pr-1 gap-2">
              <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={plan.name}>
                {plan.name}
              </h3>
              <Tooltip text={`Status: ${statusLabel(plan.status)}`}>
                <Badge variant={statusVariant(plan.status)} className="whitespace-nowrap scale-90 shrink-0" />
              </Tooltip>
            </div>
            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={selected} onChange={onSelect} />
            </div>
          </div>
          <p className="text-xs font-semibold text-brand-primary dark:text-dark-body mt-0.5 truncate">
            {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
          </p>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        {(plan.partner_name || (plan as any).store_name || (plan as any).stores?.name) && (
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Vendedor</span>
              <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate" title={plan.partner_name || (plan as any).store_name || (plan as any).stores?.name}>
                {plan.partner_name || (plan as any).store_name || (plan as any).stores?.name}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Início</span>
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {formatDate(plan.startDate) || "-"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 items-end">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Fim</span>
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {plan.endDate ? formatDate(plan.endDate) : "Sem prazo"}
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cobrança</span>
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {billingLabel}
            </span>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown
              onEdit={canManage ? () => onEdit(plan) : undefined}
              onShare={onShare ? () => onShare(plan) : undefined}
              onDelete={canManage ? () => onDelete(plan) : undefined}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default PlanGridCard
