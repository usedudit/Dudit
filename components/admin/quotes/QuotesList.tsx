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
    FileTextIcon,
    EditIcon,
    EyeIcon,
    FileIcon,
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
    updateAdminQuote,
    getAdminQuoteDetail,
    type AdminQuoteStats,
} from "@/app/actions/admin/quotes"

interface QuotesListProps {
    initialData: any[]
    initialStats?: AdminQuoteStats
}

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "blue" | "gray" }> = {
    pending: { label: "Pendente", variant: "orange" },
    pendente: { label: "Pendente", variant: "orange" },
    draft: { label: "Rascunho", variant: "gray" },
    rascunho: { label: "Rascunho", variant: "gray" },
    sent: { label: "Enviado", variant: "blue" },
    enviado: { label: "Enviado", variant: "blue" },
    approved: { label: "Aprovado", variant: "green" },
    aprovado: { label: "Aprovado", variant: "green" },
    rejected: { label: "Recusado", variant: "red" },
    recusado: { label: "Recusado", variant: "red" },
    cancelled: { label: "Cancelado", variant: "red" },
    cancelado: { label: "Cancelado", variant: "red" },
    expired: { label: "Expirado", variant: "gray" },
    expirado: { label: "Expirado", variant: "gray" },
}

export default function QuotesList({ initialData, initialStats }: QuotesListProps) {
    const [quotes, setQuotes] = useState(initialData)
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
    const [selectedQuoteDetail, setSelectedQuoteDetail] = useState<any | null>(null)
    const [isLoadingDetail, setIsLoadingDetail] = useState(false)

    const [editingQuote, setEditingQuote] = useState<any | null>(null)
    const [editForm, setEditForm] = useState<{
        status: string
        notes: string
        valid_until: string
    }>({
        status: "",
        notes: "",
        valid_until: "",
    })

    const [isPending, startTransition] = useTransition()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const tabs = useMemo(() => [
        { id: "all", label: "Todos", count: stats?.total ?? quotes.length },
        { id: "pendente", label: "Pendentes", count: stats?.pendente ?? 0 },
        { id: "aprovado", label: "Aprovados", count: stats?.aprovado ?? 0 },
        { id: "recusado", label: "Recusados", count: stats?.recusado ?? 0 },
        { id: "expirado", label: "Expirados", count: stats?.expirado ?? 0 },
    ], [stats, quotes.length])

    const filtered = useMemo(() => {
        return quotes.filter((q) => {
            const statusLower = (q.status || "").toLowerCase()
            let matchesTab = true
            if (activeTab === "pendente") {
                matchesTab = ["pending", "pendente", "draft", "rascunho", "sent", "enviado"].includes(statusLower)
            } else if (activeTab === "aprovado") {
                matchesTab = ["approved", "aprovado"].includes(statusLower)
            } else if (activeTab === "recusado") {
                matchesTab = ["rejected", "recusado", "cancelled", "cancelado"].includes(statusLower)
            } else if (activeTab === "expirado") {
                matchesTab = ["expired", "expirado"].includes(statusLower)
            }

            const matchesStatusFilter =
                statusFilters.length === 0 || statusFilters.includes(statusLower)

            const term = search.trim().toLowerCase()
            const matchesSearch =
                !term ||
                q.quote_number?.toLowerCase().includes(term) ||
                q.customer_name?.toLowerCase().includes(term) ||
                q.store_name?.toLowerCase().includes(term) ||
                q.stores?.name?.toLowerCase().includes(term)

            return matchesTab && matchesStatusFilter && matchesSearch
        })
    }, [quotes, activeTab, statusFilters, search])

    const paginated = useMemo(() => {
        return filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage)
    }, [filtered, page])

    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1

    const handleOpenDetail = async (quote: any) => {
        setSelectedQuoteDetail(quote)
        setIsLoadingDetail(true)
        try {
            const fullDetail = await getAdminQuoteDetail(quote.id)
            if (fullDetail) setSelectedQuoteDetail(fullDetail)
        } catch (err) {
            console.error("Failed to fetch quote details:", err)
        } finally {
            setIsLoadingDetail(false)
        }
    }

    const handleOpenEdit = (quote: any) => {
        setEditingQuote(quote)
        setEditForm({
            status: quote.status || "draft",
            notes: quote.notes || "",
            valid_until: quote.valid_until ? quote.valid_until.slice(0, 10) : "",
        })
    }

    const handleSaveEdit = async () => {
        if (!editingQuote) return

        const changedFields: string[] = []
        if (editForm.status !== editingQuote.status) changedFields.push("status")
        if (editForm.notes !== (editingQuote.notes || "")) changedFields.push("observações")
        if (editForm.valid_until !== (editingQuote.valid_until?.slice(0, 10) || "")) changedFields.push("validade")

        await runAction({
            title: "Salvar Alterações no Orçamento",
            description: `Orçamento #${editingQuote.quote_number} (${editingQuote.store_name || editingQuote.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar e Notificar",
            notifyLabel: "Enviar notificação pelo Dudit ao vendedor",
            runner: async (payload) => {
                const res = await updateAdminQuote(
                    editingQuote.id,
                    {
                        status: editForm.status,
                        notes: editForm.notes,
                        valid_until: editForm.valid_until || null,
                    },
                    payload
                )

                if (!res.success) {
                    toast({ title: "Erro ao salvar", description: res.error, variant: "destructive" })
                    return { success: false, error: res.error }
                }

                toast({ title: "Sucesso", description: "Orçamento atualizado com sucesso." })
                setQuotes((prev) =>
                    prev.map((q) =>
                        q.id === editingQuote.id
                            ? {
                                  ...q,
                                  status: editForm.status,
                                  notes: editForm.notes,
                                  valid_until: editForm.valid_until,
                              }
                            : q
                    )
                )
                setEditingQuote(null)
                if (selectedQuoteDetail?.id === editingQuote.id) {
                    setSelectedQuoteDetail((prev: any) => ({
                        ...prev,
                        status: editForm.status,
                        notes: editForm.notes,
                        valid_until: editForm.valid_until,
                    }))
                }
                return { success: true }
            },
        })
    }

    const filterSections: FilterSectionConfig[] = [
        {
            id: "status",
            title: "Status do Orçamento",
            type: "checkbox-list",
            options: ["draft", "pending", "sent", "approved", "rejected", "cancelled", "expired"],
            optionLabels: {
                draft: "Rascunho",
                pending: "Pendente",
                sent: "Enviado",
                approved: "Aprovado",
                rejected: "Recusado",
                cancelled: "Cancelado",
                expired: "Expirado",
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

                {/* Search & Actions Bar matching ERP */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80 md:w-96">
                        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                        <Input
                            placeholder="Buscar por código, cliente ou loja..."
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
                        title="Nenhum orçamento encontrado"
                        subtitle="Não há orçamentos correspondentes aos filtros aplicados."
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
                                        Cód. Orçamento
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Cliente
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Loja / Vendedor
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Data Emissão
                                    </th>
                                    <th className="py-3.5 px-5 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
                                        Validade
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
                                {paginated.map((quote) => {
                                    const meta = STATUS_MAP[quote.status?.toLowerCase()] || {
                                        label: quote.status,
                                        variant: "gray" as const,
                                    }
                                    const storeName = quote.store_name || quote.stores?.name || "Loja Parceira"

                                    return (
                                        <tr
                                            key={quote.id}
                                            onClick={() => handleOpenDetail(quote)}
                                            className="h-[72px] cursor-pointer hover:bg-brand-green-light/5 dark:hover:bg-dark-border/20 transition-colors"
                                        >
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                        <FileIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading block">
                                                            #{quote.quote_number}
                                                        </span>
                                                        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                            {quote.items_count ?? 1} item(ns)
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    {quote.customer_name || "Cliente sem nome"}
                                                </div>
                                                <div className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body">
                                                    {quote.customer_phone || quote.customer_email || "Sem contato"}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <div className="flex items-center gap-1.5 font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                    <StoreIcon size={14} className="text-brand-green shrink-0" />
                                                    <span className="truncate max-w-[180px]">{storeName}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                {formatDate(quote.created_at)}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                                {quote.valid_until || quote.expiration_date
                                                    ? formatDate(quote.valid_until || quote.expiration_date)
                                                    : "Sem prazo"}
                                            </td>
                                            <td className="py-3.5 px-5 align-middle">
                                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(quote.total_amount || quote.total || 0)}
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
                                                    onView={() => handleOpenDetail(quote)}
                                                    onEdit={() => handleOpenEdit(quote)}
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
                /* ERP Grid Mode matching QuoteGridCard */
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {paginated.map((quote) => {
                            const meta = STATUS_MAP[quote.status?.toLowerCase()] || {
                                label: quote.status,
                                variant: "gray" as const,
                            }
                            const storeName = quote.store_name || quote.stores?.name || "Loja Parceira"

                            return (
                                <div
                                    key={quote.id}
                                    onClick={() => handleOpenDetail(quote)}
                                    className="p-5 rounded-[24px] bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-9 h-9 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                                                    <FileIcon size={16} />
                                                </div>
                                                <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                                                    #{quote.quote_number}
                                                </span>
                                            </div>
                                            <Badge variant={meta.variant}>{meta.label}</Badge>
                                        </div>

                                        <div className="space-y-1 mb-4">
                                            <p className="font-bold text-[13px] text-brand-dark dark:text-dark-heading line-clamp-1">
                                                {quote.customer_name || "Cliente sem nome"}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body">
                                                <StoreIcon size={12} className="text-brand-green shrink-0" />
                                                <span className="truncate">{storeName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                                        <div>
                                            <span className="text-[11px] font-medium text-brand-inactive-text block">
                                                Valor Total
                                            </span>
                                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(quote.total_amount || quote.total || 0)}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleOpenEdit(quote)
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

            {/* Detail Modal matching ERP QuoteDetail */}
            {selectedQuoteDetail && (
                <DefaultModal
                    isOpen={Boolean(selectedQuoteDetail)}
                    onClose={() => setSelectedQuoteDetail(null)}
                    title={`Orçamento #${selectedQuoteDetail.quote_number}`}
                    description={`Loja: ${selectedQuoteDetail.store_name || selectedQuoteDetail.stores?.name || "Loja Parceira"}`}
                    footer={
                        <div className="flex justify-between items-center w-full">
                            <div className="text-xs text-brand-inactive-text">
                                Criado em {formatDate(selectedQuoteDetail.created_at)}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        const q = selectedQuoteDetail
                                        setSelectedQuoteDetail(null)
                                        handleOpenEdit(q)
                                    }}
                                >
                                    Editar Orçamento
                                </Button>
                                <Button variant="default" onClick={() => setSelectedQuoteDetail(null)}>
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
                                    {selectedQuoteDetail.status}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-brand-inactive-text font-medium block">
                                    Total da Proposta
                                </span>
                                <span className="text-lg font-bold text-brand-green">
                                    {formatCurrency(selectedQuoteDetail.total_amount || selectedQuoteDetail.total || 0)}
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
                                        {selectedQuoteDetail.customer_name || "Não informado"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-xs text-brand-inactive-text block">Contato:</span>
                                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                                        {selectedQuoteDetail.customer_phone || selectedQuoteDetail.customer_email || "Sem contato"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Items if loaded */}
                        {selectedQuoteDetail.items && selectedQuoteDetail.items.length > 0 && (
                            <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                                    Itens Inclusos ({selectedQuoteDetail.items.length})
                                </h4>
                                <div className="divide-y divide-brand-border dark:divide-dark-border">
                                    {selectedQuoteDetail.items.map((it: any, i: number) => (
                                        <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                                            <div>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading block">
                                                    {it.custom_name || it.product_name_snapshot || "Item"}
                                                </span>
                                                <span className="text-brand-inactive-text">
                                                    Qtd: {it.quantity} × {formatCurrency(it.unit_price || 0)}
                                                </span>
                                            </div>
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency((it.quantity || 1) * (it.unit_price || 0))}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {selectedQuoteDetail.notes && (
                            <div className="p-4 rounded-2xl border border-brand-border dark:border-dark-border">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text mb-1">
                                    Observações
                                </h4>
                                <p className="text-xs text-brand-dark dark:text-dark-heading leading-relaxed">
                                    {selectedQuoteDetail.notes}
                                </p>
                            </div>
                        )}
                    </div>
                </DefaultModal>
            )}

            {/* Edit Modal with AdminActionModal */}
            {editingQuote && (
                <DefaultModal
                    isOpen={Boolean(editingQuote)}
                    onClose={() => setEditingQuote(null)}
                    title={`Editar Orçamento #${editingQuote.quote_number}`}
                    description={`Loja: ${editingQuote.store_name || editingQuote.stores?.name || "Loja"} • Cliente: ${editingQuote.customer_name || "Sem nome"}`}
                    footer={
                        <div className="flex justify-end gap-2 w-full">
                            <Button variant="ghost" onClick={() => setEditingQuote(null)}>
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
                                Status do Orçamento
                            </label>
                            <select
                                className="w-full px-3 py-2 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-white text-sm"
                                value={editForm.status}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                            >
                                <option value="draft">Rascunho</option>
                                <option value="pending">Pendente</option>
                                <option value="sent">Enviado</option>
                                <option value="approved">Aprovado</option>
                                <option value="rejected">Recusado</option>
                                <option value="cancelled">Cancelado</option>
                                <option value="expired">Expirado</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                                Validade da Proposta
                            </label>
                            <Input
                                type="date"
                                value={editForm.valid_until}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                            />
                        </div>

                        <div>
                            <FormTextarea
                                label="Observações e Condições"
                                value={editForm.notes}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
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
