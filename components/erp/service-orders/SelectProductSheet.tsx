"use client"

import React, { useCallback } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Input, ThreeDotsLoader } from "@/components/reusable"
import { SearchIcon } from "@/lib/icons"
import { fetchPartnerProductsBucket } from "@/app/actions/erp/client-loaders"
import { useProductBucket, type ProductBucketItem } from "@/components/erp/hooks"
import { ProductSearchResultItem } from "@/components/erp/shared/ProductSearchResultItem"

interface SelectProductSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (product: any) => void
  partnerId: string
  storeId?: string | null
}

export default function SelectProductSheet({ open, onOpenChange, onSelect, storeId }: SelectProductSheetProps) {
  const loadProducts = useCallback(() => fetchPartnerProductsBucket(storeId), [storeId])
  const productBucket = useProductBucket<ProductBucketItem>(loadProducts, {
    pageSize: 20,
    preload: open,
    showAllWhenEmpty: true,
  })

  return (
    <DefaultModal isOpen={open} onClose={() => onOpenChange(false)} title="Selecionar Produto" maxWidth="lg">
      <div className="space-y-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
          <Input
            placeholder="Buscar produto por nome, SKU ou variação..."
            value={productBucket.searchQuery}
            onChange={(e) => productBucket.setSearchQuery(e.target.value)}
            onFocus={() => productBucket.loadBucket()}
            className="pl-9"
          />
        </div>

        {productBucket.isLoading ? (
          <div className="py-8"><ThreeDotsLoader /></div>
        ) : productBucket.filteredResults.length === 0 ? (
          <p className="text-sm text-brand-inactive-text text-center py-8">Nenhum produto encontrado</p>
        ) : (
          <div
            className="max-h-[400px] overflow-y-auto custom-scrollbar"
            onScroll={(event) => {
              const target = event.currentTarget
              if (target.scrollHeight - target.scrollTop - target.clientHeight < 24) {
                productBucket.loadMore()
              }
            }}
          >
            {productBucket.filteredResults.map((product) => (
              <ProductSearchResultItem
                key={product.id}
                item={product}
                onClick={() => {
                  onSelect(product)
                  onOpenChange(false)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </DefaultModal>
  )
}
