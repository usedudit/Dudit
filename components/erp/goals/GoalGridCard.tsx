"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge } from "@/components/reusable"
import { TargetIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

type GoalRow = {
  id: string
  name: string
  period_type: "monthly" | "weekly"
  start_date: string
  end_date: string
  target_amount: number
  goal_type: "sales" | "service_orders" | "both"
  assigned_user_names?: string[]
  current_amount: number
  progress_percent: number
  status: "Em andamento" | "Concluída" | "Expirada"
}

interface GoalGridCardProps {
  goal: GoalRow
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function goalTypeLabel(goalType: GoalRow["goal_type"]) {
  if (goalType === "sales") return "Vendas"
  if (goalType === "service_orders") return "Ordens de serviço"
  return "Vendas e OS"
}

function statusVariant(status: GoalRow["status"]) {
  if (status === "Concluída") return "green" as const
  if (status === "Expirada") return "red" as const
  return "orange" as const
}

const GoalGridCard = React.memo(function GoalGridCard({
  goal,
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
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 flex flex-col h-full"
    >
      <div className="flex gap-4 mb-2">
        <div className="w-12 h-12 rounded-full bg-brand-slate dark:bg-dark-border/50 flex border border-brand-border dark:border-dark-border items-center justify-center shrink-0">
          <TargetIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div className="flex items-center min-w-0 gap-2">
                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate" title={goal.name}>
                  {goal.name}
                </h3>
                <Badge variant={statusVariant(goal.status)} className="whitespace-nowrap scale-90 shrink-0">
                  {goal.status}
                </Badge>
              </div>
              <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
                {goal.period_type === "monthly" ? "Mensal" : "Semanal"} • {goal.start_date} até {goal.end_date}
              </p>
            </div>

            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <ActionsDropdown onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
            </div>
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
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Tipo</span>
              <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{goalTypeLabel(goal.goal_type)}</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Atual</span>
              <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(goal.current_amount || 0)}</p>
            </div>
          </div>

          <div className="min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Abrangência</span>
            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
              {goal.assigned_user_names?.length ? goal.assigned_user_names.join(", ") : "Todos os vendedores"}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
})

export default GoalGridCard
