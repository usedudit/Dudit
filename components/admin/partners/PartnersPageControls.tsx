"use client"

import React from "react"
import { Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { 
    SearchIcon, 
    StoreIcon, 
    BlockedIcon, 
    AlertTriangleIcon,
    CheckCircleIcon
} from "@/lib/icons"

interface PartnersPageControlsProps {
    search: string
    setSearch: (val: string) => void
    statusTab: string
    setStatusTab: (val: string) => void
}

const PartnersPageControls = ({
    search,
    setSearch,
    statusTab,
    setStatusTab
}: PartnersPageControlsProps) => {
    
    const tabs = [
        { value: "all", label: "Todos", icon: StoreIcon },
        { value: "active", label: "Ativos", icon: CheckCircleIcon },
        { value: "suspended", label: "Suspensos", icon: AlertTriangleIcon },
        { value: "erp_disabled", label: "Sem ERP", icon: BlockedIcon },
    ] as const

    return (
        <div className="flex flex-col gap-6 mb-6 px-4 md:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tabs de Status */}
                <Tabs value={statusTab} onValueChange={setStatusTab} className="w-full md:w-auto">
                    <TabsList className="bg-brand-gray/50 dark:bg-dark-border/30 p-1 h-11">
                        {tabs.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="flex items-center gap-2 px-4 h-9 data-[state=active]:bg-white dark:data-[state=active]:bg-dark-surface data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading data-[state=active]:shadow-sm transition-all rounded-md"
                            >
                                <tab.icon size={16} className={statusTab === tab.value ? "text-brand-green" : "text-brand-inactive-text"} />
                                <span className="text-[13px] font-bold whitespace-nowrap">{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {/* Barra de Busca */}
                <div className="w-full md:w-80">
                    <Input
                        name="search"
                        placeholder="Buscar por loja ou dono..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="h-[42px]"
                        variant="full-rounded"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                        label=""
                    />
                </div>
            </div>
        </div>
    )
}

export default PartnersPageControls
