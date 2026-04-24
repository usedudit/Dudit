'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getStockStatus, formatCurrency } from "./product-utils"
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
    onDetails: (product: Product) => void
    suppliers: any[]
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
        onDetails,
    }: ProductListItemProps) => {
        const stock = product.stock_quantity ?? 0
        const status = getStockStatus(stock, product.min_stock ?? undefined)
        const variationsCount = Array.isArray(product.variants)
            ? (product.variants[0]?.count ?? product.variants.length)
            : 0

        const renderCellContent = (colId: string) => {
            switch (colId) {
                case "name":
                    return (
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                                <img
                                    src={getR2ImageUrl(product.images?.[0], "thumbnail") || "https://img.dudit.com.br/static/Placeholder.png"}
                                    alt=""
                                    className="w-full h-full object-cover rounded-full"
                                    loading="lazy"
                                />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 flex items-center gap-1.5">
                                    <span className="truncate max-w-[200px] xl:max-w-[300px]">{product.name}</span>
                                    {product.moderation_status === 'pending_moderation' && (
                                        <Tooltip text="Aguardando aprovação para exibição pública.">
                                            <Badge variant="orange" className="shrink-0" />
                                        </Tooltip>
                                    )}
                                </span>
                                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                    {product.sku}
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
                                    {stock} {product.unit || "UN"}
                                </span>
                                <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                    {status.label}
                                </span>
                            </div>
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
                        <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                            {formatCurrency(product.price)}
                        </span>
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

                case "status":
                    return (
                        <Badge variant={product.is_active ? "green" : "red"}>
                            {product.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                    )

                case "actions":
                    return (
                        <div
                            className="flex justify-center action-btn"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={() => onEdit(product)}
                                onDuplicate={() => onDuplicate(product)}
                                onDelete={() => onDelete(product)}
                            />
                        </div>
                    )

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
