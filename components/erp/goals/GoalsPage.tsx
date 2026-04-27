"use client"

import React, { useMemo, useState } from "react"
import { Button, FormDropdown, Input, Pagination, Badge, IconPlaceholder } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import DefaultModal from "@/components/reusable/DefaultModal"
import GoalsPageControls from "./GoalsPageControls"
import { deleteSalesGoalAction, getSalesGoalsModuleAction, getSalesGoalsRankingAction, getSalesGoalsSummaryAction, upsertSalesGoalAction } from "@/app/actions/erp/goals"
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

const PAGE_SIZE = 8

export default function GoalsPage(props: {
  partnerId: string
  initialGoals: GoalRow[]
  sellers: Array<{ id: string; name: string }>
  initialRanking: RankingRow[]
  initialSummary: Summary
}) {
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
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    periodType: "monthly" as "monthly" | "weekly",
    startDate: "",
    endDate: "",
    targetAmount: "0",
    bonusType: "fixed" as "fixed" | "percentage",
    bonusValue: "0",
    appliesTo: "all" as "all" | "user",
    userId: "",
    goalType: "sales" as "sales" | "service_orders" | "both",
  })

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
    if (goalsRes.success) setGoals(goalsRes.goals as any)
    if (rankingRes.success) setRanking(rankingRes.ranking)
    if (summaryRes.success) setSummary(summaryRes.summary as any)
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
    const list = goals.filter((g) => !term || g.name.toLowerCase().includes(term))
    return list
  }, [goals, search])

  const totalPages = Math.max(1, Math.ceil(filteredGoals.length / PAGE_SIZE))
  const paginatedGoals = filteredGoals.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openCreate = () => {
    setEditingGoal(null)
    setForm({
      name: "",
      periodType: "monthly",
      startDate: "",
      endDate: "",
      targetAmount: "0",
      bonusType: "fixed",
      bonusValue: "0",
      appliesTo: "all",
      userId: "",
      goalType: "sales",
    })
    setModalOpen(true)
  }

  const openEdit = (goal: GoalRow) => {
    setEditingGoal(goal)
    setForm({
      name: goal.name,
      periodType: goal.period_type,
      startDate: goal.start_date,
      endDate: goal.end_date,
      targetAmount: String(goal.target_amount || 0),
      bonusType: goal.bonus_type,
      bonusValue: String(goal.bonus_value || 0),
      appliesTo: goal.applies_to,
      userId: goal.user_id || "",
      goalType: goal.goal_type || "sales",
    })
    setModalOpen(true)
  }

  const saveGoal = async () => {
    if (!form.name.trim()) return toast({ title: "Erro", description: "Informe o nome da meta.", variant: "destructive" })
    if (Number(form.targetAmount) <= 0) return toast({ title: "Erro", description: "O valor da meta deve ser maior que zero.", variant: "destructive" })
    if (!form.startDate || !form.endDate) return toast({ title: "Erro", description: "Informe as datas de início e fim.", variant: "destructive" })

    setSaving(true)
    const res = await upsertSalesGoalAction({
      id: editingGoal?.id,
      partnerId: props.partnerId,
      name: form.name,
      periodType: form.periodType,
      startDate: form.startDate,
      endDate: form.endDate,
      targetAmount: Number(form.targetAmount || 0),
      bonusType: form.bonusType,
      bonusValue: Number(form.bonusValue || 0),
      appliesTo: form.appliesTo,
      userId: form.appliesTo === "user" ? form.userId || null : null,
      goalType: form.goalType,
    })
    setSaving(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    setModalOpen(false)
    await refreshData()
    toast({ title: "Sucesso", description: editingGoal ? "Meta atualizada." : "Meta criada." })
  }

  const removeGoal = async (id: string) => {
    setDeletingId(id)
    const res = await deleteSalesGoalAction(props.partnerId, id)
    setDeletingId(null)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    await refreshData()
    toast({ title: "Sucesso", description: "Meta excluída." })
  }

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Metas</h1>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Acompanhe desempenho, bônus e ranking de vendedores
            </p>
          </div>
        </div>

        <GoalsPageControls
          activeTab={activeTab}
          onTabChange={setActiveTab}
          search={search}
          onSearchChange={setSearch}
          onCreate={openCreate}
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
                    subtitle="Crie metas para acompanhar e premiar desempenho da equipe."
                    itemButton={{ text: "Nova meta", action: openCreate }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paginatedGoals.map((goal) => (
                    <div key={goal.id} className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <h3 className="font-bold text-brand-dark dark:text-dark-heading">{goal.name}</h3>
                          <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            {goal.period_type === "monthly" ? "Mensal" : "Semanal"} • {goal.start_date} a {goal.end_date}
                          </p>
                          <p className="text-xs text-brand-inactive-text mt-1">
                            Tipo: {goal.goal_type === "sales" ? "Vendas" : goal.goal_type === "service_orders" ? "Ordem de Serviço" : "Ambos"}
                          </p>
                        </div>
                        <Badge variant={goal.status === "Concluída" ? "green" : goal.status === "Expirada" ? "red" : "orange"}>
                          {goal.status}
                        </Badge>
                      </div>

                      <div className="space-y-2 mt-4">
                        <div className="text-sm text-brand-dark dark:text-dark-heading">
                          Meta: <strong>{formatCurrency(goal.target_amount)}</strong>
                        </div>
                        <div className="text-sm text-brand-dark dark:text-dark-heading">
                          Progresso: <strong>{formatCurrency(goal.current_amount)}</strong> ({goal.progress_percent}%)
                        </div>
                        <div className="h-2 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden">
                          <div className="h-full bg-brand-green transition-all duration-300" style={{ width: `${Math.min(100, goal.progress_percent)}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-6">
                        <Button variant="outline" className="flex-1 rounded-xl h-10 text-xs" onClick={() => openEdit(goal)}>Editar</Button>
                        <Button variant="ghost" className="flex-1 rounded-xl h-10 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" disabled={deletingId === goal.id} onClick={() => removeGoal(goal.id)}>
                          {deletingId === goal.id ? "..." : "Excluir"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
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
                  {ranking.map((row) => {
                    const medal = row.position === 1 ? "🥇" : row.position === 2 ? "🥈" : row.position === 3 ? "🥉" : ""
                    const isTop3 = row.position <= 3
                    return (
                      <div 
                        key={row.user_id} 
                        className={`rounded-2xl border ${isTop3 ? 'border-brand-green bg-brand-green/5' : 'border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface'} p-5 flex items-center justify-between gap-4 transition-all hover:shadow-sm`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${isTop3 ? 'bg-brand-green text-white' : 'bg-brand-gray text-brand-dark'}`}>
                            {row.position}
                          </div>
                          <div>
                            <p className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2 text-lg">
                              {row.seller_name} {medal}
                            </p>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                              Total vendido: <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(row.total_amount)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-brand-inactive-text mb-1 font-medium">Atingimento da meta</p>
                          <Badge variant={isTop3 ? "green" : "gray"} className="text-sm px-3 py-1">{row.progress_percent}%</Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
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

      <DefaultModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGoal ? "Editar meta" : "Nova meta"}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" className="rounded-xl" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button className="rounded-xl px-8" onClick={saveGoal} disabled={saving}>{saving ? "Salvando..." : "Salvar meta"}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input label="Nome da meta" placeholder="Ex: Meta de Vendas Abril" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          
          <FormDropdown
            label="Tipo de Meta"
            value={form.goalType}
            setValue={(value) => setForm((p) => ({ ...p, goalType: value as any }))}
            options={[
              { value: "sales", label: "Apenas Vendas" },
              { value: "service_orders", label: "Apenas Ordens de Serviço" },
              { value: "both", label: "Vendas e Ordens de Serviço" }
            ]}
          />
          
          <FormDropdown
            label="Recorrência"
            value={form.periodType}
            setValue={(value) => setForm((p) => ({ ...p, periodType: value as any }))}
            options={[{ value: "monthly", label: "Mensal" }, { value: "weekly", label: "Semanal" }]}
          />
          
          <Input label="Início" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input label="Fim" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
          
          <Input label="Valor Alvo (R$)" placeholder="0,00" value={form.targetAmount} onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value }))} />
          
          <div className="grid grid-cols-2 gap-2">
            <FormDropdown
              label="Tipo bônus"
              value={form.bonusType}
              setValue={(value) => setForm((p) => ({ ...p, bonusType: value as any }))}
              options={[{ value: "fixed", label: "Fixo (R$)" }, { value: "percentage", label: "Percentual (%)" }]}
            />
            <Input label="Valor bônus" value={form.bonusValue} onChange={(e) => setForm((p) => ({ ...p, bonusValue: e.target.value }))} />
          </div>

          <FormDropdown
            label="Abrangência"
            value={form.appliesTo}
            setValue={(value) => setForm((p) => ({ ...p, appliesTo: value as any }))}
            options={[{ value: "all", label: "Todos os vendedores" }, { value: "user", label: "Vendedor específico" }]}
          />
          
          {form.appliesTo === "user" ? (
            <FormDropdown
              label="Vendedor"
              value={form.userId}
              setValue={(value) => setForm((p) => ({ ...p, userId: value }))}
              options={props.sellers.map((s) => ({ value: s.id, label: s.name }))}
            />
          ) : <div />}
        </div>
      </DefaultModal>
    </FadeIn>
  )
}

function SummaryCard({ title, value }: { title: string, value: string }) {
  return (
    <div className="rounded-2xl border border-brand-border dark:border-dark-border p-6 bg-white dark:bg-dark-surface shadow-sm">
      <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body mb-2 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{value}</p>
    </div>
  )
}

