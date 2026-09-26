"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Package, ShoppingCartIcon, AlertTriangleIcon, XIcon, ClockIcon, ArrowLeftIcon, SparklesIcon, TagIcon, SearchIcon } from "@/lib/icons"
import { Button, MoneyInput, IconPlaceholder, Spinner, Badge, InfoCard, Tabs, TabsList, TabsTrigger, ThreeDotsLoader, Input, FormDropdown } from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import {
    getReplenishmentSuggestionsAction,
    getStagnantProductsAction,
    updateProductPromotionalPriceAction,
} from "@/app/actions/erp/products"
import { notifyReplenishmentSuggestedAction } from "@/app/actions/erp/notifications"
import { formatCurrency, formatQuantityWithUnit, formatUnit } from "@/lib/utils"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { useRouter } from "next/navigation"
import { useNotification } from "@/hooks/use-notification"

interface Suggestion {
    id: string
    name: string
    sku: string | null
    gtin: string | null
    stock_quantity: number
    min_stock: number
    suggestion: number
    unit: string
    cost_price: number | null
    images: string[] | null
    supplier_name: string | null
    supplier_cost: number | null
    variant_min_price: number | null
    variant_max_price: number | null
}

interface StagnantProduct {
    id: string
    name: string
    sku: string | null
    gtin: string | null
    stock_quantity: number
    price: number
    cost_price: number | null
    promotional_price: number | null
    unit: string
    images: string[] | null
    days_stagnant: number
    created_at: string
    variant_min_price: number | null
    variant_max_price: number | null
}

interface ReplenishmentSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    storeId?: string
}

