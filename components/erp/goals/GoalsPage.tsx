"use client"

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { AlertModal, IconPlaceholder, Pagination, Button, ThreeDotsLoader } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { FadeIn } from "@/components/animations/FadeIn"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import GoalsPageControls from "./GoalsPageControls"
import GoalGridCard from "./GoalGridCard"
import GoalListRow from "./GoalListRow"
import RankingListRow from "./RankingListRow"
import RankingGridCard from "./RankingGridCard"
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
import {
    EMPTY_DATE_PERIOD,
    getBrazilTodayYmd,
    isDatePeriodFilterActive,
    resolveDatePeriodBounds,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import { useToast } from "@/hooks/use-toast"
import { PlusIcon, ArrowUpDownIcon } from "@/lib/icons"
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

type SortConfig = {
    key: string
    direction: "asc" | "desc"
}

const GOALS_PAGE_SIZE = 8
const RANKING_PAGE_SIZE = 8

const GOAL_COLUMNS = [
    { id: "name", label: "Meta", align: "left" as const, width: "38%" },
    { id: "period", label: "Recorrência", align: "center" as const },
    { id: "target", label: "Meta R$", align: "right" as const },
    { id: "current", label: "Realizado", align: "right" as const },
    { id: "progress", label: "Progresso", align: "left" as const },
    { id: "status", label: "Status", align: "center" as const },
    { id: "actions", label: "", align: "center" as const, width: "70px" },
]

const RANKING_COLUMNS = [
    { id: "position", label: "Posição", align: "center" as const, width: "90px" },
    { id: "seller", label: "Vendedor", align: "left" as const },
    { id: "total", label: "Total vendido", align: "right" as const },
    { id: "progress", label: "Atingimento", align: "left" as const },
]

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const mql = window.matchMedia(query)
        const onChange = () => setMatches(mql.matches)
        onChange()
        mql.addEventListener("change", onChange)
        return () => mql.removeEventListener("change", onChange)
    }, [query])

    return matches
}

function compareValues(a: any, b: any, key: string) {
    const va = a[key]
    const vb = b[key]
    if (typeof va === "number" && typeof vb === "number") return va - vb
    return String(va ?? "").localeCompare(String(vb ?? ""), "pt-BR")
}

