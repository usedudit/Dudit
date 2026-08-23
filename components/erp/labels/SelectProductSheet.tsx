"use client"

import { useState, useEffect, useMemo } from "react"
import { SearchIcon, XIcon } from "@/lib/icons"
import { Button, Input, Checkbox } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency } from "@/lib/utils"

interface ProductBase {
  id: string
  name: string
  sku: string | null
  gtin: string | null
  price: number
  promotional_price: number | null
}

interface SelectProductSheetProps {
  isOpen: boolean
  onClose: () => void
  products: ProductBase[]
  existingIds: Set<string>
  onConfirm: (selectedIds: string[]) => void
}

function ProductRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 border-b border-brand-border p-3.5 last:border-0 dark:border-dark-border">
      <div className="h-5 w-5 shrink-0 rounded bg-gray-100 dark:bg-dark-border" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-dark-border" />
        <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-dark-border" />
      </div>
    </div>
  )
}

export default function SelectProductSheet({ isOpen, onClose, products, existingIds, onConfirm }: SelectProductSheetProps) {
  const isMobile = useMediaQuery("(max-width: 1023px)")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      setSelected(new Set(existingIds))
      setSearch("")
    }
  }, [isOpen, existingIds])

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.sku?.toLowerCase().includes(search.toLowerCase()) ||
          p.gtin?.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  )

  const toggleProduct = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    onConfirm(Array.from(selected))
    onClose()
  }

  const content = (
    <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Selecionar Produtos</h2>
        <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
          <XIcon className="h-5 w-5" />
        </Button>
      </header>

      <div className="z-10 shrink-0 border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
        <Input
          label=""
          name="productSearch"
          placeholder="Buscar por nome, SKU ou GTIN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
          className="mb-0"
          variant="full-rounded"
        />
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-brand-inactive-text">
            Nenhum produto encontrado
          </div>
        ) : (
          <div className="flex flex-col px-2 pb-2">
            {filtered.map((product) => {
              const isSelected = selected.has(product.id)
              return (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleProduct(product.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleProduct(product.id)
                    }
                  }}
                  className={`group flex items-center gap-4 border-b border-brand-border p-3.5 transition-colors last:border-0 dark:border-dark-border cursor-pointer ${isSelected
                    ? "bg-brand-primary/5 dark:bg-brand-primary/10"
                    : "hover:bg-gray-50 dark:hover:bg-dark-border/40"
                    }`}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onChange={() => toggleProduct(product.id)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {product.name}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-brand-dark dark:text-dark-heading">
                    {formatCurrency(product.price)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="h-12 flex-1" onClick={handleSave}>
            Salvar ({selected.size})
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
        className={`fixed inset-0 z-[140] bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      >
        <div
          className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-100"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </Portal>
  )
}
