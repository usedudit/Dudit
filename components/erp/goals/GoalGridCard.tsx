"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge } from "@/components/reusable"
import { TargetIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"

type GoalRow = {
  id: string
  name: string
  period_type: "monthly" | "weekly"
  start_date: string
  end_date: string
  target_amount: number
  bonus_type?: "fixed" | "percentage"
  bonus_value?: number
  assigned_user_names?: string[]
  bonus_distribution?: string | null
  current_amount: number
  progress_percent: number
  status: "Em andamento" | "Concluída" | "Expirada"
}

interface GoalGridCardProps {
  goal: GoalRow
  onDetails?: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function statusVariant(status: GoalRow["status"]) {
  if (status === "Concluída") return "green" as const
  if (status === "Expirada") return "red" as const
  return "orange" as const
}

const GoalGridCard = React.memo(function GoalGridCard({
  goal,
  onDetails,
  onEdit,
  onDuplicate,
  onDelete,
}: GoalGridCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onDetails}
      className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 flex flex-col h-full ${onDetails ? "cursor-pointer" : ""}`}
    >
      <div className="flex gap-4 mb-2">
        <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0">
          <TargetIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="min-w-0">
            <div className="flex items-center min-w-0 gap-2">
              <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={goal.name}>
                {goal.name}
              </h3>
              <Badge variant={statusVariant(goal.status)} className="whitespace-nowrap scale-90 shrink-0"></Badge>
            </div>
            <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
              {goal.period_type === "monthly" ? "Mensal" : "Semanal"} • {formatDate(goal.start_date)} até {formatDate(goal.end_date)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Meta</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(goal.target_amount || 0)}</span>
          </div>

          <div className="flex flex-col gap-0.5 items-end">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Progresso</span>
            <span className="text-[14px] font-bold text-brand-green">{goal.progress_percent || 0}%</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden">
            <div
              className="h-full bg-brand-green transition-all duration-300"
              style={{ width: `${Math.min(100, goal.progress_percent || 0)}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Atual</span>
              <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(goal.current_amount || 0)}</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Bônus</span>
              <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                {goal.bonus_type === "fixed" || goal.bonus_type === "percentage"
                  ? goal.bonus_type === "percentage"
                    ? `${goal.bonus_value || 0}%`
                    : formatCurrency(goal.bonus_value || 0)
                  : "-"}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-1">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Abrangência</span>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate" title={goal.assigned_user_names?.length ? goal.assigned_user_names.join(", ") : "Todos os vendedores"}>
                  {goal.assigned_user_names?.length ? goal.assigned_user_names.join(", ") : "Todos os vendedores"}
                </p>
                {goal.bonus_distribution === "proportional" && (
                  <span className="text-[10px] font-semibold text-brand-inactive-text dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0">
                    Proporcional
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <ActionsDropdown onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
})

export default GoalGridCard
