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
import type { MarketplaceDemandMetrics, ZeroResultTerm } from "@/lib/services/analytics.service"
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

    // Filter terms in search box
    const filteredZeroTerms = topZeroResultTerms.filter(t =>
        t.term.toLowerCase().includes(searchTermFilter.toLowerCase()) ||
        (t.suggestedCategory && t.suggestedCategory.toLowerCase().includes(searchTermFilter.toLowerCase()))
    )

    // Chart points
    const lineChartData = dailyTimeline.map(item => ({
        label: item.date.slice(5), // MM-DD
        value: item.totalSearches,
        secondary: item.withResults,
    }))

    return (
        <div className="space-y-8">
            {/* Header / City Banner */}
            <div className="p-6 rounded-2xl bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                        <SearchIcon className="text-brand-green" size={22} /> Inteligência de Buscas & Demanda do Marketplace
                    </h2>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                        Métricas de buscas na cidade, conversão em contatos/pedidos e diagnóstico das demandas reprimidas (buscas sem resultado).
                    </p>
                </div>
            </div>

            {/* 8 Core Metrics Grid (Exact user requested layout) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {/* 1. 🔎 Buscas */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <SearchIcon size={20} />
                        </div>
                        <Badge variant="blue">🔎 Total de Buscas</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Buscas
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {totalSearches.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Pesquisas realizadas no marketplace
                    </p>
                </div>

                {/* 2. ✅ Buscas com resultado */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-green-200 dark:border-green-900/30 transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 flex items-center justify-center">
                            <CheckCircleIcon size={20} />
                        </div>
                        <Badge variant="green">{successRate}% atendidas</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Buscas com resultado
                    </h3>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {searchesWithResults.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Encontraram produtos, serviços ou lojas
                    </p>
                </div>

                {/* 3. ❌ Buscas sem resultado */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-red-200 dark:border-red-900/30 bg-red-50/20 dark:bg-red-900/5 transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
                            <AlertCircleIcon size={20} />
                        </div>
                        <Badge variant="red">{zeroRate}% sem resultado</Badge>
                    </div>
                    <h3 className="text-red-700 dark:text-red-400 text-sm font-semibold mb-1">
                        Buscas sem resultado
                    </h3>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {searchesWithoutResults.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-2 font-medium">
                        Demanda não atendida pelo comércio atual
                    </p>
                </div>

                {/* 4. 📞 Contatos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-brand-green flex items-center justify-center">
                            <PhoneIcon size={20} />
                        </div>
                        <Badge variant="green">Conversão</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Contatos
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {contactClicks.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Cliques em WhatsApp ou telefone da loja
                    </p>
                </div>

                {/* 5. 📅 Agendamentos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <CalendarIcon size={20} />
                        </div>
                        <Badge variant="purple">Serviços</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Agendamentos
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {appointmentsCount.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Horários agendados em prestadores
                    </p>
                </div>

                {/* 6. 🛒 Pedidos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <ShoppingCartIcon size={20} />
                        </div>
                        <Badge variant="orange">Vendas</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Pedidos
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {ordersCount.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Pedidos concluídos no marketplace
                    </p>
                </div>

                {/* 7. 🏪 Negócios ativos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <StoreIcon size={20} />
                        </div>
                        <Badge variant="gray">Catálogo Ativo</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Negócios ativos
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {activeBusinessesCount.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Lojas e prestadores com vitrine ativa
                    </p>
                </div>

                {/* 8. 🧑‍💼 Negócios que receberam demanda */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-teal-200 dark:border-teal-900/30 transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                            <BriefcaseIcon size={20} />
                        </div>
                        <Badge variant="green">{demandBusinessRate}% do total</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Negócios com demanda
                    </h3>
                    <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">
                        {businessesWithDemandCount.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Receberam pedidos, contatos ou agendamentos
                    </p>
                </div>
            </div>

            {/* Strategic Diagnostic Callout: "O que as pessoas estavam procurando?" */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-red-200 dark:border-red-900/30 overflow-hidden shadow-sm">
                <div className="bg-red-50/80 dark:bg-red-900/20 px-6 py-4 border-b border-red-100 dark:border-red-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                            <AlertCircleIcon size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-red-900 dark:text-red-300 text-base">
                                O que as {searchesWithoutResults.toLocaleString("pt-BR")} pessoas estavam procurando?
                            </h3>
                            <p className="text-xs text-red-700 dark:text-red-400">
                                Diagnóstico exato do que a cidade quer da Dudit. Use esses dados para prospecção de novos parceiros comerciais.
                            </p>
                        </div>
                    </div>
                    <Badge variant="red" className="self-start sm:self-auto py-1 px-3">
                        {topZeroResultTerms.length} Oportunidades Identificadas
                    </Badge>
                </div>

                <div className="p-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                        <div className="w-full sm:max-w-md">
                            <Input
                                placeholder="Filtrar termos ou categorias..."
                                value={searchTermFilter}
                                onChange={(e) => setSearchTermFilter(e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Ordenado por maior volume de buscas não atendidas
                        </div>
                    </div>

                    {filteredZeroTerms.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredZeroTerms.map((item: ZeroResultTerm, index: number) => {
                                const isTopDemand = index < 3
                                return (
                                    <div
                                        key={index}
                                        className={`p-4 rounded-xl border transition-all ${
                                            isTopDemand
                                                ? "bg-red-50/40 dark:bg-red-900/10 border-red-200 dark:border-red-900/30"
                                                : "bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="font-bold text-brand-dark dark:text-dark-heading text-sm capitalize">
                                                "{item.term}"
                                            </div>
                                            <Badge variant={isTopDemand ? "red" : "gray"}>
                                                {item.count} buscas
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
                        <div className="p-8 text-center bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-dashed border-brand-border dark:border-dark-border">
                            <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">
                                Nenhuma busca sem resultado encontrada para o filtro atual
                            </p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">
                                Isso significa que quase todas as buscas dos clientes estão encontrando produtos ou serviços parceiros!
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Timeline Chart */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                            Evolução Diária de Buscas & Conversão
                        </h3>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Acompanhamento do volume total de buscas vs buscas atendidas no período
                        </p>
                    </div>
                </div>

                <div className="h-[280px] w-full">
                    <DashboardLineChart
                        data={lineChartData}
                        colors={["#059669", "#94a3b8"]}
                        height="h-[280px]"
                        showLegend={true}
                    />
                </div>
            </div>
        </div>
    )
}
