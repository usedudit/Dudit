"use client"

import React from "react"
import { Button, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    ShieldIcon,
    UserIcon,
    StoreIcon,
    AllProductsIcon,
    FilterIcon,
    SearchIcon,
    SettingsIcon
} from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"

interface AuditLogPageControlsProps {
    activeTab: string
    setActiveTab: (val: string) => void
    search: string
    onSearchChange: (val: string) => void
    onOpenFilter: () => void
    hasActiveFilters: boolean
}

const AuditLogPageControls = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    hasActiveFilters
}: AuditLogPageControlsProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")

    const targetTabs = [
        { value: "all", label: "Todos", icon: ShieldIcon },
        { value: "user", label: "Usuário", icon: UserIcon },
        { value: "partner", label: "Parceiro", icon: StoreIcon },
        { value: "product", label: "Produto", icon: AllProductsIcon },
        { value: "system", label: "Sistema", icon: SettingsIcon },
    ] as const

    return (
        <div className="flex flex-col gap-4 px-4 md:px-8 mb-6">
            {/* Desktop and Mobile Tabs */}
            <div className="w-full overflow-x-auto hide-scrollbar">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0 w-max min-w-full">
                        {targetTabs.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                icon={tab.icon}
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <div className="relative flex-1 w-full">
                    <SearchIcon
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-inactive-text"
                    />
                    <input
                        type="text"
                        placeholder="Buscar log (id, motivo, email do executor)..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full h-11 pl-11 pr-4 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full text-[14px] font-medium text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:border-brand-primary transition-colors"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                        variant={hasActiveFilters ? "default" : "outline"}
                        onClick={onOpenFilter}
                        className={`w-full sm:w-auto h-11 px-6 rounded-full font-bold text-[14px] ${hasActiveFilters ? "" : "bg-white dark:bg-dark-surface"}`}
                        leftIcon={<FilterIcon size={16} />}
                    >
                        Filtros
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AuditLogPageControls
