"use client"

import React, { useState, useTransition, useCallback } from "react"
import {
    AnalyticsIcon,
    SearchIcon,
    Users,
    BriefcaseIcon,
    SparklesIcon,
    ReloadIcon,
    TrendingUpIcon,
    CalendarIcon,
} from "@/lib/icons"
import { Badge, Button } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { OverviewTab } from "./tabs/OverviewTab"
import { MarketplaceDemandTab } from "./tabs/MarketplaceDemandTab"
import { UserGrowthTab } from "./tabs/UserGrowthTab"
import { PartnerPlansTab } from "./tabs/PartnerPlansTab"
import { FeatureUsageTab } from "./tabs/FeatureUsageTab"
import {
    getAdminOverviewAnalyticsAction,
    getUserAnalyticsAction,
    getPartnerAnalyticsAction,
    getFeatureUsageAnalyticsAction,
    getMarketplaceDemandAnalyticsAction,
    type AnalyticsPeriod,
    type OverviewAnalyticsData,
    type UserAnalyticsData,
    type PartnerAnalyticsData,
    type FeatureUsageData,
} from "@/app/actions/admin/analytics"
import type { MarketplaceDemandMetrics } from "@/lib/types/analytics"
import { toast } from "@/hooks/use-notification"

interface AdminAnalyticsDashboardProps {
    initialOverview: OverviewAnalyticsData
    initialUsers: UserAnalyticsData
    initialPartners: PartnerAnalyticsData
    initialFeatures: FeatureUsageData
    initialDemand: MarketplaceDemandMetrics
}

type TabType = "overview" | "demanda" | "usuarios" | "parceiros" | "features"

const PERIOD_OPTIONS: Array<{ id: AnalyticsPeriod; label: string }> = [
    { id: "today", label: "Hoje" },
    { id: "7d", label: "7 dias" },
    { id: "30d", label: "30 dias" },
    { id: "90d", label: "90 dias" },
    { id: "12m", label: "12 meses" },
    { id: "all", label: "Histórico Completo" },
]

export default function AdminAnalyticsDashboard({
    initialOverview,
    initialUsers,
    initialPartners,
    initialFeatures,
    initialDemand,
}: AdminAnalyticsDashboardProps) {
    const [currentTab, setCurrentTab] = useState<TabType>("overview")
    const [period, setPeriod] = useState<AnalyticsPeriod>("30d")
    const [isPending, startTransition] = useTransition()

    // Data State
    const [overviewData, setOverviewData] = useState<OverviewAnalyticsData>(initialOverview)
    const [usersData, setUsersData] = useState<UserAnalyticsData>(initialUsers)
    const [partnersData, setPartnersData] = useState<PartnerAnalyticsData>(initialPartners)
    const [featuresData, setFeaturesData] = useState<FeatureUsageData>(initialFeatures)
    const [demandData, setDemandData] = useState<MarketplaceDemandMetrics>(initialDemand)

    const refreshData = useCallback((selectedPeriod: AnalyticsPeriod) => {
        startTransition(async () => {
            try {
                const [overviewRes, usersRes, partnersRes, featuresRes, demandRes] = await Promise.all([
                    getAdminOverviewAnalyticsAction(selectedPeriod),
                    getUserAnalyticsAction(selectedPeriod),
                    getPartnerAnalyticsAction(selectedPeriod),
                    getFeatureUsageAnalyticsAction(selectedPeriod),
                    getMarketplaceDemandAnalyticsAction(selectedPeriod),
                ])

                setOverviewData(overviewRes)
                setUsersData(usersRes)
                setPartnersData(partnersRes)
                setFeaturesData(featuresRes)
                setDemandData(demandRes)
            } catch (err: any) {
                console.error("[ANALYTICS] Failed to load data:", err)
                toast.error("Erro ao carregar métricas de analytics.")
            }
        })
    }, [])

    const handlePeriodChange = (newPeriod: AnalyticsPeriod) => {
        setPeriod(newPeriod)
        refreshData(newPeriod)
    }

    return (
        <div className="p-6 md:p-8 max-w-[1700px] mx-auto space-y-8">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div>
                    <h1 className="text-[28px] sm:text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mb-2">
                        Analytics da Dudit
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                        Inteligência de demanda da cidade, crescimento de usuários, saúde de parceiros e uso de features.
                    </p>
                </div>

                {/* Period & Refresh Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center p-1 bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border shadow-xs">
                        {PERIOD_OPTIONS.map((opt) => {
                            const isSelected = period === opt.id
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => handlePeriodChange(opt.id)}
                                    disabled={isPending}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                                        isSelected
                                            ? "bg-brand-green text-white shadow-xs"
                                            : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            )
                        })}
                    </div>

                    <Button
                        variant="outline"
                        size="icon"
                        disabled={isPending}
                        onClick={() => refreshData(period)}
                        className="h-9 w-9 rounded-xl shrink-0"
                        aria-label="Atualizar dados"
                    >
                        <ReloadIcon className={`w-4 h-4 ${isPending ? "animate-spin text-brand-green" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* Navigation Tabs Bar */}
            <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as TabType)}>
                <TabsList>
                    <TabsTrigger value="overview" icon={AnalyticsIcon}>
                        Visão Geral
                    </TabsTrigger>
                    <TabsTrigger value="demanda" icon={SearchIcon}>
                        Demanda & Buscas da Cidade
                        {demandData.searchesWithoutResults > 0 && (
                            <span className="w-2 h-2 rounded-full bg-red-500 ml-1" />
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="usuarios" icon={Users}>
                        Usuários & Retenção
                    </TabsTrigger>
                    <TabsTrigger value="parceiros" icon={BriefcaseIcon}>
                        Parceiros & Planos
                    </TabsTrigger>
                    <TabsTrigger value="features" icon={SparklesIcon}>
                        Uso de Features
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Content Area */}
            <div className={`transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
                {currentTab === "overview" && (
                    <OverviewTab
                        data={overviewData}
                        onNavigateTab={(tabId) => setCurrentTab(tabId as TabType)}
                    />
                )}

                {currentTab === "demanda" && (
                    <MarketplaceDemandTab data={demandData} />
                )}

                {currentTab === "usuarios" && (
                    <UserGrowthTab data={usersData} />
                )}

                {currentTab === "parceiros" && (
                    <PartnerPlansTab data={partnersData} />
                )}

                {currentTab === "features" && (
                    <FeatureUsageTab data={featuresData} />
                )}
            </div>
        </div>
    )
}
