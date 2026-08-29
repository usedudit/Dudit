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

    return (
        <div className="space-y-8">
            {/* Header Banner */}
            <div className="p-6 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                        <TrendingUpIcon className="text-brand-green" size={22} /> Adoção & Uso de Funcionalidades do Ecossistema
                    </h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Mapeamento das ferramentas mais e menos utilizadas pelos parceiros para direcionar melhorias e suporte.
                    </p>
                </div>
                <Badge variant="green" className="self-start md:self-auto py-1 px-3">
                    {totalPlatformInteractions.toLocaleString("pt-BR")} Interações Totais
                </Badge>
            </div>

            {/* Top Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Mais Utilizadas */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-green-200 dark:border-green-900/30 p-6">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold mb-4 text-base">
                        <CheckCircleIcon size={20} /> 🔥 Funcionalidades Campeãs de Uso
                    </div>
                    <div className="space-y-3">
                        {mostUsedFeatures.map((f: FeatureUsageMetric, index: number) => {
                            const Icon = getIconComponent(f.iconName)
                            return (
                                <div key={f.id} className="p-3.5 rounded-xl bg-green-50/50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-brand-green flex items-center justify-center font-bold text-xs">
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
                </div>

                {/* Menos Utilizadas / Oportunidades */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-amber-200 dark:border-amber-900/30 p-6">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold mb-4 text-base">
                        <AlertCircleIcon size={20} /> 💡 Subutilizadas / Oportunidades de Adoção
                    </div>
                    <div className="space-y-3">
                        {leastUsedFeatures.map((f: FeatureUsageMetric) => {
                            const Icon = getIconComponent(f.iconName)
                            return (
                                <div key={f.id} className="p-3.5 rounded-xl bg-amber-50/40 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
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
                </div>
            </div>

            {/* Complete Ranking Table & Progress Bars */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                <h3 className="font-bold text-brand-dark dark:text-dark-heading text-base mb-1">
                    Ranking Geral de Volume por Módulo
                </h3>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-6">
                    Volume total de registros e ações geradas no período selecionado
                </p>

                <div className="space-y-5">
                    {featuresRanked.map((item: FeatureUsageMetric, index: number) => {
                        const Icon = getIconComponent(item.iconName)
                        const pct = Math.max(4, Math.round((item.count / maxCount) * 100))

                        return (
                            <div key={item.id} className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-xs font-mono font-bold text-brand-inactive-text w-5">
                                            #{index + 1}
                                        </span>
                                        <div className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-brand-dark dark:text-dark-heading">
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
            </div>
        </div>
    )
}
