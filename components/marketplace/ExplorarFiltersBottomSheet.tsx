"use client"

import { useState, useEffect } from "react"
import BottomSheet from "@/components/BottomSheet"
import { Button, Checkbox, Input, FormDropdown } from "@/components/reusable"
import { Check, MapPin } from "lucide-react"
import { Separator } from "@/components/reusable/Separator"
import type { FilterConfig, PageMode } from "./contextual-filters"

const RADIUS_OPTIONS = [
    { value: "", label: "Toda a cidade (sem limite)" },
    { value: "5", label: "Até 5 km" },
    { value: "10", label: "Até 10 km" },
    { value: "25", label: "Até 25 km" },
    { value: "50", label: "Até 50 km" },
    { value: "100", label: "Até 100 km" },
]

interface ExplorarFiltersBottomSheetProps {
    isOpen: boolean
    onClose: () => void
    selectedCitySlug: string | null
    formatCitySlug: (slug: string) => string
    onCitySelect: () => void
    currentType: string
    typeOptions: { value: string; label: string }[]
    onTypeChange: (type: string) => void
    activeCategoriesList: { name: string; icon_url: string | null }[]
    selectedCategories: string[]
    onToggleCategory: (cat: string) => void
    minPrice: string | number
    onMinPriceChange: (val: string) => void
    maxPrice: string | number
    onMaxPriceChange: (val: string) => void
    sortBy: string
    sortOptions: { value: string; label: string }[]
    onSortChange: (val: string) => void
    promoOn: boolean
    onPromoToggle: () => void
    activeFiltersCount: number
    onClearFilters: () => void
    selectedRadius?: number | null
    onRadiusChange?: (radius: number | null) => void
    userProfile?: any
    filterConfig?: FilterConfig
    pageMode?: PageMode
}

export function ExplorarFiltersBottomSheet({
    isOpen,
    onClose,
    selectedCitySlug,
    formatCitySlug,
    onCitySelect,
    currentType,
    typeOptions,
    onTypeChange,
    activeCategoriesList,
    selectedCategories,
    onToggleCategory,
    minPrice,
    onMinPriceChange,
    maxPrice,
    onMaxPriceChange,
    sortBy,
    sortOptions,
    onSortChange,
    promoOn,
    onPromoToggle,
    activeFiltersCount,
    onClearFilters,
    selectedRadius,
    onRadiusChange,
    userProfile,
    filterConfig = { showType: true, showCategory: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    pageMode,
}: ExplorarFiltersBottomSheetProps) {
    return (
        <BottomSheet isOpen={isOpen} onClose={onClose} title="Filtros">
            <div className="space-y-6 py-4 px-4">
                {/* Header with clear button */}
                <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-brand-dark">Filtros</h3>
                    {activeFiltersCount > 0 && (
                        <button
                            onClick={onClearFilters}
                            className="text-xs font-bold text-brand-green hover:underline"
                        >
                            Limpar Tudo
                        </button>
                    )}
                </div>

                <Separator />

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
                {filterConfig.showRadius !== false && ((selectedCitySlug && selectedCitySlug !== "brasil" && !selectedCitySlug.startsWith("estado-")) || !!userProfile) && onRadiusChange && (
                    <section>
                        <FormDropdown
                            label="Raio de busca"
                            value={String(selectedRadius || "")}
                            setValue={(v) => onRadiusChange(v ? Number(v) : null)}
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
                                    onClick={() => onTypeChange(option.value)}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${currentType === option.value
                                        ? "bg-[#ecfdf5] text-brand-green"
                                        : "text-brand-dark hover:bg-gray-50"
                                        }`}
                                >
                                    <span>{option.label}</span>
                                    {currentType === option.value && (
                                        <Check className="h-4 w-4" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Categories Section */}
                {filterConfig.showCategory !== false && activeCategoriesList.length > 0 && (
                    <section>
                        <h4 className="mb-3 text-sm font-bold text-brand-dark">
                            {pageMode === "category" ? "Subcategorias" : "Categorias"}
                        </h4>
                        <div className="space-y-2">
                            {activeCategoriesList.map((cat) => {
                                const isSelected = selectedCategories.includes(cat.name)
                                return (
                                    <button
                                        key={cat.name}
                                        onClick={() => onToggleCategory(cat.name)}
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
                                value={minPrice}
                                onChange={(e) => onMinPriceChange(e.target.value)}
                                inputMode="decimal"
                                placeholder="Min."
                                className="h-10 text-sm"
                            />
                            <Input
                                value={maxPrice}
                                onChange={(e) => onMaxPriceChange(e.target.value)}
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
                            onClick={onPromoToggle}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${promoOn
                                ? "bg-[#ecfdf5] text-brand-green"
                                : "text-brand-dark hover:bg-gray-50"
                                }`}
                        >
                            <span
                                className={`flex h-4 w-4 items-center justify-center rounded border shrink-0 ${promoOn
                                    ? "border-brand-green bg-brand-green"
                                    : "border-gray-200 bg-white"
                                    }`}
                            >
                                {promoOn && (
                                    <Check className="h-3.5 w-3.5 text-white" />
                                )}
                            </span>
                            Em promoção
                        </button>
                    </section>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                    {activeFiltersCount > 0 && (
                        <Button
                            onClick={() => {
                                onClearFilters()
                                onClose()
                            }}
                            variant="outline"
                            className="flex-1"
                        >
                            Limpar
                        </Button>
                    )}
                    <Button
                        onClick={onClose}
                        className="flex-1"
                    >
                        Aplicar
                    </Button>
                </div>
            </div>
        </BottomSheet>
    )
}
