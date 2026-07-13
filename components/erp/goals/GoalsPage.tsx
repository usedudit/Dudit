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

type Tab = "Metas" | "Ranking" | "Resumo"

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
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()
    const { openPlanUpgrade } = usePlanUpgrade()

    const planGate = props.planGate

    // URL CRUD parameters
    const isCreate = searchParams.get("create") === "true"
    const editId = searchParams.get("edit")
    const duplicateId = searchParams.get("duplicate")
    const formMode = isCreate ? "create" : editId ? "edit" : duplicateId ? "duplicate" : null

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
                        const params = new URLSearchParams(searchParams.toString())
                        params.delete("edit")
                        params.delete("duplicate")
                        router.push(`/erp/produtividade/metas?${params.toString()}`)
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
    }, [formMode, editId, duplicateId, props.partnerId, router, searchParams, toast])

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
                onBack={() => router.push("/erp/produtividade/metas")}
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
                            <Button onClick={() => router.push("/erp/produtividade/metas?create=true")} leftIcon={<PlusIcon size={18} />}>
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
                    onCreate={() => router.push("/erp/produtividade/metas?create=true")}
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
                                        itemButton={{ text: "Nova meta", action: () => router.push("/erp/produtividade/metas?create=true") }}
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-4">
                                    {paginatedGoals.map((goal) => (
                                        <GoalGridCard
                                            key={goal.id}
                                            goal={goal}
                                            onEdit={() => router.push(`/erp/produtividade/metas?edit=${goal.id}`)}
                                            onDuplicate={() => router.push(`/erp/produtividade/metas?duplicate=${goal.id}`)}
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

                    {activeTab === "Resumo" && (() => {
                        const formatCompactValue = (value: number) => {
                            return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
                        }

                        const barChartData = filteredGoals.slice(0, 8).map(goal => ({
                            name: goal.name.length > 15 ? goal.name.slice(0, 12) + "..." : goal.name,
                            target_amount: goal.target_amount,
                            current_amount: goal.current_amount,
                        }))

                        const CHART_COLORS = ["#10B981", "#0EA5E9", "#F59E0B", "#8B5CF6", "#EC4899", "#3B82F6", "#6366F1"]

                        const activeRankingRows = ranking.filter(row => row.total_amount > 0)
                        const totalRankingSales = activeRankingRows.reduce((acc, row) => acc + row.total_amount, 0)

                        const pieChartData = activeRankingRows.map((row, index) => {
                            const pct = totalRankingSales > 0 ? Math.round((row.total_amount / totalRankingSales) * 100) : 0
                            return {
                                name: row.seller_name,
                                value: row.total_amount,
                                percentage: pct,
                                color: CHART_COLORS[index % CHART_COLORS.length]
                            }
                        })

                        return (
                            <div className="flex flex-col gap-6">
                                {/* Premium Cards Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <PremiumSummaryCard
                                        title="Total vendido"
                                        value={formatCurrency(summary.total_sold)}
                                        subtext="Faturamento acumulado"
                                        icon={MoneyIcon}
                                        iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
                                        iconColor="text-emerald-600 dark:text-emerald-400"
                                    />
                                    <PremiumSummaryCard
                                        title="Comissões Geradas"
                                        value={formatCurrency(summary.total_commissions)}
                                        subtext="Comissões acumuladas"
                                        icon={TagIcon}
                                        iconBgColor="bg-amber-50 dark:bg-amber-500/10"
                                        iconColor="text-amber-600 dark:text-amber-400"
                                    />
                                    <PremiumSummaryCard
                                        title="Bônus Pagos"
                                        value={formatCurrency(summary.total_bonus_paid)}
                                        subtext="Premiações por atingimento"
                                        icon={AwardIcon}
                                        iconBgColor="bg-sky-50 dark:bg-sky-500/10"
                                        iconColor="text-sky-600 dark:text-sky-400"
                                    />
                                    <PremiumSummaryCard
                                        title="Taxa de Sucesso"
                                        value={`${summary.achieved_goals} / ${summary.active_goals}`}
                                        subtext="Metas concluídas vs. ativas"
                                        icon={TargetIcon}
                                        iconBgColor="bg-violet-50 dark:bg-violet-500/10"
                                        iconColor="text-violet-600 dark:text-violet-400"
                                    />
                                </div>

                                {/* Charts Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Metas vs Realizado Bar Chart */}
                                    <div className="lg:col-span-2 bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between shadow-sm">
                                        <div className="mb-6">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Metas vs Realizado</h3>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Comparação detalhada do valor alvo contra o realizado acumulado por meta (exibindo até 8 metas).
                                            </p>
                                        </div>

                                        {barChartData.length === 0 ? (
                                            <div className="h-[280px] flex items-center justify-center">
                                                <IconPlaceholder
                                                    title="Sem Metas Cadastradas"
                                                    subtitle="Crie metas para visualizar o gráfico comparativo."
                                                    className="py-4"
                                                />
                                            </div>
                                        ) : (
                                            <div className="h-[280px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-dark-border/40" />
                                                        <XAxis
                                                            dataKey="name"
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 11, fontWeight: 500 }}
                                                            dy={10}
                                                        />
                                                        <YAxis
                                                            axisLine={false}
                                                            tickLine={false}
                                                            tickFormatter={formatCompactValue}
                                                            tick={{ fill: "currentColor", className: "text-brand-inactive-text dark:text-dark-body", fontSize: 11, fontWeight: 500 }}
                                                            dx={-5}
                                                        />
                                                        <ChartTooltip content={<CustomTooltip />} cursor={{ fill: "rgba(16, 185, 129, 0.04)" }} />
                                                        <Bar dataKey="target_amount" name="target_amount" fill="#D1D5DB" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                        <Bar dataKey="current_amount" name="current_amount" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>

                                    {/* Desempenho da Equipe Pie Chart */}
                                    <div className="lg:col-span-1 bg-white dark:bg-dark-surface rounded-2xl p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between shadow-sm">
                                        <div className="mb-4">
                                            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Participação de Vendas</h3>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                Divisão proporcional do faturamento por vendedor no período ativo.
                                            </p>
                                        </div>

                                        {pieChartData.length === 0 ? (
                                            <div className="h-[200px] flex items-center justify-center my-4">
                                                <IconPlaceholder
                                                    title="Sem Dados no Ranking"
                                                    subtitle="Os vendedores precisam registrar vendas no período para aparecer aqui."
                                                    className="py-4"
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <div className="h-[180px] w-full relative flex items-center justify-center">
                                                    {/* Overall Total text in donut center */}
                                                    <div className="absolute flex flex-col items-center justify-center pointer-events-none mt-1">
                                                        <span className="text-[10px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                                                            Total Vendas
                                                        </span>
                                                        <span className="text-lg font-black text-brand-dark dark:text-dark-heading tracking-tight mt-0.5">
                                                            {formatCompactValue(totalRankingSales)}
                                                        </span>
                                                    </div>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <ChartTooltip content={<CustomPieTooltip />} />
                                                            <Pie
                                                                data={pieChartData}
                                                                dataKey="value"
                                                                nameKey="name"
                                                                innerRadius={55}
                                                                outerRadius={75}
                                                                paddingAngle={3}
                                                                cx="50%"
                                                                cy="50%"
                                                            >
                                                                {pieChartData.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                                ))}
                                                            </Pie>
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                {/* Pie chart legend listing with color badges */}
                                                <div className="space-y-2 max-h-[110px] overflow-y-auto pr-1 mt-4 scrollbar-thin">
                                                    {pieChartData.slice(0, 4).map((entry, idx) => (
                                                        <div key={idx} className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center gap-2 truncate pr-2">
                                                                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                                                                <span className="font-semibold text-brand-dark dark:text-dark-heading truncate">
                                                                    {entry.name}
                                                                </span>
                                                            </div>
                                                            <span className="font-bold text-brand-inactive-text dark:text-dark-body shrink-0">
                                                                {entry.percentage}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {pieChartData.length > 4 && (
                                                        <div className="text-[10px] text-center font-bold text-brand-inactive-text dark:text-dark-body pt-1">
                                                            + {pieChartData.length - 4} outros vendedores
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
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
