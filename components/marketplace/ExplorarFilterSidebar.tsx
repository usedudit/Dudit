"use client"

import { Button, Checkbox, FormDropdown, Input, MoneyInput } from "@/components/reusable"
import { Check, MapPin, X } from "lucide-react"
import { Separator } from "@/components/reusable/Separator"
import type { FilterConfig, PageMode } from "./contextual-filters"

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
    userProfile?: any
    filterConfig?: FilterConfig
    pageMode?: PageMode
    sectionId?: string | null
    collapsed?: boolean
}

const RADIUS_OPTIONS = [
    { value: "", label: "Toda a cidade (sem limite)" },
    { value: "5", label: "Até 5 km" },
    { value: "10", label: "Até 10 km" },
    { value: "25", label: "Até 25 km" },
    { value: "50", label: "Até 50 km" },
    { value: "100", label: "Até 100 km" },
]

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
    userProfile,
    filterConfig = { showType: true, showCategory: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    pageMode,
    sectionId,
    collapsed = false,
}: ExplorarFilterSidebarProps) {
    return (
        <aside
            className="hidden lg:block lg:shrink-0 transition-all duration-300 ease-in-out"
            style={{
                width: collapsed ? 0 : 280,
                overflow: collapsed ? 'hidden' : 'visible',
                borderRightWidth: collapsed ? 0 : 1,
            }}
        >
            <div className="w-[280px]">
                <div className="sticky top-[128px] space-y-6 py-5 px-5 max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-0">
                    <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">Filtros</h2>
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
                {filterConfig.showRadius !== false && (
                    <section>
                        <h3 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Local</h3>
                        <button
                            onClick={onCitySelect}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-2.5 text-left text-sm font-semibold text-brand-dark dark:text-dark-heading hover:border-brand-green transition-colors"
                        >
                            <span className="truncate">
                                {selectedCitySlug ? formatCitySlug(selectedCitySlug) : "Selecionar cidade"}
                            </span>
                            <MapPin className="h-4 w-4 shrink-0 text-brand-green" />
                        </button>
                    </section>
                )}

                {/* Raio de busca */}
                {filterConfig.showRadius !== false && ((selectedCitySlug && selectedCitySlug !== "brasil" && !selectedCitySlug.startsWith("estado-")) || !!userProfile) && onRadiusChange && (
                    <section>
                        <Separator className="my-6" />
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
                        <Separator className="my-6" />
                        <FormDropdown
                            label="Tipo"
                            value={currentType}
                            setValue={onTypeChange}
                            options={typeOptions.map(o => ({ value: o.value, label: o.label }))}
                        />
                    </section>
                )}

                {/* Categories Section */}
                {filterConfig.showCategory !== false && activeCategoriesList.length > 0 && (
                    <section>
                        <Separator className="my-6" />
                        <h3 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">
                            {pageMode === "category" ? "Subcategorias" : "Categorias"}
                        </h3>
                        <div className="space-y-2">
                            {activeCategoriesList.map((cat) => {
                                const isSelected = selectedCategories.includes(cat.name)
                                return (
                                    <label
                                        key={cat.name}
                                        className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-colors"
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
                                        <span className="text-sm font-medium text-brand-dark dark:text-dark-heading truncate">
                                            {cat.name}
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                    </section>
                )}

                {/* Price Section */}
                {filterConfig.showPrice !== false && (
                    <section>
                        <Separator className="my-6" />
                        <h3 className="mb-3 text-sm font-bold text-brand-dark dark:text-dark-heading">Preço</h3>
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
                )}

                {/* Sort Section */}
                {filterConfig.showSort !== false && (
                    <section>
                        <Separator className="my-6" />
                        <FormDropdown
                            label="Ordenar"
                            value={sortBy}
                            setValue={onSortChange}
                            options={sortOptions.map(o => ({ value: o.value, label: o.label }))}
                        />
                    </section>
                )}

                {/* Promo Section */}
                {filterConfig.showPromo !== false && (
                    <section>
                        <Separator className="my-6" />
                        <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border/30 transition-colors">
                            <Checkbox
                                checked={promoOn}
                                onChange={onPromoToggle}
                            />
                            <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">Em promoção</span>
                        </label>
                    </section>
                )}
            </div>
            </div>
        </aside>
    )
}
