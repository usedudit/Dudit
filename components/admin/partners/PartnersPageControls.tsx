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
        <>
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

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 md:px-8 mb-4">
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
        </>
    )
}

export default PartnersPageControls
