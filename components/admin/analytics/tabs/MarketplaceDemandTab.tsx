"use client"

import React, { useState } from "react"
import {
    SearchIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    PhoneIcon,
    CalendarIcon,
    ShoppingCartIcon,
    StoreIcon,
    Users,
    TagIcon,
    SparklesIcon,
    BriefcaseIcon,
    ArrowUpIcon,
    FilterIcon,
} from "@/lib/icons"
import { Badge, Button, Input } from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { DashboardSectionCard } from "@/components/erp/dashboard/cards/DashboardSectionCard"
import type { MarketplaceDemandMetrics, ZeroResultTerm } from "@/lib/types/analytics"
import { isBotSearch } from "@/lib/search/bot-detection"
import { DashboardLineChart, DashboardBarChart } from "@/components/erp/dashboard/charts/DashboardCharts"

interface MarketplaceDemandTabProps {
    data: MarketplaceDemandMetrics
    selectedCity?: string | null
    onSelectCity?: (city: string | null) => void
}

export function MarketplaceDemandTab({ data, selectedCity, onSelectCity }: MarketplaceDemandTabProps) {
    const [searchTermFilter, setSearchTermFilter] = useState("")

    const {
        totalSearches,
        searchesWithResults,
        searchesWithoutResults,
        contactClicks,
        appointmentsCount,
        ordersCount,
        activeBusinessesCount,
        businessesWithDemandCount,
        topZeroResultTerms,
        dailyTimeline,
    } = data

    const zeroRate = totalSearches > 0 ? Number(((searchesWithoutResults / totalSearches) * 100).toFixed(1)) : 0
    const successRate = totalSearches > 0 ? Number(((searchesWithResults / totalSearches) * 100).toFixed(1)) : 100
    const demandBusinessRate = activeBusinessesCount > 0 ? Number(((businessesWithDemandCount / activeBusinessesCount) * 100).toFixed(1)) : 0

    const filteredZeroTerms = topZeroResultTerms.filter(t =>
        !isBotSearch(t.term) &&
        (t.term.toLowerCase().includes(searchTermFilter.toLowerCase()) ||
        (t.suggestedCategory && t.suggestedCategory.toLowerCase().includes(searchTermFilter.toLowerCase())))
    )

    const lineChartData = dailyTimeline.map(item => ({
        label: item.date.slice(5),
        value: item.totalSearches,
        secondary: item.withResults,
    }))

    const kpiItems = [
        {
            title: "Buscas",
            value: totalSearches.toLocaleString("pt-BR"),
            trend: `${successRate}% atendidas`,
            subtext: "Pesquisas realizadas no marketplace",
            icon: SearchIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Buscas com resultado",
            value: searchesWithResults.toLocaleString("pt-BR"),
            trend: `${successRate}% atendidas`,
            subtext: "Encontraram produtos, serviços ou lojas",
            icon: CheckCircleIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Buscas sem resultado",
            value: searchesWithoutResults.toLocaleString("pt-BR"),
            trend: `${zeroRate}% sem resultado`,
            subtext: "Demanda não atendida pelo comércio atual",
            icon: AlertCircleIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Contatos",
            value: contactClicks.toLocaleString("pt-BR"),
            trend: "Conversão",
            subtext: "Cliques em WhatsApp ou telefone da loja",
            icon: PhoneIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
    ]

    return (
        <div className="flex flex-col gap-6">
            {/* Header - Using DashboardSectionCard */}
            <DashboardSectionCard
                title="Inteligência de Buscas & Demanda do Marketplace"
                icon={SearchIcon}
                className="mb-0"
            >
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    Métricas de buscas na cidade, conversão em contatos/pedidos e diagnóstico das demandas reprimidas (buscas sem resultado).
                </p>
            </DashboardSectionCard>

            {/* Top KPI Cards */}
            <HorizontalKPICard items={kpiItems} />

            {/* Secondary Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <DashboardSectionCard
                    title="Agendamentos"
                    icon={CalendarIcon}
                    action={<Badge variant="purple">Serviços</Badge>}
                    className="mb-0 p-6"
                >
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">Agendamentos</h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{appointmentsCount.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">Horários agendados em prestadores</p>
                </DashboardSectionCard>

                <DashboardSectionCard
                    title="Pedidos"
                    icon={ShoppingCartIcon}
                    action={<Badge variant="orange">Vendas</Badge>}
                    className="mb-0 p-6"
                >
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">Pedidos</h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{ordersCount.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">Pedidos concluídos no marketplace</p>
                </DashboardSectionCard>

                <DashboardSectionCard
                    title="Negócios ativos"
                    icon={StoreIcon}
                    action={<Badge variant="gray">Catálogo Ativo</Badge>}
                    className="mb-0 p-6"
                >
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">Negócios ativos</h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{activeBusinessesCount.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">Lojas e prestadores com vitrine ativa</p>
                </DashboardSectionCard>

                <DashboardSectionCard
                    title="Negócios com demanda"
                    icon={BriefcaseIcon}
                    action={<Badge variant="green">{demandBusinessRate}% do total</Badge>}
                    className="mb-0 p-6"
                >
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">Negócios com demanda</h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{businessesWithDemandCount.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">Receberam pedidos, contatos ou agendamentos</p>
                </DashboardSectionCard>
            </div>

            {/* Strategic Diagnostic - Using DashboardSectionCard */}
            <DashboardSectionCard
                title="Demandas Cadastradas pelos Clientes"
                icon={AlertCircleIcon}
                action={
                    <Badge variant="red" className="py-1 px-3">
                        {topZeroResultTerms.length} {topZeroResultTerms.length === 1 ? "Demanda Registrada" : "Demandas Registradas"}
                    </Badge>
                }
                className="mb-0 border-red-200 dark:border-red-900/30 shadow-sm bg-red-50/30 dark:bg-red-900/10"
            >
                <p className="text-xs text-red-700 dark:text-red-400 mb-6">
                    Diagnóstico das demandas que os clientes informaram na plataforma através do "Estou procurando isso".
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                    <div className="w-full sm:max-w-md">
                        <Input
                            placeholder="Filtrar demandas ou categorias..."
                            value={searchTermFilter}
                            onChange={(e) => setSearchTermFilter(e.target.value)}
                            className="w-full"
                        />
                    </div>
                    <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                        Ordenado por maior volume de solicitações
                    </div>
                </div>

                {filteredZeroTerms.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredZeroTerms.map((item: ZeroResultTerm, index: number) => {
                            const isTopDemand = index < 3
                            return (
                                <div
                                    key={index}
                                    className={`p-4 rounded-[24px] border transition-all ${
                                        isTopDemand
                                            ? "bg-red-50/40 dark:bg-red-900/10 border-red-200 dark:border-red-900/30"
                                            : "bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex flex-col gap-1 min-w-0">
                                            <div className="font-bold text-brand-dark dark:text-dark-heading text-sm capitalize truncate">
                                                "{item.term}"
                                            </div>
                                            {item.demandType && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <Badge
                                                        variant={
                                                            item.demandType.includes("comprar")
                                                                ? "orange"
                                                                : item.demandType.includes("contratar")
                                                                    ? "purple"
                                                                    : "blue"
                                                        }
                                                        className="text-[11px] py-0.5 px-2"
                                                    >
                                                        {item.demandType}
                                                    </Badge>
                                                </div>
                                            )}
                                        </div>
                                        <Badge variant={isTopDemand ? "red" : "gray"} className="shrink-0">
                                            {item.count} {item.count === 1 ? "demanda" : "demandas"}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                                        <TagIcon size={12} className="text-brand-green" />
                                        <span>Categoria: <strong className="text-brand-dark dark:text-dark-heading">{item.suggestedCategory || "Geral"}</strong></span>
                                    </div>
                                    <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                            <SparklesIcon size={12} /> Alta oportunidade comercial
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="p-8 text-center bg-gray-50 dark:bg-gray-900/30 rounded-[24px] border border-dashed border-brand-border dark:border-dark-border">
                        <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                            Nenhuma demanda registrada para o filtro atual
                        </p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                            Quando os clientes procurarem algo e preencherem o formulário "Estou procurando isso", as solicitações aparecerão aqui.
                        </p>
                    </div>
                )}
            </DashboardSectionCard>

            {/* Timeline Chart - Using DashboardSectionCard */}
            <DashboardSectionCard
                title="Evolução Diária de Buscas & Conversão"
                icon={CalendarIcon}
                className="mb-0"
            >
                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-6">
                    Acompanhamento do volume total de buscas vs buscas atendidas no período
                </p>
                <div className="h-[280px] w-full">
                    <DashboardLineChart
                        data={lineChartData}
                        colors={["#059669", "#94a3b8"]}
                        height="h-[280px]"
                        showLegend={true}
                    />
                </div>
            </DashboardSectionCard>
        </div>
    )
}