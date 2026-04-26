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
    })
    setModalOpen(true)
  }

  const saveGoal = async () => {
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
                        </div>
                        <Badge variant={goal.status === "Concluída" ? "green" : goal.status === "Expirada" ? "red" : "orange"}>
                          {goal.status}
                        </Badge>
                      </div>

                      <div className="space-y-2">
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

                      <div className="flex items-center gap-2 mt-4">
                        <Button variant="outline" onClick={() => openEdit(goal)}>Editar</Button>
                        <Button variant="outline" onClick={() => openEdit(goal)}>Ver detalhes</Button>
                        <Button variant="ghost" disabled={deletingId === goal.id} onClick={() => removeGoal(goal.id)}>
                          {deletingId === goal.id ? "Excluindo..." : "Excluir"}
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
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-2">
                <FormDropdown
                  label="Período"
                  value={rankingPeriodMode}
                  setValue={(value) => setRankingPeriodMode(value as "monthly" | "weekly" | "custom")}
                  options={[
                    { value: "monthly", label: "Mensal" },
                    { value: "weekly", label: "Semanal" },
                    { value: "custom", label: "Personalizado" },
                  ]}
                />
                {rankingPeriodMode === "custom" && (
                  <>
                    <Input label="Data início" type="date" value={rankingStartDate} onChange={(e) => setRankingStartDate(e.target.value)} />
                    <Input label="Data fim" type="date" value={rankingEndDate} onChange={(e) => setRankingEndDate(e.target.value)} />
                  </>
                )}
                <div className="flex items-end">
                  <Button onClick={refreshRanking} disabled={rankingLoading || (rankingPeriodMode === "custom" && (!rankingStartDate || !rankingEndDate))}>
                    {rankingLoading ? "Carregando..." : "Aplicar filtro"}
                  </Button>
                </div>
              </div>

              {ranking.length === 0 && !rankingLoading ? (
                <div className="min-h-[260px] flex items-center justify-center">
                  <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                    imageAlt="Sem ranking"
                    title="Sem dados para o período"
                    subtitle="Ajuste o período para visualizar o ranking de vendedores."
                  />
                </div>
              ) : null}

              {ranking.map((row) => {
                const medal = row.position === 1 ? "🥇" : row.position === 2 ? "🥈" : row.position === 3 ? "🥉" : ""
                return (
                  <div key={row.user_id} className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-brand-dark dark:text-dark-heading">
                        #{row.position} {medal} {row.seller_name}
                      </p>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Total vendido: {formatCurrency(row.total_amount)}
                      </p>
                    </div>
                    <Badge variant={row.position <= 3 ? "green" : "gray"}>{row.progress_percent}% meta</Badge>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === "Resumo" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Total vendido</p>
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(summary.total_sold)}</p>
              </div>
              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Total em comissões</p>
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(summary.total_commissions)}</p>
              </div>
              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Total em bônus pagos</p>
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(summary.total_bonus_paid)}</p>
              </div>
              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Metas ativas</p>
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{summary.active_goals}</p>
              </div>
              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-4">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Metas concluídas</p>
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">{summary.achieved_goals}</p>
              </div>
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
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveGoal} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Nome" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <FormDropdown
            label="Período"
            value={form.periodType}
            setValue={(value) => setForm((p) => ({ ...p, periodType: value as any }))}
            options={[{ value: "monthly", label: "Mensal" }, { value: "weekly", label: "Semanal" }]}
          />
          <Input label="Data início" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input label="Data fim" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
          <Input label="Valor meta" value={form.targetAmount} onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value }))} />
          <FormDropdown
            label="Tipo bônus"
            value={form.bonusType}
            setValue={(value) => setForm((p) => ({ ...p, bonusType: value as any }))}
            options={[{ value: "fixed", label: "Fixo (R$)" }, { value: "percentage", label: "Percentual (%)" }]}
          />
          <Input label="Valor bônus" value={form.bonusValue} onChange={(e) => setForm((p) => ({ ...p, bonusValue: e.target.value }))} />
          <FormDropdown
            label="Aplicação"
            value={form.appliesTo}
            setValue={(value) => setForm((p) => ({ ...p, appliesTo: value as any }))}
            options={[{ value: "all", label: "Todos vendedores" }, { value: "user", label: "Vendedor específico" }]}
          />
          {form.appliesTo === "user" && (
            <FormDropdown
              label="Vendedor"
              value={form.userId}
              setValue={(value) => setForm((p) => ({ ...p, userId: value }))}
              options={props.sellers.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
        </div>
      </DefaultModal>
    </FadeIn>
  )
}
