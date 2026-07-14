"use client"

import { memo } from "react"
import { formatCurrency } from "@/lib/utils"
import { Badge, Button } from "@/components/reusable"
import type { PDVCustomer, PDVPreSale } from "@/lib/types/pdv"
import { TrashIcon } from "lucide-react"

type Props = {
  preSale: PDVPreSale
  index: number
  customers: PDVCustomer[]
  onClick: () => void
  onDelete?: (e: React.MouseEvent) => void
}

export const POSPreSaleCard = memo(function POSPreSaleCard({ preSale, index, customers, onClick, onDelete }: Props) {
  return (
    <div
      className="min-w-[280px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex flex-col h-full relative"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onClick}>
          <span className="text-lg font-bold text-brand-dark dark:text-dark-heading">Nº {index + 1}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="gray" icon={<span className="hidden" />} className="gap-0 px-3 py-1 text-[11px] font-medium">
            {new Date(preSale.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).replace(",", " às")}
          </Badge>
          {onDelete && (
            <Button
              variant="outlinered"
              className="w-6 h-6"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(e)
              }}
              leftIcon={<TrashIcon size={12} className="text-brand-red" />}
            >
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 cursor-pointer" onClick={onClick}>
        <span className="max-w-[150px] truncate text-sm font-medium text-brand-inactive-text">
          {customers.find((customer) => customer.id === preSale.customer_id)?.name || "Consumidor final"}
        </span>
        <span className="text-lg font-bold text-brand-primary">
          {formatCurrency(Number(preSale.total_amount || 0))}
        </span>
      </div>
    </div>
  )
})

export function POSMorePreSalesCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-[110px] items-center justify-center rounded-2xl border border-brand-border p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer"
    >
      <span className="text-2xl font-bold text-brand-dark dark:text-dark-heading">+{count}</span>
    </button>
  )
}
