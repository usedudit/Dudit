'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getStockStatus, formatCurrency } from "./product-utils"
import StockAvailabilityHint from "./StockAvailabilityHint"
import type { Product } from "@/lib/types/product"

interface ColumnDef {
    id: string
    align?: "left" | "center" | "right"
    width?: string
    minWidth?: string
}

interface ProductListItemProps {
    product: Product
    columns: ColumnDef[]
    selected: boolean
    onSelect: (id: string) => void
    onEdit: (product: Product) => void
    onDuplicate: (product: Product) => void
    onDelete: (product: Product) => void
    onArchive?: (product: Product) => void
    onUnarchive?: (product: Product) => void
    onDetails: (product: Product) => void
    onShare: (product: Product) => void
    suppliers: any[]
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
}

const ProductListItem = React.memo(
    ({
        product,
        columns,
        selected,
        onSelect,
        onEdit,
        onDuplicate,
        onDelete,
        onArchive,
        onUnarchive,
        onDetails,
        onShare,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
    }: ProductListItemProps) => {
        const variationsCount = Array.isArray(product.variants)
            ? (product.variants[0]?.count ?? product.variants.length)
            : 0
        const hasVariants = variationsCount > 0
        const hasVariantData = hasVariants && product.variant_min_price !== undefined
        const effectiveStock = hasVariantData ? (product.variant_total_stock ?? 0) : (product.stock_quantity ?? 0)
        const reservedStock = hasVariantData ? (product.variant_total_reserved ?? 0) : (product.stock_reserved ?? 0)
        const status = getStockStatus(effectiveStock, product.min_stock ?? undefined)

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "name":
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <img
                                    src={getPrimaryProductDisplayImage(product)}
                                    alt=""
                                    className="w-full h-full object-cover rounded-full"
                                    loading="lazy"
                                />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 flex items-center gap-1.5">
                                    <span className="truncate max-w-[200px] xl:max-w-[300px]">{product.name}</span>
                                    {product.moderation_status === 'pending_moderation' && (
                                        <Tooltip text="Aguardando aprovação pela moderação para exibição na vitrine online.">
                                            <Badge variant="orange" className="shrink-0" />
                                        </Tooltip>
                                    )}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {hasVariants ? "Múltiplos SKUs" : (product.sku || "-")}
                                </span>
                            </div>
                        </div>
                    )

                case "category":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {product.category || "-"}
                        </span>
                    )

                case "brand":
                    return (
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {product.brand || "-"}
                        </span>
                    )

                case "stock":
                    return (
                        <div className="w-full">
                            <div className={`flex items-center gap-1.5 ${getJustifyClass(columns.find(c => c.id === 'stock')?.align)}`}>
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                    {effectiveStock} {product.unit || "UN"}
                                </span>
                                <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                    {status.label}
                                </span>
                            </div>
                            {reservedStock > 0 && (
                                <div className={`mt-0.5 ${getAlignClass(columns.find(c => c.id === 'stock')?.align)}`}>
                                    <StockAvailabilityHint total={effectiveStock} reserved={reservedStock} />
                                </div>
                            )}
                            {variationsCount > 0 && (
                                <div className={`${getAlignClass(columns.find(c => c.id === 'stock')?.align)}`}>
                                    <span className="text-[11px] font-bold text-brand-green underline decoration-brand-green/30">
                                        {variationsCount} {variationsCount === 1 ? "variação" : "variações"}
                                    </span>
                                </div>
                            )}
                        </div>
                    )

                case "price":
                    return (
                        <div className="flex flex-col items-start">
                            {hasVariantData ? (
                                product.variant_min_price === product.variant_max_price ? (
                                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(product.variant_min_price!)}
                                    </span>
                                ) : (
                                    <>
                                        <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
                                            De: {formatCurrency(product.variant_min_price!)}
                                        </span>
                                        <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                            Até: {formatCurrency(product.variant_max_price!)}
                                        </span>
                                    </>
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
                                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                        {formatCurrency(product.promotional_price)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(product.price)}
                                </span>
                            )}
                        </div>
                    )

                case "visibility":
                    return (
                        <div className="flex justify-center">
                            <Badge
                                variant={product.show_in_marketplace ? "green" : "gray"}
                                className="w-fit whitespace-nowrap"
                            >
                                {product.show_in_marketplace ? "Visível" : "Oculto"}
                            </Badge>
                        </div>
                    )

                case "status": {
                    const isArchived = product.status === "arquivado" || product.status === "archived"
                    return (
                        <Badge variant={isArchived ? "orange" : product.is_active ? "green" : "red"}>
                            {isArchived ? "Arquivado" : product.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                    )
                }

                case "actions": {
                    const isArchived = product.status === "arquivado" || product.status === "archived"
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={() => onEdit(product)}
                                onDuplicate={() => onDuplicate(product)}
                                onDelete={() => onDelete(product)}
                                onArchive={!isArchived && onArchive ? () => onArchive(product) : undefined}
                                onUnarchive={isArchived && onUnarchive ? () => onUnarchive(product) : undefined}
                                onShare={() => onShare(product)}
                            />
                        </div>
                    )
                }

                default:
                    return null
            }
        }

        const getJustifyClass = (align?: string) => {
            if (align === "center") return "justify-center"
            if (align === "right") return "justify-end"
            return "justify-start"
        }

        const getAlignClass = (align?: string) => {
            if (align === "center") return "text-center"
            if (align === "right") return "text-right"
            return "text-left"
        }

        return (
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onDetails(product)}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <td
                    className="py-2 pl-6 pr-0 border-b border-brand-border dark:border-dark-border w-14"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox checked={selected} onChange={() => onSelect(product.id)} />
                </td>

                {columns.map((col) => (
                    <td
                        key={col.id}
                        className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
                    >
                        <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
                            {renderCellContent(col.id)}
                        </div>
                    </td>
                ))}
            </motion.tr>
        )
    },
    (prev, next) =>
        prev.product === next.product &&
        prev.selected === next.selected &&
        prev.suppliers === next.suppliers &&
        prev.columns === next.columns
)

ProductListItem.displayName = "ProductListItem"

export default ProductListItem