export function ReplenishmentSheet({ isOpen, onClose, partnerId, storeId }: ReplenishmentSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const router = useRouter()
    const { success: notifySuccess, error: notifyError } = useNotification()

    const [activeTab, setActiveTab] = useState<"reposicao" | "parados">("reposicao")

    const [selectedPeriod, setSelectedPeriod] = useState<number>(90)
    const [searchQuery, setSearchQuery] = useState("")

    const PERIOD_OPTIONS = [
        { value: "15", label: "15 dias" },
        { value: "30", label: "30 dias" },
        { value: "60", label: "60 dias" },
        { value: "90", label: "90 dias" },
    ]

    // Replenishment suggestions
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)

    // Stagnant products (>selectedPeriod d)
    const [stagnantProducts, setStagnantProducts] = useState<StagnantProduct[]>([])
    const [loadingStagnant, setLoadingStagnant] = useState(false)

    // Second Sheet (Promotional Price for Stagnant Product)
    const [selectedStagnant, setSelectedStagnant] = useState<StagnantProduct | null>(null)
    const [isDiscountSheetOpen, setIsDiscountSheetOpen] = useState(false)
    const [promoPriceInput, setPromoPriceInput] = useState<number>(0)
    const [isSavingPromo, setIsSavingPromo] = useState(false)

    const fetchSuggestions = useCallback(() => {
        setLoadingSuggestions(true)
        getReplenishmentSuggestionsAction(partnerId, storeId).then((res) => {
            if (res.suggestions) {
                setSuggestions(res.suggestions)
                if (res.suggestions.length > 0) {
                    notifyReplenishmentSuggestedAction().catch(() => { })
                }
            }
            setLoadingSuggestions(false)
        })
    }, [partnerId, storeId])

    const fetchStagnant = useCallback(() => {
        setLoadingStagnant(true)
        getStagnantProductsAction(partnerId, selectedPeriod, storeId).then((res) => {
            if (res.products) {
                setStagnantProducts(res.products)
            }
            setLoadingStagnant(false)
        })
    }, [partnerId, selectedPeriod, storeId])

    const refetchStagnant = useCallback(() => {
        fetchStagnant()
    }, [fetchStagnant])

    useEffect(() => {
        if (!isOpen) {
            setSuggestions([])
            setStagnantProducts([])
            setSearchQuery("")
            setIsDiscountSheetOpen(false)
            setSelectedStagnant(null)
            return
        }
        fetchSuggestions()
        fetchStagnant()
    }, [isOpen, fetchSuggestions, fetchStagnant])

    useEffect(() => {
        if (isOpen) {
            fetchStagnant()
        }
    }, [selectedPeriod, isOpen, fetchStagnant])

    const openDiscountSheet = (product: StagnantProduct) => {
        setSelectedStagnant(product)
        const hasVariantData = product.variant_min_price !== null && product.variant_max_price !== null
        const basePrice = hasVariantData ? product.variant_min_price! : product.price
        const initialPromo = product.promotional_price || Math.round(basePrice * 0.85 * 100) / 100
        setPromoPriceInput(initialPromo)
        setIsDiscountSheetOpen(true)
    }

    const filteredStagnantProducts = useMemo(() => {
        if (!searchQuery.trim()) return stagnantProducts
        const term = searchQuery.toLowerCase().trim()
        return stagnantProducts.filter(
            (p) =>
                p.name.toLowerCase().includes(term) ||
                (p.sku || "").toLowerCase().includes(term) ||
                (p.gtin || "").toLowerCase().includes(term)
        )
    }, [stagnantProducts, searchQuery])

    const handleSavePromoPrice = async () => {
        if (!selectedStagnant) return
        setIsSavingPromo(true)

        const res = await updateProductPromotionalPriceAction({
            productId: selectedStagnant.id,
            partnerId,
            promotionalPrice: promoPriceInput > 0 ? promoPriceInput : null,
        })

        setIsSavingPromo(false)

        if (res.error) {
            notifyError(res.error)
        } else {
            notifySuccess("Preço promocional atualizado com sucesso!")
            setIsDiscountSheetOpen(false)
            setSelectedStagnant(null)
            fetchStagnant()
            router.refresh()
        }
    }

    // --- CONTEÚDO DA SHEET PRINCIPAL ---
    const mainContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Sugestões & Oportunidades</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 relative">
                {/* Navigation Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                    <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6">
                        <TabsTrigger value="reposicao" className="px-0 pb-3 text-sm">
                            Reposição ({suggestions.length})
                        </TabsTrigger>
                        <TabsTrigger value="parados" className="px-0 pb-3 text-sm">
                            Parados ({stagnantProducts.length})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {activeTab === "reposicao" ? (
                    loadingSuggestions ? (
                        <div className="flex items-center justify-center py-16">
                            <ThreeDotsLoader />
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="py-12">
                            <IconPlaceholder
                                icon={Package}
                                title="Estoque em dia!"
                                subtitle="Nenhum produto está abaixo do nível mínimo de estoque no momento."
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-brand-inactive-text px-1">
                                {suggestions.length} produto(s) necessitando de compra ou reposição
                            </p>
                            {suggestions.map((s) => (
                                <div
                                    key={s.id}
                                    className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-green transition-all cursor-pointer"
                                    onClick={() => {
                                        onClose()
                                        router.push(`/erp/produtos?view=${s.id}`)
                                    }}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                            <img src={getPrimaryProductDisplayImage(s)} alt={s.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                {s.name}
                                            </p>
                                            <p className="text-xs text-brand-inactive-text font-mono mt-0.5">
                                                {s.sku || s.gtin || "Sem SKU"}
                                            </p>
                                        </div>
                                        <Badge variant="orange">Comprar {s.suggestion} {s.unit}</Badge>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <span className="text-brand-inactive-text">Atual: </span>
                                                <span className="font-bold text-brand-red">{s.stock_quantity}</span>
                                            </div>
                                            <div>
                                                <span className="text-brand-inactive-text">Mínimo: </span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{s.min_stock}</span>
                                            </div>
                                        </div>
                                        {s.supplier_name && (
                                            <div className="text-right">
                                                <span className="text-brand-inactive-text block truncate max-w-[140px]">
                                                    {s.supplier_name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    loadingStagnant ? (
                        <div className="flex items-center justify-center py-16">
                            <Spinner size={28} />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="mb-3 flex items-center justify-between">
                                <FormDropdown
                                    options={PERIOD_OPTIONS}
                                    value={String(selectedPeriod)}
                                    setValue={(v) => setSelectedPeriod(Number(v))}
                                    placeholder="Período"
                                    width="w-40"
                                />
                                <div className="w-56">
                                    <Input
                                        name="search"
                                        placeholder="Buscar..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        variant="full-rounded"
                                        prefix={
                                            <SearchIcon
                                                size={18}
                                                className="text-brand-inactive-text shrink-0"
                                            />
                                        }
                                        label=""
                                    />
                                </div>
                            </div>

                            {stagnantProducts.length === 0 ? (
                                <div className="py-12">
                                    <IconPlaceholder
                                        icon={ClockIcon}
                                        title="Nenhum produto estagnado!"
                                        subtitle={`Todos os seus produtos possuem movimentação ou foram cadastrados há menos de ${selectedPeriod} dias.`}
                                    />
                                </div>
                            ) : (
                                <>
                                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                                        {filteredStagnantProducts.length} produto(s) sem giro há mais de {selectedPeriod} dias
                                    </p>
                                    {filteredStagnantProducts.map((p) => {
                                        const hasVariantData = p.variant_min_price !== null && p.variant_max_price !== null
                                        const effectivePrice = hasVariantData ? p.variant_min_price! : p.price
                                        const hasPromo = p.promotional_price && p.promotional_price > 0 && p.promotional_price < effectivePrice
                                        return (
                                            <div
                                                key={p.id}
                                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-primary/40 hover:shadow-sm transition-all cursor-pointer"
                                                onClick={() => openDiscountSheet(p)}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                        <img src={getPrimaryProductDisplayImage(p)} alt={p.name} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                {p.name}
                                                            </p>
                                                        </div>
                                                        <p className="text-xs text-brand-inactive-text font-mono mt-0.5">
                                                            {p.sku || p.gtin || "Sem SKU"} • {p.stock_quantity} em estoque
                                                        </p>
                                                    </div>
                                                    <Badge variant="blue">Parado há {p.days_stagnant}d</Badge>
                                                </div>

                                                <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-brand-border/60 dark:border-dark-border/60">
                                                    <div>
                                                        <span className="text-xs text-brand-inactive-text block">Preço de Venda</span>
                                                        <div className="flex items-center gap-2">
                                                            {hasVariantData ? (
                                                                p.variant_min_price === p.variant_max_price ? (
                                                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(p.variant_min_price!)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-brand-inactive-text">
                                                                        De: {formatCurrency(p.variant_min_price!)} até <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(p.variant_max_price!)}</span>
                                                                    </span>
                                                                )
                                                            ) : hasPromo ? (
                                                                <>
                                                                    <span className="text-sm font-bold line-through text-brand-inactive-text">
                                                                        {formatCurrency(p.price)}
                                                                    </span>
                                                                    <span className="text-sm font-bold text-brand-green">
                                                                        {formatCurrency(p.promotional_price!)}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(p.price)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs gap-1.5"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            openDiscountSheet(p)
                                                        }}
                                                    >
                                                        <TagIcon size={14} className="text-brand-primary" />
                                                        Aplicar Desconto
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* Footer */}
            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <Button variant="outline" className="w-full h-11" onClick={onClose}>
                    Fechar
                </Button>
            </footer>
        </div>
    )

    // --- CONTEÚDO DA SEGUNDA SHEET (PREÇO PROMOCIONAL) ---
    const discountContent = selectedStagnant ? (() => {
        const hasVariantData = selectedStagnant.variant_min_price !== null && selectedStagnant.variant_max_price !== null
        const effectiveBasePrice = hasVariantData ? selectedStagnant.variant_min_price! : selectedStagnant.price
        return (
            <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
                {/* Header */}
                <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsDiscountSheetOpen(false)}
                            className="p-1.5 hover:bg-brand-gray dark:hover:bg-dark-border rounded-lg transition-colors"
                        >
                            <ArrowLeftIcon size={20} className="text-brand-dark dark:text-dark-heading" />
                        </button>
                        <div>
                            <h2 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                                Preço Promocional
                            </h2>
                            <p className="text-xs text-brand-inactive-text">Girar estoque parado por +{selectedPeriod} dias</p>
                        </div>
                    </div>
                    <Button variant="filled" onClick={() => setIsDiscountSheetOpen(false)} size="icon" className="hidden lg:flex">
                        <XIcon className="h-5 w-5" />
                    </Button>
                </header>

                {/* Scroll Body */}
                <div className="custom-scrollbar flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Resumo do Produto */}
                    <div className="bg-brand-gray/40 dark:bg-dark-border/40 border border-brand-border dark:border-dark-border rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-white dark:bg-dark-surface shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                            <img src={getPrimaryProductDisplayImage(selectedStagnant)} alt={selectedStagnant.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {selectedStagnant.name}
                            </p>
                            <p className="text-xs text-brand-inactive-text mt-0.5">
                                Estoque: <strong className="text-brand-dark dark:text-dark-heading">{formatQuantityWithUnit(selectedStagnant.stock_quantity, selectedStagnant.unit, "full")}</strong> • Parado há {selectedStagnant.days_stagnant} dias
                            </p>
                            <div className="mt-1.5 flex items-center gap-3 text-xs">
                                {selectedStagnant.variant_min_price !== null && selectedStagnant.variant_max_price !== null ? (
                                    selectedStagnant.variant_min_price === selectedStagnant.variant_max_price ? (
                                        <span>Preço normal: <strong>{formatCurrency(selectedStagnant.variant_min_price)}</strong></span>
                                    ) : (
                                        <span>Preço de venda: <strong>De {formatCurrency(selectedStagnant.variant_min_price)} até {formatCurrency(selectedStagnant.variant_max_price)}</strong></span>
                                    )
                                ) : (
                                    <span>Preço normal: <strong>{formatCurrency(selectedStagnant.price)}</strong></span>
                                )}
                                {selectedStagnant.cost_price != null && selectedStagnant.cost_price > 0 && (
                                    <span className="text-brand-inactive-text">Custo: {formatCurrency(selectedStagnant.cost_price)}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* InfoCard Sugestão Inteligente */}
                    <InfoCard
                        title="Sugestão de Giro de Estoque"
                        color="blue"
                        message={`Este produto possui ${formatQuantityWithUnit(selectedStagnant.stock_quantity, selectedStagnant.unit, "short")} empacadas há ${selectedStagnant.days_stagnant} dias. Aplicar um desconto promocional atrai clientes e libera ${formatCurrency(effectiveBasePrice * selectedStagnant.stock_quantity)} em capital de giro.`}
                    />

                    {/* Atalhos Rápidos de Desconto */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-2.5">
                            Sugestões de Desconto Rápido
                        </label>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {[15, 20, 30, 50].map((pct) => {
                                const calculatedPrice = Math.round(effectiveBasePrice * (1 - pct / 100) * 100) / 100
                                const isSelected = Math.abs(promoPriceInput - calculatedPrice) < 0.05
                                return (
                                    <button
                                        key={pct}
                                        type="button"
                                        onClick={() => setPromoPriceInput(calculatedPrice)}
                                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${isSelected
                                            ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                                            : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:border-brand-primary/50"
                                            }`}
                                    >
                                        -{pct}%
                                    </button>
                                )
                            })}

                            {selectedStagnant.cost_price != null && selectedStagnant.cost_price > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setPromoPriceInput(selectedStagnant.cost_price!)}
                                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all col-span-3 sm:col-span-1 ${Math.abs(promoPriceInput - selectedStagnant.cost_price) < 0.05
                                        ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                                        : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading hover:border-brand-orange/50"
                                        }`}
                                >
                                    No Custo
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Input de Preço Promocional */}
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-brand-dark dark:text-dark-heading">
                            Preço Promocional (R$)
                        </label>
                        <MoneyInput
                            name="promo_price"
                            value={promoPriceInput}
                            onChange={(val) => setPromoPriceInput(typeof val === "number" ? val : parseFloat(val) || 0)}
                            placeholder="0,00"
                        />
                        {promoPriceInput > 0 && effectiveBasePrice > 0 && (
                            <div className="flex items-center justify-between text-xs pt-1 px-1">
                                {promoPriceInput < effectiveBasePrice ? (
                                    <span className="font-bold text-brand-green">
                                        Desconto de {Math.round(((effectiveBasePrice - promoPriceInput) / effectiveBasePrice) * 100)}%
                                        ({formatCurrency(effectiveBasePrice - promoPriceInput)} de redução)
                                    </span>
                                ) : (
                                    <span className="text-brand-inactive-text">Preço promocional igual ou superior ao original</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="h-12 flex-1"
                            onClick={() => setIsDiscountSheetOpen(false)}
                            disabled={isSavingPromo}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="h-12 flex-1"
                            onClick={handleSavePromoPrice}
                            isLoading={isSavingPromo}
                        >
                            Salvar Oferta
                        </Button>
                    </div>
                </footer>
            </div>
        )
    })() : null

    // --- RENDERIZADOR RESPONSIVO (DESKTOP SHEET VS BOTTOM SHEET) ---
    if (isMobile) {
        return (
            <>
                <BottomSheet isOpen={isOpen} onClose={onClose}>
                    {mainContent}
                </BottomSheet>
                <BottomSheet isOpen={isDiscountSheetOpen} onClose={() => setIsDiscountSheetOpen(false)}>
                    {discountContent}
                </BottomSheet>
            </>
        )
    }

    return (
        <>
            <Portal>
                <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                        }`}
                    onClick={onClose}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen
                            ? isDiscountSheetOpen
                                ? "-translate-x-10 scale-[0.97] opacity-70"
                                : "translate-x-0 opacity-100"
                            : "translate-x-[120%] opacity-100"
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {mainContent}
                    </div>
                </div>
            </Portal>

            <Portal>
                <div
                    className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-300 ${isDiscountSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"
                        }`}
                    onClick={() => setIsDiscountSheetOpen(false)}
                >
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isDiscountSheetOpen ? "translate-x-0" : "translate-x-[120%]"
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {discountContent}
                    </div>
                </div>
            </Portal>
        </>
    )
}
