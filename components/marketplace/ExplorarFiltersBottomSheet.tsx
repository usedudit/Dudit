"use client"

import { useState, useEffect, useMemo } from "react"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { Button, Input, FormDropdown } from "@/components/reusable"
import { Check, MapPin } from "lucide-react"
import { Separator } from "@/components/reusable/Separator"
import { useMediaQuery } from "@/components/erp/hooks"
import { XIcon } from "@/lib/icons"
import type { FilterConfig } from "./contextual-filters"

const RADIUS_OPTIONS = [
    { value: "", label: "Toda a cidade (sem limite)" },
    { value: "5", label: "Até 5 km" },
    { value: "10", label: "Até 10 km" },
    { value: "25", label: "Até 25 km" },
    { value: "50", label: "Até 50 km" },
    { value: "100", label: "Até 100 km" },
]

export interface AppliedFilters {
    type: string
    categories: string[]
    minPrice: string | number
    maxPrice: string | number
    promoOn: boolean
    radius: number | null
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
    selectedRadius?: number | null
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
    selectedRadius,
    minPrice,
    maxPrice,
    promoOn,
    typeOptions,
    productCategories,
    serviceCategories,
    partnerCategories,
    userProfile,
    filterConfig = { showType: true, showCategory: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
}: ExplorarFiltersBottomSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")

    const [draftType, setDraftType] = useState(currentType)
    const [draftCategories, setDraftCategories] = useState<string[]>(selectedCategories)
    const [draftMinPrice, setDraftMinPrice] = useState<string | number>(minPrice)
    const [draftMaxPrice, setDraftMaxPrice] = useState<string | number>(maxPrice)
    const [draftPromo, setDraftPromo] = useState(promoOn)
    const [draftRadius, setDraftRadius] = useState<number | null>(selectedRadius ?? null)

    useEffect(() => {
        if (!isOpen) return
        setDraftType(currentType)
        setDraftCategories(selectedCategories)
        setDraftMinPrice(minPrice)
        setDraftMaxPrice(maxPrice)
        setDraftPromo(promoOn)
        setDraftRadius(selectedRadius ?? null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const hasDraftFilters = (typeOptions.length > 0 && draftType !== "tudo")
        || draftCategories.length > 0
        || !!draftMinPrice
        || !!draftMaxPrice
        || draftPromo
        || !!draftRadius

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
            radius: draftRadius,
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

    const headerRow = (
        <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-brand-dark">Filtros</h3>
            {hasDraftFilters && (
                <button
                    onClick={handleClear}
                    className="text-xs font-bold text-brand-green hover:underline"
                >
                    Limpar Tudo
                </button>
            )}
        </div>
    )

    const bodySections = (
        <>
            {/* Local Section */}
            {filterConfig.showRadius !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark">Local</h4>
                    <button
                        onClick={() => {
                            onCitySelect()
                            onClose()
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-semibold text-brand-dark hover:border-brand-green transition-colors"
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

            {/* Raio de busca */}
            {filterConfig.showRadius !== false && ((selectedCitySlug && selectedCitySlug !== "brasil" && !selectedCitySlug.startsWith("estado-")) || !!userProfile) && (
                <section>
                    <FormDropdown
                        label="Raio de busca"
                        value={String(draftRadius || "")}
                        setValue={(v) => setDraftRadius(v ? Number(v) : null)}
                        options={RADIUS_OPTIONS}
                    />
                </section>
            )}

            {/* Type Section */}
            {filterConfig.showType !== false && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark">Tipo</h4>
                    <div className="space-y-2">
                        {typeOptions.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleTypeSelect(option.value)}
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${draftType === option.value
                                    ? "bg-[#ecfdf5] text-brand-green"
                                    : "text-brand-dark hover:bg-gray-50"
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

            {/* Categories Section */}
            {filterConfig.showCategory !== false && draftCategoryList.length > 0 && (
                <section>
                    <h4 className="mb-3 text-sm font-bold text-brand-dark">Categorias</h4>
                    <div className="space-y-2">
                        {draftCategoryList.map((cat) => {
                            const isSelected = draftCategories.includes(cat.name)
                            return (
                                <button
                                    key={cat.name}
                                    onClick={() => handleToggleCategory(cat.name)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                                        ? "bg-[#ecfdf5] text-brand-green"
                                        : "text-brand-dark hover:bg-gray-50"
                                        }`}
                                >
                                    <span
                                        className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${isSelected
                                            ? "border-brand-green bg-brand-green"
                                            : "border-gray-200 bg-white"
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
                    <h4 className="mb-3 text-sm font-bold text-brand-dark">Preço</h4>
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
                            ? "bg-[#ecfdf5] text-brand-green"
                            : "text-brand-dark hover:bg-gray-50"
                            }`}
                    >
                        <span
                            className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${draftPromo
                                ? "border-brand-green bg-brand-green"
                                : "border-gray-200 bg-white"
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

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose} title="Filtros">
                <div className="space-y-6 py-4 px-4">
                    {headerRow}

                    <Separator />

                    {bodySections}

                    <div className="flex gap-3 pt-4">
                        {footerButtons}
                    </div>
                </div>
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-[100] bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 max-w-[calc(100vw-2rem)] bg-white shadow-2xl rounded-2xl transition-transform duration-300 overflow-hidden flex flex-col ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className="border-b border-brand-border p-6 flex justify-between items-center shrink-0">
                        <h2 className="text-xl font-bold text-brand-dark">Filtros</h2>
                        <Button variant="filled" onClick={onClose} size="icon">
                            <XIcon className="w-5 h-5" />
                        </Button>
                    </header>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <div className="space-y-6 py-4 px-6">
                            {bodySections}
                        </div>
                    </div>

                    <footer className="shrink-0 border-t border-brand-border bg-white p-4">
                        <div className="flex items-center gap-4">
                            {footerButtons}
                        </div>
                    </footer>
                </div>
            </div>
        </Portal>
    )
}
