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
    WrenchIcon,
    EditIcon,
    EyeIcon,
    StoreIcon,
    ClockIcon,
    SearchIcon,
    ListIcon,
    GridIcon,
    FilterIcon,
} from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate } from "@/lib/utils"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import {
    updateAdminServiceOrder,
    getAdminServiceOrderDetail,
    type AdminServiceOrderStats,
} from "@/app/actions/admin/service-orders"

interface ServiceOrdersListProps {
    initialData: any[]
    initialStats?: AdminServiceOrderStats
}

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "blue" | "gray" }> = {
    aberta: { label: "Aberta", variant: "blue" },
    aguardando_aprovacao: { label: "Aguardando Aprovação", variant: "orange" },
    aprovada: { label: "Aprovada", variant: "blue" },
    em_andamento: { label: "Em Andamento", variant: "orange" },
    aguardando_peca: { label: "Aguardando Peça", variant: "orange" },
    concluida: { label: "Concluída", variant: "green" },
    entregue: { label: "Entregue", variant: "green" },
    cancelada: { label: "Cancelada", variant: "red" },
}

export default function ServiceOrdersList({ initialData, initialStats }: ServiceOrdersListProps) {
    const [orders, setOrders] = useState(initialData)
    const [stats, setStats] = useState(initialStats)
    const [activeTab, setActiveTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const itemsPerPage = 10

    // Filter Sheet state
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
    const [statusFilters, setStatusFilters] = useState<string[]>([])

    // Detail & Edit State
    const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null)
    const [isLoadingDetail, setIsLoadingDetail] = useState(false)

    const [editingOrder, setEditingOrder] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        status: string
        title: string
        description: string
        diagnosis: string
        internal_notes: string
        expected_completion_date: string
    }>({
        status: "",
        title: "",
        description: "",
        diagnosis: "",
        internal_notes: "",
        expected_completion_date: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const tabs = useMemo(() => [
        { id: "all", label: "Todas", count: stats?.total ?? orders.length },
        { id: "aberta", label: "Abertas", count: (stats?.aberta ?? 0) + (stats?.aguardando_aprovacao ?? 0) },
        { id: "em_andamento", label: "Em Andamento", count: stats?.em_andamento ?? 0 },
        { id: "concluida", label: "Concluídas", count: stats?.concluida ?? 0 },
        { id: "cancelada", label: "Canceladas", count: stats?.cancelada ?? 0 },
    ], [stats, orders.length])

    const filtered = useMemo(() => {
        return orders.filter((o) => {
            const statusLower = (o.status || "").toLowerCase()
            let matchesTab = true
            if (activeTab === "aberta") {
                matchesTab = ["aberta", "aguardando_aprovacao", "aprovada"].includes(statusLower)
            } else if (activeTab === "em_andamento") {
                matchesTab = ["em_andamento", "aguardando_peca"].includes(statusLower)
            } else if (activeTab === "concluida") {
                matchesTab = ["concluida", "entregue"].includes(statusLower)
            } else if (activeTab === "cancelada") {
                matchesTab = ["cancelada"].includes(statusLower)
            }

            const matchesStatusFilter =
                statusFilters.length === 0 || statusFilters.includes(statusLower)

            const term = search.trim().toLowerCase()
            const matchesSearch =
                !term ||
                o.order_number?.toLowerCase().includes(term) ||
                o.title?.toLowerCase().includes(term) ||
                o.customer_name?.toLowerCase().includes(term) ||
                o.store_name?.toLowerCase().includes(term) ||
                o.stores?.name?.toLowerCase().includes(term)

            return matchesTab && matchesStatusFilter && matchesSearch
        })
    }, [orders, activeTab, statusFilters, search])

    const paginated = useMemo(() => {
        return filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    }, [filtered, page])

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenDetail = async (order: any) => {
        setSelectedOrderDetail(order)
        setIsLoadingDetail(true)
        try {
            const fullDetail = await getAdminServiceOrderDetail(order.id)
            if (fullDetail) setSelectedOrderDetail(fullDetail)
        } catch (err) {
            console.error("Failed to fetch service order details:", err)
        } finally {
            setIsLoadingDetail(false)
        }
    }

    const handleOpenEdit = (order: any) => {
        setEditingOrder(order)
        setEditForm({
            status: order.status || "aberta",
            title: order.title || "",
            description: order.description || "",
            diagnosis: order.diagnosis || "",
            internal_notes: order.internal_notes || "",
            expected_completion_date: order.expected_completion_date
                ? order.expected_completion_date.slice(0, 10)
                : "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingOrder) return

        const changedFields: string[] = []
        if (editForm.status !== editingOrder.status) changedFields.push("status")
        if (editForm.title !== (editingOrder.title || "")) changedFields.push("título")
        if (editForm.diagnosis !== (editingOrder.diagnosis || "")) changedFields.push("diagnóstico")
        if (editForm.internal_notes !== (editingOrder.internal_notes || "")) changedFields.push("observações internas")
        if (editForm.expected_completion_date !== (editingOrder.expected_completion_date?.slice(0, 10) || "")) {
            changedFields.push("data prevista")
        }

        await runAction({
            title: "Salvar Alterações na Ordem de Serviço",
            description: `OS #${editingOrder.order_number} (${editingOrder.store_name || editingOrder.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao responsável da loja",
            runner: async (payload) => {
                const res = await updateAdminServiceOrder(
                    editingOrder.id,
                    {
                        status: editForm.status,
                        title: editForm.title,
                        description: editForm.description,
                        diagnosis: editForm.diagnosis,
                        internal_notes: editForm.internal_notes,
                        expected_completion_date: editForm.expected_completion_date || null,
                    },
                    payload
                )

                if (!res.success) {
                    toast({ title: "Erro ao salvar", description: res.error, variant: "destructive" })
                    return { success: false, error: res.error }
                }

                toast({ title: "Sucesso", description: "Ordem de Serviço atualizada com sucesso." })
                setOrders((prev) =>
                    prev.map((o) =>
                        o.id === editingOrder.id
                            ? {
                                  ...o,
                                  status: editForm.status,
                                  title: editForm.title,
                                  description: editForm.description,
                                  diagnosis: editForm.diagnosis,
                                  internal_notes: editForm.internal_notes,
                                  expected_completion_date: editForm.expected_completion_date,
                              }
                            : o
                    )
                )
                setEditingOrder(null)
                if (selectedOrderDetail?.id === editingOrder.id) {
                    setSelectedOrderDetail((prev: any) => ({
                        ...prev,
                        status: editForm.status,
                        title: editForm.title,
                        description: editForm.description,
                        diagnosis: editForm.diagnosis,
                        internal_notes: editForm.internal_notes,
                        expected_completion_date: editForm.expected_completion_date,
                    }))
                }
                return { success: true }
            },
        })
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "status",
            title: "Status da Ordem de Serviço",
            type: "checkbox-list",
            options: [
                "aberta",
                "aguardando_aprovacao",
                "aprovada",
                "em_andamento",
                "aguardando_peca",
                "concluida",
                "entregue",
                "cancelada",
            ],
            optionLabels: {
                aberta: "Aberta",
                aguardando_aprovacao: "Aguardando Aprovação",
                aprovada: "Aprovada",
                em_andamento: "Em Andamento",
                aguardando_peca: "Aguardando Peça",
                concluida: "Concluída",
                entregue: "Entregue",
                cancelada: "Cancelada",
            },
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
                            placeholder="Buscar por número, título, cliente ou loja..."
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
                            {statusFilters.length > 0 && (
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
                        title="Nenhuma ordem de serviço encontrada"
                        subtitle="Não há OS correspondentes aos filtros aplicados."
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
                                        Nº OS
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Título do Serviço
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Cliente
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Loja / Oficina
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Data Prevista
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Total
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
                                {paginated.map((order) => {
                                    const meta = STATUS_MAP[order.status?.toLowerCase()] || {
                                        label: order.status,
                                        variant: "gray" as const,
                                    }
                                    const storeName = order.store_name || order.stores?.name || "Loja Parceira"

                                    return (
                                        <tr
                                            key={order.id}
                                            onClick={() => handleOpenDetail(order)}
                                            className="h-[72px] cursor-pointer hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20 transition-colors"
                                        >
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                        <WrenchIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading block">
                                                            #{order.order_number}
                                                        </span>
                                                        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                            Criada em {formatDate(order.created_at)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading line-clamp-1 max-w-[220px]">
                                                    {order.title || "Ordem de Serviço Geral"}
                                                </div>
                                                <div className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body line-clamp-1 max-w-[220px]">
                                                    {order.diagnosis || order.description || "Sem descrição"}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    {order.customer_name || "Cliente não informado"}
                                                </div>
                                                <div className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                    {order.customer_phone || order.customer_email || "Sem contato"}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-1.5 font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    <StoreIcon size={14} className="text-brand-green shrink-0" />
                                                    <span className="truncate max-w-[180px]">{storeName}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                {order.expected_completion_date
                                                    ? formatDate(order.expected_completion_date)
                                                    : "Não definida"}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(order.total_amount || 0)}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-center">
                                                <Badge variant={meta.variant}>{meta.label}</Badge>
                                            </td>
                                            <td
                                                className="py-3.5 px-5 align-middle text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <ActionsDropdown
                                                    onView={() => handleOpenDetail(order)}
                                                    onEdit={() => handleOpenEdit(order)}
                                                />
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
                /* ERP Grid Mode matching ServiceOrderGridCard */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {paginated.map((order) => {
                            const meta = STATUS_MAP[order.status?.toLowerCase()] || {
                                label: order.status,
                                variant: "gray" as const,
                            }
                            const storeName = order.store_name || order.stores?.name || "Loja Parceira"

                            return (
                                <div
                                    key={order.id}
                                    onClick={() => handleOpenDetail(order)}
                                    className="p-5 rounded-[24px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-9 h-9 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                    <WrenchIcon size={16} />
                                                </div>
                                                <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                                    #{order.order_number}
                                                </span>
                                            </div>
                                            <Badge variant={meta.variant}>{meta.label}</Badge>
                                        </div>

                                        <div className="space-y-1 mb-4">
                                            <p className="font-bold text-[13px] text-brand-dark dark:text-dark-heading line-clamp-1">
                                                {order.title || "Ordem de Serviço"}
                                            </p>
                                            <p className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-1">
                                                {order.customer_name || "Cliente não informado"}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body pt-1">
                                                <StoreIcon size={12} className="text-brand-green shrink-0" />
                                                <span className="truncate">{storeName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                                        <div>
                                            <span className="text-[11px] font-medium text-brand-inactive-text block">
                                                Total da OS
                                            </span>
                                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(order.total_amount || 0)}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleOpenEdit(order)
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
                filters={{ status: statusFilters }}
                setFilters={(newFilters: any) => setStatusFilters(newFilters.status || [])}
                onClear={() => setStatusFilters([])}
            />

            {/* Detail Modal matching ServiceOrderDetail */}
            {selectedOrderDetail && (
                <DefaultModal
                    isOpen={Boolean(selectedOrderDetail)}
                    onClose={() => setSelectedOrderDetail(null)}
                    title={`Ordem de Serviço #${selectedOrderDetail.order_number}`}
                    description={`Loja: ${selectedOrderDetail.store_name || selectedOrderDetail.stores?.name || "Loja Parceira"}`}
                    footer={
                        <div className="flex justify-between items-center w-full">
                            <div className="text-xs text-brand-inactive-text">
                                Criada em {formatDate(selectedOrderDetail.created_at)}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const o = selectedOrderDetail
                                        setSelectedOrderDetail(null)
                                        handleOpenEdit(o)
                                    }}
                                >
                                    Editar OS
                                </Button>
                                <Button variant="default" onClick={() => setSelectedOrderDetail(null)}>
                                    Fechar
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className="space-y-6 pt-2">
                        {/* Status Bar */}
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-brand-gray/50 dark:bg-dark-border/30 border border-brand-border dark:border-dark-border">
                            <div>
                                <span className="text-xs text-brand-inactive-text font-medium block">
                                    Situação Atual
                                </span>
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">
                                    {selectedOrderDetail.status?.replace(/_/g, " ")}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-brand-inactive-text font-medium block">
                                    Total
                                </span>
                                <span className="text-lg font-bold text-brand-green">
                                    {formatCurrency(selectedOrderDetail.total_amount || 0)}
                                </span>
                            </div>
                        </div>

                        {/* Customer Info */}
                        <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                Dados do Cliente
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-xs text-brand-inactive-text block">Nome:</span>
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                        {selectedOrderDetail.customer_name || "Não informado"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-xs text-brand-inactive-text block">Contato:</span>
                                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                                        {selectedOrderDetail.customer_phone || selectedOrderDetail.customer_email || "Sem contato"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Diagnosis / Notes */}
                        <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border space-y-3">
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-1">
                                    Título / Reclamação
                                </h4>
                                <p className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                    {selectedOrderDetail.title || "Não especificado"}
                                </p>
                            </div>
                            {selectedOrderDetail.diagnosis && (
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-1">
                                        Diagnóstico Técnico
                                    </h4>
                                    <p className="text-xs text-brand-dark dark:text-dark-heading">
                                        {selectedOrderDetail.diagnosis}
                                    </p>
                                </div>
                            )}
                            {selectedOrderDetail.internal_notes && (
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-1">
                                        Notas Internas
                                    </h4>
                                    <p className="text-xs text-brand-dark dark:text-dark-heading">
                                        {selectedOrderDetail.internal_notes}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Services / Products if loaded */}
                        {selectedOrderDetail.services && selectedOrderDetail.services.length > 0 && (
                            <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                    Serviços Aplicados ({selectedOrderDetail.services.length})
                                </h4>
                                <div className="divide-y divide-brand-border dark:divide-dark-border">
                                    {selectedOrderDetail.services.map((s: any, i: number) => (
                                        <div key={i} className="py-2 flex items-center justify-between text-xs">
                                            <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                {s.services?.name || s.name || "Serviço"}
                                            </span>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(s.price || 0)}
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
            {editingOrder && (
                <DefaultModal
                    isOpen={Boolean(editingOrder)}
                    onClose={() => setEditingOrder(null)}
                    title={`Editar Ordem de Serviço #${editingOrder.order_number}`}
                    description={`Loja: ${editingOrder.store_name || editingOrder.stores?.name || "Loja"} • Cliente: ${editingOrder.customer_name || "Sem nome"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingOrder(null)}>
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
                                Status da OS
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.status}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="aberta">Aberta</option>
                                <option value="aguardando_aprovacao">Aguardando Aprovação</option>
                                <option value="aprovada">Aprovada</option>
                                <option value="em_andamento">Em Andamento</option>
                                <option value="aguardando_peca">Aguardando Peça</option>
                                <option value="concluida">Concluída</option>
                                <option value="entregue">Entregue</option>
                                <option value="cancelada">Cancelada</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Título do Serviço
                            </label>
                            <Input
                                value={editForm.title}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Data Prevista de Conclusão
                            </label>
                            <Input
                                type="date"
                                value={editForm.expected_completion_date}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, expected_completion_date: e.target.value }))}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Diagnóstico Técnico"
                                value={editForm.diagnosis}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
                                rows={2}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Observações Internas"
                                value={editForm.internal_notes}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, internal_notes: e.target.value }))}
                                rows={2}
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
