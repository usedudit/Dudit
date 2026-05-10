"use client"

import React from "react"
import { Button, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import { 
    ShieldIcon, 
    CheckCircleIcon, 
    AlertTriangleIcon,
    UserIcon,
    StoreIcon,
    AllProductsIcon,
    FilterIcon
} from "@/lib/icons"

interface AuditLogPageControlsProps {
    actionFilter: string
    setActionFilter: (val: string) => void
    targetFilter: string
    setTargetFilter: (val: string) => void
    onApplyFilters: () => void
}

const AuditLogPageControls = ({
    actionFilter,
    setActionFilter,
    targetFilter,
    setTargetFilter,
    onApplyFilters
}: AuditLogPageControlsProps) => {
    
    const targetTabs = [
        { value: "all", label: "Todos", icon: ShieldIcon },
        { value: "user", label: "Usuário", icon: UserIcon },
        { value: "partner", label: "Parceiro", icon: StoreIcon },
        { value: "product", label: "Produto", icon: AllProductsIcon },
        { value: "system", label: "Sistema", icon: FilterIcon },
    ] as const

    const actionOptions = [
        { value: "all", label: "Todas as Ações" },
        { value: "moderation.approve", label: "Aprovações" },
        { value: "moderation.reject", label: "Rejeições" },
        { value: "user.ban", label: "Banimentos" },
        { value: "partner.suspend", label: "Suspensões" },
        { value: "subscription.cancel", label: "Cancelamentos" },
    ]

    return (
        <div className="flex flex-col gap-6 mb-6 px-4 md:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tabs de Alvo */}
                <Tabs value={targetFilter} onValueChange={(val) => { setTargetFilter(val); onApplyFilters(); }} className="w-full md:w-auto">
                    <TabsList className="bg-brand-gray/50 dark:bg-dark-border/30 p-1 h-11">
                        {targetTabs.map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className="flex items-center gap-2 px-4 h-9 data-[state=active]:bg-white dark:data-[state=active]:bg-dark-surface data-[state=active]:text-brand-dark dark:data-[state=active]:text-dark-heading data-[state=active]:shadow-sm transition-all rounded-md"
                            >
                                <tab.icon size={16} className={targetFilter === tab.value ? "text-brand-green" : "text-brand-inactive-text"} />
                                <span className="text-[13px] font-bold whitespace-nowrap">{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {/* Filtro de Ação e Botão */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        value={actionFilter}
                        onChange={(e) => { setActionFilter(e.target.value); onApplyFilters(); }}
                        className="h-[42px] px-4 rounded-full border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-border/30 text-[13px] font-bold text-brand-dark dark:text-dark-heading focus:outline-none focus:border-brand-green transition-colors min-w-[160px]"
                    >
                        {actionOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    
                    <Button 
                        variant="outline" 
                        onClick={onApplyFilters}
                        className="h-[42px] px-5 rounded-full border-brand-green/20 hover:border-brand-green/40 hover:bg-brand-green/5 text-brand-green font-bold text-[13px]"
                    >
                        <FilterIcon size={16} className="mr-2" />
                        Atualizar
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default AuditLogPageControls
