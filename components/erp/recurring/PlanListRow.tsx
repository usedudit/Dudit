"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatDate } from "@/lib/utils"
import type { RecurringPlan } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel, getRecurringBillingModeLabel } from "@/lib/types/recurring"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface PlanListRowProps {
  plan: RecurringPlan
  columns: ColumnDef[]
  canManage: boolean
  selected: boolean
  onSelect: (id: string) => void
  onEdit: (plan: RecurringPlan) => void
  onDelete: (plan: RecurringPlan) => void
  onShare?: (plan: RecurringPlan) => void
  onDetails: (plan: RecurringPlan) => void
}

export const PlanListRow: React.FC<PlanListRowProps> = ({
  plan,
  columns,
  canManage,
  selected,
  onSelect,
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
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border overflow-hidden">
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover rounded-full"
                loading="lazy"
              />
            </div>
            <div className="flex flex-col text-left min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                {plan.name}
              </span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {plan.items?.length || 0} {(plan.items?.length || 0) === 1 ? "item" : "itens"}
              </span>
            </div>
          </div>
        )
      case "seller":
        return (
          <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate max-w-[180px] block" title={plan.partner_name || (plan as any).store_name || (plan as any).stores?.name || "—"}>
            {plan.partner_name || (plan as any).store_name || (plan as any).stores?.name || "—"}
          </span>
        )
      case "frequency":
        return (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
            {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)}
          </span>
        )
      case "billing":
        return (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
            {getRecurringBillingModeLabel(plan.billingMode)}
          </span>
        )
      case "startDate":
        return (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
            {formatDate(plan.startDate) || "-"}
          </span>
        )
      case "endDate":
        return (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
            {plan.endDate ? formatDate(plan.endDate) : "Sem prazo"}
          </span>
        )
      case "status":
        return (
          <Badge variant={statusVariant(plan.status)}>
            {statusLabel(plan.status)}
          </Badge>
        )
      case "actions":
        return (
          <div
            className="flex justify-center action-btn"
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsDropdown
              onEdit={canManage ? () => onEdit(plan) : undefined}
              onShare={onShare ? () => onShare(plan) : undefined}
              onDelete={canManage ? () => onDelete(plan) : undefined}
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => onDetails(plan)}
      className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
    >
      <td
        className="py-2 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onChange={() => onSelect(plan.id)} />
      </td>
      {columns.map((col) => (
        <td
          key={col.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
        >
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
            {renderCellContent(col.id)}
          </div>
        </td>
      ))}
    </motion.tr>
  )
}

export default PlanListRow
