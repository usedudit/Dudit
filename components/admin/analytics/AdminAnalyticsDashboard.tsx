"use client"

import React, { useState, useTransition, useCallback } from "react"
import {
    AnalyticsIcon,
    SearchIcon,
    Users,
    BriefcaseIcon,
    SparklesIcon,
    ReloadIcon,
    CalendarIcon,
    Settings2Icon,
    CheckIcon,
} from "@/lib/icons"
import { Button, ActionsDropdown } from "@/components/reusable"
import DropdownItem from "@/components/reusable/DropdownItem"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { FadeIn } from "@/components/animations/FadeIn"
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
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Analytics da Dudit
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Inteligência de demanda da cidade, crescimento de usuários, saúde de parceiros e uso de features.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Actions Dropdown (período + atualizar) */}
                        <ActionsDropdown
                            trigger={
                                <Button variant="outline" leftIcon={<Settings2Icon size={18} />}>
                                    Ações
                                </Button>
                            }
                        >
                            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                                Período
                            </div>
                            {PERIOD_OPTIONS.map((opt) => (
                                <DropdownItem
                                    key={opt.id}
                                    onClick={() => handlePeriodChange(opt.id)}
                                    className={period === opt.id ? "text-brand-green font-semibold" : ""}
                                >
                                    {period === opt.id ? <CheckIcon size={16} /> : <CalendarIcon size={16} />}
                                    {opt.label}
                                </DropdownItem>
                            ))}
                            <div className="my-1 h-px bg-brand-border dark:bg-dark-border" />
                            <DropdownItem onClick={() => refreshData(period)} disabled={isPending}>
                                <ReloadIcon size={16} className={isPending ? "animate-spin" : ""} />
                                {isPending ? "Atualizando..." : "Atualizar dados"}
                            </DropdownItem>
                        </ActionsDropdown>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 px-4 md:px-8">
                    <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as TabType)}>
                        <TabsList className="px-0">
                            <TabsTrigger value="overview" icon={AnalyticsIcon}>
                                Visão Geral
                            </TabsTrigger>
                            <TabsTrigger
                                value="demanda"
                                icon={SearchIcon}
                                badge={demandData.searchesWithoutResults > 0 && <TabCountBadge count={demandData.searchesWithoutResults} variant="red" />}
                            >
                                Demanda & Buscas
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
                </div>

                {/* Content Area */}
                <div className={`flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
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
        </FadeIn>
    )
}