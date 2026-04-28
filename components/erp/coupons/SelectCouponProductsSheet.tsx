"use client"

import React, { useMemo, useState } from "react"
import { SearchIcon, PlusIcon, XIcon, CheckCircleIcon, BoxIcon } from "@/lib/icons"
import { Badge, Button, Input, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils/formatters"
import type { ScopeItem } from "@/lib/types/coupon"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

interface SelectCouponProductsSheetProps {
  isOpen: boolean
  onClose: () => void
  products: ScopeItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
  isLoading?: boolean
}

function ProductRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border">
      <div className="h-12 w-12 shrink-0 rounded-full bg-gray-100 dark:bg-dark-border" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-dark-border" />
        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
      </div>
    </div>
  )
}

export default function SelectCouponProductsSheet({
  isOpen,
  onClose,
  products,
  selectedIds,
  onToggle,
  isLoading = false,
}: SelectCouponProductsSheetProps) {
  const [search, setSearch] = useState("")
  const isMobile = useMediaQuery("(max-width: 768px)")

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...products].sort((a, b) => {
      const aInactive = a.isActive === false ? 1 : 0
      const bInactive = b.isActive === false ? 1 : 0
      if (aInactive !== bInactive) return aInactive - bInactive
      return a.name.localeCompare(b.name)
    })

    if (!term) return sorted

    return sorted.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        String(item.category || "").toLowerCase().includes(term) ||
        String(item.sku || "").toLowerCase().includes(term)
      )
    })
  }, [products, search])

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Produtos</h2>
        <Button variant="ghost" onClick={onClose} size="icon">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Input
          label=""
          name="couponProductSearch"
          placeholder="Buscar por nome, categoria ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
          variant="full-rounded"
        />
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductRowSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="flex flex-col px-2 pb-2">
            {filteredProducts.map((product) => {
              const disabled = product.isActive === false
              const isSelected = selectedIds.includes(product.id)
              const imageUrl = getR2ImageUrl(product.image || null, "thumbnail") || PLACEHOLDER_IMAGE

              return (
                <div
                  key={product.id}
                  role={disabled ? undefined : "button"}
                  tabIndex={disabled ? undefined : 0}
                  onClick={disabled ? undefined : () => onToggle(product.id)}
                  onKeyDown={
                    disabled
                      ? undefined
                      : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onToggle(product.id)
                        }
                      }
                  }
                  className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border ${
                    disabled
                      ? "cursor-not-allowed opacity-55"
                      : isSelected
                        ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                        : "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border/40"
                  }`}
                >
                  <img
                    src={imageUrl}
                    alt={product.name}
                    className={`h-12 w-12 shrink-0 rounded-full border border-brand-border dark:border-dark-border ${product.image ? "object-cover" : "object-contain p-1.5"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {product.name}
                      </span>
                      <Badge variant={product.isActive === false ? "gray" : "green"} className="whitespace-nowrap scale-90 shrink-0">
                        {product.isActive === false ? "Inativo" : "Ativo"}
                      </Badge>
                      {isSelected && (
                        <Badge variant="green" className="whitespace-nowrap scale-90 shrink-0">
                          Selecionado
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                      {product.sku ? `SKU: ${product.sku}` : "Sem SKU"}
                      {product.category ? ` • ${product.category}` : ""}
                    </p>
                    <p className="truncate text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                      {product.price != null ? formatCurrency(product.price) : "Sem valor"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!disabled && isSelected ? (
                      <div className="flex h-8 w-8 items-center justify-center text-brand-green">
                        <CheckCircleIcon size={18} />
                      </div>
                    ) : !disabled ? (
                      <div className="flex h-8 w-8 items-center justify-center text-brand-inactive-text opacity-0 transition-opacity group-hover:opacity-100">
                        <PlusIcon size={18} />
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="px-4 py-12">
            <IconPlaceholder
              icon={BoxIcon}
              title="Nenhum produto encontrado"
              subtitle="Tente outro termo de busca."
            />
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Button variant="outline" className="h-12 w-full" onClick={onClose}>
          Fechar
        </Button>
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
        className={`fixed inset-0 z-[80] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 z-[81] w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}
