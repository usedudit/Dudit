"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Button, Input } from "@/components/reusable"
import Dropdown, { DropdownItem } from "@/components/reusable/Dropdown"
import FilterChip from "@/components/reusable/FilterChip"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import {
    CancelCircleIcon,
    CheckCircleIcon,
    CreditCardIcon,
    ExportFileIcon,
    FilterIcon,
    InfoIcon,
    PlusIcon,
    SearchIcon,
    Settings2Icon,
    Users,
} from "@/lib/icons"

interface FilterState {
    type: string[]
    status: string[]
}

interface PaymentMethodPageControlsProps {
    activeTab: "all" | "active" | "inactive"
    setActiveTab: (tab: "all" | "active" | "inactive") => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    onAddMethod: () => void
    filters: FilterState
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>
    hasActiveFilters: boolean
}

export default function PaymentMethodPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    onAddMethod,
    filters,
    setFilters,
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
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "all" | "active" | "inactive")}>
                    <TabsList className="px-0">
                        <TabsTrigger value="all" icon={Users}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="active" icon={CheckCircleIcon}>
                            Ativos
                        </TabsTrigger>
                        <TabsTrigger value="inactive" icon={CancelCircleIcon}>
                            Inativos
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
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
                        <Button variant="outline" onClick={onOpenFilter} className="w-[42px] h-[42px] p-0">
                            <FilterIcon className="w-4 h-4" />
                        </Button>

                        <Dropdown
                            trigger={
                                <Button variant="outline" className="w-[42px] h-[42px] p-0">
                                    <Settings2Icon className="w-4 h-4" />
                                </Button>
                            }
                            align="right"
                            showChevron={false}
                            fullWidth={false}
                        >
                            <DropdownItem onClick={onAddMethod}>
                                <PlusIcon size={14} /> Novo metodo
                            </DropdownItem>
                            <DropdownItem onClick={() => {}}>
                                <ExportFileIcon size={14} /> Exportar
                            </DropdownItem>
                        </Dropdown>
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

                    <Button onClick={onAddMethod} className="h-[42px] shrink-0">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Novo metodo
                    </Button>
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
