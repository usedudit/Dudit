"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertModal, Badge, IconPlaceholder, Pagination, Button, ThreeDotsLoader } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import GoalsPageControls from "./GoalsPageControls"
import GoalGridCard from "./GoalGridCard"
import GoalFormPage from "./GoalFormPage"
import GoalDetailPage from "./GoalDetailPage"
import { useEntityState } from "@/hooks/use-entity-state"
import {
    deleteSalesGoalAction,
    getSalesGoalsModuleAction,
    getSalesGoalsRankingAction,
    getSalesGoalsSummaryAction,
    getGoalFormOptionsAction,
    getSalesGoalByIdAction,
} from "@/app/actions/erp/goals"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { PlusIcon, MoneyIcon, TagIcon, AwardIcon, TargetIcon, Users } from "@/lib/icons"
import { BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid } from "recharts"

type Tab = "Metas" | "Ranking"

type GoalRow = {
    id: string
    name: string
    period_type: "monthly" | "weekly"
    start_date: string
    end_date: string
    target_amount: number
    bonus_type: "fixed" | "percentage"
    bonus_value: number
    applies_to: "all" | "user"
    user_id: string | null
    goal_type: "sales" | "service_orders" | "both"
    scope_user_name?: string | null
    assigned_user_names?: string[]
    current_amount: number
    progress_percent: number
    status: "Em andamento" | "Concluída" | "Expirada"
}

type RankingRow = {
    user_id: string
    seller_name: string
    total_amount: number
    progress_percent: number
    position: number
}

type Summary = {
    total_sold: number
    total_commissions: number
    total_bonus_paid: number
    active_goals: number
    achieved_goals: number
}

const GOALS_PAGE_SIZE = 8
const RANKING_PAGE_SIZE = 8

