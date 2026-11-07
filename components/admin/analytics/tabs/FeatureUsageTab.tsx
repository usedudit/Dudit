"use client"

import React from "react"
import {
    ShoppingCartIcon,
    PackageIcon,
    CalendarIcon,
    MoneyIcon,
    TagIcon,
    TruckIcon,
    ReturnIcon,
    SparklesIcon,
    MegaphoneIcon,
    TrendingUpIcon,
    AlertCircleIcon,
    CheckCircleIcon,
} from "@/lib/icons"
import { Badge } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { DashboardSectionCard } from "@/components/erp/dashboard/cards/DashboardSectionCard"
import type { FeatureUsageData, FeatureUsageMetric } from "@/app/actions/admin/analytics"

interface FeatureUsageTabProps {
    data: FeatureUsageData
}

function getIconComponent(iconName: string) {
    switch (iconName) {
        case "ShoppingCartIcon": return ShoppingCartIcon
        case "PackageIcon": return PackageIcon
        case "CalendarIcon": return CalendarIcon
        case "MoneyIcon": return MoneyIcon
        case "TruckIcon": return TruckIcon
        case "ReturnIcon": return ReturnIcon
        case "MegaphoneIcon": return MegaphoneIcon
        case "SparklesIcon": return SparklesIcon
        case "TagIcon": return TagIcon
        default: return TagIcon
    }
}

export function FeatureUsageTab({ data }: FeatureUsageTabProps) {
    const { featuresRanked, mostUsedFeatures, leastUsedFeatures, totalPlatformInteractions } = data

    const maxCount = Math.max(...featuresRanked.map(f => f.count), 1)

    // Get top 4 features for KPI card
    const topFeatures = featuresRanked.slice(0, 4)
    const kpiItems = topFeatures.map((item) => ({
        title: item.name,
        value: item.count.toLocaleString("pt-BR"),
        trend: `${item.changePercent > 0 ? "+" : ""}${item.changePercent}%`,
        subtext: `${item.activeBusinessesCount} lojas ativas`,
        icon: getIconComponent(item.iconName),
        iconBg: "bg-brand-green-light dark:bg-dark-border/40",
        iconColor: "text-brand-dark dark:text-dark-heading",
    }))

    return (
        <div className="flex flex-col gap-6">
            {/* Header Banner - Using DashboardSectionCard */}
            <DashboardSectionCard
                title="Adoção & Uso de Funcionalidades do Ecossistema"
                icon={TrendingUpIcon}
                action={
                    <Badge variant="green" className="self-start md:self-auto py-1 px-3">
                        {totalPlatformInteractions.toLocaleString("pt-BR")} Interações Totais
                    </Badge>
                }
                className="mb-0"
            >
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    Mapeamento das ferramentas mais e menos utilizadas pelos parceiros para direcionar melhorias e suporte.
                </p>
            </DashboardSectionCard>

            {/* Top Metric Cards - Using HorizontalKPICard from ERP */}
            {kpiItems.length > 0 && <HorizontalKPICard items={kpiItems} />}

            {/* Top Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Mais Utilizadas - Using DashboardSectionCard */}
                <DashboardSectionCard
                    title="Funcionalidades Campeãs de Uso"
                    icon={CheckCircleIcon}
                    className="mb-0 border-green-200 dark:border-green-900/30"
                >
                    <div className="flex flex-col gap-3">
                        {mostUsedFeatures.map((f: FeatureUsageMetric, index: number) => {
                            const Icon = getIconComponent(f.iconName)
                            return (
                                <div key={f.id} className="p-3.5 rounded-[24px] bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-brand-green flex items-center justify-center font-bold text-xs">
                                            #{index + 1}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                                <Icon size={14} /> {f.name}
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                {f.activeBusinessesCount} lojas utilizando ativamente
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {f.count.toLocaleString("pt-BR")}
                                        </div>
                                        <Badge variant="green">+{f.changePercent}%</Badge>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </DashboardSectionCard>

                {/* Menos Utilizadas / Oportunidades - Using DashboardSectionCard */}
                <DashboardSectionCard
                    title="Subutilizadas / Oportunidades de Adoção"
                    icon={AlertCircleIcon}
                    className="mb-0 border-amber-200 dark:border-amber-900/30"
                >
                    <div className="flex flex-col gap-3">
                        {leastUsedFeatures.map((f: FeatureUsageMetric) => {
                            const Icon = getIconComponent(f.iconName)
                            return (
                                <div key={f.id} className="p-3.5 rounded-[24px] bg-amber-50/40 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                            <Icon size={15} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {f.name}
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                {f.category}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {f.count.toLocaleString("pt-BR")}
                                        </div>
                                        <Badge variant="orange">Baixo volume</Badge>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </DashboardSectionCard>
            </div>

            {/* Complete Ranking Table & Progress Bars - Using DashboardSectionCard */}
            <DashboardSectionCard
                title="Ranking Geral de Volume por Módulo"
                icon={TagIcon}
                className="mb-0"
            >
                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-6">
                    Volume total de registros e ações geradas no período selecionado
                </p>

                <div className="flex flex-col gap-5">
                    {featuresRanked.map((item: FeatureUsageMetric, index: number) => {
                        const Icon = getIconComponent(item.iconName)
                        const pct = Math.max(4, Math.round((item.count / maxCount) * 100))

                        return (
                            <div key={item.id} className="flex flex-col gap-2">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-xs font-mono font-bold text-brand-inactive-text w-5">
                                            #{index + 1}
                                        </span>
                                        <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                            <Icon size={13} />
                                        </div>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {item.name}
                                        </span>
                                        <Badge variant="gray" className="text-[10px] hidden sm:inline-flex">
                                            {item.category}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body hidden sm:inline">
                                            {item.activeBusinessesCount > 0 ? `${item.activeBusinessesCount} lojas ativas` : ""}
                                        </span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading tabular-nums">
                                            {item.count.toLocaleString("pt-BR")}
                                        </span>
                                    </div>
                                </div>

                                <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-brand-green rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </DashboardSectionCard>
        </div>
    )
}