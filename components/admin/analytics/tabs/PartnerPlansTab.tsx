"use client"

import React, { useState, useMemo } from "react"
import {
    BriefcaseIcon,
    StoreIcon,
    CrownIcon,
    TrendingUpIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    AlertCircleIcon,
    CheckCircleIcon,
    MoneyIcon,
    CalendarIcon,
    FilterIcon,
    SearchIcon,
    Settings2Icon,
    ChevronDownIcon,
    ThreeDotsIcon,
} from "@/lib/icons"
import { Badge, Button, Input, Dropdown, DropdownItem } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { FormSection } from "@/components/reusable/FormSection"
import { ListItem } from "@/components/reusable/ListItem"
import Pagination from "@/components/reusable/Pagination"
import type { PartnerAnalyticsData, PlanChangeEvent } from "@/app/actions/admin/analytics"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface PartnerPlansTabProps {
    data: PartnerAnalyticsData
}

const ITEMS_PER_PAGE = 10

// PageControls-like component for filters and search
function PartnerPlansPageControls({
    filterType,
    onFilterChange,
    searchTerm,
    onSearchChange,
    planUpgrades,
    planDowngrades,
    planCancellations,
    recentPlanChanges,
}: {
    filterType: string
    onFilterChange: (type: string) => void
    searchTerm: string
    onSearchChange: (value: string) => void
    planUpgrades: number
    planDowngrades: number
    planCancellations: number
    recentPlanChanges: PlanChangeEvent[]
}) {
    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 md:p-6 border-b border-brand-border/60 dark:border-dark-border/60">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <Button
                    variant={filterType === "all" ? "default" : "outline"}
                    className="text-xs shrink-0"
                    onClick={() => onFilterChange("all")}
                >
                    Todos ({recentPlanChanges.length})
                </Button>
                <Button
                    variant={filterType === "upgrade" ? "default" : "outline"}
                    className="text-xs shrink-0"
                    onClick={() => onFilterChange("upgrade")}
                >
                    Upgrades ({planUpgrades})
                </Button>
                <Button
                    variant={filterType === "downgrade" ? "default" : "outline"}
                    className="text-xs shrink-0"
                    onClick={() => onFilterChange("downgrade")}
                >
                    Downgrades ({planDowngrades})
                </Button>
                <Button
                    variant={filterType === "cancellation" ? "default" : "outline"}
                    className="text-xs shrink-0"
                    onClick={() => onFilterChange("cancellation")}
                >
                    Cancelamentos ({planCancellations})
                </Button>
            </div>

            {/* Search Input */}
            <div className="w-full sm:max-w-xs flex items-center gap-2">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                    <Input
                        placeholder="Buscar parceiro, loja ou motivo..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10 w-full"
                    />
                </div>
            </div>
        </div>
    )
}

// Plan change row using ListItem like ERP
function PlanChangeRow({ item }: { item: PlanChangeEvent }) {
    const isUpgrade = item.eventType === "upgrade"
    const isDowngrade = item.eventType === "downgrade"
    const isCancel = item.eventType === "cancellation"

    const eventIcon = isUpgrade ? TrendingUpIcon : isDowngrade ? ArrowDownIcon : AlertCircleIcon
    const eventBg = isUpgrade ? "bg-brand-green/10" : isDowngrade ? "bg-orange-100 dark:bg-orange-900/30" : "bg-red-50 dark:bg-red-900/30"
    const eventTextColor = isUpgrade ? "text-brand-green" : isDowngrade ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400"
    const eventLabel = isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Cancelamento"

    return (
        <ListItem
            key={item.id}
            icon={eventIcon}
            title={
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-brand-dark dark:text-dark-heading truncate">
                        {item.storeName || item.partnerName}
                    </span>
                    <Badge variant={isUpgrade ? "green" : isDowngrade ? "orange" : isCancel ? "red" : "blue"} className="whitespace-nowrap">
                        {eventLabel}
                    </Badge>
                </div>
            }
            description={
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-brand-inactive-text dark:text-dark-body text-sm">
                        {item.previousPlanName}
                    </span>
                    <ChevronDownIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
                    <span className={cn("font-medium", isUpgrade ? "text-brand-green" : isCancel ? "text-red-500" : "text-brand-dark dark:text-dark-heading")}>
                        {item.newPlanName}
                    </span>
                    <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                    <span className="text-sm text-brand-inactive-text dark:text-dark-body truncate max-w-[300px]">
                        {item.reason || "Sem motivo informado"}
                    </span>
                </div>
            }
            right={
                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                            {formatDate(item.createdAt)}
                        </div>
                        <div className="text-[10px] text-brand-inactive-text dark:text-dark-body font-mono mt-0.5">
                            ID: {item.partnerId ? item.partnerId.slice(0, 8) : "N/A"}
                        </div>
                    </div>
                    {/* Actions Dropdown with Settings2Icon */}
                    <Dropdown
                        trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                                <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text" />
                            </Button>
                        }
                        align="right"
                        width="w-48"
                        showChevron={false}
                    >
                        <DropdownItem>
                            <CalendarIcon size={14} /> Ver detalhes do período
                        </DropdownItem>
                        <DropdownItem>
                            <StoreIcon size={14} /> Ver loja do parceiro
                        </DropdownItem>
                        {item.amount && item.amount > 0 && (
                            <DropdownItem>
                                <MoneyIcon size={14} /> Valor: R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </DropdownItem>
                        )}
                    </Dropdown>
                </div>
            }
            className={cn("bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border hover:border-brand-green/30 dark:hover:border-brand-green/30", eventBg)}
        />
    )
}

