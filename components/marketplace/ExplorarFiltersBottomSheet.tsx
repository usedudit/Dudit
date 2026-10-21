"use client"

import { useState, useEffect, useMemo } from "react"
import Portal from "@/components/Portal"
import { Button, Input } from "@/components/reusable"
import { Check, MapPin, Star } from "lucide-react"
import { XIcon } from "@/lib/icons"
import type { FilterConfig } from "./contextual-filters"
import {
    CONDITION_OPTIONS,
    DELIVERY_OPTIONS,
    DISTANCE_OPTIONS,
    RATING_OPTIONS,
    type DeliveryFilter,
    type ExploreFilterState,
} from "./explorar-filters"
import { motion, AnimatePresence, useMotionValue } from "framer-motion"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { useSwipeToDismiss } from "@/hooks/use-swipe-to-dismiss"

export interface AppliedFilters {
    type: string
    categories: string[]
    minPrice: string | number
    maxPrice: string | number
    promoOn: boolean
    condition?: string
    shipping?: boolean
    minRating?: number | null
    delivery?: DeliveryFilter
    maxDistanceKm?: number | null
    showcaseOnly?: boolean
    brands?: string[]
    selectedBrands?: string[]
}

interface ExplorarFiltersBottomSheetProps {
    isOpen: boolean
    onClose: () => void
    onApply: (filters: AppliedFilters) => void
    onClear: () => void
    onCitySelect: () => void
    selectedCitySlug: string | null
    formatCitySlug: (slug: string) => string
    currentType: string
    selectedCategories: string[]
    selectedCondition?: string
    minPrice: string | number
    maxPrice: string | number
    promoOn: boolean
    typeOptions: { value: string; label: string }[]
    productCategories: { name: string; icon_url: string | null }[]
    serviceCategories: { name: string; icon_url: string | null }[]
    partnerCategories: { name: string; icon_url: string | null }[]
    shipping?: boolean
    userProfile?: any
    filterConfig?: FilterConfig
    minRating?: number | null
    delivery?: DeliveryFilter
    maxDistanceKm?: number | null
    showcaseOnly?: boolean
    brands?: string[]
    selectedBrands?: string[]
    /** Tipos (do filtro "Tipo") para os quais o filtro de marca se aplica. */
    brandTypes?: string[]
}

const DEFAULT_FILTER_CONFIG: FilterConfig = {
    showType: true,
    showCategory: true,
    showPrice: true,
    showSort: true,
    showPromo: true,
    showShipping: true,
    showCondition: true,
    showRating: true,
    showBrands: false,
}

