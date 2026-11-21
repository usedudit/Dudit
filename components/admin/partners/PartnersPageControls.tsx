"use client"

import React from "react"
import { Button, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import {
    StoreIcon,
    BlockedIcon,
    AlertTriangleIcon,
    CheckCircleIcon,
    FilterIcon,
} from "@/lib/icons"

interface PartnersPageControlsProps {
    statusTab: string
    setStatusTab: (val: string) => void
    onOpenFilter?: () => void
    chips?: React.ReactNode
}

const PartnersPageControls = ({
    statusTab,
    setStatusTab,
    onOpenFilter,
    chips,
}: PartnersPageControlsProps) => {
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={statusTab} onValueChange={setStatusTab}>
                    <TabsList className="px-0">
                        <TabsTrigger value="all" icon={StoreIcon}>
                            Todos
                        </TabsTrigger>
                        <TabsTrigger value="active" icon={CheckCircleIcon}>
                            Ativos
                        </TabsTrigger>
                        <TabsTrigger value="suspended" icon={AlertTriangleIcon}>
                            Suspensos
                        </TabsTrigger>
                        <TabsTrigger value="high_risk" icon={BlockedIcon}>
                            Alto Risco
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-wrap items-center gap-3 w-full px-4 md:px-8 mb-6">
                {onOpenFilter && (
                    <Button
                        variant="outline"
                        onClick={onOpenFilter}
                        leftIcon={<FilterIcon size={18} />}
                    >
                        Filtros e Busca
                    </Button>
                )}
                {chips && (
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                        {chips}
                    </div>
                )}
            </div>
        </>
    )
}

export default PartnersPageControls
