"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertModal, Badge, IconPlaceholder, Pagination } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import GoalsPageControls from "./GoalsPageControls"
import GoalGridCard from "./GoalGridCard"
import {
  deleteSalesGoalAction,
  getSalesGoalsModuleAction,
  getSalesGoalsRankingAction,
  getSalesGoalsSummaryAction,
} from "@/app/actions/erp/goals"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

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
}) {
  const router = useRouter()
  const { toast } = useToast()
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

  const filteredGoals = useMemo(() => {
    const term = search.trim().toLowerCase()
    return goals.filter((goal) => !term || goal.name.toLowerCase().includes(term))
  }, [goals, search])

  const totalGoalPages = Math.max(1, Math.ceil(filteredGoals.length / GOALS_PAGE_SIZE))
  const paginatedGoals = filteredGoals.slice((goalsPage - 1) * GOALS_PAGE_SIZE, goalsPage * GOALS_PAGE_SIZE)
  const totalRankingPages = Math.max(1, Math.ceil(ranking.length / RANKING_PAGE_SIZE))
  const paginatedRanking = ranking.slice((rankingPage - 1) * RANKING_PAGE_SIZE, rankingPage * RANKING_PAGE_SIZE)

  useEffect(() => {
    setGoalsPage(1)
  }, [search])

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

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Metas</h1>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Acompanhe desempenho, bônus e ranking de vendedores.
            </p>
          </div>
        </div>

        <GoalsPageControls
          activeTab={activeTab}
          onTabChange={setActiveTab}
          search={search}
          onSearchChange={setSearch}
          onCreate={() => router.push("/erp/goals/new")}
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
                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                    imageAlt="Sem metas"
                    title="Nenhuma meta encontrada"
                    subtitle="Crie metas para acompanhar e premiar o desempenho da equipe."
                    itemButton={{ text: "Nova meta", action: () => router.push("/erp/goals/new") }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-4">
                  {paginatedGoals.map((goal) => (
                    <GoalGridCard
                      key={goal.id}
                      goal={goal}
                      onEdit={() => router.push(`/erp/goals/${goal.id}/edit`)}
                      onDuplicate={() => router.push(`/erp/goals/${goal.id}/duplicate`)}
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
                        className={`rounded-2xl border ${
                          isTop3
                            ? "border-brand-green bg-brand-green/5"
                            : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        } p-5 flex items-center justify-between gap-4 transition-all hover:shadow-sm`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                              isTop3 ? "bg-brand-green text-white" : "bg-brand-gray text-brand-dark"
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

          {activeTab === "Resumo" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SummaryCard title="Total vendido" value={formatCurrency(summary.total_sold)} />
              <SummaryCard title="Total em comissões" value={formatCurrency(summary.total_commissions)} />
              <SummaryCard title="Total em bônus pagos" value={formatCurrency(summary.total_bonus_paid)} />
              <SummaryCard title="Metas ativas" value={String(summary.active_goals)} />
              <SummaryCard title="Metas concluídas" value={String(summary.achieved_goals)} />
            </div>
          )}
        </div>
      </div>

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

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-border dark:border-dark-border p-6 bg-white dark:bg-dark-surface shadow-sm">
      <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-2 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{value}</p>
    </div>
  )
}
