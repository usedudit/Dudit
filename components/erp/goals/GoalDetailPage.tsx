"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
    ActionsDropdown,
    AlertModal,
    Badge,
    Button,
    FormSection,
    Pagination,
    SidebarCard,
    ThreeDotsLoader,
} from "@/components/reusable"
import { HorizontalKPICard } from "@/components/erp/dashboard/cards/HorizontalKPICard"
import { AwardIcon, CheckCircleIcon, ChevronLeftIcon, EditIcon, MoneyIcon, TargetIcon } from "@/lib/icons"
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

const SELLERS_PAGE_SIZE = 8

function statusVariant(status: string) {
    if (status === "Concluída") return "green" as const
    if (status === "Expirada") return "red" as const
    return "orange" as const
}

function KeyValueRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-start text-[14px] gap-4 py-1">
            <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
            <div className="text-right text-brand-dark dark:text-dark-heading font-bold text-sm">{value}</div>
        </div>
    )
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
    const [isScrolled, setIsScrolled] = useState(false)
    const [sellersPage, setSellersPage] = useState(1)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

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
            } catch {
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

    useEffect(() => {
        setSellersPage(1)
        setIsScrolled(false)
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0
    }, [goalId])

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

    const handleScroll = useCallback(() => {
        if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }, [])

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

    const progressDetail: Array<{
        id: string
        user_id: string
        seller_name: string
        current_amount: number
        achieved: boolean
    }> = goal?.progress_detail || []

    const totalSellerPages = Math.max(1, Math.ceil(progressDetail.length / SELLERS_PAGE_SIZE))
    const paginatedSellers = useMemo(
        () => progressDetail.slice((sellersPage - 1) * SELLERS_PAGE_SIZE, sellersPage * SELLERS_PAGE_SIZE),
        [progressDetail, sellersPage],
    )

    const progressPercent = goal?.progress_percent || 0
    const currentAmount = goal?.current_amount || 0
    const targetAmount = goal?.target_amount || 0
    const assignedSellers: string[] = goal?.assigned_user_names || []

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!goal) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">Meta não encontrada.</p>
                <button type="button" onClick={onBack} className="mt-4 px-4 py-2 border rounded-md text-sm">
                    Voltar
                </button>
            </div>
        )
    }

    return (
        <FadeIn>
            <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
                <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-8">
                    {/* Sticky Header */}
                    <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                        <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                            {/* Back button - desktop only */}
                            <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                </Button>
                            </div>

                            {/* Title row */}
                            <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                    <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                        <span className="hidden md:inline truncate">{goal.name}</span>
                                        <Badge variant={statusVariant(goal.status)} className="whitespace-nowrap scale-90 shrink-0">
                                            {goal.status}
                                        </Badge>
                                    </h1>

                                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                        {goal.period_type === "monthly" ? "Recorrência Mensal" : "Recorrência Semanal"} • Período de{" "}
                                        {formatDate(goal.start_date)} até {formatDate(goal.end_date)}
                                    </div>
                                </div>

                                {/* Desktop action buttons */}
                                <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                    <ActionsDropdown
                                        onEdit={() => onEdit(goalId)}
                                        onDuplicate={() => onDuplicate(goalId)}
                                        onDelete={() => setShowDeleteModal(true)}
                                    />
                                    <Button className="whitespace-nowrap" onClick={() => onEdit(goalId)} leftIcon={<EditIcon size={18} />}>
                                        Editar meta
                                    </Button>
                                </div>
                            </div>

                            <div className={`hidden md:block transition-all duration-500 ${isScrolled ? "h-0" : "h-4"}`} />
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                        <FadeIn className="grid grid-cols-12 gap-y-8 md:gap-y-0 relative">
                            {/* Main column */}
                            <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                <HorizontalKPICard
                                    className="mb-10"
                                    items={[
                                        {
                                            title: "Valor Meta",
                                            value: formatCurrency(targetAmount),
                                            icon: TargetIcon,
                                            iconBg: "bg-brand-slate dark:bg-dark-border/40",
                                            iconColor: "text-brand-dark dark:text-dark-heading",
                                        },
                                        {
                                            title: "Progresso Atual",
                                            value: formatCurrency(currentAmount),
                                            icon: MoneyIcon,
                                            iconBg: "bg-brand-green/10",
                                            iconColor: "text-brand-green",
                                        },
                                        {
                                            title: "Atingimento",
                                            value: `${progressPercent}%`,
                                            icon: CheckCircleIcon,
                                            iconBg: "bg-blue-500/10",
                                            iconColor: "text-blue-500",
                                        },
                                        {
                                            title: "Bônus / Premiação",
                                            value:
                                                goal.bonus_type === "fixed"
                                                    ? formatCurrency(goal.bonus_value || 0)
                                                    : `${goal.bonus_value || 0}% da meta`,
                                            icon: AwardIcon,
                                            iconBg: "bg-amber-500/10",
                                            iconColor: "text-amber-500",
                                        },
                                    ]}
                                />

                                <FormSection
                                    title="Desempenho dos Vendedores"
                                    titleRight={
                                        <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body bg-brand-slate dark:bg-dark-border/40 px-2.5 py-1 rounded-lg">
                                            {progressDetail.length > 0
                                                ? `${progressDetail.length} participante(s)`
                                                : "Sem vendedores registrados"}
                                        </span>
                                    }
                                >
                                    {progressDetail.length === 0 ? (
                                        <div className="py-8 text-center text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                                            Nenhum progresso individual de vendedor registrado para esta meta ainda.
                                        </div>
                                    ) : (
                                        <>
                                            <div className="divide-y divide-brand-border dark:divide-dark-border">
                                                {paginatedSellers.map((item) => {
                                                    const itemPercent =
                                                        targetAmount > 0
                                                            ? Math.min(100, Math.round((item.current_amount / targetAmount) * 100))
                                                            : 0
                                                    return (
                                                        <div key={item.id || item.user_id} className="py-4 flex flex-col gap-2">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                        {item.seller_name}
                                                                    </span>
                                                                    {item.achieved && (
                                                                        <Badge variant="green" className="scale-90 shrink-0">
                                                                            Atingiu a meta
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading shrink-0">
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

                                            {totalSellerPages > 1 && (
                                                <Pagination
                                                    inline
                                                    currentPage={sellersPage}
                                                    totalPages={totalSellerPages}
                                                    onPageChange={setSellersPage}
                                                />
                                            )}
                                        </>
                                    )}
                                </FormSection>
                            </div>

                            {/* Sidebar - with divider */}
                            <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                <SidebarCard hasSeparator hasTopStrip title="Regras e Informações">
                                    <div className="space-y-3 text-sm divide-y divide-brand-border/40 dark:divide-dark-border/40">
                                        <KeyValueRow
                                            label="Recorrência"
                                            value={goal.period_type === "monthly" ? "Mensal" : "Semanal"}
                                        />
                                        <KeyValueRow label="Início" value={formatDate(goal.start_date)} />
                                        <KeyValueRow label="Término" value={formatDate(goal.end_date)} />
                                        <KeyValueRow
                                            label="Abrangência"
                                            value={
                                                assignedSellers.length > 0
                                                    ? `${assignedSellers.length} Vendedor(es)`
                                                    : "Todos os Vendedores"
                                            }
                                        />
                                        <KeyValueRow
                                            label="Divisão do bônus"
                                            value={
                                                goal.bonus_distribution === "proportional"
                                                    ? "Proporcional"
                                                    : "Igualitária"
                                            }
                                        />
                                        <KeyValueRow
                                            label="Lançamento Auto."
                                            value={goal.auto_launch_bonus ? "Sim (Financeiro)" : "Não"}
                                        />
                                        {goal.bonus_account_name && (
                                            <KeyValueRow label="Conta Financeira" value={goal.bonus_account_name} />
                                        )}
                                    </div>
                                </SidebarCard>
                            </div>
                        </FadeIn>
                    </div>
                </div>

                <AlertModal
                    isOpen={showDeleteModal}
                    onClose={() => setShowDeleteModal(false)}
                    title="Excluir meta?"
                    description={`Tem certeza que deseja excluir a meta "${goal.name}"? Esta ação não pode ser desfeita.`}
                    confirmText="Excluir"
                    variant="danger"
                    isLoading={isDeleting}
                    onConfirm={handleDelete}
                />
            </div>
        </FadeIn>
    )
}
