"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import {
    CreditCardIcon,
    FilterIcon,
    GridIcon,
    InfoIcon,
    ListIcon,
    PlusIcon,
    SearchIcon,
} from "@/lib/icons"

interface FilterState {
    type: string[]
    status: string[]
}

interface PaymentMethodPageControlsProps {
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onAddMethod: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    hasActiveFilters: boolean
}

export default function PaymentMethodPageControls({
    search,
    onSearchChange,
    onOpenFilter,
    onAddMethod,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
    hasActiveFilters,
}: PaymentMethodPageControlsProps) {
    const filtersContainerRef = useRef<HTMLDivElement>(null)
    const [filterScrollState, setFilterScrollState] = useState({ left: false, right: false })

    const checkFilterScroll = useCallback(() => {
        if (!filtersContainerRef.current) return

        const { scrollLeft, scrollWidth, clientWidth } = filtersContainerRef.current

        setFilterScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    useEffect(() => {
        checkFilterScroll()
        window.addEventListener("resize", checkFilterScroll)
        return () => window.removeEventListener("resize", checkFilterScroll)
    }, [checkFilterScroll, filters])

    const renderGroupedBadge = (label: string, items: string[], key: keyof FilterState, icon?: React.ReactElement<{ className?: string }>) => {
        if (items.length === 0) return null

        const displayValue = items.length <= 2 ? items.join(", ") : `${items.slice(0, 2).join(", ")}...`
        const fullValue = items.join(", ")

        return (
            <FilterChip
                key={key}
                label={label}
                value={displayValue}
                tooltip={`${label}: ${fullValue}`}
                icon={icon}
                onRemove={() => setFilters((prev) => ({ ...prev, [key]: [] }))}
            />
        )
    }

    const BadgeList = () => (
        <AnimatePresence>
            {renderGroupedBadge("Tipo", filters.type, "type", <CreditCardIcon size={12} />)}
            {renderGroupedBadge("Status", filters.status, "status", <InfoIcon size={12} />)}
        </AnimatePresence>
    )

    return (
        <>
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4">
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search-payment-methods"
                            placeholder="Buscar metodos..."
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            label=""
                        />
                    </div>

                    <div className="flex-none flex items-center gap-2">
                        <Button
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon size={18} />}
                            className="h-[42px]"
                        >
                            Filtros
                        </Button>

                        <Button
                            onClick={onAddMethod}
                            leftIcon={<PlusIcon size={18} />}
                            className="h-[42px]"
                        >
                            Novo método
                        </Button>
                    </div>
                </div>

                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search-payment-methods-desktop"
                                placeholder="Buscar formas de pagamento..."
                                value={search}
                                onChange={(event) => onSearchChange(event.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                label=""
                            />
                        </div>

                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon className="h-[18px] w-[18px]" />}
                        >
                            Filtros
                        </Button>

                        {hasActiveFilters ? <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" /> : null}
                    </div>

                    <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                        <div
                            className={`absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.left ? "opacity-100" : "opacity-0"}`}
                        />

                        <div
                            ref={filtersContainerRef}
                            onScroll={checkFilterScroll}
                            className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full"
                        >
                            <BadgeList />
                        </div>

                        <div
                            className={`absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${filterScrollState.right ? "opacity-100" : "opacity-0"}`}
                        />
                    </div>

                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <ListIcon className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("grid")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                        >
                            <GridIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <BadgeList />
                </div>
            </div>
        </>
    )
}
