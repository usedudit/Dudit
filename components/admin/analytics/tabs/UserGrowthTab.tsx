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
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
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

    const kpiItems = [
        {
            title: "Total de Usuários",
            value: totalUsers.toLocaleString("pt-BR"),
            trend: "Base Total",
            subtext: "Perfis cadastrados na plataforma",
            icon: Users,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Novos Cadastros",
            value: `+${newSignups.toLocaleString("pt-BR")}`,
            trend: `${newSignupsChange >= 0 ? "+" : ""}${newSignupsChange}% vs anterior`,
            subtext: "Contas criadas no período selecionado",
            icon: TrendingUpIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Usuários Ativos",
            value: activeUsers.toLocaleString("pt-BR"),
            trend: "Atividade",
            subtext: "Interagiram com lojas, pedidos ou perfil",
            icon: UserIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Taxa de Retorno",
            value: `${retentionRate}%`,
            trend: "Recorrência",
            subtext: `${retainedUsers.toLocaleString("pt-BR")} usuários recorrentes`,
            icon: RepeatIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
    ]

    return (
        <div className="flex flex-col gap-6">
            {/* Top Metric Cards - Using HorizontalKPICard from ERP */}
            <HorizontalKPICard items={kpiItems} />

            {/* Timeline Chart */}
            <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border p-6">
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
                <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border p-6">
                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                        Comportamento de Retenção & Fidelização
                    </h4>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                        A taxa de retorno mede os clientes cadastrados que voltam à Dudit para pesquisar, contatar lojas, agendar ou comprar.
                    </p>
                    <div className="flex flex-col gap-3">
                        <div className="p-3 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Retenção D7 (7 dias após cadastro)</span>
                            <span className="text-sm font-bold text-brand-green">~64%</span>
                        </div>
                        <div className="p-3 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Retenção D30 (30 dias após cadastro)</span>
                            <span className="text-sm font-bold text-brand-green">~48%</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border p-6">
                    <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-2">
                        Engajamento da Base
                    </h4>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-4">
                        Distribuição dos usuários ativos por tipo de interação na plataforma:
                    </p>
                    <div className="flex flex-col gap-3">
                        <div className="p-3 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Buscas & Descoberta Local</span>
                            <Badge variant="blue">Principal Canal (78%)</Badge>
                        </div>
                        <div className="p-3 rounded-[24px] bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">Contatos Diretos no WhatsApp</span>
                            <Badge variant="green">Alta Conversão (62%)</Badge>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
