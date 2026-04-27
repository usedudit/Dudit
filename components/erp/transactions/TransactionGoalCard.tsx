"use client"

import { TargetIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

export function TransactionGoalCard(props: {
  goalName: string
  paidTo: string[]
  achievedAt: string | null
  amount: number
}) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden transition-colors">
      <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border" />
      <div className="p-6 text-left">
        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6 mt-2">Meta</h3>
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center mb-4">
          <TargetIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading" />
        </div>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nome</p>
        <p className="font-bold text-brand-dark dark:text-dark-heading">{props.goalName}</p>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-3">Pago para</p>
        <p className="font-bold text-brand-dark dark:text-dark-heading">{props.paidTo.join(", ") || "-"}</p>
        {props.achievedAt && (
          <>
            <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-3">Data de atingimento</p>
            <p className="font-bold text-brand-dark dark:text-dark-heading">{props.achievedAt}</p>
          </>
        )}
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-3">Total do bônus</p>
        <p className="font-bold text-brand-green">{formatCurrency(props.amount)}</p>
      </div>
    </div>
  )
}