export function ExplorarFiltersBottomSheet({
    isOpen,
    onClose,
    onApply,
    onClear,
    onCitySelect,
    selectedCitySlug,
    formatCitySlug,
    currentType,
    selectedCategories,
    selectedCondition,
    minPrice,
    maxPrice,
    promoOn,
    typeOptions,
    productCategories,
    serviceCategories,
    partnerCategories,
    shipping,
    filterConfig = DEFAULT_FILTER_CONFIG,
    minRating = null,
    delivery = "",
    maxDistanceKm = null,
    showcaseOnly = false,
    brands = [],
    selectedBrands = [],
    brandTypes = [],
}: ExplorarFiltersBottomSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")

    // z-index dinâmico: abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    // Off-screen inicial da sheet mobile (sobe de baixo).
    const [initialY, setInitialY] = useState(() =>
        typeof window !== "undefined" ? window.innerHeight : 800
    )

    useEffect(() => {
        setInitialY(window.innerHeight)
    }, [])

    const y = useMotionValue(initialY)

    // Arrastar pelo handle para fechar (gesto nativo de bottom sheet).
    const swipe = useSwipeToDismiss({ y, onDismiss: onClose, armKey: isOpen })

    const [draftType, setDraftType] = useState(currentType)
    const [draftCategories, setDraftCategories] = useState<string[]>(selectedCategories)
    const [draftMinPrice, setDraftMinPrice] = useState<string | number>(minPrice)
    const [draftMaxPrice, setDraftMaxPrice] = useState<string | number>(maxPrice)
    const [draftPromo, setDraftPromo] = useState(promoOn)
    const [draftCondition, setDraftCondition] = useState(selectedCondition || "")
    const [draftShipping, setDraftShipping] = useState(shipping === true)
    const [draftMinRating, setDraftMinRating] = useState<number | null>(minRating)
    const [draftDelivery, setDraftDelivery] = useState<DeliveryFilter>(delivery)
    const [draftMaxDistance, setDraftMaxDistance] = useState<number | null>(maxDistanceKm)
    const [draftShowcaseOnly, setDraftShowcaseOnly] = useState(showcaseOnly)
    const [draftBrands, setDraftBrands] = useState<string[]>(selectedBrands)

    useEffect(() => {
        if (!isOpen) return
        setDraftType(currentType)
        setDraftCategories(selectedCategories)
        setDraftMinPrice(minPrice)
        setDraftMaxPrice(maxPrice)
        setDraftPromo(promoOn)
        setDraftCondition(selectedCondition || "")
        setDraftShipping(shipping === true)
        setDraftMinRating(minRating)
        setDraftDelivery(delivery)
        setDraftMaxDistance(maxDistanceKm)
        setDraftShowcaseOnly(showcaseOnly)
        setDraftBrands(selectedBrands)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    // Mantém o rascunho do tipo sincronizado quando ele muda por fora
    // (ex.: pelo menu lateral da vitrine do vendedor) com o painel aberto.
    useEffect(() => {
        if (!isOpen) return
        setDraftType(currentType)
    }, [currentType, isOpen])

    const hasDraftFilters = (typeOptions.length > 0 && draftType !== currentType)
        || draftCategories.length > 0
        || !!draftMinPrice
        || !!draftMaxPrice
        || draftPromo
        || !!draftCondition
        || draftShipping
        || !!draftMinRating
        || !!draftDelivery
        || !!draftMaxDistance
        || draftShowcaseOnly
        || draftBrands.length > 0

    const draftCategoryList = useMemo(() => {
        if (draftType === "servicos") return serviceCategories
        if (draftType === "vitrines" || draftType === "negocios") return partnerCategories
        if (draftType === "produtos") return productCategories
        // "Tudo": união das três listas (produtos + serviços + lojas)
        const seen = new Set<string>()
        const merged: { name: string; icon_url: string | null }[] = []
        for (const list of [productCategories, serviceCategories, partnerCategories]) {
            for (const cat of list) {
                const key = cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
                if (!key || seen.has(key)) continue
                seen.add(key)
                merged.push(cat)
            }
        }
        return merged
    }, [draftType, productCategories, serviceCategories, partnerCategories])

    const handleApply = () => {
        onApply({
            type: draftType,
            categories: draftCategories,
            minPrice: draftMinPrice,
            maxPrice: draftMaxPrice,
            promoOn: draftPromo,
            condition: draftCondition,
            shipping: draftShipping,
            minRating: draftMinRating,
            delivery: draftDelivery,
            maxDistanceKm: draftMaxDistance,
            showcaseOnly: draftShowcaseOnly,
            brands: draftBrands,
        })
        onClose()
    }

    const handleClear = () => {
        onClear()
        onClose()
    }

    const handleTypeSelect = (value: string) => {
        setDraftType(value)
        setDraftCategories([])
    }

    const handleToggleCategory = (cat: string) => {
        setDraftCategories(prev => prev.includes(cat) ? [] : [cat])
    }

    const isStoreMode = draftType === "vitrines" || draftType === "negocios"

    const optionRowClass = (selected: boolean) => `flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${selected
        ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green"
        : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
        }`

    const checkboxRowClass = (selected: boolean) => `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${selected
        ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green"
        : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
        }`

    const bodySections = (
        <>
            {/* Local Section */}
            {filterConfig.showCategory !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Local</h4>
                    <button
                        onClick={() => {
                            onCitySelect()
                            onClose()
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-2.5 text-left text-sm font-semibold text-brand-dark dark:text-dark-heading hover:border-brand-green transition-colors"
                    >
                        <span className="truncate">
                            {selectedCitySlug
                                ? formatCitySlug(selectedCitySlug)
                                : "Selecionar cidade"}
                        </span>
                        <MapPin className="h-4 w-4 shrink-0 text-brand-green" />
                    </button>
                </section>
            )}

            {/* Type Section */}
            {filterConfig.showType !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Tipo</h4>
                    <div className="space-y-2">
                        {typeOptions.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleTypeSelect(option.value)}
                                className={optionRowClass(draftType === option.value)}
                            >
                                <span>{option.label}</span>
                                {draftType === option.value && (
                                    <Check className="h-4 w-4" />
                                )}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Condition Section */}
            {filterConfig.showCondition !== false && draftType !== "servicos" && draftType !== "vitrines" && draftType !== "negocios" && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Condição</h4>
                    <div className="space-y-2">
                        {CONDITION_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setDraftCondition(option.value)}
                                className={optionRowClass(draftCondition === option.value)}
                            >
                                <span>{option.label}</span>
                                {draftCondition === option.value && (
                                    <Check className="h-4 w-4" />
                                )}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Categories Section */}
            {filterConfig.showCategory !== false && draftCategoryList.length > 0 && (
                <section>
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">Categorias</h4>
                        {draftCategories.length > 0 && (
                            <button
                                onClick={() => setDraftCategories([])}
                                className="text-xs font-semibold text-brand-green hover:underline"
                            >
                                Limpar
                            </button>
                        )}
                    </div>
                    <div className="space-y-2">
                        {draftCategoryList.map((cat) => {
                            const isSelected = draftCategories.includes(cat.name)
                            return (
                                <button
                                    key={cat.name}
                                    onClick={() => handleToggleCategory(cat.name)}
                                    className={checkboxRowClass(isSelected)}
                                >
                                    <span
                                        className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${isSelected
                                            ? "border-brand-green bg-brand-green"
                                            : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface"
                                            }`}
                                    >
                                        {isSelected && (
                                            <Check className="h-3.5 w-3.5 text-white" />
                                        )}
                                    </span>
                                    {cat.icon_url && (
                                        <img
                                            src={cat.icon_url}
                                            alt=""
                                            className="h-5 w-5 object-contain"
                                        />
                                    )}
                                    <span className="min-w-0 flex-1 truncate">
                                        {cat.name}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Brand Section */}
            {filterConfig.showBrands !== false && brands.length > 0 && (brandTypes.length === 0 || brandTypes.includes(draftType)) && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Marca</h4>
                    <div className="space-y-2">
                        {brands.map((brand) => {
                            const isSelected = draftBrands.includes(brand)
                            return (
                                <button
                                    key={brand}
                                    onClick={() => setDraftBrands(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand])}
                                    className={checkboxRowClass(isSelected)}
                                >
                                    <span
                                        className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${isSelected
                                            ? "border-brand-green bg-brand-green"
                                            : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface"
                                            }`}
                                    >
                                        {isSelected && (
                                            <Check className="h-3.5 w-3.5 text-white" />
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{brand}</span>
                                </button>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Price Section */}
            {filterConfig.showPrice !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Preço</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value={draftMinPrice}
                            onChange={(e) => setDraftMinPrice(e.target.value)}
                            inputMode="decimal"
                            placeholder="Mín."
                            className="h-10 text-sm"
                        />
                        <Input
                            value={draftMaxPrice}
                            onChange={(e) => setDraftMaxPrice(e.target.value)}
                            inputMode="decimal"
                            placeholder="Máx."
                            className="h-10 text-sm"
                        />
                    </div>
                </section>
            )}

            {/* Rating Section */}
            {filterConfig.showRating !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Avaliação</h4>
                    <div className="space-y-2">
                        {RATING_OPTIONS.map((option) => {
                            const isSelected = (draftMinRating || 0) === option.value
                            return (
                                <button
                                    key={option.value}
                                    onClick={() => setDraftMinRating(option.value > 0 ? option.value : null)}
                                    className={optionRowClass(isSelected)}
                                >
                                    <span className="flex items-center gap-2">
                                        {option.value > 0 && <Star className="h-4 w-4 text-brand-green fill-brand-green" />}
                                        {option.label}
                                    </span>
                                    {isSelected && (
                                        <Check className="h-4 w-4" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Store filters (entrega / raio / vitrine ativa) */}
            {filterConfig.showStoreFilters !== false && isStoreMode && (
                <>
                    <section>
                        <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Entrega</h4>
                        <div className="space-y-2">
                            {DELIVERY_OPTIONS.map((option) => {
                                const isSelected = draftDelivery === option.value
                                return (
                                    <button
                                        key={option.value || "todas"}
                                        onClick={() => setDraftDelivery(option.value)}
                                        className={optionRowClass(isSelected)}
                                    >
                                        <span>{option.label}</span>
                                        {isSelected && (
                                            <Check className="h-4 w-4" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    <section>
                        <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Distância</h4>
                        <div className="space-y-2">
                            {DISTANCE_OPTIONS.map((option) => {
                                const isSelected = (draftMaxDistance || 0) === option.value
                                return (
                                    <button
                                        key={option.value || "qualquer"}
                                        onClick={() => setDraftMaxDistance(option.value > 0 ? option.value : null)}
                                        className={optionRowClass(isSelected)}
                                    >
                                        <span>{option.label}</span>
                                        {isSelected && (
                                            <Check className="h-4 w-4" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    <section>
                        <button
                            onClick={() => setDraftShowcaseOnly(!draftShowcaseOnly)}
                            className={checkboxRowClass(draftShowcaseOnly)}
                        >
                            <span
                                className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${draftShowcaseOnly
                                    ? "border-brand-green bg-brand-green"
                                    : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface"
                                    }`}
                            >
                                {draftShowcaseOnly && (
                                    <Check className="h-3.5 w-3.5 text-white" />
                                )}
                            </span>
                            Vitrine online ativa
                        </button>
                    </section>
                </>
            )}

            {/* Promo Section */}
            {filterConfig.showPromo !== false && (
                <section>
                    <button
                        onClick={() => setDraftPromo(!draftPromo)}
                        className={checkboxRowClass(draftPromo)}
                    >
                        <span
                            className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${draftPromo
                                ? "border-brand-green bg-brand-green"
                                : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface"
                                }`}
                        >
                            {draftPromo && (
                                <Check className="h-3.5 w-3.5 text-white" />
                            )}
                        </span>
                        Em promoção
                    </button>
                </section>
            )}

            {/* Envio nacional Section */}
            {filterConfig.showShipping !== false && (
                <section>
                    <button
                        onClick={() => setDraftShipping(!draftShipping)}
                        className={checkboxRowClass(draftShipping)}
                    >
                        <span
                            className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${draftShipping
                                ? "border-brand-green bg-brand-green"
                                : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface"
                                }`}
                        >
                            {draftShipping && (
                                <Check className="h-3.5 w-3.5 text-white" />
                            )}
                        </span>
                        Envio nacional
                    </button>
                </section>
            )}
        </>
    )

    const footerButtons = (
        <>
            {hasDraftFilters && (
                <Button
                    onClick={handleClear}
                    variant="outline"
                    className="flex-1"
                >
                    Limpar
                </Button>
            )}
            <Button
                onClick={handleApply}
                className="flex-1"
            >
                Aplicar
            </Button>
        </>
    )

    return (
        <Portal>
            {isMobile ? (
                <AnimatePresence>
                    {isOpen && (
                        <>
                            <motion.div
                                className="fixed inset-0 z-[100] bg-black/50"
                                style={{ zIndex }}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={onClose}
                            />
                            <motion.div
                                className="fixed bottom-0 left-0 right-0 z-[101] bg-white dark:bg-dark-surface shadow-2xl flex flex-col overflow-hidden rounded-t-3xl max-h-[85vh]"
                                style={{ y, zIndex: zIndex ? zIndex + 1 : undefined }}
                                initial={{ y: initialY }}
                                animate={{ y: 0 }}
                                exit={{ y: initialY }}
                                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                                onClick={(e) => e.stopPropagation()}
                                {...swipe.layerProps}
                            >
                                <div
                                    {...swipe.handleProps}
                                    className="shrink-0 flex justify-center pt-3 pb-1 cursor-grab active:cursor-grab select-none touch-none"
                                >
                                    <div className="w-10 h-1.5 bg-gray-300 dark:bg-dark-border rounded-full" />
                                </div>
                                <header className="shrink-0 border-b border-brand-border p-6 flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Filtros</h2>
                                    <Button variant="filled" onClick={onClose} size="icon">
                                        <XIcon className="w-5 h-5" />
                                    </Button>
                                </header>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <div className="space-y-6 py-4 px-6">
                                        {bodySections}
                                    </div>
                                </div>
                                <footer className="shrink-0 border-t border-brand-border bg-white dark:bg-dark-surface p-4">
                                    <div className="flex items-center gap-4">
                                        {footerButtons}
                                    </div>
                                </footer>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            ) : (
                <>
                    <div
                        className={`fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        style={{ zIndex }}
                        onClick={onClose}
                    />
                    <div
                        className={`fixed right-4 top-4 bottom-4 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-dark-surface shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden flex flex-col z-[101] ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                        style={{ zIndex }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="border-b border-brand-border p-6 flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Filtros</h2>
                            <Button variant="filled" onClick={onClose} size="icon">
                                <XIcon className="w-5 h-5" />
                            </Button>
                        </header>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <div className="space-y-6 py-4 px-6">
                                {bodySections}
                            </div>
                        </div>

                        <footer className="shrink-0 border-t border-brand-border bg-white dark:bg-dark-surface p-4">
                            <div className="flex items-center gap-4">
                                {footerButtons}
                            </div>
                        </footer>
                    </div>
                </>
            )}
        </Portal>
    )
}
