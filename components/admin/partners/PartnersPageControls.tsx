"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    StoreIcon,
    BlockedIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    FilterIcon
} from "@/lib/icons"
import type { AdminPartnerStats } from "@/app/actions/admin/enforcement"

interface PartnersPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
    tabCounts?: AdminPartnerStats
    onOpenFilter?: () => void
}

const PartnersPageControls = ({
    search,
    setSearch,
    statusTab,
    setStatusTab,
    tabCounts,
    onOpenFilter,
}: PartnersPageControlsProps) => {
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="all"
                            icon={StoreIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.total} variant="gray" />}
                        >
                            Todos
                        </TabsTrigger>
                        <TabsTrigger
                            value="active"
                            icon={CheckCircleIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.active} variant="green" />}
                        >
                            Ativos
                        </TabsTrigger>
                        <TabsTrigger
                            value="suspended"
                            icon={AlertTriangleIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.suspended} variant="red" />}
                        >
                            Suspensos
                        </TabsTrigger>
                        <TabsTrigger
                            value="high_risk"
                            icon={BlockedIcon}
                            badge={tabCounts && <TabCountBadge count={tabCounts.highRisk} variant="yellow" />}
                        >
                            Alto Risco
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                <div className="w-full sm:w-96">
                    <Input
                        placeholder="Buscar por nome da loja ou parceiro..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        variant="full-rounded"
                        className="h-[42px]"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                    />
                </div>

                {onOpenFilter && (
                    <Button
                        variant="outline"
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                    >
                        Filtros
                    </Button>
                )}
            </div>
        </>
    )
}

export default PartnersPageControls

