"use client"

import React from "react"
import { Button, Input, Tabs, TabsList, TabsTrigger, FormDropdown } from "@/components/reusable"
import { SearchIcon, PlusIcon, GridIcon, AwardIcon, RankingIcon } from "@/lib/icons"

type Tab = "Metas" | "Ranking" | "Resumo"

export default function GoalsPageControls(props: {
    activeTab: Tab
    onTabChange: (tab: Tab) => void
    search: string
    onSearchChange: (value: string) => void
    onCreate: () => void
    // Ranking filters
    rankingPeriodMode?: "monthly" | "weekly" | "custom"
    onRankingPeriodModeChange?: (val: "monthly" | "weekly" | "custom") => void
    rankingStartDate?: string
    onRankingStartDateChange?: (val: string) => void
    rankingEndDate?: string
    onRankingEndDateChange?: (val: string) => void
    onApplyRankingFilter?: () => void
    rankingLoading?: boolean
}) {
    return (
        <>
            <div className="mb-6 px-4 md:px-8">
                <Tabs value={props.activeTab} onValueChange={(val) => props.onTabChange(val as Tab)}>
                    <TabsList className="px-0">
                        <TabsTrigger value="Metas" icon={AwardIcon}>Metas</TabsTrigger>
                        <TabsTrigger value="Ranking" icon={RankingIcon}>Ranking</TabsTrigger>
                        <TabsTrigger value="Resumo" icon={GridIcon}>Resumo</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 px-4 md:px-8">
                <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    {props.activeTab === "Metas" && (
                        <div className="w-full md:w-80">
                            <Input
                                name="search-goals"
                                placeholder="Buscar metas..."
                                value={props.search}
                                onChange={(e) => props.onSearchChange(e.target.value)}
                                className="h-[42px]"
                                variant="full-rounded"
                                prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                                label=""
                            />
                        </div>
                    )}

                    {props.activeTab === "Ranking" && (
                        <div className="flex flex-col md:flex-row items-center gap-3 w-full">
                            <div className="w-full md:w-40">
                                <FormDropdown
                                    value={props.rankingPeriodMode || "monthly"}
                                    setValue={(val) => props.onRankingPeriodModeChange?.(val as any)}
                                    options={[
                                        { value: "monthly", label: "Mensal" },
                                        { value: "weekly", label: "Semanal" },
                                        { value: "custom", label: "Personalizado" },
                                    ]}
                                    className="h-[42px]"
                                />
                            </div>
                            {props.rankingPeriodMode === "custom" && (
                                <>
                                    <div className="w-full md:w-40">
                                        <Input
                                            type="date"
                                            value={props.rankingStartDate || ""}
                                            onChange={(e) => props.onRankingStartDateChange?.(e.target.value)}
                                            className="h-[42px]"
                                            variant="full-rounded"
                                        />
                                    </div>
                                    <div className="w-full md:w-40">
                                        <Input
                                            type="date"
                                            value={props.rankingEndDate || ""}
                                            onChange={(e) => props.onRankingEndDateChange?.(e.target.value)}
                                            className="h-[42px]"
                                            variant="full-rounded"
                                        />
                                    </div>
                                </>
                            )}
                            <Button
                                variant="outline"
                                className="h-[42px] px-6 rounded-full"
                                onClick={props.onApplyRankingFilter}
                                disabled={props.rankingLoading}
                            >
                                {props.rankingLoading ? "..." : "Filtrar"}
                            </Button>
                        </div>
                    )}
                </div>

                {props.activeTab === "Metas" && (
                    <Button onClick={props.onCreate} className="h-[42px]" leftIcon={<PlusIcon size={18} />}>
                        Nova meta
                    </Button>
                )}
            </div>
        </>
    )
}
