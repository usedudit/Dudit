"use client"

import React, { useRef, useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    ShieldIcon,
    UserIcon,
    StoreIcon,
    PackageIcon,
    FilterIcon,
    SearchIcon,
    SettingsIcon,
    GridIcon,
    ListIcon,
} from "@/lib/icons"
import type { AuditLogStats } from "@/app/actions/admin/audit-logs"

export interface AuditFilterState {
    action: string[]
    targetType: string[]
}

export const INITIAL_AUDIT_FILTERS: AuditFilterState = {
    action: [],
    targetType: [],
}

interface AuditLogPageControlsProps {
    activeTab: string
    setActiveTab: (val: string) => void
    search: string
    onSearchChange: (val: string) => void
    onOpenFilter: () => void
    filters: AuditFilterState
    setFilters: React.Dispatch<React.SetStateAction<AuditFilterState>>
    hasActiveFilters: boolean
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    stats?: AuditLogStats
}

export default function AuditLogPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    filters,
    setFilters,
    hasActiveFilters,
    viewMode,
    onViewModeChange,
    stats,
}: AuditLogPageControlsProps) {
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

    const BadgeList = () => (
        <AnimatePresence>
            {filters.action.length > 0 && (
                <FilterChip
                    label="Ação"
                    value={filters.action.join(", ")}
                    icon={<SettingsIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, action: [] }))}
                />
            )}
            {filters.targetType.length > 0 && (
                <FilterChip
                    label="Tipo de Alvo"
                    value={filters.targetType.join(", ")}
                    icon={<ShieldIcon size={12} />}
                    onRemove={() => setFilters((prev) => ({ ...prev, targetType: [] }))}
                />
            )}
        </AnimatePresence>
    )

    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="all"
                            icon={ShieldIcon}
                            badge={stats && <TabCountBadge count={stats.total} variant="gray" />}
                        >
                            Todos
                        </TabsTrigger>
                        <TabsTrigger
                            value="user"
                            icon={UserIcon}
                            badge={stats && <TabCountBadge count={stats.user} variant="blue" />}
                        >
                            Usuário
                        </TabsTrigger>
                        <TabsTrigger
                            value="partner"
                            icon={StoreIcon}
                            badge={stats && <TabCountBadge count={stats.partner} variant="green" />}
                        >
                            Parceiro
                        </TabsTrigger>
                        <TabsTrigger
                            value="product"
                            icon={PackageIcon}
                            badge={stats && <TabCountBadge count={stats.product} variant="yellow" />}
                        >
                            Produto
                        </TabsTrigger>
                        <TabsTrigger
                            value="system"
                            icon={SettingsIcon}
                            badge={stats && <TabCountBadge count={stats.system} variant="red" />}
                        >
                            Sistema
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
                            placeholder="Buscar por admin, ação ou alvo..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                    <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0 shrink-0">
                        <FilterIcon className="w-4 h-4" />
                    </Button>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                placeholder="Buscar por admin, ação ou alvo..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            />
                        </div>
                        <Button
                            variant="outline"
                            onClick={onOpenFilter}
                            leftIcon={<FilterIcon size={18} />}
                        >
                            Filtros
                        </Button>
                        {hasActiveFilters && (
                            <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1" />
                        )}
                    </div>

                    {/* Scrollable Badges Area */}
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

                    {/* View Toggles */}
                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            aria-label="Visualização em Lista"
                        >
                            <ListIcon className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("grid")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            aria-label="Visualização em Grade"
                        >
                            <GridIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </div>
            </div>

            {/* MOBILE CHIPS */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
                <div className="flex items-center gap-2">
                    <BadgeList />
                </div>
            </div>
        </>
    )
}
