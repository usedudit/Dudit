"use client"

import React from "react"
import { Button, Input } from "@/components/reusable"
import { Tabs, TabsList, TabsTrigger } from "@/components/reusable/Tabs"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import {
    SearchIcon,
    GridIcon,
    ListIcon,
    StoreIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    ClockIcon,
} from "@/lib/icons"
import type { AdminSubscriptionStats } from "@/app/actions/admin/subscriptions"

interface SubscriptionsPageControlsProps {
    activeTab: string
    setActiveTab: (tab: string) => void
    search: string
    onSearchChange: (value: string) => void
    viewMode: "list" | "grid"
    onViewModeChange: (mode: "list" | "grid") => void
    stats?: AdminSubscriptionStats
}

export default function SubscriptionsPageControls({
    activeTab,
    setActiveTab,
    search,
    onSearchChange,
    viewMode,
    onViewModeChange,
    stats,
}: SubscriptionsPageControlsProps) {
    return (
        <>
            {/* --- TABS --- */}
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="px-0">
                        <TabsTrigger
                            value="all"
                            icon={StoreIcon}
                            badge={stats && <TabCountBadge count={stats.total} variant="gray" />}
                        >
                            Todas
                        </TabsTrigger>
                        <TabsTrigger
                            value="connected"
                            icon={CheckCircleIcon}
                            badge={stats && <TabCountBadge count={stats.connected} variant="green" />}
                        >
                            Conectadas
                        </TabsTrigger>
                        <TabsTrigger
                            value="disconnected"
                            icon={CancelCircleIcon}
                            badge={stats && <TabCountBadge count={stats.disconnected} variant="red" />}
                        >
                            Desconectadas
                        </TabsTrigger>
                        <TabsTrigger
                            value="suspended"
                            icon={ClockIcon}
                            badge={stats && <TabCountBadge count={stats.suspended} variant="yellow" />}
                        >
                            Suspensas
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* --- CONTROLS BAR --- */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
                {/* MOBILE CONTROLS */}
                <div className="md:hidden flex items-center gap-2 w-full">
                    <div className="flex-1 min-w-0">
                        <Input
                            placeholder="Buscar loja ou Mercado Pago ID..."
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="h-[42px] w-full"
                            variant="full-rounded"
                            prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                    </div>
                </div>

                {/* DESKTOP CONTROLS */}
                <div className="hidden md:flex items-center w-full gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="w-80">
                            <Input
                                placeholder="Buscar loja ou Mercado Pago ID..."
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                            />
                        </div>
                    </div>

                    <div className="flex-1 min-w-0" />

                    {/* View Toggles */}
                    <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                        <button
                            onClick={() => onViewModeChange("list")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            aria-label="Visualização em Lista"
                        >
                            <ListIcon className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={() => onViewModeChange("grid")}
                            className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                            aria-label="Visualização em Grade"
                        >
                            <GridIcon className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
