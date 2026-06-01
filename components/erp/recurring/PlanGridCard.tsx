"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

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
        <div className="w-12 h-12 shrink-0 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-lg select-none">
          {plan.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center min-w-0 pr-1 gap-2">
              <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={plan.name}>
                {plan.name}
              </h3>
              <Badge variant={statusVariant(plan.status)} className="whitespace-nowrap scale-90 shrink-0">
                {statusLabel(plan.status)}
              </Badge>
            </div>
            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
              <Checkbox checked={selected} onChange={onSelect} />
            </div>
          </div>
          <p className="text-xs font-semibold text-brand-primary dark:text-dark-body mt-0.5">
            {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
          </p>
        </div>
      </div>

      {plan.description && (
        <p className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-3 my-3">
          {plan.description}
        </p>
      )}

      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Início</span>
          <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
            {formatFullDate(plan.startDate).slice(0, 10)}
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
    </motion.div>
  )
}

export default PlanGridCard
