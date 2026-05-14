"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button, IconPlaceholder } from "@/components/reusable"
import QuantitySelector from "@/components/reusable/QuantitySelector"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { BoxIcon, XIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import type { PDVProduct as Product } from "@/lib/types/pdv"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

type Props = {
  isOpen: boolean
  product: Product | null
  onClose: () => void
  onConfirm: (selections: Array<{ variantId: string; qty: number }>) => void
}

export default function SelectProductVariantSheet({ isOpen, product, onClose, onConfirm }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [qtyByVariantId, setQtyByVariantId] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!isOpen || !product) return
    const next: Record<string, number> = {}
    for (const variant of product.product_variants || []) {
      next[variant.id] = 0
    }
    setQtyByVariantId(next)
  }, [isOpen, product])

  const selections = useMemo(() => {
    return Object.entries(qtyByVariantId)
      .map(([variantId, qty]) => ({ variantId, qty: Math.max(0, Number(qty || 0)) }))
      .filter((item) => item.qty > 0)
  }, [qtyByVariantId])

  if (!product) return null

  const variants = product.product_variants || []
  const canConfirm = selections.length > 0

  const updateVariantQty = (variantId: string, qty: number, stockLimit?: number | null) => {
    const parsedQty = Math.max(0, Number(qty || 0))
    const maxQty = product.allow_sell_without_stock ? parsedQty : Math.min(parsedQty, Math.max(0, Number(stockLimit || 0)))
    setQtyByVariantId((prev) => ({ ...prev, [variantId]: maxQty }))
  }

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar variações</h2>
        <Button variant="filled" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-0">
        <div className="border-b border-brand-border px-4 py-4 dark:border-dark-border">
          <div className="flex gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
              <img
                src={getR2ImageUrl(product.images?.[0] || null, "thumbnail") || PLACEHOLDER_IMAGE}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold text-brand-dark dark:text-dark-heading">{product.name}</h3>
              <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">SKU: {product.sku || "-"}</p>
              <p className="mt-0.5 text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(product.price || 0))}</p>
            </div>
          </div>
        </div>

        {variants.length === 0 ? (
          <div className="px-4 py-10">
            <IconPlaceholder
              icon={BoxIcon}
              title="Sem variações"
              subtitle="Este produto não possui variações para seleção."
            />
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-2">
            {variants.map((variant) => {
              const stock = Math.max(0, Number(variant.stock_available || 0))
              const currentQty = Math.max(0, Number(qtyByVariantId[variant.id] || 0))
              const variantImage = (variant.variant_options?.image as string | undefined) || product.images?.[0] || null
              const variantPrice = Number(product.price || 0) + Number(variant.price_adjustment || 0)
              const outOfStock = !product.allow_sell_without_stock && stock <= 0

              return (
                <div
                  key={variant.id}
                  className="flex items-center gap-3 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-gray dark:border-dark-border dark:bg-dark-border/40">
                    <img
                      src={getR2ImageUrl(variantImage, "thumbnail") || PLACEHOLDER_IMAGE}
                      alt={variant.variant_name}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">{variant.variant_name}</p>
                    <p className="truncate text-xs font-medium text-brand-inactive-text dark:text-dark-body">SKU: {variant.sku || "-"}</p>
                  </div>

                  <div className="w-[80px] text-right">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(variantPrice)}</p>
                  </div>

                  <div className="w-[72px] text-right">
                    <p className={`text-sm font-bold ${outOfStock ? "text-brand-red" : "text-brand-dark dark:text-dark-heading"}`}>
                      {stock}
                    </p>
                    <p className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">estoque</p>
                  </div>

                  <div className="shrink-0">
                    <QuantitySelector
                      value={currentQty}
                      min={0}
                      max={product.allow_sell_without_stock ? undefined : stock}
                      onChange={(value) => updateVariantQty(variant.id, value, stock)}
                      disabled={outOfStock}
                      size="sm"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="h-12 flex-1"
            disabled={!canConfirm}
            onClick={() => {
              onConfirm(selections)
              onClose()
            }}
          >
            Adicionar variações
          </Button>
        </div>
      </footer>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose}>
        {content}
      </BottomSheet>
    )
  }

  return (
    <Portal>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 w-[560px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}
