import React from "react"
import { TagIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

type PaymentSummaryProps = {
  orderLabel: string
  customerName?: string | null
  totalAmount: number
  paidAmount: number
  remainingAmount?: number
}

export function PaymentSummary({
  orderLabel,
  customerName,
  totalAmount,
  paidAmount,
  remainingAmount,
}: PaymentSummaryProps) {
  const remaining = remainingAmount ?? Math.max(0, totalAmount - paidAmount)

  return (
    <div className="bg-brand-gray dark:bg-dark-border/30 rounded-2xl p-5 flex flex-col gap-4 border border-brand-border dark:border-dark-border h-full">
      <div className="flex items-center justify-between pb-4 border-b border-dashed border-brand-border dark:border-dark-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-brand-primary/10 dark:bg-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
            <TagIcon className="w-5 h-5" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading leading-tight truncate">{orderLabel}</span>
            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
              {customerName || "Consumidor final"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">Resumo Financeiro</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Total</span>
            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Recebido</span>
            <span className="font-bold text-green-600">{formatCurrency(paidAmount)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">Restante</span>
            <span className="font-bold text-amber-600">{formatCurrency(remaining)}</span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
        <span className="text-[10px] text-brand-inactive-text dark:text-dark-body uppercase font-bold tracking-wider">Cliente</span>
        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-1">{customerName || "Consumidor final"}</p>
      </div>
    </div>
  )
}
