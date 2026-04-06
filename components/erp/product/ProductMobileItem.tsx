'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, Tooltip, Checkbox } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getStockStatus, formatCurrency } from "./product-utils"
import type { Product } from "@/lib/types/product"

interface ProductMobileItemProps {
  product: Product
  onClick: (product: Product) => void
  isSelected?: boolean
  onSelect?: (id: string) => void
}

const ProductMobileItem = React.memo(
  ({ product, onClick, isSelected, onSelect }: ProductMobileItemProps) => {
    const stock = product.stock_quantity ?? 0
    const status = getStockStatus(stock, product.min_stock ?? undefined)
    const variationsCount = Array.isArray(product.variants)
      ? (product.variants[0]?.count ?? product.variants.length)
      : 0

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="py-5 border-b border-brand-border dark:border-dark-border last:border-0 cursor-pointer"
        onClick={() => onClick(product)}
      >
        <div className="flex items-start gap-4 h-auto">
          {/* Imagem */}
          <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border flex-shrink-0 overflow-hidden">
            <img
              src={getR2ImageUrl(product.images?.[0], "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Detalhes */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {/* Linha 1: Nome + Bolinha Status */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading leading-tight truncate pr-1 flex items-center gap-1.5">
                <span className="truncate">{product.name}</span>
                {product.moderation_status === 'pending_moderation' && (
                  <Tooltip text="Aguardando aprovação para exibição pública.">
                    <Badge variant="orange" className="w-2.5 h-2.5 p-0 min-w-0 min-h-0 rounded-full flex-shrink-0" />
                  </Tooltip>
                )}
              </h3>
              <div
                className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${product.is_active ? "bg-brand-green" : "bg-brand-red"
                  }`}
              ></div>
            </div>

            {/* Linha 2: SKU • Cat • Marca */}
            <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
              <span>{product.sku || "N/A"}</span>
              {product.category && (
                <>
                  <span className="mx-1.5">•</span>
                  <span>{product.category}</span>
                </>
              )}
              {product.brand && (
                <>
                  <span className="mx-1.5">•</span>
                  <span>{product.brand}</span>
                </>
              )}
            </div>

            {/* Linha 3: Preço • Estoque • Badge + Checkbox */}
            <div className="flex items-end justify-between gap-2 mt-0.5">
              <div className="flex items-center flex-wrap gap-y-1">
                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                  {formatCurrency(product.price)}
                </span>
                <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                <span className="text-md font-medium text-brand-inactive-text dark:text-dark-body">
                  {stock} un
                </span>
                <span className="mx-2"></span>
                <Badge variant={status.variant} className="h-5 text-[10px] px-1.5">
                  {status.label}
                </Badge>
              </div>

              {/* Selection Checkbox */}
              {onSelect && (
                <div className="flex-none -mb-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={!!isSelected} onChange={() => onSelect(product.id)} />
                </div>
              )}
            </div>

            {/* Variações */}
            {variationsCount > 0 && (
              <div className="mt-0.5">
                <span className="text-[11px] font-bold text-brand-green underline decoration-brand-green/30">
                  {variationsCount} {variationsCount === 1 ? "variação" : "variações"}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    )
  },
  // Otimização: Só re-renderiza se o produto ou status de seleção mudar
  (prev, next) => prev.product === next.product && prev.isSelected === next.isSelected && prev.onSelect === next.onSelect
)

ProductMobileItem.displayName = "ProductMobileItem"

export default ProductMobileItem
