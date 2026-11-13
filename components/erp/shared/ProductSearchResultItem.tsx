"use client"

import React from "react"
import { Badge } from "@/components/reusable"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils/formatters"
import { computeItemDisplayPrice } from "@/lib/services/pricing-engine"

export interface ProductSearchResultItemProps {
    /** Product, service or combined-catalog item returned by the search buckets. */
    item: any
    /** Active promotions used to compute the display price of products/services. */
    promotions?: any[]
    onClick?: () => void
    disabled?: boolean
    className?: string
    /** Force service rendering (used by service pickers that do not carry `isService`). */
    isService?: boolean
    showPrice?: boolean
    showStock?: boolean
    showOptionsBadge?: boolean
    /** Override the stock total (e.g. replacement stock calculation). */
    displayStock?: number | null
    /** Override the displayed unit price (e.g. an already calculated best price). */
    displayPrice?: number | null
    secondaryLabel?: React.ReactNode
    rightSlot?: React.ReactNode
}

function getVariants(item: any): any[] {
    if (Array.isArray(item?.variants)) return item.variants
    if (Array.isArray(item?.product_variants)) return item.product_variants
    return []
}

function getVariantStock(variant: any): number {
    const raw = variant?.stock_available ?? variant?.stock_quantity ?? variant?.stock ?? 0
    return Number(raw) || 0
}

function getItemStock(item: any): number {
    const raw = item?.stock_available ?? item?.stock_quantity ?? item?.stock ?? 0
    return Number(raw) || 0
}

function getVariantPrice(variant: any, basePrice: number): number {
    const direct = variant?.price ?? variant?.sale_price
    if (direct !== undefined && direct !== null && Number.isFinite(Number(direct)) && Number(direct) > 0) {
        return Number(direct)
    }
    return basePrice + (Number(variant?.price_adjustment) || 0)
}

function resolveImage(item: any, variants: any[]): string {
    const variantImages = variants
        .map((variant) => variant?.variant_options?.image || variant?.image || null)
        .filter((image): image is string => typeof image === "string" && image.trim().length > 0)

    const ownImage =
        item?.image ||
        (Array.isArray(item?.images) ? item.images.find((image: any) => typeof image === "string" && image.trim()) : null) ||
        item?.primary_image ||
        null

    return getR2ImageUrl(ownImage || item?.fallback_variant_image || variantImages[0] || null, "thumbnail")
}

function resolveIsService(item: any, forced?: boolean): boolean {
    if (forced !== undefined) return forced
    if (item?.isService !== undefined) return Boolean(item.isService)
    if (item?.is_service !== undefined) return Boolean(item.is_service)
    const productType = typeof item?.product_type === "string" ? item.product_type.toLowerCase() : ""
    return productType === "service" || productType === "serviço" || productType === "servico"
}

export function ProductSearchResultItem({
    item,
    promotions = [],
    onClick,
    disabled = false,
    className = "",
    isService,
    showPrice = true,
    showStock = true,
    showOptionsBadge = true,
    displayStock,
    displayPrice,
    secondaryLabel,
    rightSlot,
}: ProductSearchResultItemProps) {
    const variants = getVariants(item)
    const service = resolveIsService(item, isService)
    const hasVariants = !service && (item?.has_variants === true || variants.length > 0)
    const imageUrl = resolveImage(item, variants)

    const stock = React.useMemo(() => {
        if (displayStock !== undefined && displayStock !== null) return Number(displayStock) || 0
        if (service) return 0
        if (hasVariants && variants.length > 0) {
            return variants.reduce((sum, variant) => sum + getVariantStock(variant), 0)
        }
        if (hasVariants && item?.variant_total_available !== undefined && item?.variant_total_available !== null) {
            return Number(item.variant_total_available) || 0
        }
        return getItemStock(item)
    }, [displayStock, service, hasVariants, variants, item])

    const priceContent = React.useMemo(() => {
        if (!showPrice) return null

        if (displayPrice !== undefined && displayPrice !== null) {
            return <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(displayPrice)}</span>
        }

        if (hasVariants && variants.length > 0) {
            const basePrice = Number(item?.price || 0)
            const prices = variants
                .map((variant) => getVariantPrice(variant, basePrice))
                .filter((price) => Number.isFinite(price))
            if (prices.length > 0) {
                const minPrice = Math.min(...prices)
                const maxPrice = Math.max(...prices)
                return (
                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                        {minPrice === maxPrice
                            ? formatCurrency(minPrice)
                            : `De: ${formatCurrency(minPrice)} Até: ${formatCurrency(maxPrice)}`}
                    </span>
                )
            }
        }

        const basePrice = Number(item?.price || 0)
        const promotionalPrice = item?.promotional_price != null && Number(item.promotional_price) < basePrice
            ? Number(item.promotional_price)
            : null
        const pricing = computeItemDisplayPrice(
            basePrice,
            promotionalPrice,
            promotions,
            {
                productId: service ? null : item?.id || null,
                serviceId: service ? item?.id || null : null,
                categoryId: item?.category_id || null,
            },
        )

        return (
            <div className="flex items-center gap-1.5">
                {pricing.referencePrice && (
                    <span className="text-xs text-brand-inactive-text line-through">{formatCurrency(pricing.referencePrice)}</span>
                )}
                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(pricing.bestPrice)}</span>
                {pricing.badgeVariant === "blue" && (
                    <Badge variant="blue" icon={null} className="whitespace-nowrap">-{pricing.discountPercent}%</Badge>
                )}
                {pricing.badgeVariant === "orange" && (
                    <Badge variant="orange" icon={null} className="whitespace-nowrap">-{pricing.discountPercent}%</Badge>
                )}
            </div>
        )
    }, [showPrice, displayPrice, hasVariants, variants, item, promotions, service])

    const resolvedSecondaryLabel = secondaryLabel ?? (
        hasVariants
            ? "Múltiplos SKUs"
            : service
                ? (item?.sku && item.sku !== "SERVIÇO" ? item.sku : "Serviço")
                : (item?.sku || "N/A")
    )

    const handleClick = () => {
        if (!disabled) onClick?.()
    }

    return (
        <div
            role={onClick && !disabled ? "button" : undefined}
            tabIndex={onClick && !disabled ? 0 : undefined}
            onClick={handleClick}
            onKeyDown={(event) => {
                if (!onClick || disabled) return
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    handleClick()
                }
            }}
            className={`flex w-full items-center gap-4 p-3.5 text-left transition-colors border-b border-brand-border last:border-0 dark:border-dark-border ${disabled ? "cursor-default opacity-40" : onClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border" : ""} ${className}`}
        >
            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border/50 overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                <img
                    src={imageUrl}
                    alt={item?.name || ""}
                    loading="lazy"
                    className="w-full h-full object-cover rounded-full"
                />
            </div>

            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{item?.name}</div>
                <div className="text-[11px] font-medium text-brand-inactive-text mt-0.5 tracking-wider uppercase truncate">
                    {resolvedSecondaryLabel}
                </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
                {priceContent}
                {showStock && (
                    <div className="text-xs font-bold text-white bg-brand-dark dark:bg-brand-green px-2 py-1 rounded-md whitespace-nowrap">
                        {service ? "Serviço" : `${stock} em estoque`}
                    </div>
                )}
                {rightSlot}
            </div>

            {showOptionsBadge && hasVariants && (
                <div className="px-2 py-0.5 bg-gray-100 dark:bg-zinc-700 text-[10px] font-bold rounded text-brand-inactive-text uppercase whitespace-nowrap">
                    Opções
                </div>
            )}
        </div>
    )
}

export default ProductSearchResultItem