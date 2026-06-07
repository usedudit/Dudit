"use client"

import { Button, Checkbox, Input } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
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

                {/* Type Section - Using Dropdown */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Tipo</h3>
                    <Dropdown trigger={
                        <button className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-brand-dark hover:border-brand-green transition-colors text-left">
                            <span>{typeOptions.find(o => o.value === currentType)?.label || "Selecionar"}</span>
                            <span className="text-gray-400">▼</span>
                        </button>
                    }>
                        {typeOptions.map((option) => (
                            <DropdownItem
                                key={option.value}
                                onClick={() => onTypeChange(option.value)}
                                className={currentType === option.value ? "bg-[#ecfdf5] text-brand-green" : ""}
                            >
                                {option.label}
                            </DropdownItem>
                        ))}
                    </Dropdown>
                </section>

                {/* Categories Section - Using Checkbox */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Categorias</h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-hidden">
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
                        <Input
                            value={minPrice}
                            onChange={(e) => onMinPriceChange(e.target.value)}
                            inputMode="decimal"
                            placeholder="Mín."
                            className="h-10 text-sm"
                        />
                        <Input
                            value={maxPrice}
                            onChange={(e) => onMaxPriceChange(e.target.value)}
                            inputMode="decimal"
                            placeholder="Máx."
                            className="h-10 text-sm"
                        />
                    </div>
                </section>

                {/* Sort Section - Using Dropdown */}
                <section>
                    <h3 className="mb-3 text-sm font-bold text-brand-dark">Ordenar</h3>
                    <Dropdown trigger={
                        <button className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-brand-dark hover:border-brand-green transition-colors text-left">
                            <span>{sortOptions.find(o => o.value === sortBy)?.label || "Selecionar"}</span>
                            <span className="text-gray-400">▼</span>
                        </button>
                    }>
                        {sortOptions.map((option) => (
                            <DropdownItem
                                key={option.value}
                                onClick={() => onSortChange(option.value)}
                                className={sortBy === option.value ? "bg-[#ecfdf5] text-brand-green" : ""}
                            >
                                {option.label}
                            </DropdownItem>
                        ))}
                    </Dropdown>
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
