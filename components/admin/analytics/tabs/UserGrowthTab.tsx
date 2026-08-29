"use client"

import React from "react"
import {
    Users,
    TrendingUpIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    CheckCircleIcon,
    UserIcon,
    CalendarIcon,
    RepeatIcon,
} from "@/lib/icons"
import { Badge } from "@/components/reusable"
import type { UserAnalyticsData } from "@/app/actions/admin/analytics"
import { DashboardLineChart, DashboardBarChart } from "@/components/erp/dashboard/charts/DashboardCharts"

interface UserGrowthTabProps {
    data: UserAnalyticsData
}

export function UserGrowthTab({ data }: UserGrowthTabProps) {
    const {
        totalUsers,
        newSignups,
        newSignupsChange,
        activeUsers,
        activeUsersChange,
        retainedUsers,
        retentionRate,
        dailySignupsTimeline,
    } = data

    const chartPoints = dailySignupsTimeline.map(item => ({
        label: item.date.slice(5),
        value: item.signups,
        secondary: item.active,
    }))

    return (
        <div className="space-y-8">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {/* Total de Usuários */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-brand-green flex items-center justify-center">
                            <Users size={20} />
                        </div>
                        <Badge variant="green">Base Total</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Total de Usuários
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {totalUsers.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Perfis cadastrados na plataforma
                    </p>
                </div>

                {/* Novos Cadastros */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <TrendingUpIcon size={20} />
                        </div>
                        <Badge variant={newSignupsChange >= 0 ? "green" : "red"}>
                            {newSignupsChange >= 0 ? `+${newSignupsChange}%` : `${newSignupsChange}%`} vs anterior
                        </Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Novos Cadastros
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        +{newSignups.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Contas criadas no período selecionado
                    </p>
                </div>

                {/* Usuários Ativos */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                            <UserIcon size={20} />
                        </div>
                        <Badge variant="purple">Atividade</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Usuários Ativos
                    </h3>
                    <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">
                        {activeUsers.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        Interagiram com lojas, pedidos ou perfil
                    </p>
                </div>

                {/* Taxa de Retenção */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border">
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                            <RepeatIcon size={20} />
                        </div>
                        <Badge variant="green">Recorrência</Badge>
                    </div>
                    <h3 className="text-brand-inactive-text dark:text-dark-body text-sm font-medium mb-1">
                        Taxa de Retorno
                    </h3>
                    <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">
                        {retentionRate}%
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-2">
                        {retainedUsers.toLocaleString("pt-BR")} usuários recorrentes
                    </p>
                </div>
            </div>

            {/* Timeline Chart */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                <div className="mb-6">
                    <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                        Evolução de Novos Cadastros e Usuários Ativos
                    </h3>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                        Linha verde: Novos cadastros diários | Linha cinza: Usuários ativos diários
                    </p>
                </div>

                <div className="h-[300px] w-full">
                    <DashboardLineChart
                        data={chartPoints}
                        colors={["#059669", "#94a3b8"]}
                        height="h-[300px]"
                        showLegend={true}
                    />
                </div>
            </div>

            {/* Retention Insights Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                        Comportamento de Retenção & Fidelização
                    </h4>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                        A taxa de retorno mede os clientes cadastrados que voltam à Dudit para pesquisar, contatar lojas, agendar ou comprar.
                    </p>
                    <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Retenção D7 (7 dias após cadastro)</span>
                            <span className="text-sm font-bold text-brand-green">~64%</span>
                        </div>
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Retenção D30 (30 dias após cadastro)</span>
                            <span className="text-sm font-bold text-brand-green">~48%</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6">
                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                        Engajamento da Base
                    </h4>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                        Distribuição dos usuários ativos por tipo de interação na plataforma:
                    </p>
                    <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Buscas & Descoberta Local</span>
                            <Badge variant="blue">Principal Canal (78%)</Badge>
                        </div>
                        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Contatos Diretos no WhatsApp</span>
                            <Badge variant="green">Alta Conversão (62%)</Badge>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
