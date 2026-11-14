"use client"

import React, { useState, useTransition, useMemo } from "react"
import {
    Button,
    Badge,
    Input,
    Pagination,
    IconPlaceholder,
    ActionsDropdown,
    DefaultModal,
    FormTextarea,
} from "@/components/reusable"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { toast } from "@/hooks/use-notification"
import {
    RepeatIcon,
    EditIcon,
    EyeIcon,
    StoreIcon,
    SearchIcon,
    ListIcon,
    GridIcon,
    FilterIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    getAdminCatalogPlanDetail,
    updateAdminRecurringPlan,
} from "@/app/actions/admin/catalog"

interface PlansListProps {
    initialItems: any[]
}

const FREQUENCY_LABELS: Record<string, string> = {
    weekly: "Semanal",
    biweekly: "Quinzenal",
    monthly: "Mensal",
    bimonthly: "Bimestral",
    quarterly: "Trimestral",
    semiannual: "Semestral",
    yearly: "Anual",
}

export default function PlansList({ initialItems }: PlansListProps) {
    const [plans, setPlans] = useState(initialItems)
    const [activeTab, setActiveTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 10

    // Filter Sheet state
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
    const [frequencyFilters, setFrequencyFilters] = useState<string[]>([])

    // Detail & Edit State
    const [selectedPlanDetail, setSelectedPlanDetail] = useState<any | null>(null)
    const [isLoadingDetail, setIsLoadingDetail] = useState(false)

    const [editingPlan, setEditingPlan] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        status: string
        name: string
        price: number
        description: string
    }>({
        status: "active",
        name: "",
        price: 0,
        description: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const activeCount = plans.filter((p) => p.status === "active" || p.status === "ativo").length
    const inactiveCount = plans.length - activeCount

    const tabs = useMemo(() => [
        { id: "all", label: "Todos os Planos", count: plans.length },
        { id: "active", label: "Ativos", count: activeCount },
        { id: "inactive", label: "Inativos", count: inactiveCount },
    ], [plans.length, activeCount, inactiveCount])

    const filtered = useMemo(() => {
        return plans.filter((p) => {
            const isAct = p.status === "active" || p.status === "ativo"
            let matchesTab = true
            if (activeTab === "active") matchesTab = isAct
            else if (activeTab === "inactive") matchesTab = !isAct

            const freq = (p.billing_frequency || p.frequency || p.interval || "").toLowerCase()
            const matchesFrequency =
                frequencyFilters.length === 0 || frequencyFilters.includes(freq)

            const term = search.trim().toLowerCase()
            const matchesSearch =
                !term ||
                p.name?.toLowerCase().includes(term) ||
                p.partner_name?.toLowerCase().includes(term) ||
                p.stores?.name?.toLowerCase().includes(term)

            return matchesTab && matchesFrequency && matchesSearch
        })
    }, [plans, activeTab, frequencyFilters, search])

    const paginated = useMemo(() => {
        return filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    }, [filtered, page])

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenDetail = async (plan: any) => {
        setSelectedPlanDetail(plan)
        setIsLoadingDetail(true)
        try {
            const res = await getAdminCatalogPlanDetail(plan.id)
            if (res.success && res.data?.plan) {
                setSelectedPlanDetail(res.data.plan)
            }
        } catch (err) {
            console.error("Failed to fetch plan detail:", err)
        } finally {
            setIsLoadingDetail(false)
        }
    }

    const handleOpenEdit = (plan: any) => {
        setEditingPlan(plan)
        setEditForm({
            status: plan.status || "active",
            name: plan.name || "",
            price: Number(plan.price || 0),
            description: plan.description || "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingPlan) return

        const changedFields: string[] = []
        if (editForm.status !== editingPlan.status) changedFields.push("status")
        if (editForm.name !== (editingPlan.name || "")) changedFields.push("nome")
        if (editForm.price !== Number(editingPlan.price || 0)) changedFields.push("preço")
        if (editForm.description !== (editingPlan.description || "")) changedFields.push("descrição")

        await runAction({
            title: "Salvar Alterações no Plano Recorrente",
            description: `Plano "${editingPlan.name}" (${editingPlan.partner_name || editingPlan.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao vendedor",
            runner: async (payload) => {
                const partnerId = editingPlan.partner_id || editingPlan.partnerId || editingPlan.stores?.partner_id || ""
                const res = await updateAdminRecurringPlan(
                    {
                        partnerId,
                        planId: editingPlan.id,
                        status: editForm.status as any,
                        name: editForm.name,
                        description: editForm.description,
                    },
                    payload
                )

                if (!res.success) {
                    toast({ title: "Erro ao salvar", description: res.error, variant: "destructive" })
                    return { success: false, error: res.error }
                }

                toast({ title: "Sucesso", description: "Plano atualizado com sucesso." })
                setPlans((prev) =>
                    prev.map((p) =>
                        p.id === editingPlan.id
                            ? {
                                  ...p,
                                  status: editForm.status,
                                  name: editForm.name,
                                  price: editForm.price,
                                  description: editForm.description,
                              }
                            : p
                    )
                )
                setEditingPlan(null)
                if (selectedPlanDetail?.id === editingPlan.id) {
                    setSelectedPlanDetail((prev: any) => ({
                        ...prev,
                        status: editForm.status,
                        name: editForm.name,
                        price: editForm.price,
                        description: editForm.description,
                    }))
                }
                return { success: true }
            },
        })
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "frequency",
            title: "Frequência de Cobrança",
            type: "checkbox-list",
            options: ["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"],
            optionLabels: FREQUENCY_LABELS,
        },
    ]

    return (
        <FadeIn className="w-full space-y-6 pt-4 px-4 md:px-8 max-w-[1700px] mx-auto pb-12">
            {/* Top Controls matching ERP */}
            <div className="flex flex-col gap-4">
                {/* Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id)
                                    setPage(1)
                                }}
                                className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                                    isActive
                                        ? "bg-brand-dark dark:bg-white text-white dark:text-brand-dark shadow-sm"
                                        : "bg-white dark:bg-dark-surface text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-white border border-brand-border dark:border-dark-border"
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isActive
                                            ? "bg-white/20 text-white dark:bg-brand-dark/20 dark:text-brand-dark"
                                            : "bg-brand-gray dark:bg-dark-border text-brand-inactive-text"
                                    }`}
                                >
                                    {tab.count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Search & Actions Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80 md:w-96">
                        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                        <Input
                            placeholder="Buscar plano ou loja..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value)
                                setPage(1)
                            }}
                            className="pl-10 h-10 text-xs rounded-xl border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsFilterSheetOpen(true)}
                            className="flex items-center gap-2 text-xs font-semibold h-10 px-3 border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
                        >
                            <FilterIcon className="w-3.5 h-3.5" />
                            <span>Filtros</span>
                            {frequencyFilters.length > 0 && (
                                <span className="w-2 h-2 rounded-full bg-brand-green" />
                            )}
                        </Button>

                        <div className="flex items-center border border-brand-border dark:border-dark-border rounded-xl bg-white dark:bg-dark-surface p-0.5">
                            <button
                                onClick={() => setViewMode("list")}
                                className={`p-2 rounded-lg transition-colors ${
                                    viewMode === "list"
                                        ? "bg-brand-green-light dark:bg-dark-border text-brand-dark dark:text-white"
                                        : "text-brand-inactive-text hover:text-brand-dark"
                                }`}
                                title="Visualização em Lista"
                            >
                                <ListIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode("grid")}
                                className={`p-2 rounded-lg transition-colors ${
                                    viewMode === "grid"
                                        ? "bg-brand-green-light dark:bg-dark-border text-brand-dark dark:text-white"
                                        : "text-brand-inactive-text hover:text-brand-dark"
                                }`}
                                title="Visualização em Grade"
                            >
                                <GridIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {filtered.length === 0 ? (
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-8 border border-brand-border dark:border-dark-border flex flex-col justify-center min-h-[360px]">
                    <IconPlaceholder
                        title="Nenhum plano recorrente encontrado"
                        subtitle="Não há planos correspondentes aos filtros aplicados."
                        className="py-12"
                    />
                </div>
            ) : viewMode === "list" ? (
                /* ERP List / Table Layout */
                <div className="bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-brand-gray/50 dark:bg-dark-border/30 border-b border-brand-border dark:border-dark-border">
                                <tr>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Nome do Plano
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Loja / Vendedor
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Frequência
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Preço / Mensalidade
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Cobrança
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body text-center">
                                        Status
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body text-center">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                                {paginated.map((plan) => {
                                    const isAct = plan.status === "active" || plan.status === "ativo"
                                    const storeName = plan.partner_name || plan.stores?.name || "Loja Parceira"
                                    const freq = (plan.billing_frequency || plan.frequency || plan.interval || "monthly").toLowerCase()

                                    return (
                                        <tr
                                            key={plan.id}
                                            onClick={() => handleOpenDetail(plan)}
                                            className="h-[72px] cursor-pointer hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20 transition-colors"
                                        >
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                        <RepeatIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading block">
                                                            {plan.name}
                                                        </span>
                                                        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                            {plan.items_count ? `${plan.items_count} item(ns) inclusos` : "Plano Recorrente"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-1.5 font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    <StoreIcon size={14} className="text-brand-green shrink-0" />
                                                    <span className="truncate max-w-[180px]">{storeName}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-semibold text-brand-dark dark:text-dark-heading capitalize">
                                                {FREQUENCY_LABELS[freq] || freq}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <span className="text-[14px] font-bold text-brand-green">
                                                    {formatCurrency(plan.price || 0)}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs text-brand-inactive-text dark:text-dark-body">
                                                {plan.billing_mode === "manual" ? "Manual" : "Mercado Pago Automático"}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-center">
                                                <Badge variant={isAct ? "green" : "gray"}>
                                                    {isAct ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </td>
                                            <td
                                                className="py-3.5 px-5 align-middle text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenEdit(plan)}
                                                    className="inline-flex items-center gap-1 text-xs h-8 px-2.5"
                                                >
                                                    <EditIcon className="w-3.5 h-3.5" />
                                                    <span>Editar</span>
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="p-4 border-t border-brand-border dark:border-dark-border flex justify-end">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            ) : (
                /* ERP Grid Mode matching PlanGridCard */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {paginated.map((plan) => {
                            const isAct = plan.status === "active" || plan.status === "ativo"
                            const storeName = plan.partner_name || plan.stores?.name || "Loja Parceira"
                            const freq = (plan.billing_frequency || plan.frequency || plan.interval || "monthly").toLowerCase()

                            return (
                                <div
                                    key={plan.id}
                                    onClick={() => handleOpenDetail(plan)}
                                    className="p-5 rounded-[24px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-9 h-9 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                    <RepeatIcon size={16} />
                                                </div>
                                                <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors line-clamp-1">
                                                    {plan.name}
                                                </span>
                                            </div>
                                            <Badge variant={isAct ? "green" : "gray"}>
                                                {isAct ? "Ativo" : "Inativo"}
                                            </Badge>
                                        </div>

                                        <div className="space-y-1 mb-4">
                                            <p className="text-base font-bold text-brand-green">
                                                {formatCurrency(plan.price || 0)}
                                                <span className="text-xs font-normal text-brand-inactive-text">
                                                    {" "}/ {FREQUENCY_LABELS[freq] || freq}
                                                </span>
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body pt-1">
                                                <StoreIcon size={12} className="text-brand-green shrink-0" />
                                                <span className="truncate">{storeName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                                        <span className="text-xs text-brand-inactive-text font-medium">
                                            {plan.billing_mode === "manual" ? "Manual" : "Mercado Pago"}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleOpenEdit(plan)
                                            }}
                                            className="text-xs h-8 px-2.5"
                                        >
                                            Editar
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="p-4 bg-white dark:bg-dark-surface rounded-[24px] border border-brand-border dark:border-dark-border flex justify-end">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Filter Sheet */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={{ frequency: frequencyFilters }}
                setFilters={(newFilters: any) => setFrequencyFilters(newFilters.frequency || [])}
                onClear={() => setFrequencyFilters([])}
            />

            {/* Detail Modal matching PlanDetailPage */}
            {selectedPlanDetail && (
                <DefaultModal
                    isOpen={Boolean(selectedPlanDetail)}
                    onClose={() => setSelectedPlanDetail(null)}
                    title={selectedPlanDetail.name}
                    description={`Loja: ${selectedPlanDetail.partner_name || selectedPlanDetail.stores?.name || "Loja Parceira"}`}
                    footer={
                        <div className="flex justify-between items-center w-full">
                            <div className="text-xs text-brand-inactive-text">
                                Criado em {formatDate(selectedPlanDetail.created_at)}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const p = selectedPlanDetail
                                        setSelectedPlanDetail(null)
                                        handleOpenEdit(p)
                                    }}
                                >
                                    Editar Plano
                                </Button>
                                <Button variant="default" onClick={() => setSelectedPlanDetail(null)}>
                                    Fechar
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className="space-y-6 pt-2">
                        {/* Status & Pricing */}
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-gray/50 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border">
                            <div>
                                <span className="text-xs text-brand-inactive-text font-medium block">
                                    Frequência de Cobrança
                                </span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">
                                    {FREQUENCY_LABELS[selectedPlanDetail.interval || selectedPlanDetail.billing_frequency] || "Mensal"}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-brand-inactive-text font-medium block">
                                    Preço Recorrente
                                </span>
                                <span className="text-lg font-bold text-brand-green">
                                    {formatCurrency(selectedPlanDetail.price || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Description */}
                        {selectedPlanDetail.description && (
                            <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-1">
                                    Descrição do Plano
                                </h4>
                                <p className="text-xs text-brand-dark dark:text-dark-heading leading-relaxed">
                                    {selectedPlanDetail.description}
                                </p>
                            </div>
                        )}

                        {/* Items included */}
                        {selectedPlanDetail.items && selectedPlanDetail.items.length > 0 && (
                            <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                    Itens Inclusos na Mensalidade ({selectedPlanDetail.items.length})
                                </h4>
                                <div className="divide-y divide-brand-border dark:divide-dark-border">
                                    {selectedPlanDetail.items.map((it: any, i: number) => (
                                        <div key={i} className="py-2 flex items-center justify-between text-xs">
                                            <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                {it.name || "Item do Plano"}
                                            </span>
                                            <span className="text-brand-inactive-text">
                                                {it.quantity} {it.unit || "un"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </DefaultModal>
            )}

            {/* Edit Modal with AdminActionModal */}
            {editingPlan && (
                <DefaultModal
                    isOpen={Boolean(editingPlan)}
                    onClose={() => setEditingPlan(null)}
                    title={`Editar Plano Recorrente`}
                    description={`Loja: ${editingPlan.partner_name || editingPlan.stores?.name || "Loja Parceira"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingPlan(null)}>
                                Cancelar
                            </Button>
                            <Button variant="default" onClick={handleSaveEdit}>
                                Prosseguir e Salvar
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Status do Plano
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.status}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="active">Ativo (Disponível na vitrine)</option>
                                <option value="inactive">Inativo (Pausado)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Nome do Plano
                            </label>
                            <Input
                                value={editForm.name}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Preço da Mensalidade
                            </label>
                            <Input
                                type="number"
                                value={editForm.price}
                                onChange={(e) =>
                                    setEditForm((prev) => ({
                                        ...prev,
                                        price: parseFloat(e.target.value) || 0,
                                    }))
                                }
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Descrição do Plano"
                                value={editForm.description}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Action Context Modal (Notification + Audit) */}
            {actionModal}
        </FadeIn>
    )
}
