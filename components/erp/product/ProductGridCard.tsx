'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, Tooltip } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getStockStatus, formatCurrency } from "./product-utils"
import type { Product } from "@/lib/types/product"

interface ProductGridCardProps {
    product: Product
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onArchive?: () => void
    onUnarchive?: () => void
    onDuplicate: () => void
    onDetails: () => void
    onShare: () => void
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const ProductGridCard = React.memo(
    ({
        product,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onArchive,
        onUnarchive,
        onDuplicate,
        onDetails,
        onShare,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: ProductGridCardProps) => {

        const variationsCount = Array.isArray(product.variants)
            ? (product.variants[0]?.count ?? product.variants.length)
            : 0
        const hasVariations = variationsCount > 0
        const hasVariantData = hasVariations && product.variant_min_price !== undefined
        const effectiveStock = hasVariantData ? (product.variant_total_stock ?? 0) : (product.stock_quantity ?? 0)
        const status = getStockStatus(effectiveStock, product.min_stock ?? undefined)

        const imageUrl = getPrimaryProductDisplayImage(product)

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onDetails}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="flex gap-4 mb-2">
                    {/* Imagem do Produto */}
                    <div className="w-18 h-18 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden">
                        <img
                            src={imageUrl}
                            alt={product.name}
                            loading="lazy"
                            className="w-full h-full object-cover rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border"
                        />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: Nome + Badge Status + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3
                                    className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                                    title={product.name}
                                >
                                    <span className="truncate">{product.name}</span>
                                    {product.moderation_status === 'pending_moderation' && (
                                        <Tooltip text="Aguardando aprovação para exibição pública.">
                                            <Badge variant="orange" className="w-2.5 h-2.5 p-0 min-w-0 min-h-0 rounded-full shrink-0" />
                                        </Tooltip>
                                    )}
                                </h3>
                                {(() => {
                                    const isArchived = product.status === "arquivado" || product.status === "archived"
                                    return (
                                        <Tooltip text={isArchived ? "Arquivado" : product.is_active ? "Ativo" : "Inativo"}>
                                            <Badge
                                                variant={isArchived ? "orange" : product.is_active ? "green" : "red"}
                                                className="whitespace-nowrap scale-90 shrink-0"
                                            />
                                        </Tooltip>
                                    )
                                })()}
                            </div>

                            {/* Checkbox com stopPropagation para não abrir os detalhes ao clicar */}
                            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Linha 2: SKU • Categoria • Marca */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center">
                            <span>{hasVariations ? "Múltiplos SKUs" : `SKU: ${product.sku || "N/A"}`}</span>
                            {product.category && (
                                <>
                                    <span className="mx-1.5">•</span>
                                    <span className="truncate">{product.category}</span>
                                </>
                            )}
                            {product.brand && (
                                <>
                                    <span className="mx-1.5">•</span>
                                    <span className="truncate">{product.brand}</span>
                                </>
                            )}
                        </div>

                        {/* Linha 3: Preço */}
                        <div className="mt-1.5">
                            {hasVariantData ? (
                                product.variant_min_price === product.variant_max_price ? (
                                    <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(product.variant_min_price!)}
                                    </span>
                                ) : (
                                    <div className="flex flex-col items-start">
                                        <span className="text-[16px] font-medium text-brand-inactive-text dark:text-dark-body">
                                            De: {formatCurrency(product.variant_min_price!)} até <p className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(product.variant_max_price!)}</p>
                                        </span>
                                    </div>
                                )
                            ) : product.promotional_price && product.promotional_price > 0 && product.promotional_price < product.price ? (
                                <div className="flex flex-col items-start">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-brand-orange font-semibold">
                                            -{Math.round(((product.price - product.promotional_price) / product.price) * 100)}%
                                        </span>
                                        <span className="text-xs text-brand-inactive-text line-through">
                                            {formatCurrency(product.price)}
                                        </span>
                                    </div>
                                    <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                        {formatCurrency(product.promotional_price)}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[16px] font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(product.price)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Área do Rodapé */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">

                    {/* Linha A: Visibilidade (Esq) e Unidade (Dir) - TROCADO AQUI */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Visibilidade</span>
                            <Tooltip text={product.show_in_marketplace ? "Visibilidade: Visível" : "Visibilidade: Oculto"}>
                                <Badge variant={product.show_in_marketplace ? "green" : "gray"} className="whitespace-nowrap scale-90" />
                            </Tooltip>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Unidade</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {product.unit || "UN"}
                            </span>
                        </div>
                    </div>

                    {/* Linha B: Estoque e Ações */}
                    <div className="flex items-end justify-between mt-1">
                        {/* Seção de Estoque */}
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Estoque</span>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{effectiveStock}</span>
                                <Tooltip text={`Estoque: ${status.label}`}>
                                    <Badge variant={status.variant} className="whitespace-nowrap scale-90" />
                                </Tooltip>
                            </div>
                            {hasVariations && (
                                <span className="text-[10px] font-bold text-brand-green underline decoration-brand-green/30 mt-0.5">
                                    {variationsCount} {variationsCount === 1 ? 'variação' : 'variações'}
                                </span>
                            )}
                        </div>

                        {/* Botão de Ações */}
                        <div
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {(() => {
                                const isArchived = product.status === "arquivado" || product.status === "archived"
                                return (
                                    <ActionsDropdown
                                        onEdit={onEdit}
                                        onDuplicate={onDuplicate}
                                        onDelete={onDelete}
                                        onArchive={!isArchived ? onArchive : undefined}
                                        onUnarchive={isArchived ? onUnarchive : undefined}
                                        onShare={onShare}
                                    />
                                )
                            })()}
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    // Função de comparação personalizada para o React.memo
    (prev, next) =>
        prev.selected === next.selected &&
        prev.product === next.product // Assume que 'product' é imutável ou a referência muda quando atualiza
)

ProductGridCard.displayName = "ProductGridCard"

export default ProductGridCard
