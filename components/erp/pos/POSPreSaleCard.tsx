"use client"

import { memo } from "react"
import { ClockIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/reusable"
import type { PDVCustomer, PDVPreSale } from "@/lib/types/pdv"

type Props = {
  preSale: PDVPreSale
  index: number
  customers: PDVCustomer[]
  onClick: () => void
}

export const POSPreSaleCard = memo(function POSPreSaleCard({ preSale, index, customers, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="min-w-[280px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border">
            <ClockIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" />
          </div>
          <span className="text-lg font-bold text-brand-dark dark:text-dark-text">Nº {index + 1}</span>
        </div>
        <Badge variant="gray" icon={<span className="hidden" />} className="gap-0 px-3 py-1 text-[11px] font-medium">
          {new Date(preSale.created_at).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).replace(",", " às")}
        </Badge>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="max-w-[150px] truncate text-sm font-medium text-brand-inactive-text">
          {customers.find((customer) => customer.id === preSale.customer_id)?.name || "Cliente Balcão"}
        </span>
        <span className="text-lg font-bold text-brand-primary">
          {formatCurrency(Number(preSale.total_amount || 0))}
        </span>
      </div>
    </button>
  )
})

export function POSMorePreSalesCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-[110px] items-center justify-center rounded-[20px] border border-brand-border bg-white p-4"
    >
      <span className="text-2xl font-bold text-brand-primary">+{count}</span>
    </button>
  )
}
