"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Badge, Button, ActionsDropdown, ThreeDotsLoader, AlertModal } from "@/components/reusable"
import { ChevronLeftIcon, TargetIcon, Users, MoneyIcon, AwardIcon, CheckCircleIcon, CalendarIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { FadeIn } from "@/components/animations/FadeIn"
import { useSidebar } from "@/lib/sidebar-context"
import { deleteSalesGoalAction, getSalesGoalByIdAction } from "@/app/actions/erp/goals"
import { useToast } from "@/hooks/use-toast"

interface GoalDetailPageProps {
  partnerId: string
  goalId: string
  initialGoalData?: any
  onBack: () => void
  onEdit: (goalId: string) => void
  onDuplicate: (goalId: string) => void
  onSuccessMutation?: () => void
}

function goalTypeLabel(goalType: string) {
  if (goalType === "sales") return "Apenas Vendas"
  if (goalType === "service_orders") return "Apenas Ordens de Serviço"
  return "Vendas e Ordens de Serviço"
}

function statusVariant(status: string) {
  if (status === "Concluída") return "green" as const
  if (status === "Expirada") return "red" as const
  return "orange" as const
}

export default function GoalDetailPage({
  partnerId,
  goalId,
  initialGoalData,
  onBack,
  onEdit,
  onDuplicate,
  onSuccessMutation,
}: GoalDetailPageProps) {
  const { toast } = useToast()
  const { setHeaderOverride, setSidebarCard } = useSidebar()

  const [goal, setGoal] = useState<any | null>(initialGoalData || null)
  const [isLoading, setIsLoading] = useState(!initialGoalData)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleBack = useCallback(() => onBack(), [onBack])

  useEffect(() => {
    let isMounted = true
    async function loadGoal() {
      setIsLoading(true)
      try {
        const res = await getSalesGoalByIdAction(partnerId, goalId)
        if (isMounted) {
          if (res.success) {
            setGoal(res.goal)
          } else {
            toast({ title: "Erro", description: res.error || "Meta não encontrada", variant: "destructive" })
            onBack()
          }
        }
      } catch (err) {
        if (isMounted) {
          toast({ title: "Erro", description: "Erro ao carregar detalhes da meta", variant: "destructive" })
          onBack()
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadGoal()
    return () => {
      isMounted = false
    }
  }, [partnerId, goalId, onBack, toast])

  // Sync Header Override and Sidebar Card
  useEffect(() => {
    setHeaderOverride({
      title: goal?.name || "Detalhes da meta",
      onBack: handleBack,
      isSubPage: true,
    })
    return () => setHeaderOverride(null)
  }, [goal?.name, handleBack, setHeaderOverride])

  useEffect(() => {
    if (!goal) return
    setSidebarCard(
      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-brand-dark/30 border border-dark-border">
        <div className="w-10 h-10 rounded-full bg-brand-green/20 border border-brand-green/30 flex items-center justify-center shrink-0">
          <TargetIcon className="w-5 h-5 text-brand-green" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{goal.name}</p>
          <p className="text-[11px] text-brand-inactive-text truncate">
            {goal.period_type === "monthly" ? "Mensal" : "Semanal"} • {formatCurrency(goal.target_amount || 0)}
          </p>
        </div>
      </div>
    )
    return () => setSidebarCard(null)
  }, [goal, setSidebarCard])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await deleteSalesGoalAction(partnerId, goalId)
      if (res.success) {
        toast({ title: "Sucesso", description: "Meta excluída com sucesso." })
        if (onSuccessMutation) onSuccessMutation()
        onBack()
      } else {
        toast({ title: "Erro", description: res.error || "Não foi possível excluir a meta.", variant: "destructive" })
      }
    } catch {
      toast({ title: "Erro", description: "Erro ao excluir meta.", variant: "destructive" })
    } finally {
      setIsDeleting(false)
      setShowDeleteModal(false)
    }
  }

  if (isLoading || !goal) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
        <ThreeDotsLoader />
      </div>
    )
  }

  const progressPercent = goal.progress_percent || 0
  const currentAmount = goal.current_amount || 0
  const targetAmount = goal.target_amount || 0
  const assignedSellers: string[] = goal.assigned_user_names || []
  const progressDetail: Array<{
    id: string
    user_id: string
    seller_name: string
    current_amount: number
    achieved: boolean
  }> = goal.progress_detail || []

  return (
    <FadeIn>
      <div className="flex flex-col min-h-[calc(100vh-65px)] bg-white dark:bg-dark-background pb-12">
        {/* Header section */}
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
          <div className="max-w-[1300px] mx-auto px-4 md:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  className="w-10 h-10 p-0 flex items-center justify-center rounded-xl shrink-0"
                >
                  <ChevronLeftIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                </Button>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <h1 className="font-bold text-xl md:text-2xl text-brand-dark dark:text-dark-heading truncate">
                      {goal.name}
                    </h1>
                    <Badge variant={statusVariant(goal.status)} className="shrink-0">
                      {goal.status}
                    </Badge>
                  </div>
                  <p className="text-xs md:text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate">
                    {goal.period_type === "monthly" ? "Recorrência Mensal" : "Recorrência Semanal"} • Período de{" "}
                    {formatDate(goal.start_date)} até {formatDate(goal.end_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" onClick={() => onEdit(goalId)}>
                  Editar
                </Button>
                <ActionsDropdown
                  onEdit={() => onEdit(goalId)}
                  onDuplicate={() => onDuplicate(goalId)}
                  onDelete={() => setShowDeleteModal(true)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="max-w-[1300px] mx-auto w-full px-4 md:px-8 pt-6 space-y-6">
          {/* Top Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Target Amount */}
            <div className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                  Valor Meta
                </span>
                <div className="w-9 h-9 rounded-xl bg-brand-slate dark:bg-dark-border/40 flex items-center justify-center">
                  <TargetIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                  {formatCurrency(targetAmount)}
                </p>
              </div>
            </div>

            {/* Current Amount */}
            <div className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                  Progresso Atual
                </span>
                <div className="w-9 h-9 rounded-xl bg-brand-green/10 flex items-center justify-center">
                  <MoneyIcon className="w-5 h-5 text-brand-green" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-brand-green tracking-tight">
                  {formatCurrency(currentAmount)}
                </p>
              </div>
            </div>

            {/* Progress Percentage */}
            <div className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                  Atingimento
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <CheckCircleIcon className="w-5 h-5 text-blue-500" />
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                    {progressPercent}%
                  </p>
                </div>
                <div className="h-2 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden mt-2">
                  <div
                    className="h-full bg-brand-green transition-all duration-300"
                    style={{ width: `${Math.min(100, progressPercent)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Bonus */}
            <div className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body uppercase tracking-wider">
                  Bônus / Premiação
                </span>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <AwardIcon className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading tracking-tight">
                  {goal.bonus_type === "fixed"
                    ? formatCurrency(goal.bonus_value || 0)
                    : `${goal.bonus_value || 0}% da meta`}
                </p>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium mt-0.5">
                  {goal.bonus_distribution === "proportional" ? "Divisão Proporcional" : "Divisão Igualitária"}
                </p>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: General info */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-3">
                  Regras e Informações
                </h3>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Tipo de Meta</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">{goalTypeLabel(goal.goal_type)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-t border-brand-border/40 dark:border-dark-border/40">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Recorrência</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                      {goal.period_type === "monthly" ? "Mensal" : "Semanal"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-t border-brand-border/40 dark:border-dark-border/40">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Início</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDate(goal.start_date)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-t border-brand-border/40 dark:border-dark-border/40">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Término</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDate(goal.end_date)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-t border-brand-border/40 dark:border-dark-border/40">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Abrangência</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                      {assignedSellers.length > 0 ? `${assignedSellers.length} Vendedor(es)` : "Todos os Vendedores"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-t border-brand-border/40 dark:border-dark-border/40">
                    <span className="text-brand-inactive-text dark:text-dark-body font-medium">Lançamento Auto.</span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                      {goal.auto_launch_bonus ? "Sim (Financeiro)" : "Não"}
                    </span>
                  </div>

                  {goal.bonus_account_name && (
                    <div className="flex justify-between items-center py-1 border-t border-brand-border/40 dark:border-dark-border/40">
                      <span className="text-brand-inactive-text dark:text-dark-body font-medium">Conta Financeira</span>
                      <span className="font-bold text-brand-dark dark:text-dark-heading">{goal.bonus_account_name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Seller Progress breakdown */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                <div className="flex items-center justify-between border-b border-brand-border dark:border-dark-border pb-3">
                  <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-green" />
                    Desempenho dos Vendedores
                  </h3>
                  <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body bg-brand-slate dark:bg-dark-border/40 px-2.5 py-1 rounded-lg">
                    {progressDetail.length > 0 ? `${progressDetail.length} participante(s)` : "Sem vendedores registrados"}
                  </span>
                </div>

                {progressDetail.length === 0 ? (
                  <div className="py-8 text-center text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                    Nenhum progresso individual de vendedor registrado para esta meta ainda.
                  </div>
                ) : (
                  <div className="divide-y divide-brand-border dark:divide-dark-border">
                    {progressDetail.map((item) => {
                      const itemPercent = targetAmount > 0 ? Math.min(100, Math.round((item.current_amount / targetAmount) * 100)) : 0
                      return (
                        <div key={item.id || item.user_id} className="py-4 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                {item.seller_name}
                              </span>
                              {item.achieved && (
                                <Badge variant="green" className="scale-90">
                                  Atingiu a meta
                                </Badge>
                              )}
                            </div>
                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                              {formatCurrency(item.current_amount)}
                            </span>
                          </div>

                          <div className="w-full bg-brand-gray dark:bg-dark-border h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-green transition-all duration-300"
                              style={{ width: `${itemPercent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <AlertModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Excluir meta?"
          description={`Tem certeza que deseja excluir a meta "${goal.name}"? Esta ação não pode ser desfeita.`}
          confirmText="Excluir"
          variant="danger"
          onConfirm={handleDelete}
        />
      </div>
    </FadeIn>
  )
}
