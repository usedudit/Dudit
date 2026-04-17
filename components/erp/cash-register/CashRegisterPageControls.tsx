import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"

import {
    SearchIcon,
    DashboardIcon,
    ListIcon,
    PlusIcon,
    ArrowUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
} from "@/lib/icons"

interface FilterState {
    status: "all" | "open" | "closed"
}

interface CashRegisterPageControlsProps {
    search: string
    onSearchChange: (value: string) => void
    onOpenSession: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
}

const CashRegisterPageControls: React.FC<CashRegisterPageControlsProps> = ({
    search,
    onSearchChange,
    onOpenSession,
    filters,
    setFilters,
    viewMode,
    onViewModeChange,
}) => {
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs
                    value={filters.status}
                    onValueChange={(val) => setFilters(prev => ({ ...prev, status: val as any }))}
                >
                    <TabsList className="px-0">
                        <TabsTrigger value="all" icon={ArrowUpDownIcon}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="open" icon={ArrowUpIcon}>
                            Abertos
                        </TabsTrigger>
                        <TabsTrigger value="closed" icon={ArrowDownIcon}>
                            Fechados
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                {/* MOBILE CONTROLS */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            name="search"
                            placeholder="Buscar operador ou caixa..."
                            value={search}
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
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                name="search"
                                placeholder="Buscar operador ou caixa..."
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                label=""
                            />
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 flex items-center justify-end gap-4">
                        {/* View Toggles */}
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
                                <DashboardIcon className="w-[18px] h-[18px]" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default CashRegisterPageControls