export function PartnerPlansTab({ data }: PartnerPlansTabProps) {
    const [filterType, setFilterType] = useState<string>("all")
    const [searchTerm, setSearchTerm] = useState("")
    const [currentPage, setCurrentPage] = useState(1)

    const {
        totalPartners,
        newPartners,
        newPartnersChange,
        activePartners,
        partnerRetentionRate,
        businessesWithDemand,
        businessesWithDemandRate,
        planUpgrades,
        planDowngrades,
        planCancellations,
        recentPlanChanges,
    } = data

    // Filter plan changes
    const filteredPlanChanges = useMemo(() => {
        return recentPlanChanges.filter((item) => {
            const matchesSearch =
                item.partnerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.reason && item.reason.toLowerCase().includes(searchTerm.toLowerCase()))

            if (!matchesSearch) return false
            if (filterType === "all") return true
            return item.eventType === filterType
        })
    }, [recentPlanChanges, searchTerm, filterType])

    // Pagination
    const totalPages = Math.ceil(filteredPlanChanges.length / ITEMS_PER_PAGE)
    const paginatedPlanChanges = filteredPlanChanges.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    )

    // Reset page when filters change
    const handleFilterChange = (type: string) => {
        setFilterType(type)
        setCurrentPage(1)
    }

    const handleSearchChange = (value: string) => {
        setSearchTerm(value)
        setCurrentPage(1)
    }

    const kpiItems = [
        {
            title: "Total de Parceiros",
            value: totalPartners.toLocaleString("pt-BR"),
            trend: `+${newPartners} criados no período`,
            subtext: `${newPartnersChange >= 0 ? `+${newPartnersChange}%` : `${newPartnersChange}%`} vs período anterior`,
            icon: BriefcaseIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Parceiros Ativos",
            value: activePartners.toLocaleString("pt-BR"),
            trend: `${partnerRetentionRate}% retenção`,
            subtext: "Com vitrine, catálogo e operação ativa",
            icon: StoreIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Negócios c/ Demanda",
            value: businessesWithDemand.toLocaleString("pt-BR"),
            trend: `${businessesWithDemandRate}% dos ativos`,
            subtext: "Receberam pedidos, agendamentos ou contatos",
            icon: TrendingUpIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Mudanças de Plano",
            value: `+${planUpgrades} / -${planDowngrades} / -${planCancellations}`,
            trend: "Movimentação",
            subtext: "Upgrades / Downgrades / Cancelamentos",
            icon: CrownIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
    ]

    return (
        <div className="flex flex-col gap-6">
            {/* Top Metric Cards - Using HorizontalKPICard from ERP */}
            <HorizontalKPICard items={kpiItems} />

            {/* Plan Changes Section - Using FormSection */}
            <FormSection
                title="Histórico de Mudanças de Plano, Upgrades & Cancelamentos"
                description="Acompanhe quais parceiros subiram de plano, reduziram ou cancelaram, com os motivos registrados."
                hasSeparator
            >
                {/* PageControls for filters and search */}
                <PartnerPlansPageControls
                    filterType={filterType}
                    onFilterChange={handleFilterChange}
                    searchTerm={searchTerm}
                    onSearchChange={handleSearchChange}
                    planUpgrades={planUpgrades}
                    planDowngrades={planDowngrades}
                    planCancellations={planCancellations}
                    recentPlanChanges={recentPlanChanges}
                />

                {/* List using ListItem like ERP */}
                <div className="space-y-3 p-4 md:p-6">
                    {paginatedPlanChanges.length > 0 ? (
                        <>
                            {paginatedPlanChanges.map((item: PlanChangeEvent) => (
                                <PlanChangeRow key={item.id} item={item} />
                            ))}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center mt-4 pt-4 border-t border-brand-border/60 dark:border-dark-border/60">
                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={setCurrentPage}
                                        inline
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="py-12 text-center text-sm text-brand-inactive-text dark:text-dark-body">
                            Nenhuma mudança de plano registrada para os filtros selecionados.
                        </div>
                    )}
                </div>
            </FormSection>
        </div>
    )
}