export default function GoalsPage(props: {
    partnerId: string
    initialGoals: GoalRow[]
    sellers: Array<{ id: string; name: string }>
    initialRanking: RankingRow[]
    initialSummary: Summary
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
}) {
    const { toast } = useToast()
    const { openPlanUpgrade } = usePlanUpgrade()
    const planGate = props.planGate

    const { state: entityState, open, close, isViewing, isEditing, isCreating, isDuplicating } = useEntityState()

    const editId = isEditing ? entityState.entityId : null
    const duplicateId = isDuplicating ? entityState.entityId : null
    const viewId = isViewing ? entityState.entityId : null
    const formMode = isCreating ? "create" : isEditing ? "edit" : isDuplicating ? "duplicate" : null

    useEffect(() => {
        const handleReset = () => close()
        window.addEventListener("erp-sidebar-reset", handleReset)
        return () => window.removeEventListener("erp-sidebar-reset", handleReset)
    }, [close])

    const [formAccounts, setFormAccounts] = useState<any[] | null>(null)
    const [editingGoal, setEditingGoal] = useState<any | null>(null)
    const [isLoadingFormOptions, setIsLoadingFormOptions] = useState(false)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    const [activeTab, setActiveTab] = useState<Tab>("Metas")
    const [search, setSearch] = useState("")
    const [goals, setGoals] = useState<GoalRow[]>(props.initialGoals || [])
    const [ranking, setRanking] = useState<RankingRow[]>(props.initialRanking || [])
    const [summary, setSummary] = useState<Summary>(props.initialSummary)
    const [rankingLoading, setRankingLoading] = useState(false)
    const [rankingPeriodMode, setRankingPeriodMode] = useState<"monthly" | "weekly" | "custom">("monthly")
    const [rankingStartDate, setRankingStartDate] = useState("")
    const [rankingEndDate, setRankingEndDate] = useState("")
    const [goalsPage, setGoalsPage] = useState(1)
    const [rankingPage, setRankingPage] = useState(1)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [goalToDelete, setGoalToDelete] = useState<GoalRow | null>(null)

    const [filters, setFilters] = useState<{
        status: string[]
        periodType: string[]
        goalType: string[]
    }>({
        status: [],
        periodType: [],
        goalType: [],
    })

    // Synchronize state when props change
    useEffect(() => {
        setGoals(props.initialGoals || [])
    }, [props.initialGoals])

    useEffect(() => {
        setRanking(props.initialRanking || [])
    }, [props.initialRanking])

    useEffect(() => {
        setSummary(props.initialSummary)
    }, [props.initialSummary])

    // Load requirements for the form (accounts + editing/duplicating goal data)
    useEffect(() => {
        async function loadFormRequirements() {
            if (!formMode) {
                setEditingGoal(null)
                return
            }

            setIsLoadingFormOptions(true)
            try {
                const optionsRes = await getGoalFormOptionsAction(props.partnerId)
                if (optionsRes.success) {
                    setFormAccounts(optionsRes.accounts)
                } else {
                    toast({ title: "Erro", description: "Não foi possível carregar as contas.", variant: "destructive" })
                }

                const targetId = editId || duplicateId
                if (targetId) {
                    const goalRes = await getSalesGoalByIdAction(props.partnerId, targetId)
                    if (goalRes.success) {
                        setEditingGoal(goalRes.goal)
                    } else {
                        toast({ title: "Erro", description: goalRes.error || "Meta não encontrada.", variant: "destructive" })
                        close()
                    }
                } else {
                    setEditingGoal(null)
                }
            } catch (err) {
                console.error("Error loading form data:", err)
            } finally {
                setIsLoadingFormOptions(false)
            }
        }

        loadFormRequirements()
    }, [formMode, editId, duplicateId, props.partnerId, toast, close])

    async function refreshData() {
        const [goalsRes, rankingRes, summaryRes] = await Promise.all([
            getSalesGoalsModuleAction(props.partnerId),
            getSalesGoalsRankingAction(props.partnerId, {
                mode: rankingPeriodMode,
                startDate: rankingPeriodMode === "custom" ? rankingStartDate || null : null,
                endDate: rankingPeriodMode === "custom" ? rankingEndDate || null : null,
            }),
            getSalesGoalsSummaryAction(props.partnerId),
        ])

        if (goalsRes.success) setGoals(goalsRes.goals as GoalRow[])
        if (rankingRes.success) setRanking(rankingRes.ranking)
        if (summaryRes.success) setSummary(summaryRes.summary as Summary)
    }

    const refreshRanking = async () => {
        setRankingLoading(true)
        const rankingRes = await getSalesGoalsRankingAction(props.partnerId, {
            mode: rankingPeriodMode,
            startDate: rankingPeriodMode === "custom" ? rankingStartDate || null : null,
            endDate: rankingPeriodMode === "custom" ? rankingEndDate || null : null,
        })
        setRankingLoading(false)

        if (rankingRes.success) {
            setRanking(rankingRes.ranking)
            return
        }

        toast({ title: "Erro", description: "Não foi possível carregar o ranking.", variant: "destructive" })
    }

    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        return [
            {
                id: "status",
                title: "Status da Meta",
                type: "checkbox-list",
                options: ["Em andamento", "Concluída", "Expirada"],
            },
            {
                id: "periodType",
                title: "Recorrência",
                type: "checkbox-list",
                options: ["Mensal", "Semanal"],
            },
            {
                id: "goalType",
                title: "Tipo de Meta",
                type: "checkbox-list",
                options: ["Apenas vendas", "Apenas ordens de serviço", "Vendas e OS"],
            },
        ]
    }, [])

    const hasActiveFilters = useMemo(() => {
        return (
            filters.status.length > 0 ||
            filters.periodType.length > 0 ||
            filters.goalType.length > 0 ||
            search.trim().length > 0
        )
    }, [filters, search])

    const filteredGoals = useMemo(() => {
        let result = goals

        // 1. Search term filter
        const term = search.trim().toLowerCase()
        if (term) {
            result = result.filter((goal) => goal.name.toLowerCase().includes(term))
        }

        // 2. Status filter
        if (filters.status.length > 0) {
            result = result.filter((goal) => filters.status.includes(goal.status))
        }

        // 3. Recorrência (period_type) filter
        if (filters.periodType.length > 0) {
            result = result.filter((goal) => {
                const label = goal.period_type === "monthly" ? "Mensal" : "Semanal"
                return filters.periodType.includes(label)
            })
        }

        // 4. Tipo de meta (goal_type) filter
        if (filters.goalType.length > 0) {
            result = result.filter((goal) => {
                const label =
                    goal.goal_type === "sales"
                        ? "Apenas vendas"
                        : goal.goal_type === "service_orders"
                            ? "Apenas ordens de serviço"
                            : "Vendas e OS"
                return filters.goalType.includes(label)
            })
        }

        return result
    }, [goals, search, filters])

    const totalGoalPages = Math.max(1, Math.ceil(filteredGoals.length / GOALS_PAGE_SIZE))
    const paginatedGoals = filteredGoals.slice((goalsPage - 1) * GOALS_PAGE_SIZE, goalsPage * GOALS_PAGE_SIZE)
    const totalRankingPages = Math.max(1, Math.ceil(ranking.length / RANKING_PAGE_SIZE))
    const paginatedRanking = ranking.slice((rankingPage - 1) * RANKING_PAGE_SIZE, rankingPage * RANKING_PAGE_SIZE)

    useEffect(() => {
        setGoalsPage(1)
    }, [search, filters])

    useEffect(() => {
        setRankingPage(1)
    }, [ranking, rankingPeriodMode, rankingStartDate, rankingEndDate])

    useEffect(() => {
        if (goalsPage > totalGoalPages) setGoalsPage(totalGoalPages)
    }, [goalsPage, totalGoalPages])

    useEffect(() => {
        if (rankingPage > totalRankingPages) setRankingPage(totalRankingPages)
    }, [rankingPage, totalRankingPages])

    const removeGoal = async (goalId: string) => {
        setDeletingId(goalId)
        const res = await deleteSalesGoalAction(props.partnerId, goalId)
        setDeletingId(null)

        if (!res.success) {
            toast({ title: "Erro", description: res.error, variant: "destructive" })
            return
        }

        await refreshData()
        setGoalToDelete(null)
        toast({ title: "Sucesso", description: "Meta excluída." })
    }

    // Render Detail Page if viewing
    if (isViewing && viewId) {
        return (
            <GoalDetailPage
                partnerId={props.partnerId}
                goalId={viewId}
                initialGoalData={goals.find((g) => g.id === viewId)}
                onBack={() => close()}
                onEdit={(id) => open("edit", id)}
                onDuplicate={(id) => open("duplicate", id)}
                onSuccessMutation={() => refreshData()}
            />
        )
    }

    // Render Form Page instead of the list if formMode URL parameter is active
    if (formMode) {
        if (isLoadingFormOptions || ((formMode === "edit" || formMode === "duplicate") && !editingGoal)) {
            return (
                <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                    <ThreeDotsLoader />
                </div>
            )
        }

        return (
            <GoalFormPage
                partnerId={props.partnerId}
                mode={formMode}
                sellers={props.sellers}
                accounts={formAccounts || []}
                initialGoal={editingGoal}
                onBack={() => {
                    close()
                    refreshData()
                }}
            />
        )
    }

    if (planGate) {
        return (
            <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Metas.png"
                        imageAlt="Recurso bloqueado"
                        title="Metas de Vendas"
                        subtitle="Crie metas de vendas para sua equipe e acompanhe o desempenho com rankings e bônus. Disponível nos planos Crescer e Escalar."
                        itemButton={{
                            text: "Fazer upgrade",
                            action: () => openPlanUpgrade(planGate.requiredPlanSlug)
                        }}
                    />
                </div>
            </FadeIn>
        )
    }

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Metas</h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Acompanhe desempenho, bônus e ranking de vendedores.
                        </p>
                    </div>
                    {activeTab === "Metas" && (
                        <div className="flex items-center gap-3">
                            <Button onClick={() => open("create")} leftIcon={<PlusIcon size={18} />}>
                                Nova meta
                            </Button>
                        </div>
                    )}
                </div>

                <GoalsPageControls
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    search={search}
                    onSearchChange={setSearch}
                    onCreate={() => open("create")}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    rankingPeriodMode={rankingPeriodMode}
                    onRankingPeriodModeChange={setRankingPeriodMode}
                    rankingStartDate={rankingStartDate}
                    onRankingStartDateChange={setRankingStartDate}
                    rankingEndDate={rankingEndDate}
                    onRankingEndDateChange={setRankingEndDate}
                    onApplyRankingFilter={refreshRanking}
                    rankingLoading={rankingLoading}
                />

                <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
                    {activeTab === "Metas" && (
                        <>
                            {paginatedGoals.length === 0 ? (
                                <div className="min-h-[420px] flex items-center justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc={hasActiveFilters ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png" : "https://img.dudit.com.br/static/mascots/Metas.png"}
                                        imageAlt="Sem metas"
                                        title={hasActiveFilters ? "Nenhuma meta encontrada" : "Nenhuma meta criada"}
                                        subtitle={hasActiveFilters ? "Ajuste os filtros ou tente outra busca." : "Crie metas para acompanhar e premiar o desempenho da equipe."}
                                        itemButton={{ text: "Nova meta", action: () => open("create") }}
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-4">
                                    {paginatedGoals.map((goal) => (
                                        <GoalGridCard
                                            key={goal.id}
                                            goal={goal}
                                            onDetails={() => open("view", goal.id)}
                                            onEdit={() => open("edit", goal.id)}
                                            onDuplicate={() => open("duplicate", goal.id)}
                                            onDelete={() => setGoalToDelete(goal)}
                                        />
                                    ))}
                                </div>
                            )}

                            {filteredGoals.length > 0 && (
                                <Pagination currentPage={goalsPage} totalPages={totalGoalPages} onPageChange={setGoalsPage} />
                            )}
                        </>
                    )}

                    {activeTab === "Ranking" && (
                        <div className="space-y-4">
                            {ranking.length === 0 && !rankingLoading ? (
                                <div className="min-h-[320px] flex items-center justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Sem ranking"
                                        title="Sem dados para o período"
                                        subtitle="Ajuste o período para visualizar o ranking de vendedores."
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {paginatedRanking.map((row) => {
                                        const medal = row.position === 1 ? "🥇" : row.position === 2 ? "🥈" : row.position === 3 ? "🥉" : ""
                                        const isTop3 = row.position <= 3

                                        return (
                                            <div
                                                key={row.user_id}
                                                className={`rounded-2xl border ${isTop3
                                                    ? "border-brand-green bg-brand-green/5"
                                                    : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                                                    } p-5 flex items-center justify-between gap-4 transition-all hover:shadow-sm`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div
                                                        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${isTop3 ? "bg-brand-green text-white" : "bg-brand-gray text-brand-dark"
                                                            }`}
                                                    >
                                                        {row.position}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2 text-lg">
                                                            {row.seller_name} {medal}
                                                        </p>
                                                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                                            Total vendido:{" "}
                                                            <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                {formatCurrency(row.total_amount)}
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-brand-inactive-text mb-1 font-medium">Atingimento da meta</p>
                                                    <Badge variant={isTop3 ? "green" : "gray"} className="text-sm px-3 py-1">
                                                        {row.progress_percent}%
                                                    </Badge>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {ranking.length > 0 && (
                                <Pagination currentPage={rankingPage} totalPages={totalRankingPages} onPageChange={setRankingPage} />
                            )}
                        </div>
                    )}


                </div>
            </div>

            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters({ status: [], periodType: [], goalType: [] })}
            />

            <AlertModal
                isOpen={!!goalToDelete}
                onClose={() => {
                    if (!deletingId) setGoalToDelete(null)
                }}
                onConfirm={() => {
                    if (goalToDelete) void removeGoal(goalToDelete.id)
                }}
                title="Excluir meta?"
                description={`Tem certeza que deseja excluir ${goalToDelete?.name || "esta meta"}? Esta ação não pode ser desfeita.`}
                confirmText={deletingId ? "Excluindo..." : "Excluir"}
                variant="danger"
                isLoading={Boolean(deletingId)}
            />
        </FadeIn>
    )
}

function PremiumSummaryCard({
    title,
    value,
    subtext,
    icon: Icon,
    iconBgColor,
    iconColor,
}: {
    title: string
    value: string | number
    subtext: string
    icon: React.ComponentType<{ className?: string; size?: number }>
    iconBgColor: string
    iconColor: string
}) {
    return (
        <div className="group rounded-2xl border border-brand-border dark:border-dark-border p-6 bg-white dark:bg-dark-surface shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider mb-1">
                    {title}
                </p>
                <p className="text-2xl font-extrabold text-brand-dark dark:text-dark-heading tracking-tight truncate">
                    {value}
                </p>
                <p className="text-[13px] font-medium text-brand-inactive-text/80 dark:text-dark-body/60 mt-1">
                    {subtext}
                </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 ${iconBgColor}`}>
                <Icon className={iconColor} size={22} />
            </div>
        </div>
    )
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[170px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[200px]">
                    {label}
                </p>
                <div className="flex flex-col gap-1.5 border-t border-brand-border dark:border-dark-border/40 pt-1.5 mt-0.5">
                    {payload.map((entry: any, index: number) => {
                        const color = entry.fill || "var(--brand-green)";
                        const name = entry.name === "target_amount" ? "Meta Alvo" : "Realizado";
                        return (
                            <div key={index} className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-current shrink-0" style={{ color }} />
                                    <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                                        {name}
                                    </span>
                                </div>
                                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(entry.value)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
    return null
}

const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const entry = payload[0]
        const color = entry.payload.fill || entry.color || "var(--brand-green)"
        return (
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-1.5 font-sans min-w-[150px]">
                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[180px]">{entry.name}</p>
                <div className="flex items-center justify-between gap-4 border-t border-brand-border dark:border-dark-border/40 pt-1.5">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm bg-current shrink-0" style={{ color }} />
                        <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
                            Vendido
                        </span>
                    </div>
                    <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(Number(entry.value))}
                    </span>
                </div>
            </div>
        )
    }
    return null
}
