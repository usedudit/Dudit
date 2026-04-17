"use client"

import { memo } from "react"
import { MinusIcon, PlusIcon, EditIcon, TrashIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { Button } from "@/components/reusable"
import type { PDVCartItem } from "@/lib/types/pdv"

type Props = {
  item: PDVCartItem
  onChangeQty: (itemId: string, delta: number) => void
  onRemove: (itemId: string) => void
  onEdit: (item: PDVCartItem) => void
}

const POSCartItemCard = memo(function POSCartItemCard({
  item,
  onChangeQty,
  onRemove,
  onEdit,
}: Props) {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-3 dark:bg-dark-surface">
      <div className="flex items-center gap-3">
        <img
          src={getR2ImageUrl(item.image, "thumbnail")}
          alt={item.name}
          className="h-16 w-16 rounded-xl object-cover bg-brand-gray dark:bg-dark-border/50"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-brand-dark dark:text-dark-heading">{item.name}</p>
          {item.variantName && (
            <p className="truncate text-xs text-brand-inactive-text dark:text-dark-body">{item.variantName}</p>
          )}
          <p className="text-sm text-brand-inactive-text dark:text-dark-body">{formatCurrency(item.price)}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button className="flex h-7 w-7 items-center justify-center" variant="outline" onClick={() => onChangeQty(item.id, -1)}>
              <MinusIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" />
            </Button>
            <span className="min-w-8 text-center font-bold">{String(item.qty).padStart(2, "0")}</span>
            <Button className="flex h-7 w-7 items-center justify-center" onClick={() => onChangeQty(item.id, 1)}>
              <PlusIcon className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <div className="flex gap-1.5">
            <Button className="h-8 w-8" variant="outline" onClick={() => onEdit(item)}>
              <EditIcon className="h-4 w-4 text-brand-inactive-text dark:text-dark-body" />
            </Button>
            <Button className="h-8 w-8" variant="outline" onClick={() => onRemove(item.id)}>
              <TrashIcon className="h-4 w-4 text-brand-red dark:text-brand-red" />
            </Button>
          </div>
          <div className="mt-1">
            <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Total</p>
            <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(item.price * item.qty)}</p>
          </div>
        </div>
      </div>
    </div>
  )
})

export default POSCartItemCard
