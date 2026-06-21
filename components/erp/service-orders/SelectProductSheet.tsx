"use client"

import React, { useState, useEffect, useMemo } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Input, Button, ThreeDotsLoader } from "@/components/reusable"
import { SearchIcon, Package } from "@/lib/icons"
import { getERPProductsPageAction } from "@/app/actions/erp/products"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface SelectProductSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (product: any) => void
  partnerId: string
}

export default function SelectProductSheet({ open, onOpenChange, onSelect, partnerId }: SelectProductSheetProps) {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getERPProductsPageAction(partnerId, { cursor: null, limit: 200 })
      .then((res) => {
        if (res.success) setProducts(res.items || [])
      })
      .finally(() => setLoading(false))
  }, [open, partnerId])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    if (!term) return products
    return products.filter((p: any) =>
      p.name?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term)
    )
  }, [products, search])

  return (
    <DefaultModal isOpen={open} onClose={() => onOpenChange(false)} title="Selecionar Produto" maxWidth="lg">
      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <ThreeDotsLoader />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-brand-inactive-text text-center py-8">Nenhum produto encontrado</p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {filtered.map((prod: any) => (
              <button
                key={prod.id}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-brand-gray dark:hover:bg-dark-border transition-colors text-left"
                onClick={() => {
                  onSelect(prod)
                  onOpenChange(false)
                }}
              >
                <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden">
                  {prod.images?.[0] ? (
                    <img
                      src={getR2ImageUrl(prod.images[0], "thumbnail")}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-5 h-5 text-brand-inactive-text" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate">{prod.name}</p>
                  {prod.sku && <p className="text-[11px] text-brand-inactive-text">{prod.sku}</p>}
                </div>
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading shrink-0">
                  {formatCurrency(prod.price || 0)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </DefaultModal>
  )
}
