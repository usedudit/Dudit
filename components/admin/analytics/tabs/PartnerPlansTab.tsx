"use client"

import React, { useState } from "react"
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
import type { PartnerAnalyticsData, PlanChangeEvent } from "@/app/actions/admin/analytics"
import { formatDate } from "@/lib/utils"

interface PartnerPlansTabProps {
    data: PartnerAnalyticsData
}

export function PartnerPlansTab({ data }: PartnerPlansTabProps) {
    const [filterType, setFilterType] = useState<string>("all")
    const [searchTerm, setSearchTerm] = useState("")

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
    const filteredPlanChanges = recentPlanChanges.filter((item) => {
        const matchesSearch =
            item.partnerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.reason && item.reason.toLowerCase().includes(searchTerm.toLowerCase()))

        if (!matchesSearch) return false
        if (filterType === "all") return true
        return item.eventType === filterType
    })

    return (
        <div className="space-y-8">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {/* Total de Parceiros */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <BriefcaseIcon size={20} />
                        </div>
                        <Badge variant="blue">Base Parceira</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Total de Parceiros
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {totalPartners.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        +{newPartners} criados no período ({newPartnersChange >= 0 ? `+${newPartnersChange}%` : `${newPartnersChange}%`})
                    </p>
                </div>

                {/* Parceiros Ativos & Retenção */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-brand-green flex items-center justify-center">
                            <StoreIcon size={20} />
                        </div>
                        <Badge variant="green">{partnerRetentionRate}% retenção</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Parceiros Ativos
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {activePartners.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Com vitrine, catálogo e operação ativa
                    </p>
                </div>

                {/* Negócios com Demanda */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                            <TrendingUpIcon size={20} />
                        </div>
                        <Badge variant="green">{businessesWithDemandRate}% dos ativos</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Negócios c/ Demanda
                    </h3>
                    <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">
                        {businessesWithDemand.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Receberam pedidos, agendamentos ou contatos
                    </p>
                </div>

                {/* Resumo de Planos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <CrownIcon size={20} />
                        </div>
                        <Badge variant="purple">Movimentação</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Mudanças de Plano
                    </h3>
                    <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                        <span className="text-emerald-600 dark:text-emerald-400">+{planUpgrades}</span> / <span className="text-amber-500">-{planDowngrades}</span> / <span className="text-red-500">-{planCancellations}</span>
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Upgrades / Downgrades / Cancelamentos
                    </p>
                </div>
            </div>

            {/* Plan Changes Detailed Section */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
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
                            onClick={() => setFilterType("all")}
                        >
                            Todos ({recentPlanChanges.length})
                        </Button>
                        <Button
                            variant={filterType === "upgrade" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => setFilterType("upgrade")}
                        >
                            Upgrades ({planUpgrades})
                        </Button>
                        <Button
                            variant={filterType === "downgrade" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => setFilterType("downgrade")}
                        >
                            Downgrades ({planDowngrades})
                        </Button>
                        <Button
                            variant={filterType === "cancellation" ? "default" : "outline"}
                            className="text-xs shrink-0"
                            onClick={() => setFilterType("cancellation")}
                        >
                            Cancelamentos ({planCancellations})
                        </Button>
                    </div>

                    <div className="w-full sm:max-w-xs">
                        <Input
                            placeholder="Buscar parceiro ou motivo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    {filteredPlanChanges.length > 0 ? (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-brand-border dark:border-dark-border bg-gray-50/50 dark:bg-gray-900/30 text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                                    <th className="py-3.5 px-6">Parceiro / Loja</th>
                                    <th className="py-3.5 px-4">Tipo de Ação</th>
                                    <th className="py-3.5 px-4">Transição de Plano</th>
                                    <th className="py-3.5 px-6">Motivo Declarado</th>
                                    <th className="py-3.5 px-4 text-right">Data</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border/40 dark:divide-dark-border/40 text-sm">
                                {filteredPlanChanges.map((item: PlanChangeEvent) => {
                                    const isUpgrade = item.eventType === "upgrade"
                                    const isDowngrade = item.eventType === "downgrade"
                                    const isCancel = item.eventType === "cancellation"

                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {item.storeName || item.partnerName}
                                                </div>
                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body font-mono">
                                                    ID: {item.partnerId ? item.partnerId.slice(0, 8) : "N/A"}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <Badge
                                                    variant={
                                                        isUpgrade ? "green" :
                                                        isDowngrade ? "orange" :
                                                        isCancel ? "red" : "blue"
                                                    }
                                                >
                                                    {isUpgrade ? "▲ Upgrade" : isDowngrade ? "▼ Downgrade" : isCancel ? "✖ Cancelamento" : "Troca de Plano"}
                                                </Badge>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                    <span className="text-brand-inactive-text dark:text-dark-body">{item.previousPlanName}</span>
                                                    <span>→</span>
                                                    <span className={isUpgrade ? "text-brand-green font-bold" : isCancel ? "text-red-500 font-bold" : "text-brand-dark dark:text-dark-heading"}>
                                                        {item.newPlanName}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <div className="text-xs text-brand-dark dark:text-dark-heading bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 max-w-md">
                                                    {item.reason || "Sem motivo informado"}
                                                </div>
                                            </td>
                                            <td className="py-4 px-4 text-right text-xs text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                                                {formatDate(item.createdAt)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-8 text-center text-xs text-brand-inactive-text dark:text-dark-body">
                            Nenhuma mudança de plano registrada para os filtros selecionados.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
