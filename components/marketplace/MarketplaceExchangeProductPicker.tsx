"use client"

import { useEffect, useMemo, useState } from "react"
import { Input, Button, QuantitySelector, ThreeDotsLoader } from "@/components/reusable"
import { SearchIcon, TrashIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
    getMarketplaceExchangeProductsAction,
    type MarketplaceExchangeProduct,
} from "@/app/actions/erp/returns"

export interface MarketplaceSelectedExchangeItem {
    product_id: string
    variant_id: string | null
    quantity: number
    unit_price: number
    product_name: string
    sku: string
    image: string | null
    maxStock?: number
}

interface MarketplaceExchangeProductPickerProps {
    orderId: string
    orderProductIds: string[]
    creditAmount: number
    selectedItems: MarketplaceSelectedExchangeItem[]
    onChange: (items: MarketplaceSelectedExchangeItem[]) => void
}

export function MarketplaceExchangeProductPicker({
    orderId,
    orderProductIds,
    creditAmount,
    selectedItems,
    onChange,
}: MarketplaceExchangeProductPickerProps) {
    const [products, setProducts] = useState<MarketplaceExchangeProduct[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [expandedProductId, setExpandedProductId] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        setLoading(true)
        setError(null)
        getMarketplaceExchangeProductsAction(orderId)
            .then((res) => {
                if (!active) return
                if (res.success) {
                    setProducts(res.data.products)
                } else {
                    setError(res.error)
                }
            })
            .catch(() => {
                if (active) setError("Não foi possível carregar os produtos disponíveis da loja.")
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => { active = false }
    }, [orderId])

    const sameProductSuggestions = useMemo(() => {
        if (!orderProductIds.length) return []
        const idSet = new Set(orderProductIds)
        return products.filter((p) => idSet.has(p.id) && p.hasVariants && p.variants.length > 0)
    }, [products, orderProductIds])

    const filteredProducts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        if (!q) return products.slice(0, 8)
        return products
            .filter((p) =>
                p.name.toLowerCase().includes(q) ||
                p.sku.toLowerCase().includes(q) ||
                p.variants.some((v) => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
            )
            .slice(0, 20)
    }, [products, searchQuery])

    const addItem = (
        product: MarketplaceExchangeProduct,
        variant?: MarketplaceExchangeProduct["variants"][number] | null
    ) => {
        const variantId = variant?.id || null
        const maxStock = product.allowSellWithoutStock
            ? undefined
            : (variant ? variant.stock : product.stock)
        const unitPrice = variant ? variant.price : product.effectivePrice
        const name = variant ? `${product.name} - ${variant.name}` : product.name
        const sku = variant?.sku || product.sku
        const image = variant?.image || product.image

        const existingIdx = selectedItems.findIndex(
            (i) => i.product_id === product.id && (i.variant_id || null) === variantId
        )

        if (existingIdx >= 0) {
            const current = selectedItems[existingIdx]
            const nextQty = maxStock !== undefined ? Math.min(maxStock, current.quantity + 1) : current.quantity + 1
            onChange(selectedItems.map((item, idx) => idx === existingIdx ? { ...item, quantity: nextQty } : item))
            return
        }

        onChange([
            ...selectedItems,
            {
                product_id: product.id,
                variant_id: variantId,
                quantity: 1,
                unit_price: unitPrice,
                product_name: name,
                sku,
                image,
                maxStock,
            },
        ])
    }

    const updateQty = (index: number, qty: number) => {
        const nextQty = Math.max(1, qty)
        onChange(selectedItems.map((item, idx) => idx === index ? { ...item, quantity: nextQty } : item))
    }

    const removeItem = (index: number) => {
        onChange(selectedItems.filter((_, idx) => idx !== index))
    }

    const replacementTotal = useMemo(
        () => selectedItems.reduce((sum, i) => sum + Number(i.unit_price || 0) * i.quantity, 0),
        [selectedItems]
    )
    const differenceToPay = Math.max(0, replacementTotal - creditAmount)
    const surplusAmount = Math.max(0, creditAmount - replacementTotal)

    if (loading) {
        return (
            <div className="rounded-xl border border-brand-border dark:border-dark-border p-6 flex items-center justify-center">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (error) {
        return (
            <div className="rounded-xl border border-brand-border dark:border-dark-border p-4 text-xs text-brand-inactive-text dark:text-dark-body">
                {error} Você ainda pode enviar a solicitação e combinar o produto substituto com a loja.
            </div>
        )
    }

    if (products.length === 0) {
        return null
    }

    return (
        <div className="space-y-4 rounded-xl border border-brand-border dark:border-dark-border p-4">
            <div>
                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                    Escolha os produtos desejados na troca (opcional)
                </h4>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                    Mostrando apenas itens disponíveis em estoque na loja.
                </p>
            </div>

            {/* Same-product variant suggestions */}
            {sameProductSuggestions.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide">
                        Outras opções do mesmo produto
                    </p>
                    {sameProductSuggestions.map((prod) => (
                        <div key={prod.id} className="space-y-2">
                            <p className="text-xs font-bold text-brand-dark dark:text-dark-heading">{prod.name}</p>
                            <div className="flex flex-wrap gap-2">
                                {prod.variants.map((variant) => (
                                    <button
                                        key={variant.id}
                                        type="button"
                                        onClick={() => addItem(prod, variant)}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-border dark:border-dark-border hover:border-brand-green hover:bg-brand-gray/40 dark:hover:bg-dark-border/40 text-xs transition-colors"
                                    >
                                        <span className="font-medium text-brand-dark dark:text-dark-heading">{variant.name}</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(variant.price)}</span>
                                        {!prod.allowSellWithoutStock && (
                                            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">({variant.stock} disp.)</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Search any available product in the store */}
            <div className="space-y-2">
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar produtos disponíveis na loja..."
                    prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                    variant="full-rounded"
                />

                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-brand-border/40 dark:divide-dark-border/40 rounded-xl border border-brand-border/60 dark:border-dark-border/60">
                    {filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-xs text-brand-inactive-text dark:text-dark-body">
                            Nenhum produto disponível encontrado.
                        </div>
                    ) : (
                        filteredProducts.map((product) => {
                            const thumb = product.image ? getR2ImageUrl(product.image, "thumb") : "https://img.dudit.com.br/static/Placeholder.png"
                            const isExpanded = expandedProductId === product.id
                            return (
                                <div key={product.id} className="p-2.5 bg-white dark:bg-dark-surface">
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={thumb}
                                            alt={product.name}
                                            className="w-10 h-10 rounded-lg object-cover border border-brand-border dark:border-dark-border shrink-0"
                                            onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">{product.name}</p>
                                            <div className="flex items-center gap-2 text-[11px] text-brand-inactive-text dark:text-dark-body">
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(product.effectivePrice)}
                                                </span>
                                                {!product.allowSellWithoutStock && (
                                                    <>
                                                        <span>•</span>
                                                        <span>Estoque: {product.stock}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {product.hasVariants ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                                            >
                                                {isExpanded ? "Ocultar" : "Opções"}
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => addItem(product, null)}
                                            >
                                                Adicionar
                                            </Button>
                                        )}
                                    </div>

                                    {product.hasVariants && isExpanded && (
                                        <div className="mt-2.5 pl-13 flex flex-wrap gap-2">
                                            {product.variants.map((variant) => (
                                                <button
                                                    key={variant.id}
                                                    type="button"
                                                    onClick={() => addItem(product, variant)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-brand-border dark:border-dark-border hover:border-brand-green text-xs transition-colors"
                                                >
                                                    <span className="font-medium text-brand-dark dark:text-dark-heading">{variant.name}</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(variant.price)}</span>
                                                    {!product.allowSellWithoutStock && (
                                                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body">({variant.stock})</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Selected replacement items */}
            {selectedItems.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-brand-border dark:border-dark-border">
                    <p className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                        Itens selecionados para troca ({selectedItems.length})
                    </p>
                    <div className="space-y-2">
                        {selectedItems.map((item, idx) => {
                            const thumb = item.image ? getR2ImageUrl(item.image, "thumb") : "https://img.dudit.com.br/static/Placeholder.png"
                            const lineTotal = Number(item.unit_price || 0) * item.quantity
                            return (
                                <div key={`${item.product_id}-${item.variant_id || idx}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-brand-gray/40 dark:bg-dark-border/30">
                                    <img
                                        src={thumb}
                                        alt={item.product_name}
                                        className="w-10 h-10 rounded-lg object-cover border border-brand-border dark:border-dark-border shrink-0"
                                        onError={(e: any) => { e.target.src = "https://img.dudit.com.br/static/Placeholder.png" }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">{item.product_name}</p>
                                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                            {formatCurrency(item.unit_price)} un. • Total: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(lineTotal)}</strong>
                                        </p>
                                    </div>
                                    <QuantitySelector
                                        value={item.quantity}
                                        onChange={(val) => updateQty(idx, val)}
                                        min={1}
                                        max={item.maxStock}
                                        size="sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeItem(idx)}
                                        className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full shrink-0"
                                        aria-label="Remover item"
                                    >
                                        <TrashIcon size={14} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {/* Financial summary */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg border border-brand-border dark:border-dark-border p-2.5">
                            <p className="text-brand-inactive-text dark:text-dark-body">Total troca</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading mt-0.5">{formatCurrency(replacementTotal)}</p>
                        </div>
                        <div className="rounded-lg border border-brand-border dark:border-dark-border p-2.5">
                            <p className="text-brand-inactive-text dark:text-dark-body">Crédito itens</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading mt-0.5">{formatCurrency(creditAmount)}</p>
                        </div>
                        <div className="rounded-lg border border-brand-border dark:border-dark-border p-2.5">
                            <p className="text-brand-inactive-text dark:text-dark-body">
                                {differenceToPay > 0.009 ? "Diferença" : "Saldo"}
                            </p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                {formatCurrency(differenceToPay > 0.009 ? differenceToPay : surplusAmount)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
