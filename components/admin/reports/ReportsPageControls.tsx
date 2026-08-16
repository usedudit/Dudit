"use client"

import React from "react"
import { Button, Tabs, TabsList, TabsTrigger, Input } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    FilterIcon,
    ClockIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
    PackageIcon
} from "@/lib/icons"

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
    return (
        <div className="flex flex-col gap-4 px-4 md:px-8 mb-6">
            {/* Tabs */}
            <div className="w-full overflow-x-auto hide-scrollbar">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0 w-max min-w-full">
                        <TabsTrigger
                            value="pending"
                            icon={ClockIcon}
                            badge={<TabCountBadge count={stats.pending} variant="yellow" />}
                        >
                            Pendentes
                        </TabsTrigger>
                        <TabsTrigger
                            value="validated"
                            icon={CheckCircleIcon}
                            badge={<TabCountBadge count={stats.validated} variant="green" />}
                        >
                            Validadas
                        </TabsTrigger>
                        <TabsTrigger
                            value="dismissed"
                            icon={CancelCircleIcon}
                            badge={<TabCountBadge count={stats.dismissed} variant="gray" />}
                        >
                            Descartadas
                        </TabsTrigger>
                        <TabsTrigger
                            value="spam"
                            icon={AlertTriangleIcon}
                            badge={<TabCountBadge count={stats.spam} variant="red" />}
                        >
                            Spam
                        </TabsTrigger>
                        <TabsTrigger value="all" icon={PackageIcon}>
                            Todas
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <div className="w-full sm:w-96">
                    <Input
                        placeholder="Buscar por alvo ou denunciante..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        variant="full-rounded"
                        className="h-[42px]"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    />
                </div>

                {(hasData || hasActiveFilters) && (
                    <Button
                        variant={hasActiveFilters ? "default" : "outline"}
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                    >
                        Filtros
                    </Button>
                )}
            </div>
        </div>
    )
}

export default ReportsPageControls

