"use client"

import { useState, useMemo } from "react"
import { Button, Checkbox, Input } from "@/components/reusable"
import { Check, MapPin, X } from "lucide-react"
import { Separator } from "@/components/reusable/Separator"

interface ExplorarFilterSidebarProps {
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
}

export function ExplorarFilterSidebar({
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
}: ExplorarFilterSidebarProps) {
    return (
        <aside className="hidden lg:block lg:w-[280px] lg:shrink-0 border-r border-gray-100">
            <div className="sticky top-[128px] space-y-6 py-5 px-5 max-h-[calc(100vh-140px)] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-0">
                    <h2 className="text-base font-bold text-brand-dark">Filtros</h2>
                    {activeFiltersCount > 0 && (
                        <button
                            onClick={onClearFilters}
                            className="text-xs font-bold text-brand-green hover:underline"
                        >
                            Limpar
                        </button>
                    )}
                </div>

                {/* Separator */}
                <Separator className="my-0" />

                {/* Local Section */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Local</h3>
                    <button
                        onClick={onCitySelect}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm font-semibold text-brand-dark hover:border-brand-green transition-colors"
                    >
                        <span className="truncate">
                            {selectedCitySlug ? formatCitySlug(selectedCitySlug) : "Selecionar cidade"}
                        </span>
                        <MapPin className="h-4 w-4 shrink-0 text-brand-green" />
                    </button>
                </section>

                {/* Type Section */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Tipo</h3>
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

                {/* Categories Section */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Categorias</h3>
                    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
                                        className={`flex h-4 w-4 items-center justify-center rounded border ${isSelected
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
                                            className="h-6 w-6 object-contain"
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

                {/* Price Section */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Preço</h3>
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

                {/* Sort Section */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Ordenar</h3>
                    <select
                        value={sortBy}
                        onChange={(e) => onSortChange(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-brand-dark outline-none focus:border-brand-green"
                    >
                        {sortOptions.map((option) => (
                            <option
                                key={option.value}
                                value={option.value}
                            >
                                {option.label}
                            </option>
                        ))}
                    </select>
                </section>

                {/* Promo Section */}
                <section>
                    <button
                        onClick={onPromoToggle}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${promoOn
                                ? "bg-[#ecfdf5] text-brand-green"
                                : "text-brand-dark hover:bg-gray-50"
                            }`}
                    >
                        <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${promoOn
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
            </div>
        </aside>
    )
}
