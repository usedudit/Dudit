"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    SearchIcon,
    StoreIcon,
    BlockedIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    FilterIcon
} from "@/lib/icons"

interface PartnersPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
    hasData?: boolean
}

const PartnersPageControls = ({
    search,
    setSearch,
    statusTab,
    setStatusTab,
    hasData = true
}: PartnersPageControlsProps) => {

    const tabs = [
        { value: "all", label: "Todos", icon: StoreIcon },
        { value: "active", label: "Ativos", icon: CheckCircleIcon },
        { value: "suspended", label: "Suspensos", icon: AlertTriangleIcon },
        { value: "erp_disabled", label: "Sem ERP", icon: BlockedIcon },
    ] as const

    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                    <TabsList className="px-0">
                        {tabs.map((tab) => (
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

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full px-4 md:px-8 mb-6">
                <Input
                    placeholder="Buscar lojas..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    className="flex-1"
                    prefix={<SearchIcon size={18} />}
                />

                <Button
                    variant="outline"
                    className="w-full sm:w-auto h-11 px-6 rounded-full font-bold text-[14px] bg-white dark:bg-dark-surface"
                    leftIcon={<FilterIcon size={16} />}
                >
                    Filtros
                </Button>
            </div>
        </>
    )
}

export default PartnersPageControls
