"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { 
    SearchIcon, 
    FilterIcon,
    ClockIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    AlertTriangleIcon,
    AllProductsIcon // Using this as a placeholder for 'All'
} from "@/lib/icons"
import type { ReportStatus, ReportTargetType } from "@/app/actions/admin/reports"

interface ReportsPageControlsProps {
    statusFilter: ReportStatus | "all"
    setStatusFilter: (status: ReportStatus | "all") => void
    targetFilter: ReportTargetType | "all"
    setTargetFilter: (target: ReportTargetType | "all") => void
    search: string
    onSearchChange: (value: string) => void
    stats: {
        pending: number
        validated: number
        dismissed: number
        spam: number
    }
}

const ReportsPageControls: React.FC<ReportsPageControlsProps> = ({
    statusFilter,
    setStatusFilter,
    targetFilter,
    setTargetFilter,
    search,
    onSearchChange,
    stats
}) => {
    
    const TARGET_FILTERS = [
        { value: "all", label: "Todos" },
        { value: "product", label: "Produtos" },
        { value: "service", label: "Serviços" },
        { value: "partner", label: "Parceiros" },
        { value: "review", label: "Avaliações" },
    ] as const

    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs
                    value={statusFilter}
                    onValueChange={(val) => setStatusFilter(val as ReportStatus | "all")}
                >
                    <TabsList className="px-0">
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

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4 md:px-8 mb-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="w-full md:w-80">
                        <Input
                            name="search"
                            placeholder="Buscar por alvo ou reporter..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px]"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text" />}
                            label=""
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar w-full md:w-auto pb-2 md:pb-0">
                    <span className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider mr-2 shrink-0">
                        Tipo:
                    </span>
                    {TARGET_FILTERS.map((f) => (
                        <Button
                            key={f.value}
                            variant={targetFilter === f.value ? "filled" : "ghost"}
                            onClick={() => setTargetFilter(f.value)}
                            className={`h-8 px-3 text-xs whitespace-nowrap rounded-full ${
                                targetFilter === f.value 
                                ? "bg-brand-gray text-brand-dark" 
                                : "text-brand-inactive-text hover:bg-brand-gray/50"
                            }`}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>
            </div>
        </>
    )
}

export default ReportsPageControls
