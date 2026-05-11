"use client"

import React from "react"
import { Button, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    SearchIcon,
    FilterIcon,
    ClockIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
    AllProductsIcon
} from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"

interface ReportsPageControlsProps {
    activeTab: string
    setActiveTab: (status: string) => void
    search: string
    onSearchChange: (value: string) => void
    onOpenFilter: () => void
    hasActiveFilters: boolean
    hasData: boolean
    stats: {
        pending: number
        validated: number
        dismissed: number
        spam: number
    }
}

const ReportsPageControls: React.FC<ReportsPageControlsProps> = ({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    onOpenFilter,
    hasActiveFilters,
    hasData,
    stats
}) => {
    const isMobile = useMediaQuery("(max-width: 768px)")

    return (
        <div className="flex flex-col gap-4 px-4 md:px-8 mb-6">
            {/* Tabs */}
            <div className="w-full overflow-x-auto hide-scrollbar">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0 w-max min-w-full">
                        <TabsTrigger value="pending" icon={ClockIcon}>
                            Pendentes ({stats.pending})
                        </TabsTrigger>
                        <TabsTrigger value="validated" icon={CheckCircleIcon}>
                            Validadas ({stats.validated})
                        </TabsTrigger>
                        <TabsTrigger value="dismissed" icon={CancelCircleIcon}>
                            Descartadas ({stats.dismissed})
                        </TabsTrigger>
                        <TabsTrigger value="spam" icon={AlertTriangleIcon}>
                            Spam ({stats.spam})
                        </TabsTrigger>
                        <TabsTrigger value="all" icon={AllProductsIcon}>
                            Todas
                        </TabsTrigger>
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
                        placeholder="Buscar por alvo ou reporter..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full h-11 pl-11 pr-4 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full text-[14px] font-medium text-brand-dark dark:text-dark-heading placeholder:text-brand-inactive-text focus:outline-none focus:border-brand-primary transition-colors"
                    />
                </div>

                {(hasData || hasActiveFilters) && (
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
                )}
            </div>
        </div>
    )
}

export default ReportsPageControls
