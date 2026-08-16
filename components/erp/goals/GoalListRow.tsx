"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown } from "@/components/reusable"
import { TargetIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"

export type GoalRow = {
  id: string
  name: string
  period_type: "monthly" | "weekly"
  start_date: string
  end_date: string
  target_amount: number
  bonus_type: "fixed" | "percentage"
  bonus_value: number
  applies_to: "all" | "user"
  user_id: string | null
  scope_user_name?: string | null
  assigned_user_names?: string[]
  bonus_distribution?: string | null
  current_amount: number
  progress_percent: number
  status: "Em andamento" | "Concluída" | "Expirada"
}

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

function statusVariant(status: GoalRow["status"]) {
  if (status === "Concluída") return "green" as const
  if (status === "Expirada") return "red" as const
  return "orange" as const
}

interface GoalListRowProps {
  goal: GoalRow
  columns: ColumnDef[]
  onDetails: (goal: GoalRow) => void
  onEdit: (goal: GoalRow) => void
  onDuplicate: (goal: GoalRow) => void
  onDelete: (goal: GoalRow) => void
}

const GoalListRow = React.memo(
  ({ goal, columns, onDetails, onEdit, onDuplicate, onDelete }: GoalListRowProps) => {
    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "name":
          return (
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-brand-slate dark:bg-dark-border/50 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                <TargetIcon className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                  {goal.name}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {goal.period_type === "monthly" ? "Mensal" : "Semanal"} • {formatDate(goal.start_date)} até {formatDate(goal.end_date)}
                </span>
              </div>
            </div>
          )

        case "period":
          return (
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
              {goal.period_type === "monthly" ? "Mensal" : "Semanal"}
            </span>
          )

        case "target":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {formatCurrency(goal.target_amount || 0)}
            </span>
          )

        case "current":
          return (
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
              {formatCurrency(goal.current_amount || 0)}
            </span>
          )

        case "progress":
          return (
            <div className="flex items-center gap-2 min-w-[110px]">
              <div className="w-16 h-1.5 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden">
                <div
                  className="h-full bg-brand-green transition-all duration-300"
                  style={{ width: `${Math.min(100, goal.progress_percent || 0)}%` }}
                />
              </div>
              <span className="text-[13px] font-bold text-brand-green">{goal.progress_percent || 0}%</span>
            </div>
          )

        case "status":
          return <Badge variant={statusVariant(goal.status)}>{goal.status}</Badge>

        case "actions":
          return (
            <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
              <ActionsDropdown
                onEdit={() => onEdit(goal)}
                onDuplicate={() => onDuplicate(goal)}
                onDelete={() => onDelete(goal)}
              />
            </div>
          )

        default:
          return null
      }
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

    return (
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        onClick={() => onDetails(goal)}
      >
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
  },
  (prev, next) =>
    prev.goal.id === next.goal.id &&
    prev.goal.name === next.goal.name &&
    prev.goal.status === next.goal.status &&
    prev.goal.period_type === next.goal.period_type &&
    prev.goal.start_date === next.goal.start_date &&
    prev.goal.end_date === next.goal.end_date &&
    prev.goal.target_amount === next.goal.target_amount &&
    prev.goal.current_amount === next.goal.current_amount &&
    prev.goal.progress_percent === next.goal.progress_percent &&
    prev.columns === next.columns
)

GoalListRow.displayName = "GoalListRow"

export default GoalListRow
