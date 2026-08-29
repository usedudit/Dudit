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
import type { OverviewAnalyticsData } from "@/app/actions/admin/analytics"

interface OverviewTabProps {
    data: OverviewAnalyticsData
    onNavigateTab: (tabId: string) => void
}

export function OverviewTab({ data, onNavigateTab }: OverviewTabProps) {
    const { userStats, partnerStats, marketplaceStats, plansStats, topOpportunities } = data

    return (
        <div className="space-y-8">
            {/* Header Description */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/20 dark:via-emerald-500/5 dark:to-transparent p-5 rounded-2xl border border-emerald-500/20">
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-brand-green/20 text-brand-green flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
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

            {/* Top KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {/* 1. Cadastros de Usuários */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-brand-green flex items-center justify-center">
                            <Users size={20} />
                        </div>
                        <Badge variant="green">+{userStats.newPeriod} no período</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Total de Usuários
                    </h3>
                    <p className="text-2xl sm:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {userStats.total.toLocaleString("pt-BR")}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-brand-inactive-text dark:text-dark-body pt-3 border-t border-gray-100 dark:border-gray-800">
                        <span>{userStats.activePeriod} ativos</span>
                        <span className="font-semibold text-brand-green">{userStats.retentionRate}% retenção</span>
                    </div>
                </div>

                {/* 2. Parceiros & Lojas */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <BriefcaseIcon size={20} />
                        </div>
                        <Badge variant="blue">+{partnerStats.newPeriod} novos</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Parceiros Cadastrados
                    </h3>
                    <p className="text-2xl sm:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {partnerStats.total.toLocaleString("pt-BR")}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-brand-inactive-text dark:text-dark-body pt-3 border-t border-gray-100 dark:border-gray-800">
                        <span>{partnerStats.totalStores} lojas ativas</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">{partnerStats.withDemand} c/ demanda</span>
                    </div>
                </div>

                {/* 3. Buscas no Marketplace */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <SearchIcon size={20} />
                        </div>
                        <Badge variant={marketplaceStats.zeroResultsRate > 30 ? "orange" : "gray"}>
                            {marketplaceStats.zeroResultsRate}% sem resultado
                        </Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Buscas no Marketplace
                    </h3>
                    <p className="text-2xl sm:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {marketplaceStats.totalSearches.toLocaleString("pt-BR")}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-brand-inactive-text dark:text-dark-body pt-3 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {marketplaceStats.searchesWithResults} atendidas
                        </span>
                        <span className="text-red-500 font-medium">
                            {marketplaceStats.searchesWithoutResults} s/ resultado
                        </span>
                    </div>
                </div>

                {/* 4. Mudanças de Planos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border transition-all hover:shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <CrownIcon size={20} />
                        </div>
                        <Badge variant="purple">Planos SaaS</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Upgrades / Downgrades
                    </h3>
                    <p className="text-2xl sm:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        +{plansStats.upgrades} <span className="text-sm font-normal text-brand-inactive-text">/ -{plansStats.downgrades}</span>
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-brand-inactive-text dark:text-dark-body pt-3 border-t border-gray-100 dark:border-gray-800">
                        <span>{plansStats.cancellations} cancelamentos</span>
                        <Button
                            variant="ghost"
                            className="p-0 h-auto text-xs text-brand-green font-semibold hover:underline"
                            onClick={() => onNavigateTab("parceiros")}
                        >
                            Ver motivos
                        </Button>
                    </div>
                </div>
            </div>

            {/* Middle Section: Demand Funnel & Market Opportunities */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Funil de Demanda da Plataforma */}
                <div className="lg:col-span-2 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
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

                    <div className="p-6 space-y-4">
                        {/* Step 1: Buscas */}
                        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-brand-green flex items-center justify-center font-bold text-xs">
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
                        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
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
                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
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

                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
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
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col justify-between">
                    <div>
                        <div className="px-6 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <h3 className="font-bold text-brand-dark dark:text-dark-heading">
                                    O que a Cidade Quer
                                </h3>
                            </div>
                            <Badge variant="red">Demanda s/ Resultado</Badge>
                        </div>

                        <div className="p-6">
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                                Termos que as pessoas pesquisaram na Dudit mas não encontraram lojas parceiras correspondentes:
                            </p>

                            {topOpportunities.length > 0 ? (
                                <div className="space-y-3">
                                    {topOpportunities.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="p-3 rounded-xl bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 flex items-center justify-between"
                                        >
                                            <div>
                                                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">
                                                    {item.term}
                                                </div>
                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                    Categoria sugerida: <span className="font-medium text-brand-dark dark:text-dark-heading">{item.suggestedCategory || "Geral"}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <Badge variant="red">{item.count} buscas</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center text-xs text-brand-inactive-text dark:text-dark-body">
                                    Nenhuma busca com 0 resultados registrada recentemente.
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
                            Ver Todos os Termos da Cidade <ArrowRightIcon size={14} className="ml-1" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
