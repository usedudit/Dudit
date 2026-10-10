"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Package, ShoppingCartIcon, AlertTriangleIcon, XIcon, ClockIcon, ArrowLeftIcon, SparklesIcon, TagIcon, SearchIcon, CheckCircleIcon, TrendingUpIcon } from "@/lib/icons"
import { Button, MoneyInput, IconPlaceholder, Spinner, Badge, InfoCard, Tabs, TabsList, TabsTrigger, ThreeDotsLoader, Input, FormDropdown } from "@/components/reusable"
import AlertModal from "@/components/reusable/AlertModal"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import {
    getReplenishmentSuggestionsAction,
    getStagnantProductsAction,
    updateProductPromotionalPriceAction,
    getPricingAlertsAction,
    updateProductSalePriceAction,
    type PricingAlert,
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

    const [activeTab, setActiveTab] = useState<"reposicao" | "parados" | "precificacao">("reposicao")

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

    // Pricing alerts (cost vs sale price / thin margins)
    const [pricingAlerts, setPricingAlerts] = useState<PricingAlert[]>([])
    const [pricingMeta, setPricingMeta] = useState<{
        counts: { loss: number; thin: number }
        thresholdPercent: number
        defaultMarginPercent: number
    } | null>(null)
    const [loadingPricing, setLoadingPricing] = useState(false)
    const [applyTarget, setApplyTarget] = useState<PricingAlert | null>(null)
    const [isApplying, setIsApplying] = useState(false)

    // Second Sheet (Promotional Price for Stagnant Product)
    const [selectedStagnant, setSelectedStagnant] = useState<StagnantProduct | null>(null)
    const [isDiscountSheetOpen, setIsDiscountSheetOpen] = useState(false)
    const [promoPriceInput, setPromoPriceInput] = useState<number>(0)
    const [isSavingPromo, setIsSavingPromo] = useState(false)

    // z-index dinâmico: cada sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)
    const discountZIndex = useModalLayer(isDiscountSheetOpen)

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

    const fetchPricing = useCallback(() => {
        setLoadingPricing(true)
        getPricingAlertsAction(partnerId, storeId).then((res) => {
            if ("alerts" in res && res.alerts) {
                setPricingAlerts(res.alerts)
                setPricingMeta({
                    counts: res.counts,
                    thresholdPercent: res.thresholdPercent,
                    defaultMarginPercent: res.defaultMarginPercent,
                })
            } else if ("error" in res && res.error) {
                notifyError(res.error)
            }
            setLoadingPricing(false)
        })
    }, [partnerId, storeId])

    const refetchStagnant = useCallback(() => {
        fetchStagnant()
    }, [fetchStagnant])

    useEffect(() => {
        if (!isOpen) {
            setSuggestions([])
            setStagnantProducts([])
            setPricingAlerts([])
            setPricingMeta(null)
            setSearchQuery("")
            setIsDiscountSheetOpen(false)
            setSelectedStagnant(null)
            setApplyTarget(null)
            return
        }
        fetchSuggestions()
        fetchStagnant()
        fetchPricing()
    }, [isOpen, fetchSuggestions, fetchStagnant, fetchPricing])

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

    const handleApplyPricing = async () => {
        if (!applyTarget) return
        const target = applyTarget
        const removePromo = target.cause === "promo"
        setIsApplying(true)

        const res = removePromo
            ? await updateProductSalePriceAction({ productId: target.id, partnerId, clearPromotion: true })
            : await updateProductSalePriceAction({ productId: target.id, partnerId, price: target.suggested_price })

        setIsApplying(false)
        setApplyTarget(null)

        if (res.error) {
            notifyError(res.error)
            return
        }

        notifySuccess(removePromo ? "Promoção removida!" : "Preço atualizado com sucesso!")
        fetchPricing()
        router.refresh()
    }

    // --- CONTEÚDO DA ABA PRECIFICAÇÃO ---
    const pricingContent = loadingPricing ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : pricingAlerts.length === 0 ? (
        <div className="py-12">
            <IconPlaceholder
                icon={CheckCircleIcon}
                title="Preços em dia!"
                subtitle="Nenhum produto está sendo vendido abaixo do custo ou com margem apertada."
            />
        </div>
    ) : (
        <div className="space-y-3">
            {pricingMeta && (
                <InfoCard
                    title="Saúde dos Preços"
                    color={pricingMeta.counts.loss > 0 ? "red" : "orange"}
                    message={`${pricingMeta.counts.loss} produto(s) abaixo do custo e ${pricingMeta.counts.thin} com margem apertada (limite de ${pricingMeta.thresholdPercent}% — metade da sua margem padrão de ${pricingMeta.defaultMarginPercent}%). Comece pelos de maior impacto.`}
                />
            )}
            {pricingAlerts.map((a) => {
                const isLoss = a.status === "loss"
                const canApplyDirectly = !a.has_variants && a.suggested_price > 0
                const isPromoFix = a.cause === "promo"
                return (
                    <div
                        key={a.id}
                        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-green transition-all cursor-pointer"
                        onClick={() => {
                            onClose()
                            router.push(`/erp/produtos?view=${a.id}`)
                        }}
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                <img src={getPrimaryProductDisplayImage(a)} alt={a.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {a.name}
                                </p>
                                <p className="text-xs text-brand-inactive-text mt-0.5">
                                    {a.sku || a.gtin || "Sem SKU"}
                                </p>
                            </div>
                            <Badge variant={isLoss ? "red" : "orange"}>
                                {isLoss ? "Abaixo do custo" : "Margem apertada"}
                            </Badge>
                        </div>

                        {isPromoFix && (
                            <p className="mt-2 text-xs font-semibold text-brand-orange">
                                O preço promocional está abaixo do custo
                            </p>
                        )}

                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs pt-2.5 border-t border-brand-border/60 dark:border-dark-border/60">
                            <div>
                                <span className="text-brand-inactive-text block">Custo</span>
                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(a.cost_price)}
                                </span>
                            </div>
                            <div>
                                <span className="text-brand-inactive-text block">Preço atual</span>
                                <span className={`font-bold ${isLoss ? "text-brand-red line-through" : "text-brand-dark dark:text-dark-heading"}`}>
                                    {formatCurrency(a.effective_price)}
                                </span>
                            </div>
                            <div>
                                <span className="text-brand-inactive-text block">Margem</span>
                                <span className={`font-bold ${isLoss ? "text-brand-red" : "text-brand-orange"}`}>
                                    {a.margin_percent !== null ? `${a.margin_percent}%` : "—"}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                            <div className="text-xs text-brand-inactive-text min-w-0">
                                {isLoss ? (
                                    <>
                                        Perde <span className="font-bold text-brand-red">{formatCurrency(a.loss_per_unit)}</span>/un
                                        {a.stock_quantity > 0 && (
                                            <> · <span className="font-bold text-brand-red">{formatCurrency(a.impact)}</span> em estoque</>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        Potencial:{" "}
                                        <span className="font-bold text-brand-green">
                                            {a.stock_quantity > 0
                                                ? `+${formatCurrency(a.impact)}`
                                                : `+${formatCurrency(a.potential_gain_per_unit)}/un`}
                                        </span>
                                        {a.stock_quantity > 0 && " em estoque"}
                                    </>
                                )}
                            </div>
                            {canApplyDirectly ? (
                                <Button
                                    size="sm"
                                    variant={isPromoFix ? "outlineorange" : "outline"}
                                    className="h-8 text-xs gap-1.5 shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setApplyTarget(a)
                                    }}
                                >
                                    <TrendingUpIcon size={14} className="text-brand-primary" />
                                    {isPromoFix ? "Remover promoção" : `Aplicar ${formatCurrency(a.suggested_price)}`}
                                </Button>
                            ) : (
                                <span className="text-xs text-brand-inactive-text shrink-0">Revisar variantes</span>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )

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
                        <TabsTrigger value="precificacao" className="px-0 pb-3 text-sm">
                            Precificação ({pricingAlerts.length})
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
                                        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                            <img src={getPrimaryProductDisplayImage(s)} alt={s.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                {s.name}
                                            </p>
                                            <p className="text-xs text-brand-inactive-text mt-0.5">
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
                ) : activeTab === "parados" ? (
                    loadingStagnant ? (
                        <div className="flex items-center justify-center py-16">
                            <ThreeDotsLoader />
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
                                                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-green transition-all cursor-pointer"
                                                onClick={() => openDiscountSheet(p)}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
                                                        <img src={getPrimaryProductDisplayImage(p)} alt={p.name} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                                                {p.name}
                                                            </p>
                                                        </div>
                                                        <p className="text-xs text-brand-inactive-text mt-0.5">
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
                ) : (
                    pricingContent
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
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-white dark:bg-dark-surface shrink-0 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border">
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
                        <label className="block text-sm font-medium text-brand-inactive-text mb-2.5">
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
                                        className={`py-2 px-2 rounded-full text-xs font-bold border transition-all ${isSelected
                                            ? "border-brand-green text-brand-green"
                                            : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading"
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
                                        ? "border-brand-orange text-brand-orange"
                                        : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading"
                                        }`}
                                >
                                    No Custo
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Input de Preço Promocional */}
                    <div className="space-y-2">
                        <MoneyInput
                            label="Preço Promocional (R$)"
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

    // --- MODAL DE CONFIRMAÇÃO (APLICAR PREÇO / REMOVER PROMOÇÃO) ---
    const applyConfirmModal = applyTarget ? (
        <AlertModal
            isOpen
            onClose={() => {
                if (!isApplying) setApplyTarget(null)
            }}
            onConfirm={handleApplyPricing}
            variant={applyTarget.cause === "promo" ? "warning" : "info"}
            title={applyTarget.cause === "promo" ? "Remover promoção?" : "Aplicar preço sugerido?"}
            confirmText={applyTarget.cause === "promo" ? "Remover" : "Aplicar"}
            isLoading={isApplying}
            disabled={isApplying}
            message={
                <div className="space-y-1.5 text-left">
                    <p className="font-bold text-brand-dark dark:text-dark-heading">{applyTarget.name}</p>
                    {applyTarget.cause === "promo" ? (
                        <>
                            <p>
                                Promoção atual: <strong>{formatCurrency(applyTarget.effective_price)}</strong> · Custo:{" "}
                                <strong>{formatCurrency(applyTarget.cost_price)}</strong>
                            </p>
                            <p>
                                Remover a promoção volta o preço para{" "}
                                <strong>{formatCurrency(applyTarget.base_price)}</strong>.
                            </p>
                        </>
                    ) : (
                        <>
                            <p>
                                Preço atual: <strong>{formatCurrency(applyTarget.effective_price)}</strong> · Custo:{" "}
                                <strong>{formatCurrency(applyTarget.cost_price)}</strong>
                            </p>
                            <p>
                                Novo preço: <strong>{formatCurrency(applyTarget.suggested_price)}</strong>
                                {pricingMeta && ` (margem padrão de ${pricingMeta.defaultMarginPercent}%)`}
                            </p>
                        </>
                    )}
                </div>
            }
        />
    ) : null

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
                {applyConfirmModal}
            </>
        )
    }

    return (
        <>
            <Portal>
                <div
                    className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                        }`}
                    style={{ zIndex }}
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
                    style={{ zIndex: discountZIndex }}
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

            {applyConfirmModal}
        </>
    )
}
