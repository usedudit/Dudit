"use client"

import React from "react"
import {
    Users,
    BriefcaseIcon,
    SearchIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    PhoneIcon,
    CalendarIcon,
    ShoppingCartIcon,
    TrendingUpIcon,
    StoreIcon,
    ArrowRightIcon,
    CrownIcon,
    TagIcon,
} from "@/lib/icons"
import { Badge, Button } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import type { OverviewAnalyticsData } from "@/app/actions/admin/analytics"

interface OverviewTabProps {
    data: OverviewAnalyticsData
    onNavigateTab: (tabId: string) => void
}

export function OverviewTab({ data, onNavigateTab }: OverviewTabProps) {
    const { userStats, partnerStats, marketplaceStats, plansStats, topOpportunities } = data

    const kpiItems = [
        {
            title: "Total de Usuários",
            value: userStats.total.toLocaleString("pt-BR"),
            trend: `+${userStats.newPeriod} no período`,
            subtext: `${userStats.activePeriod} ativos | ${userStats.retentionRate}% retenção`,
            icon: Users,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Parceiros Cadastrados",
            value: partnerStats.total.toLocaleString("pt-BR"),
            trend: `+${partnerStats.newPeriod} novos`,
            subtext: `${partnerStats.totalStores} lojas ativas | ${partnerStats.withDemand} c/ demanda`,
            icon: BriefcaseIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Buscas no Marketplace",
            value: marketplaceStats.totalSearches.toLocaleString("pt-BR"),
            trend: `${marketplaceStats.zeroResultsRate}% sem resultado`,
            subtext: `${marketplaceStats.searchesWithResults} atendidas | ${marketplaceStats.searchesWithoutResults} s/ resultado`,
            icon: SearchIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Upgrades / Downgrades",
            value: `+${plansStats.upgrades} / -${plansStats.downgrades}`,
            trend: `${plansStats.cancellations} cancelamentos`,
            subtext: "Planos SaaS",
            icon: CrownIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
    ]

    return (
        <div className="flex flex-col gap-6">
            {/* Header Description */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/20 dark:via-emerald-500/5 dark:to-transparent p-5 rounded-[24px] border border-emerald-500/20">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-brand-green/20 text-brand-green flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                        <TrendingUpIcon size={20} />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Painel Executivo de Saúde da Dudit
                        </h2>
                        <p className="text-xs sm:text-sm text-brand-inactive-text dark:text-dark-body">
                            Consolidado de crescimento de usuários, atividade de parceiros e inteligência de demanda do marketplace.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="green" className="py-1 px-3">
                        Período: {data.periodRange.label}
                    </Badge>
                </div>
            </div>

            {/* Top KPI Cards - Using HorizontalKPICard from ERP */}
            <HorizontalKPICard items={kpiItems} />

            {/* Middle Section: Demand Funnel & Market Opportunities */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Funil de Demanda da Plataforma */}
                <div className="lg:col-span-8 bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border overflow-hidden">
                    <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-brand-dark dark:text-dark-heading">
                                Funil de Demanda do Marketplace
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Da intenção de compra até a conversão em contato, agendamento ou pedido
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            className="text-xs text-brand-green font-semibold"
                            onClick={() => onNavigateTab("demanda")}
                        >
                            Ver Detalhes <ArrowRightIcon size={14} className="ml-1" />
                        </Button>
                    </div>

                    <div className="p-6 flex flex-col gap-4">
                        {/* Step 1: Buscas */}
                        <div className="p-4 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-brand-green flex items-center justify-center font-bold text-xs">
                                    1
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        <SearchIcon size={15} /> Buscas no Marketplace
                                    </div>
                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Intenção de compra por moradores locais
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    {marketplaceStats.totalSearches.toLocaleString("pt-BR")}
                                </div>
                                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                    {marketplaceStats.searchesWithResults} com resultados ({100 - marketplaceStats.zeroResultsRate}%)
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Cliques em Contato */}
                        <div className="p-4 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                                    2
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        <PhoneIcon size={15} /> Contatos Iniciados (WhatsApp / Telefone)
                                    </div>
                                    <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Clientes que clicaram para conversar direto com o lojista
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    {marketplaceStats.contactClicks.toLocaleString("pt-BR")}
                                </div>
                                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    Leads diretos entregues
                                </div>
                            </div>
                        </div>

                        {/* Step 3: Agendamentos & Pedidos */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-2 text-xs font-bold text-brand-dark dark:text-dark-heading mb-1">
                                    <CalendarIcon size={14} className="text-purple-500" /> Agendamentos
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                    {marketplaceStats.appointmentsCount.toLocaleString("pt-BR")}
                                </div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                    Serviços agendados na plataforma
                                </div>
                            </div>

                            <div className="p-4 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-2 text-xs font-bold text-brand-dark dark:text-dark-heading mb-1">
                                    <ShoppingCartIcon size={14} className="text-emerald-500" /> Pedidos
                                </div>
                                <div className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                                    {marketplaceStats.ordersCount.toLocaleString("pt-BR")}
                                </div>
                                <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                    Pedidos concluídos pelo sistema
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Demanda Reprimida ("O que a cidade quer?") */}
                <div className="lg:col-span-4 bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border overflow-hidden flex flex-col justify-between">
                    <div>
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading">
                                    O que a Cidade Quer
                                </h3>
                            </div>
                            <Badge variant="red">Demandas Registradas</Badge>
                        </div>

                        <div className="p-6">
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                                Demandas que os clientes cadastraram na Dudit procurando produtos, serviços ou lojas:
                            </p>

                            {topOpportunities.length > 0 ? (
                                <div className="flex flex-col gap-3">
                                    {topOpportunities.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="p-3 rounded-[24px] bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 flex items-center justify-between"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">
                                                        {item.term}
                                                    </div>
                                                    {item.demandType && (
                                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                                            item.demandType === 'contratar'
                                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                                                                : item.demandType === 'loja'
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                                        }`}>
                                                            {item.demandType === 'contratar' ? 'Contratar' : item.demandType === 'loja' ? 'Loja' : 'Comprar'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                    Categoria sugerida: <span className="font-medium text-brand-dark dark:text-dark-heading">{item.suggestedCategory || "Geral"}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <Badge variant="red">{item.count} {item.count === 1 ? 'demanda' : 'demandas'}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center text-xs text-brand-inactive-text dark:text-dark-body">
                                    Nenhuma demanda registrada recentemente.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 pt-0 border-t border-brand-border/40 dark:border-dark-border/40 mt-auto">
                        <Button
                            variant="outline"
                            className="w-full text-xs font-semibold mt-4"
                            onClick={() => onNavigateTab("demanda")}
                        >
                            Ver Todas as Demandas da Cidade <ArrowRightIcon size={14} className="ml-1" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
