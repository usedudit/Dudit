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
} from "@/lib/icons"
import { Badge, Button, Input } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { ListItem } from "@/components/reusable/ListItem"
import Pagination from "@/components/reusable/Pagination"
import type { PartnerAnalyticsData, PlanChangeEvent } from "@/app/actions/admin/analytics"
import { formatDate } from "@/lib/utils"

interface PartnerPlansTabProps {
    data: PartnerAnalyticsData
}

const ITEMS_PER_PAGE = 10

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

            {/* Plan Changes Detailed Section */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border overflow-hidden">
                <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-brand-dark dark:text-dark-heading text-base">
                            Histórico de Mudanças de Plano, Upgrades & Cancelamentos
                        </h3>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Acompanhe quais parceiros subiram de plano, reduziram ou cancelaram, com os motivos registrados.
                        </p>
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="p-6 border-b border-brand-border/60 dark:border-dark-border/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                        <Button
                            variant={filterType === "all" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => handleFilterChange("all")}
                        >
                            Todos ({recentPlanChanges.length})
                        </Button>
                        <Button
                            variant={filterType === "upgrade" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => handleFilterChange("upgrade")}
                        >
                            Upgrades ({planUpgrades})
                        </Button>
                        <Button
                            variant={filterType === "downgrade" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => handleFilterChange("downgrade")}
                        >
                            Downgrades ({planDowngrades})
                        </Button>
                        <Button
                            variant={filterType === "cancellation" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => handleFilterChange("cancellation")}
                        >
                            Cancelamentos ({planCancellations})
                        </Button>
                    </div>

                    <div className="w-full sm:max-w-xs">
                        <Input
                            placeholder="Buscar parceiro ou motivo..."
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* List */}
                <div className="p-6">
                    {paginatedPlanChanges.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            {paginatedPlanChanges.map((item: PlanChangeEvent) => {
                                const isUpgrade = item.eventType === "upgrade"
                                const isDowngrade = item.eventType === "downgrade"
                                const isCancel = item.eventType === "cancellation"

                                return (
                                    <ListItem
                                        key={item.id}
                                        icon={isUpgrade ? TrendingUpIcon : isDowngrade ? ArrowDownIcon : AlertCircleIcon}
                                        title={
                                            <div className="flex items-center gap-2">
                                                <span>{item.storeName || item.partnerName}</span>
                                                <Badge
                                                    variant={
                                                        isUpgrade ? "green" :
                                                        isDowngrade ? "orange" :
                                                        isCancel ? "red" : "blue"
                                                    }
                                                >
                                                    {isUpgrade ? "▲ Upgrade" : isDowngrade ? "▼ Downgrade" : isCancel ? "✖ Cancelamento" : "Troca de Plano"}
                                                </Badge>
                                            </div>
                                        }
                                        description={
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-brand-inactive-text dark:text-dark-body">
                                                    {item.previousPlanName}
                                                </span>
                                                <span>→</span>
                                                <span className={isUpgrade ? "text-brand-green font-bold" : isCancel ? "text-red-500 font-bold" : "text-brand-dark dark:text-dark-heading"}>
                                                    {item.newPlanName}
                                                </span>
                                                <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                                                <span>{item.reason || "Sem motivo informado"}</span>
                                            </div>
                                        }
                                        right={
                                            <div className="text-right">
                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                    {formatDate(item.createdAt)}
                                                </div>
                                                <div className="text-[10px] text-brand-inactive-text dark:text-dark-body font-mono mt-0.5">
                                                    ID: {item.partnerId ? item.partnerId.slice(0, 8) : "N/A"}
                                                </div>
                                            </div>
                                        }
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className="py-8 text-center text-xs text-brand-inactive-text dark:text-dark-body">
                            Nenhuma mudança de plano registrada para os filtros selecionados.
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        inline
                    />
                )}
            </div>
        </div>
    )
}
