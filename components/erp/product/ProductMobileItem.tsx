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
        const variationsCount = Array.isArray(product.variants)
            ? (product.variants[0]?.count ?? product.variants.length)
            : 0
        const hasVariants = variationsCount > 0
        const hasVariantData = hasVariants && product.variant_min_price !== undefined
        const effectiveStock = hasVariantData ? (product.variant_total_stock ?? 0) : (product.stock_quantity ?? 0)
        const status = getStockStatus(effectiveStock, product.min_stock ?? undefined)

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
                    <div className="w-20 h-20 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border shrink-0 overflow-hidden">
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
                            <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                <span className="truncate">{product.name}</span>
                                {product.moderation_status === 'pending_moderation' && (
                                    <Tooltip text="Aguardando aprovação para exibição pública.">
                                        <Badge variant="orange" className="w-2.5 h-2.5 p-0 min-w-0 min-h-0 rounded-full shrink-0" />
                                    </Tooltip>
                                )}
                            </h3>
                            <div
                                className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${product.is_active ? "bg-brand-green" : "bg-brand-red"
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
                            <div className="flex flex-col gap-1">
                                {hasVariantData ? (
                                    product.variant_min_price === product.variant_max_price ? (
                                        <div className="flex items-center flex-wrap gap-y-1">
                                            <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(product.variant_min_price!)}
                                            </span>
                                            <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                                            <span className="text-md font-medium text-brand-inactive-text dark:text-dark-body">
                                                {effectiveStock} un
                                            </span>
                                            <span className="mx-2"></span>
                                            <Badge variant={status.variant} className="h-5 text-[10px] px-1.5">
                                                {status.label}
                                            </Badge>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                De: {formatCurrency(product.variant_min_price!)}
                                            </span>
                                            <div className="flex items-center flex-wrap gap-y-1">
                                                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                                                    Até: {formatCurrency(product.variant_max_price!)}
                                                </span>
                                                <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                                                <span className="text-md font-medium text-brand-inactive-text dark:text-dark-body">
                                                    {effectiveStock} un
                                                </span>
                                                <span className="mx-2"></span>
                                                <Badge variant={status.variant} className="h-5 text-[10px] px-1.5">
                                                    {status.label}
                                                </Badge>
                                            </div>
                                        </div>
                                    )
                                ) : product.promotional_price && product.promotional_price > 0 && product.promotional_price < product.price ? (
                                    <>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-brand-orange font-semibold">
                                                -{Math.round(((product.price - product.promotional_price) / product.price) * 100)}%
                                            </span>
                                            <span className="text-xs text-brand-inactive-text line-through">
                                                {formatCurrency(product.price)}
                                            </span>
                                        </div>
                                        <div className="flex items-center flex-wrap gap-y-1">
                                            <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(product.promotional_price)}
                                            </span>
                                            <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                                            <span className="text-md font-medium text-brand-inactive-text dark:text-dark-body">
                                                {effectiveStock} un
                                            </span>
                                            <span className="mx-2"></span>
                                            <Badge variant={status.variant} className="h-5 text-[10px] px-1.5">
                                                {status.label}
                                            </Badge>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center flex-wrap gap-y-1">
                                        <span className="text-md font-bold text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(product.price)}
                                        </span>
                                        <span className="mx-2 text-brand-inactive-text dark:text-dark-border">•</span>
                                        <span className="text-md font-medium text-brand-inactive-text dark:text-dark-body">
                                            {effectiveStock} un
                                        </span>
                                        <span className="mx-2"></span>
                                        <Badge variant={status.variant} className="h-5 text-[10px] px-1.5">
                                            {status.label}
                                        </Badge>
                                    </div>
                                )}
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
