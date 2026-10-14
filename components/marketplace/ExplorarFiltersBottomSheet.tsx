"use client"

import { useState, useEffect, useMemo } from "react"
import Portal from "@/components/Portal"
import { Button, Input } from "@/components/reusable"
import { Check, MapPin } from "lucide-react"
import { XIcon } from "@/lib/icons"
import type { FilterConfig } from "./contextual-filters"
import { motion, AnimatePresence, useMotionValue } from "framer-motion"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { useSwipeToDismiss } from "@/hooks/use-swipe-to-dismiss"

const CONDITION_FILTER_OPTIONS = [
    { value: "", label: "Todos os estados" },
    { value: "novo", label: "Apenas Novos" },
    { value: "usado", label: "Usados / Desapegos" },
]

export interface AppliedFilters {
    type: string
    categories: string[]
    minPrice: string | number
    maxPrice: string | number
    promoOn: boolean
    condition?: string
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
    userProfile?: any
    filterConfig?: FilterConfig
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
    filterConfig = { showType: true, showCategory: true, showPrice: true, showSort: true, showPromo: true },
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

    useEffect(() => {
        if (!isOpen) return
        setDraftType(currentType)
        setDraftCategories(selectedCategories)
        setDraftMinPrice(minPrice)
        setDraftMaxPrice(maxPrice)
        setDraftPromo(promoOn)
        setDraftCondition(selectedCondition || "")
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const hasDraftFilters = (typeOptions.length > 0 && draftType !== "tudo")
        || draftCategories.length > 0
        || !!draftMinPrice
        || !!draftMaxPrice
        || draftPromo
        || !!draftCondition

    const draftCategoryList = useMemo(() => {
        if (draftType === "servicos") return serviceCategories
        if (draftType === "vitrines" || draftType === "negocios") return partnerCategories
        return productCategories
    }, [draftType, productCategories, serviceCategories, partnerCategories])

    const handleApply = () => {
        onApply({
            type: draftType,
            categories: draftCategories,
            minPrice: draftMinPrice,
            maxPrice: draftMaxPrice,
            promoOn: draftPromo,
            condition: draftCondition,
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
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${draftType === option.value
                                    ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green"
                                    : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
                                    }`}
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
            {draftType !== "servicos" && draftType !== "vitrines" && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Condição</h4>
                    <div className="space-y-2">
                        {CONDITION_FILTER_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => setDraftCondition(option.value)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${draftCondition === option.value
                                    ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green"
                                    : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
                                    }`}
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
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Categorias</h4>
                    <div className="space-y-2">
                        {draftCategoryList.map((cat) => {
                            const isSelected = draftCategories.includes(cat.name)
                            return (
                                <button
                                    key={cat.name}
                                    onClick={() => handleToggleCategory(cat.name)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                                        ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green"
                                        : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
                                        }`}
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

            {/* Price Section */}
            {filterConfig.showPrice !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Preço</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value={draftMinPrice}
                            onChange={(e) => setDraftMinPrice(e.target.value)}
                            inputMode="decimal"
                            placeholder="Min."
                            className="h-10 text-sm"
                        />
                        <Input
                            value={draftMaxPrice}
                            onChange={(e) => setDraftMaxPrice(e.target.value)}
                            inputMode="decimal"
                            placeholder="Max."
                            className="h-10 text-sm"
                        />
                    </div>
                </section>
            )}

            {/* Promo Section */}
            {filterConfig.showPromo !== false && (
                <section>
                    <button
                        onClick={() => setDraftPromo(!draftPromo)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${draftPromo
                            ? "bg-[#ecfdf5] dark:bg-brand-dark/10 text-brand-green"
                            : "text-brand-dark dark:text-dark-heading hover:bg-gray-50 dark:hover:bg-dark-border/30"
                            }`}
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
