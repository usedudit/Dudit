"use client"

import { Button, Checkbox, FormDropdown, Input, MoneyInput } from "@/components/reusable"
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
    selectedRadius?: number | null
    onRadiusChange?: (radius: number | null) => void
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
    selectedRadius,
    onRadiusChange,
}: ExplorarFilterSidebarProps) {
    return (
        <aside className="hidden lg:block lg:w-[280px] lg:shrink-0 border-r border-gray-100">
            <div className="sticky top-[128px] space-y-6 py-5 px-5 max-h-[calc(100vh-140px)] overflow-y-hidden">
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

                {/* Raio de busca */}
                {selectedCitySlug && selectedCitySlug !== "brasil" && !selectedCitySlug.startsWith("estado-") && onRadiusChange && (
                    <section>
                        <h3 className="mb-3 text-sm font-bold text-brand-dark">Raio de busca</h3>
                        <select
                            value={selectedRadius || ""}
                            onChange={(e) => onRadiusChange(e.target.value ? Number(e.target.value) : null)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-brand-dark hover:border-brand-green focus:border-brand-green focus:outline-none transition-colors bg-white cursor-pointer"
                        >
                            <option value="">Toda a cidade (sem limite)</option>
                            <option value="5">Até 5 km</option>
                            <option value="10">Até 10 km</option>
                            <option value="25">Até 25 km</option>
                            <option value="50">Até 50 km</option>
                            <option value="100">Até 100 km</option>
                        </select>
                    </section>
                )}


                {/* Type Section - Using FormDropdown */}
                <section>
                    <FormDropdown
                        label="Tipo"
                        value={currentType}
                        setValue={onTypeChange}
                        options={typeOptions.map(o => ({ value: o.value, label: o.label }))}
                    />
                </section>

                {/* Categories Section - Using Checkbox */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Categorias</h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>

                        {activeCategoriesList.map((cat) => {
                            const isSelected = selectedCategories.includes(cat.name)
                            return (
                                <label
                                    key={cat.name}
                                    className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    <Checkbox
                                        checked={isSelected}
                                        onChange={() => onToggleCategory(cat.name)}
                                    />
                                    {cat.icon_url && (
                                        <img
                                            src={cat.icon_url}
                                            alt=""
                                            className="h-5 w-5 object-contain"
                                        />
                                    )}
                                    <span className="text-sm font-medium text-brand-dark truncate">
                                        {cat.name}
                                    </span>
                                </label>
                            )
                        })}
                    </div>
                </section>

                {/* Price Section */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Preço</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <MoneyInput
                            value={minPrice}
                            onChange={(v) => onMinPriceChange(String(v))}
                            placeholder="Mín."
                            className="h-10"
                        />
                        <MoneyInput
                            value={maxPrice}
                            onChange={(v) => onMaxPriceChange(String(v))}
                            placeholder="Máx."
                            className="h-10"
                        />
                    </div>
                </section>

                {/* Sort Section - Using FormDropdown */}
                <section>
                    <FormDropdown
                        label="Ordenar"
                        value={sortBy}
                        setValue={onSortChange}
                        options={sortOptions.map(o => ({ value: o.value, label: o.label }))}
                    />
                </section>

                {/* Promo Section - Using Checkbox */}
                <section>
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <Checkbox
                            checked={promoOn}
                            onChange={onPromoToggle}
                        />
                        <span className="text-sm font-medium text-brand-dark">Em promoção</span>
                    </label>
                </section>
            </div>
        </aside>
    )
}
