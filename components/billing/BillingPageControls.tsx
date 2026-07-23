"use client"

import React from "react"
import { Button, Input } from "@/components/reusable"
import {
    SearchIcon,
    FilterIcon,
    ListIcon,
    GridIcon,
} from "@/lib/icons"

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
    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 flex-none px-4 md:px-0">
            {/* MOBILE CONTROLS */}
            <div className="md:hidden flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0">
                    <Input
                        name="search"
                        placeholder="Buscar faturas..."
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-[42px] w-full"
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
                <div className="flex-none flex items-center gap-2">
                    <Button
                        variant={hasActiveFilters ? "default" : "outline"}
                        onClick={onOpenFilter}
                        className="w-[42px] h-[42px] p-0 flex items-center justify-center"
                    >
                        <FilterIcon className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* DESKTOP CONTROLS */}
            <div className="hidden md:flex items-center w-full justify-between gap-4">
                <div className="flex items-center gap-3 shrink-0">
                    <div className="w-80">
                        <Input
                            name="search"
                            placeholder="Buscar faturas..."
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            value={searchValue}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px]"
                            variant="full-rounded"
                            label=""
                        />
                    </div>
                    <Button
                        variant={hasActiveFilters ? "default" : "outline"}
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                    >
                        Filtros
                    </Button>
                </div>

                {/* View Toggles */}
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                    <button
                        type="button"
                        onClick={() => onViewModeChange("list")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${
                            viewMode === "list"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading font-medium"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        title="Visualização em Lista"
                    >
                        <ListIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onViewModeChange("grid")}
                        className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${
                            viewMode === "grid"
                                ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading font-medium"
                                : "text-gray-400 hover:text-gray-600 dark:text-dark-body"
                        }`}
                        title="Visualização em Grid"
                    >
                        <GridIcon className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default BillingPageControls