export default function GoalsPage(props: {
    partnerId: string
    initialGoals: GoalRow[]
    sellers: Array<{ id: string; name: string }>
    initialRanking: RankingRow[]
    initialSummary: Summary
    planGate?: { requiredPlanSlug: "crescer" | "escalar" }
}) {
    const { toast } = useToast()
    const router = useRouter()
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
    const [goalsPage, setGoalsPage] = useState(1)
    const [rankingPage, setRankingPage] = useState(1)
    const [viewMode, setViewMode] = useState<"list" | "grid">("grid")
    const [goalSort, setGoalSort] = useState<SortConfig>({ key: "name", direction: "asc" })
    const [rankingSort, setRankingSort] = useState<SortConfig>({ key: "position", direction: "asc" })
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [goalToDelete, setGoalToDelete] = useState<GoalRow | null>(null)

    const isMobile = useMediaQuery("(max-width: 767px)")
    const isXl = useMediaQuery("(min-width: 1280px)")

    const effectiveViewMode = isMobile ? "grid" : viewMode

    const [filters, setFilters] = useState<{
        status: string[]
        periodType: string[]
        period: DatePeriodFilterValue
    }>({
        status: [],
        periodType: [],
        period: { ...EMPTY_DATE_PERIOD },
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

    // Período do ranking (abas de filtro) - null = mês atual (padrão)
    const rankingBounds = useMemo(() => {
        if (!isDatePeriodFilterActive(filters.period)) return null
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.period)
        return {
            startDate: startYmd || "1970-01-01",
            endDate: endYmd || getBrazilTodayYmd(),
        }
    }, [filters.period])

    const rankingFilterArg = useMemo(
        () =>
            rankingBounds
                ? ({ mode: "custom", startDate: rankingBounds.startDate, endDate: rankingBounds.endDate } as const)
                : ({ mode: "monthly" } as const),
        [rankingBounds],
    )

    const fetchRanking = useCallback(
        async (showLoader = true) => {
            if (showLoader) setRankingLoading(true)
            try {
                const rankingRes = await getSalesGoalsRankingAction(props.partnerId, rankingFilterArg)
                if (rankingRes.success) {
                    setRanking(rankingRes.ranking)
                    return
                }
                toast({ title: "Erro", description: "Não foi possível carregar o ranking.", variant: "destructive" })
            } catch {
                toast({ title: "Erro", description: "Não foi possível carregar o ranking.", variant: "destructive" })
            } finally {
                if (showLoader) setRankingLoading(false)
            }
        },
        [props.partnerId, rankingFilterArg, toast],
    )

    async function refreshData() {
        const [goalsRes, rankingRes, summaryRes] = await Promise.allSettled([
            getSalesGoalsModuleAction(props.partnerId),
            getSalesGoalsRankingAction(props.partnerId, rankingFilterArg),
            getSalesGoalsSummaryAction(props.partnerId),
        ])

        if (goalsRes.status === "fulfilled" && goalsRes.value.success) {
            setGoals(goalsRes.value.goals as GoalRow[])
        }
        if (rankingRes.status === "fulfilled" && rankingRes.value.success) {
            setRanking(rankingRes.value.ranking)
        }
        if (summaryRes.status === "fulfilled" && summaryRes.value.success) {
            setSummary(summaryRes.value.summary as Summary)
        }
    }

    // Mantém o servidor em sincronia com o estado do cliente após mutações
    async function refreshAll() {
        await refreshData()
        router.refresh()
    }

    // Recarrega o ranking quando o período do filtro muda
    const rankingKeyRef = useRef<string | null>(null)
    const rankingKey = rankingBounds ? `${rankingBounds.startDate}:${rankingBounds.endDate}` : "default"
    useEffect(() => {
        if (rankingKeyRef.current === null) {
            rankingKeyRef.current = rankingKey
            return
        }
        if (rankingKeyRef.current === rankingKey) return
        rankingKeyRef.current = rankingKey
        void fetchRanking(true)
    }, [rankingKey, fetchRanking])

    const filterSections = useMemo<FilterSectionConfig[]>(() => {
        if (activeTab === "Ranking") {
            return [{ id: "period", title: "Período", type: "date-period" }]
        }

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
        ]
    }, [activeTab])

    const hasActiveFilters = useMemo(() => {
        if (activeTab === "Ranking") {
            return isDatePeriodFilterActive(filters.period) || search.trim().length > 0
        }
        return filters.status.length > 0 || filters.periodType.length > 0 || search.trim().length > 0
    }, [activeTab, filters, search])

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

        // 4. Sort
        const sorted = [...result].sort((a, b) => {
            const cmp = compareValues(a, b, goalSort.key)
            return goalSort.direction === "asc" ? cmp : -cmp
        })

        return sorted
    }, [goals, search, filters, goalSort])

    const filteredRanking = useMemo(() => {
        let result = ranking

        const term = search.trim().toLowerCase()
        if (term) {
            result = result.filter((row) => row.seller_name.toLowerCase().includes(term))
        }

        const sorted = [...result].sort((a, b) => {
            const cmp = compareValues(a, b, rankingSort.key)
            return rankingSort.direction === "asc" ? cmp : -cmp
        })

        return sorted
    }, [ranking, search, rankingSort])

    const totalGoalPages = Math.max(1, Math.ceil(filteredGoals.length / GOALS_PAGE_SIZE))
    const paginatedGoals = filteredGoals.slice((goalsPage - 1) * GOALS_PAGE_SIZE, goalsPage * GOALS_PAGE_SIZE)
    const totalRankingPages = Math.max(1, Math.ceil(filteredRanking.length / RANKING_PAGE_SIZE))
    const paginatedRanking = filteredRanking.slice((rankingPage - 1) * RANKING_PAGE_SIZE, rankingPage * RANKING_PAGE_SIZE)

    useEffect(() => {
        setGoalsPage(1)
    }, [search, filters, goalSort])

    useEffect(() => {
        setRankingPage(1)
    }, [ranking, rankingKey, search, rankingSort])

    useEffect(() => {
        if (goalsPage > totalGoalPages) setGoalsPage(totalGoalPages)
    }, [goalsPage, totalGoalPages])

    useEffect(() => {
        if (rankingPage > totalRankingPages) setRankingPage(totalRankingPages)
    }, [rankingPage, totalRankingPages])

    const handleGoalSort = useCallback((key: string) => {
        setGoalSort((prev) => ({
            key,
            direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
        }))
    }, [])

    const handleRankingSort = useCallback((key: string) => {
        setRankingSort((prev) => ({
            key,
            direction: prev?.key === key && prev.direction === "asc" ? "desc" : "asc",
        }))
    }, [])

    const handleGoalDetails = useCallback((goal: GoalRow) => open("view", goal.id), [open])
    const handleGoalEdit = useCallback((goal: GoalRow) => open("edit", goal.id), [open])
    const handleGoalDuplicate = useCallback((goal: GoalRow) => open("duplicate", goal.id), [open])
    const handleGoalDelete = useCallback((goal: GoalRow) => setGoalToDelete(goal), [])

    const removeGoal = async (goalId: string) => {
        setDeletingId(goalId)
        const res = await deleteSalesGoalAction(props.partnerId, goalId)
        setDeletingId(null)

        if (!res.success) {
            toast({ title: "Erro", description: res.error, variant: "destructive" })
            return
        }

        await refreshAll()
        setGoalToDelete(null)
        toast({ title: "Sucesso", description: "Meta excluída." })
    }

    const renderGoalsTableHeader = () => (
        <tr className="bg-brand-gray dark:bg-dark-border/50">
            {GOAL_COLUMNS.map((col, idx) => {
                const isSortable = col.id !== "actions"
                const isSorted = goalSort?.key === col.id
                return (
                    <th
                        key={col.id}
                        className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === GOAL_COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""}`}
                        style={{ width: col.width }}
                        onClick={() => {
                            if (isSortable) handleGoalSort(col.id)
                        }}
                    >
                        <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                            <span>{col.label}</span>
                            {isSortable && (
                                <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                    <ArrowUpDownIcon
                                        size={14}
                                        className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && goalSort.direction === "desc" ? "rotate-180" : ""}`}
                                    />
                                </div>
                            )}
                        </div>
                    </th>
                )
            })}
        </tr>
    )

    const renderRankingTableHeader = () => (
        <tr className="bg-brand-gray dark:bg-dark-border/50">
            {RANKING_COLUMNS.map((col, idx) => {
                const isSorted = rankingSort?.key === col.id
                return (
                    <th
                        key={col.id}
                        className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === RANKING_COLUMNS.length - 1 ? "rounded-r-lg" : ""} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors`}
                        style={{ width: col.width }}
                        onClick={() => handleRankingSort(col.id)}
                    >
                        <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                            <span>{col.label}</span>
                            <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                <ArrowUpDownIcon
                                    size={14}
                                    className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && rankingSort.direction === "desc" ? "rotate-180" : ""}`}
                                />
                            </div>
                        </div>
                    </th>
                )
            })}
        </tr>
    )

    // Render Detail Page if viewing
    if (isViewing && viewId) {
        return (
            <FadeIn key={`goal-detail-${viewId}`} className="w-full h-full">
                <GoalDetailPage
                    partnerId={props.partnerId}
                    goalId={viewId}
                    initialGoalData={goals.find((g) => g.id === viewId)}
                    onBack={() => close()}
                    onEdit={(id) => open("edit", id)}
                    onDuplicate={(id) => open("duplicate", id)}
                    onSuccessMutation={() => refreshAll()}
                />
            </FadeIn>
        )
    }

    // Render Form Page instead of the list if formMode URL parameter is active
    if (formMode) {
        return (
            <FadeIn key={`goal-form-${formMode}`} className="w-full h-full">
                <GoalFormPage
                    partnerId={props.partnerId}
                    mode={formMode}
                    sellers={props.sellers}
                    accounts={formAccounts || []}
                    initialGoal={editingGoal}
                    onBack={() => {
                        close()
                        void refreshAll()
                    }}
                />
            </FadeIn>
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
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    hasActiveFilters={hasActiveFilters}
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
                            ) : effectiveViewMode === "grid" ? (
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
                            ) : (
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                            <thead>
                                                {renderGoalsTableHeader()}
                                            </thead>
                                            <tbody>
                                                {paginatedGoals.map((goal) => (
                                                    <GoalListRow
                                                        key={goal.id}
                                                        goal={goal}
                                                        columns={GOAL_COLUMNS}
                                                        onDetails={handleGoalDetails}
                                                        onEdit={handleGoalEdit}
                                                        onDuplicate={handleGoalDuplicate}
                                                        onDelete={handleGoalDelete}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {filteredGoals.length > 0 && (
                                <Pagination currentPage={goalsPage} totalPages={totalGoalPages} onPageChange={setGoalsPage} />
                            )}
                        </>
                    )}

                    {activeTab === "Ranking" && (
                        <div className="space-y-4">
                            {rankingLoading ? (
                                <div className="min-h-[320px] flex items-center justify-center">
                                    <ThreeDotsLoader />
                                </div>
                            ) : filteredRanking.length === 0 ? (
                                <div className="min-h-[320px] flex items-center justify-center">
                                    <IconPlaceholder
                                        placeholderType="image"
                                        imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                        imageAlt="Sem ranking"
                                        title="Sem dados para o período"
                                        subtitle={
                                            hasActiveFilters
                                                ? "Ajuste o período ou a busca para visualizar o ranking de vendedores."
                                                : "Ainda não há vendas registradas neste período. Assim que houver vendas, o ranking aparece aqui."
                                        }
                                    />
                                </div>
                            ) : (
                                <>
                                    {isXl ? (
                                        <div className="w-full overflow-hidden rounded-xl relative">
                                            <div className="overflow-x-auto pb-4 custom-scrollbar">
                                                <table className="w-full text-left border-separate border-spacing-0 min-w-[700px]">
                                                    <thead>
                                                        {renderRankingTableHeader()}
                                                    </thead>
                                                    <tbody>
                                                        {paginatedRanking.map((row) => (
                                                            <RankingListRow
                                                                key={row.user_id}
                                                                row={row}
                                                                columns={RANKING_COLUMNS}
                                                            />
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {paginatedRanking.map((row) => (
                                                <RankingGridCard key={row.user_id} row={row} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {filteredRanking.length > 0 && (
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
                onClear={() =>
                    setFilters({
                        status: [],
                        periodType: [],
                        period: { ...EMPTY_DATE_PERIOD },
                    })
                }
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