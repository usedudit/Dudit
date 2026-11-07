"use client"

import React from "react"
import {
    Users,
    TrendingUpIcon,
    UserIcon,
    CalendarIcon,
    RepeatIcon,
} from "@/lib/icons"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { AnalyticsChartCard } from "../AnalyticsChartCard"
import type { UserAnalyticsData } from "@/app/actions/admin/analytics"
import { DashboardLineChart, DashboardDonutChart } from "@/components/erp/dashboard/charts/DashboardCharts"

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
            trend: `${totalUsers > 0 ? ((newSignups / totalUsers) * 100).toFixed(1) : 0}% novos`,
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
            trend: `${totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0}% da base`,
            subtext: "Interagiram com lojas, pedidos ou perfil",
            icon: UserIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
        {
            title: "Taxa de Retorno",
            value: `${retentionRate}%`,
            trend: `${retentionRate}%`,
            subtext: `${retainedUsers.toLocaleString("pt-BR")} usuários recorrentes`,
            icon: RepeatIcon,
            iconBg: "bg-brand-green-light dark:bg-dark-border/40",
            iconColor: "text-brand-dark dark:text-dark-heading",
        },
    ]

    const retentionData = [
        { label: "Retidos", value: retainedUsers, fill: "#79c325" },
        { label: "Não retidos", value: Math.max(totalUsers - retainedUsers, 0), fill: "#94a3b8" },
    ]

    const engagementData = [
        { label: "Ativos", value: activeUsers, fill: "#79c325" },
        { label: "Inativos", value: Math.max(totalUsers - activeUsers, 0), fill: "#94a3b8" },
    ]

    return (
        <div className="flex flex-col gap-6">
            {/* Top Metric Cards */}
            <HorizontalKPICard items={kpiItems} />

            {/* Timeline Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-12">
                    <AnalyticsChartCard
                        title="Evolução de Novos Cadastros e Usuários Ativos"
                        subtitle="Novos cadastros diários vs usuários ativos diários"
                        icon={CalendarIcon}
                        legendItems={[
                            { label: "Novos cadastros", color: "#79c325" },
                            { label: "Usuários ativos", color: "#94a3b8" },
                        ]}
                    >
                        <DashboardLineChart
                            data={chartPoints}
                            colors={["#79c325", "#94a3b8"]}
                            height="h-[300px]"
                            legendLabels={{ value: "Novos cadastros", secondary: "Usuários ativos" }}
                        />
                    </AnalyticsChartCard>
                </div>
            </div>

            {/* Retention & Engagement Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
                <div className="lg:col-span-6">
                    <AnalyticsChartCard
                        title="Comportamento de Retenção & Fidelização"
                        subtitle={`${retentionRate}% da base retornou no período`}
                        icon={RepeatIcon}
                    >
                        <DashboardDonutChart
                            data={retentionData}
                            totalValue={totalUsers.toLocaleString("pt-BR")}
                            totalLabel="Usuários"
                            format="number"
                        />
                    </AnalyticsChartCard>
                </div>

                <div className="lg:col-span-6">
                    <AnalyticsChartCard
                        title="Engajamento da Base"
                        subtitle={`${activeUsers.toLocaleString("pt-BR")} usuários ativos no período`}
                        icon={UserIcon}
                    >
                        <DashboardDonutChart
                            data={engagementData}
                            totalValue={totalUsers.toLocaleString("pt-BR")}
                            totalLabel="Base total"
                            format="number"
                        />
                    </AnalyticsChartCard>
                </div>
            </div>
        </div>
    )
}