"use client"

import React from "react"
import { Badge, Button } from "@/components/reusable"
import { EditIcon } from "@/lib/icons"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

interface PlanGridCardProps {
  plan: RecurringPlan
  canManage: boolean
  onEdit: (plan: RecurringPlan) => void
  onDetails: (plan: RecurringPlan) => void
}

export const PlanGridCard: React.FC<PlanGridCardProps> = ({
  plan,
  canManage,
  onEdit,
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
    <div
      onClick={() => onDetails(plan)}
      className="border border-brand-border dark:border-dark-border rounded-xl p-5 bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[160px]"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading line-clamp-2">
            {plan.name}
          </h3>
          <Badge variant={statusVariant(plan.status)}>
            {statusLabel(plan.status)}
          </Badge>
        </div>
        <p className="text-xs font-semibold text-brand-primary dark:text-dark-body mb-3">
          {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
        </p>
        {plan.description && (
          <p className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-3 mb-4">
            {plan.description}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-brand-border dark:border-dark-border pt-3 mt-auto">
        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">
          Início: {formatFullDate(plan.startDate).slice(0, 10)}
        </span>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(plan)
            }}
            className="h-8 px-3"
          >
            <EditIcon size={14} className="mr-1" /> Editar
          </Button>
        )}
      </div>
    </div>
  )
}

export default PlanGridCard
