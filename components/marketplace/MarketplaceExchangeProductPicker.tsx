"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
    Input,
    Button,
    Badge,
    QuantitySelector,
    ThreeDotsLoader,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer, useBodyScrollLock } from "@/lib/modal-stack"
import { SearchIcon, TrashIcon, XIcon, ShoppingBagIcon, ChevronDownIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
    getMarketplaceExchangeProductsAction,
    type MarketplaceExchangeProduct,
} from "@/app/actions/erp/returns"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

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
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const [isOpen, setIsOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<"products" | "selected">("products")
    const [products, setProducts] = useState<MarketplaceExchangeProduct[]>([])
    const [hasLoaded, setHasLoaded] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [expandedProductId, setExpandedProductId] = useState<string | null>(null)

    const zIndex = useModalLayer(isOpen)
    useBodyScrollLock(isOpen && !isMobile)

    useEffect(() => {
        if (!isOpen || hasLoaded) return
        let active = true
        setLoading(true)
        setError(null)
        getMarketplaceExchangeProductsAction(orderId)
            .then((res) => {
                if (!active) return
                if (res.success) {
                    setProducts(res.data.products)
                    setHasLoaded(true)
                    // Auto-expand the first product from the order if it has variants
                    const orderIdSet = new Set(orderProductIds)
                    const firstOrderVariantProduct = res.data.products.find(
                        (p) => orderIdSet.has(p.id) && p.hasVariants && p.variants.length > 0
                    )
                    if (firstOrderVariantProduct) {
                        setExpandedProductId(firstOrderVariantProduct.id)
                    }
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
    }, [isOpen, hasLoaded, orderId, orderProductIds])

    const orderProductIdSet = useMemo(() => new Set(orderProductIds), [orderProductIds])

    const filteredProducts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        const list = q
            ? products.filter((p) =>
                p.name.toLowerCase().includes(q) ||
                p.sku.toLowerCase().includes(q) ||
                p.variants.some((v) => v.name.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
            )
            : products

        // Keep products from the original order at the top for quick size/color swaps
        return [...list].sort((a, b) => {
            const aInOrder = orderProductIdSet.has(a.id) ? 0 : 1
            const bInOrder = orderProductIdSet.has(b.id) ? 0 : 1
            if (aInOrder !== bInOrder) return aInOrder - bInOrder
            return a.name.localeCompare(b.name)
        })
    }, [products, searchQuery, orderProductIdSet])

    const getItemQuantity = (productId: string, variantId: string | null) => {
        const found = selectedItems.find(
            (i) => i.product_id === productId && (i.variant_id || null) === variantId
        )
        return found ? found.quantity : 0
    }

    const setItemQuantity = (
        product: MarketplaceExchangeProduct,
        variant: MarketplaceExchangeProduct["variants"][number] | null,
        qty: number
    ) => {
        const variantId = variant?.id || null
        const maxStock = product.allowSellWithoutStock
            ? undefined
            : (variant ? variant.stock : product.stock)
        const clampedQty = maxStock !== undefined ? Math.min(maxStock, qty) : qty

        if (clampedQty <= 0) {
            onChange(
                selectedItems.filter(
                    (i) => !(i.product_id === product.id && (i.variant_id || null) === variantId)
                )
            )
            return
        }

        const existingIdx = selectedItems.findIndex(
            (i) => i.product_id === product.id && (i.variant_id || null) === variantId
        )

        if (existingIdx >= 0) {
            onChange(
                selectedItems.map((item, idx) =>
                    idx === existingIdx ? { ...item, quantity: clampedQty } : item
                )
            )
            return
        }

        const unitPrice = variant ? variant.price : product.effectivePrice
        const name = variant ? `${product.name} - ${variant.name}` : product.name
        const sku = variant?.sku || product.sku
        const image = variant?.image || product.image

        onChange([
            ...selectedItems,
            {
                product_id: product.id,
                variant_id: variantId,
                quantity: clampedQty,
                unit_price: unitPrice,
                product_name: name,
                sku,
                image,
                maxStock,
            },
        ])
    }

    const updateSelectedQty = (index: number, qty: number) => {
        if (qty <= 0) {
            onChange(selectedItems.filter((_, idx) => idx !== index))
            return
        }
        onChange(selectedItems.map((item, idx) => idx === index ? { ...item, quantity: qty } : item))
    }

    const removeSelectedItem = (index: number) => {
        onChange(selectedItems.filter((_, idx) => idx !== index))
    }

    const totalSelectedUnits = useMemo(
        () => selectedItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0),
        [selectedItems]
    )
    const replacementTotal = useMemo(
        () => selectedItems.reduce((sum, i) => sum + Number(i.unit_price || 0) * i.quantity, 0),
        [selectedItems]
    )
    const differenceToPay = Math.max(0, replacementTotal - creditAmount)
    const surplusAmount = Math.max(0, creditAmount - replacementTotal)

    const sheetBody = (
        <div className="flex flex-col h-full min-h-0">
            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "products" | "selected")}
                className="flex flex-col flex-1 min-h-0"
            >
                <div className="px-5 pt-2 border-b border-brand-border dark:border-dark-border shrink-0">
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                        <TabsTrigger value="products">Produtos</TabsTrigger>
                        <TabsTrigger value="selected">
                            Selecionados{totalSelectedUnits > 0 ? ` (${totalSelectedUnits})` : ""}
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Tab 1: Available Store Products */}
                <TabsContent value="products" className="flex-1 flex flex-col min-h-0 mt-0">
                    <div className="p-4 border-b border-brand-border/50 dark:border-dark-border/50 shrink-0">
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar produtos disponíveis na loja..."
                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                            variant="full-rounded"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-brand-border/50 dark:divide-dark-border/50">
                        {loading ? (
                            <div className="py-12 flex items-center justify-center">
                                <ThreeDotsLoader />
                            </div>
                        ) : error ? (
                            <div className="p-6 text-center text-sm text-brand-inactive-text dark:text-dark-body">
                                {error}
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="p-8 text-center text-sm text-brand-inactive-text dark:text-dark-body">
                                Nenhum produto disponível encontrado.
                            </div>
                        ) : (
                            filteredProducts.map((product) => {
                                const thumb = product.image ? getR2ImageUrl(product.image, "thumb") : PLACEHOLDER_IMAGE
                                const isExpanded = expandedProductId === product.id
                                const isFromOrder = orderProductIdSet.has(product.id)
                                const simpleQty = !product.hasVariants ? getItemQuantity(product.id, null) : 0
                                const selectedVariantsCount = product.hasVariants
                                    ? product.variants.reduce((sum, v) => sum + getItemQuantity(product.id, v.id), 0)
                                    : 0

                                return (
                                    <div key={product.id} className="p-4 bg-white dark:bg-dark-surface">
                                        <div
                                            className={`flex items-center gap-3 ${product.hasVariants ? "cursor-pointer" : ""}`}
                                            onClick={() => {
                                                if (product.hasVariants) {
                                                    setExpandedProductId(isExpanded ? null : product.id)
                                                }
                                            }}
                                        >
                                            <img
                                                src={thumb}
                                                alt={product.name}
                                                className="w-12 h-12 rounded-xl object-cover border border-brand-border dark:border-dark-border shrink-0"
                                                onError={(e: any) => { e.target.src = PLACEHOLDER_IMAGE }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        {product.name}
                                                    </p>
                                                    {isFromOrder && (
                                                        <Badge variant="gray" className="text-[10px]">Do seu pedido</Badge>
                                                    )}
                                                    {selectedVariantsCount > 0 && (
                                                        <Badge variant="green" className="text-[10px]">{selectedVariantsCount} sel.</Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                    <span className="font-bold text-brand-green">
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

                                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {product.hasVariants ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                                                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark dark:text-dark-heading px-3 py-1.5 rounded-lg border border-brand-border dark:border-dark-border hover:bg-brand-gray/50 dark:hover:bg-dark-border/50 transition-colors"
                                                    >
                                                        <span>Opções</span>
                                                        <ChevronDownIcon
                                                            size={14}
                                                            className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                                        />
                                                    </button>
                                                ) : simpleQty > 0 ? (
                                                    <QuantitySelector
                                                        value={simpleQty}
                                                        onChange={(val) => setItemQuantity(product, null, val)}
                                                        min={0}
                                                        max={product.allowSellWithoutStock ? undefined : product.stock}
                                                        size="sm"
                                                    />
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setItemQuantity(product, null, 1)}
                                                    >
                                                        Adicionar
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* CartPage-style variant pills below the product */}
                                        {product.hasVariants && isExpanded && (
                                            <div className="mt-3 pt-3 border-t border-brand-border/40 dark:border-dark-border/40">
                                                <p className="text-[12px] font-semibold text-brand-dark dark:text-dark-heading mb-2">
                                                    Opções disponíveis:
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {product.variants.map((variant) => {
                                                        const vImg = variant.image ? getR2ImageUrl(variant.image, "thumb") : thumb
                                                        const vQty = getItemQuantity(product.id, variant.id)
                                                        const vMax = product.allowSellWithoutStock ? undefined : variant.stock

                                                        return (
                                                            <div
                                                                key={variant.id}
                                                                className={`inline-flex items-center gap-2 pr-2 py-1 pl-1 rounded-lg border transition-all ${
                                                                    vQty > 0
                                                                        ? "bg-brand-green/5 border-brand-green dark:bg-brand-green/10"
                                                                        : "bg-white hover:bg-brand-gray dark:bg-dark-surface dark:hover:bg-zinc-800 border-brand-border dark:border-dark-border hover:border-brand-green dark:hover:border-brand-green"
                                                                }`}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setItemQuantity(product, variant, vQty + 1)}
                                                                    className="inline-flex items-center gap-2 text-left active:scale-95 transition-transform"
                                                                >
                                                                    <span className="w-9 h-9 rounded-md overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                                                        <img
                                                                            src={vImg}
                                                                            alt={variant.name}
                                                                            className="w-full h-full object-cover"
                                                                            onError={(e: any) => { e.target.src = PLACEHOLDER_IMAGE }}
                                                                        />
                                                                    </span>
                                                                    <span className="flex flex-col items-start leading-tight pr-1">
                                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                                                            {variant.name}
                                                                        </span>
                                                                        <span className="text-[12px] font-semibold text-brand-green">
                                                                            {formatCurrency(variant.price)}
                                                                            {!product.allowSellWithoutStock && (
                                                                                <span className="text-[11px] font-normal text-brand-inactive-text dark:text-dark-body ml-1">
                                                                                    ({variant.stock} disp.)
                                                                                </span>
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                </button>

                                                                {vQty > 0 && (
                                                                    <div className="pl-1 border-l border-brand-border/50 dark:border-dark-border/50">
                                                                        <QuantitySelector
                                                                            value={vQty}
                                                                            onChange={(val) => setItemQuantity(product, variant, val)}
                                                                            min={0}
                                                                            max={vMax}
                                                                            size="sm"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </TabsContent>

                {/* Tab 2: Selected Replacement Items */}
                <TabsContent value="selected" className="flex-1 overflow-y-auto custom-scrollbar mt-0 p-4 space-y-3">
                    {selectedItems.length === 0 ? (
                        <div className="py-12 text-center space-y-3">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Nenhum produto selecionado para a troca ainda.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab("products")}
                            >
                                Ver produtos disponíveis
                            </Button>
                        </div>
                    ) : (
                        selectedItems.map((item, idx) => {
                            const thumb = item.image ? getR2ImageUrl(item.image, "thumb") : PLACEHOLDER_IMAGE
                            const lineTotal = Number(item.unit_price || 0) * item.quantity
                            return (
                                <div
                                    key={`${item.product_id}-${item.variant_id || idx}`}
                                    className="flex items-center gap-3 p-3 rounded-xl border border-brand-border/60 dark:border-dark-border/60 bg-white dark:bg-dark-surface"
                                >
                                    <img
                                        src={thumb}
                                        alt={item.product_name}
                                        className="w-12 h-12 rounded-xl object-cover border border-brand-border dark:border-dark-border shrink-0"
                                        onError={(e: any) => { e.target.src = PLACEHOLDER_IMAGE }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                            {item.product_name}
                                        </p>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                            Unit.: {formatCurrency(item.unit_price)} • Total:{" "}
                                            <strong className="text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(lineTotal)}
                                            </strong>
                                        </p>
                                    </div>
                                    <QuantitySelector
                                        value={item.quantity}
                                        onChange={(val) => updateSelectedQty(idx, val)}
                                        min={0}
                                        max={item.maxStock}
                                        size="sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeSelectedItem(idx)}
                                        className="w-8 h-8 flex items-center justify-center text-brand-red hover:bg-red-50 dark:hover:bg-red-900/10 rounded-full shrink-0"
                                        aria-label="Remover item"
                                    >
                                        <TrashIcon size={15} />
                                    </button>
                                </div>
                            )
                        })
                    )}
                </TabsContent>
            </Tabs>

            {/* Footer with summary & confirm */}
            <div className="p-4 border-t border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface shrink-0 space-y-3">
                {selectedItems.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg border border-brand-border dark:border-dark-border p-2.5">
                            <p className="text-brand-inactive-text dark:text-dark-body">Total troca</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                {formatCurrency(replacementTotal)}
                            </p>
                        </div>
                        <div className="rounded-lg border border-brand-border dark:border-dark-border p-2.5">
                            <p className="text-brand-inactive-text dark:text-dark-body">Crédito itens</p>
                            <p className="font-bold text-brand-dark dark:text-dark-heading mt-0.5">
                                {formatCurrency(creditAmount)}
                            </p>
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
                )}
                <Button type="button" className="w-full" onClick={() => setIsOpen(false)}>
                    {totalSelectedUnits > 0
                        ? `Confirmar (${totalSelectedUnits} ${totalSelectedUnits === 1 ? "item" : "itens"})`
                        : "Concluir"}
                </Button>
            </div>
        </div>
    )

    return (
        <>
            <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                leftIcon={<ShoppingBagIcon size={16} />}
                onClick={() => setIsOpen(true)}
            >
                <span className="truncate">
                    {totalSelectedUnits > 0
                        ? `Produtos para troca (${totalSelectedUnits} ${totalSelectedUnits === 1 ? "selecionado" : "selecionados"} • ${formatCurrency(replacementTotal)})`
                        : "Escolher produtos para troca (opcional)"}
                </span>
            </Button>

            {isMobile ? (
                <BottomSheet
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title="Produtos para troca"
                >
                    <div className="h-[75vh] flex flex-col">
                        {sheetBody}
                    </div>
                </BottomSheet>
            ) : (
                <Portal>
                    <AnimatePresence>
                        {isOpen && (
                            <motion.div
                                className="fixed inset-0 flex justify-end"
                                style={{ zIndex }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div
                                    className="absolute inset-0 bg-black/50"
                                    onClick={() => setIsOpen(false)}
                                />
                                <motion.div
                                    className="relative w-full max-w-lg h-full bg-white dark:bg-dark-surface shadow-2xl border-l border-brand-border dark:border-dark-border flex flex-col"
                                    initial={{ x: "100%" }}
                                    animate={{ x: 0 }}
                                    exit={{ x: "100%" }}
                                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                                >
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border dark:border-dark-border shrink-0">
                                        <div>
                                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                                Produtos para troca
                                            </h3>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Selecione os itens disponíveis em estoque na loja
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsOpen(false)}
                                            className="w-9 h-9 rounded-full hover:bg-brand-gray dark:hover:bg-dark-border flex items-center justify-center text-brand-inactive-text dark:text-dark-body transition-colors"
                                            aria-label="Fechar"
                                        >
                                            <XIcon size={18} />
                                        </button>
                                    </div>
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        {sheetBody}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Portal>
            )}
        </>
    )
}
