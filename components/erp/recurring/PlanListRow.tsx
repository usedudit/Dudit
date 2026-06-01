"use client"

import React from "react"
import { Badge, Button } from "@/components/reusable"
import { EditIcon } from "@/lib/icons"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel } from "@/lib/types/recurring"

interface PlanListRowProps {
  plan: RecurringPlan
  columns: Array<{ id: string; label: string; align?: "left" | "center" | "right" }>
  canManage: boolean
  onEdit: (plan: RecurringPlan) => void
  onDetails: (plan: RecurringPlan) => void
}

export const PlanListRow: React.FC<PlanListRowProps> = ({
  plan,
  columns,
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
      case "name":
        return (
          <div className="flex flex-col">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[300px]">
              {plan.name}
            </span>
            {plan.description && (
              <span className="text-xs text-brand-inactive-text dark:text-dark-body truncate max-w-[300px]">
                {plan.description}
              </span>
            )}
          </div>
        )
      case "frequency":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
            {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
          </span>
        )
      case "status":
        return (
          <Badge variant={statusVariant(plan.status)}>
            {statusLabel(plan.status)}
          </Badge>
        )
      case "actions":
        return canManage ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(plan)}
              className="h-8"
            >
              <EditIcon size={14} className="mr-1" /> Editar
            </Button>
          </div>
        ) : null
      default:
        return null
    }
  }

  return (
    <tr
      onClick={() => onDetails(plan)}
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
  )
}

export default PlanListRow
