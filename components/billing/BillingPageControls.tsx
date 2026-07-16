"use client"

import { SearchIcon, XIcon, FilterIcon, ListIcon, GridIcon } from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"

interface BillingPageControlsProps {
    searchValue: string
    onSearchChange: (value: string) => void
    viewMode: "grid" | "list"
    onViewModeChange: (mode: "grid" | "list") => void
    onOpenFilter: () => void
    hasActiveFilters: boolean
}

export function BillingPageControls({
    searchValue,
    onSearchChange,
    viewMode,
    onViewModeChange,
    onOpenFilter,
    hasActiveFilters,
}: BillingPageControlsProps) {
    const isMobile = useMediaQuery("(max-width: 767px)")

    return (
        <div className="px-4 md:px-8 py-3 flex items-center gap-2 bg-white dark:bg-dark-background">
            <div className="flex-1 flex items-center bg-brand-gray dark:bg-dark-border/50 rounded-xl px-3 h-10">
                <SearchIcon size={16} className="text-brand-inactive-text shrink-0" />
                <input
                    type="text"
                    placeholder="Buscar compras..."
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-sm px-2 text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text"
                />
                {searchValue && (
                    <button onClick={() => onSearchChange("")} className="shrink-0">
                        <XIcon size={14} className="text-brand-inactive-text" />
                    </button>
                )}
            </div>

            <button
                onClick={onOpenFilter}
                className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-colors ${
                    hasActiveFilters
                        ? "bg-brand-green text-white border-brand-green"
                        : "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading border-brand-border dark:border-dark-border hover:bg-brand-gray dark:hover:bg-dark-border/50"
                }`}
            >
                <FilterIcon size={18} />
            </button>

            {!isMobile && (
                <div className="flex items-center bg-brand-gray dark:bg-dark-border/50 rounded-xl p-0.5">
                    <button
                        onClick={() => onViewModeChange("list")}
                        className={`h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
                            viewMode === "list"
                                ? "bg-white dark:bg-dark-surface shadow-sm text-brand-dark dark:text-dark-heading"
                                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                        }`}
                    >
                        <ListIcon size={16} />
                    </button>
                    <button
                        onClick={() => onViewModeChange("grid")}
                        className={`h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
                            viewMode === "grid"
                                ? "bg-white dark:bg-dark-surface shadow-sm text-brand-dark dark:text-dark-heading"
                                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                        }`}
                    >
                        <GridIcon size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}
