"use client"

import React, { useState, useEffect, useCallback, useMemo, useTransition } from "react"
import {
    Badge,
    Button,
    Input,
    Tabs,
    TabsList,
    TabsTrigger,
    Pagination,
    IconPlaceholder,
} from "@/components/reusable"
import { TabCountBadge } from "@/components/reusable/TabCountBadge"
import { formatCurrency, formatDate } from "@/lib/utils"
import { adminListRefundRequestsAction } from "@/app/actions/billing/refunds"
import { AdminRefundReviewModal } from "@/components/admin/AdminRefundReviewModal"
import {
    SearchIcon,
    ExportFileIcon,
    StoreIcon,
    AlertTriangleIcon,
} from "@/lib/icons"
import {
    ShieldCheck,
    Clock,
    CheckCircle2,
    XCircle,
} from "lucide-react"
import Link from "next/link"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"

type SortKey = "store" | "plan" | "amount" | "status" | "date"
type SortDirection = "asc" | "desc"

const ITEMS_PER_PAGE = 8

const getStatusBadgeVariant = (status: string) => {
    switch (status) {
        case "approved":
            return "green" as const
        case "rejected":
            return "red" as const
        case "under_review":
            return "blue" as const
        case "cancelled":
            return "gray" as const
        default:
            return "orange" as const
    }
}

const getStatusLabel = (status: string) => {
    switch (status) {
        case "approved":
            return "Estornado"
        case "rejected":
            return "Recusado"
        case "under_review":
            return "Em Análise"
        case "cancelled":
            return "Cancelado"
        default:
            return "Pendente"
    }
}

const getReasonLabel = (cat: string) => {
    switch (cat) {
        case "repentance_7_days":
            return "Arrependimento (CDC 7d)"
        case "double_charge":
            return "Cobrança duplicada"
        case "technical_issue":
            return "Problema técnico"
        case "commercial_agreement":
            return "Acordo comercial"
        case "unsatisfied":
            return "Insatisfação"
        default:
            return "Outro"
    }
}

export function AdminRefundsPage() {
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [statusFilter, setStatusFilter] = useState("all")
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [data, setData] = useState<any[]>([])
    const [stats, setStats] = useState<any>({ total: 0, pending: 0, approved: 0, rejected: 0, within7Days: 0 })
    const [selectedRefund, setSelectedRefund] = useState<any | null>(null)
    const [isPending, startTransition] = useTransition()

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    const loadData = useCallback(() => {
        startTransition(async () => {
            try {
                const res = await adminListRefundRequestsAction({
                    status: "all",
                    limit: 100,
                })
                if (res.success) {
                    setData(res.data || [])
                    if (res.stats) setStats(res.stats)
                }
            } catch (err) {
                console.error("[AdminRefundsPage] Error loading data:", err)
            }
        })
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    // Sincronizar URL ?view=[refundId] com selectedRefund
    useEffect(() => {
        if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
            const found = data.find((r) => r.id === entityState.entityId)
            if (found) setSelectedRefund(found)
        } else if (!entityState.isOpen) {
            setSelectedRefund(null)
        }
    }, [entityState, data])

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const handleOpenReview = (refund: any) => {
        setSelectedRefund(refund)
        openEntity("view", refund.id)
    }

    const handleCloseReview = () => {
        setSelectedRefund(null)
        closeEntity()
    }

    // In-memory instant filtering
    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase()

        let result = data.filter((r) => {
            // Status Tab
            if (statusFilter === "pending" && (r.status !== "pending" && r.status !== "under_review")) return false
            if (statusFilter === "approved" && r.status !== "approved") return false
            if (statusFilter === "rejected" && r.status !== "rejected") return false

            // Search
            if (q) {
                const stores = r.partner?.stores || []
                const storeName = String(stores[0]?.name || "").toLowerCase()
                const planName = String(r.purchase?.plan?.name || r.purchase?.description || "").toLowerCase()
                const partnerId = String(r.partner_id || "").toLowerCase()
                const requestId = String(r.id || "").toLowerCase()

                if (!storeName.includes(q) && !planName.includes(q) && !partnerId.includes(q) && !requestId.includes(q)) {
                    return false
                }
            }

            return true
        })

        // Sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "store": {
                        const aStores = a.partner?.stores || []
                        const bStores = b.partner?.stores || []
                        aVal = (aStores[0]?.name || "").toLowerCase()
                        bVal = (bStores[0]?.name || "").toLowerCase()
                        break
                    }
                    case "plan":
                        aVal = (a.purchase?.plan?.name || a.purchase?.description || "").toLowerCase()
                        bVal = (b.purchase?.plan?.name || b.purchase?.description || "").toLowerCase()
                        break
                    case "amount":
                        aVal = Number(a.amount || 0)
                        bVal = Number(b.amount || 0)
                        break
                    case "status":
                        aVal = a.status || ""
                        bVal = b.status || ""
                        break
                    case "date":
                        aVal = new Date(a.created_at || 0).getTime()
                        bVal = new Date(b.created_at || 0).getTime()
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [data, statusFilter, search, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredItems.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredItems, page])

    useMemo(() => {
        setPage(1)
    }, [statusFilter, search])

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
                .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                {/* Desktop Header */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Solicitações de Reembolso
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Analise pedidos de estorno de assinaturas e faturas com garantia legal do CDC e conciliação bancária.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => toast.success("Exportação iniciada em segundo plano")}
                            leftIcon={<ExportFileIcon size={18} />}
                        >
                            Exportar
                        </Button>
                    </div>
                </div>

                {/* Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 px-4 md:px-8">
                    <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                        <span className="text-xs text-brand-inactive-text font-medium">Total de Pedidos</span>
                        <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading mt-1">{stats.total}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                        <span className="text-xs text-brand-orange font-medium flex items-center gap-1">
                            <Clock size={14} />
                            <span>Pendentes</span>
                        </span>
                        <p className="text-2xl font-bold text-brand-orange mt-1">{stats.pending}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                        <span className="text-xs text-brand-green font-medium flex items-center gap-1">
                            <CheckCircle2 size={14} />
                            <span>Estornados</span>
                        </span>
                        <p className="text-2xl font-bold text-brand-green mt-1">{stats.approved}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border">
                        <span className="text-xs text-brand-red font-medium flex items-center gap-1">
                            <XCircle size={14} />
                            <span>Recusados</span>
                        </span>
                        <p className="text-2xl font-bold text-brand-red mt-1">{stats.rejected}</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border col-span-2 sm:col-span-1">
                        <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                            <ShieldCheck size={14} />
                            <span>Garantia CDC (7d)</span>
                        </span>
                        <p className="text-2xl font-bold text-blue-600 mt-1">{stats.within7Days}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 px-4 md:px-8">
                    <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                        <TabsList className="px-0">
                            <TabsTrigger
                                value="all"
                                badge={<TabCountBadge count={stats.total} variant="gray" />}
                            >
                                Todas
                            </TabsTrigger>
                            <TabsTrigger
                                value="pending"
                                badge={<TabCountBadge count={stats.pending} variant="orange" />}
                            >
                                Pendentes
                            </TabsTrigger>
                            <TabsTrigger
                                value="approved"
                                badge={<TabCountBadge count={stats.approved} variant="green" />}
                            >
                                Estornados
                            </TabsTrigger>
                            <TabsTrigger
                                value="rejected"
                                badge={<TabCountBadge count={stats.rejected} variant="red" />}
                            >
                                Recusados
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {/* Search */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 px-4 md:px-8">
                    <div className="w-full sm:w-80">
                        <Input
                            placeholder="Buscar por loja, plano ou protocolo..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            prefix={<SearchIcon size={16} className="text-brand-inactive-text" />}
                        />
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum reembolso"
                                    title="Nenhuma solicitação encontrada"
                                    subtitle={search || statusFilter !== "all" ? "Tente ajustar seus filtros de busca." : "Nenhum pedido de reembolso registrado nesta categoria."}
                                    itemButton={search || statusFilter !== "all" ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setStatusFilter("all")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Desktop Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("store")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Loja / Parceiro {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("plan")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Plano / Fatura {sortConfig?.key === "plan" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("amount")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Valor {sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Motivo & Evidências
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Garantia CDC
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Data {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((r) => {
                                                    const stores = r.partner?.stores || []
                                                    const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
                                                    const imagesCount = Array.isArray(r.images) ? r.images.length : 0
                                                    const docsCount = Array.isArray(r.documents) ? r.documents.length : 0

                                                    return (
                                                        <tr
                                                            key={r.id}
                                                            className="border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/40 dark:hover:bg-dark-border/20 transition-colors"
                                                        >
                                                            <td className="py-4 px-2 pl-6">
                                                                <Link
                                                                    href={`/ddt-admin/partners?view=${r.partner_id}`}
                                                                    className="flex items-center gap-3 group cursor-pointer"
                                                                >
                                                                    <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                                                        {hq.logo_url ? (
                                                                            <img src={hq.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                                                                        ) : (
                                                                            <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors truncate max-w-[200px]">
                                                                            {hq.name || "Loja Parceira"}
                                                                        </span>
                                                                        <span className="text-xs text-brand-inactive-text">
                                                                            ID: {r.partner_id?.slice(0, 8)}...
                                                                        </span>
                                                                    </div>
                                                                </Link>
                                                            </td>

                                                            <td className="py-4 px-2">
                                                                <span className="text-sm font-medium text-brand-dark dark:text-dark-heading">
                                                                    {r.purchase?.plan?.name ? `Plano ${r.purchase.plan.name}` : r.purchase?.description || "Assinatura"}
                                                                </span>
                                                            </td>

                                                            <td className="py-4 px-2">
                                                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(r.amount)}
                                                                </span>
                                                            </td>

                                                            <td className="py-4 px-2">
                                                                <div className="flex flex-col text-xs">
                                                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                                        {getReasonLabel(r.reason_category)}
                                                                    </span>
                                                                    <span className="text-[11px] text-brand-inactive-text">
                                                                        {imagesCount} fotos • {docsCount} PDFs
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            <td className="py-4 px-2 text-center">
                                                                {r.is_within_7_days ? (
                                                                    <Badge variant="green" className="inline-flex items-center gap-1">
                                                                        <ShieldCheck size={11} />
                                                                        <span>7d CDC</span>
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="gray">
                                                                        Fora do prazo
                                                                    </Badge>
                                                                )}
                                                            </td>

                                                            <td className="py-4 px-2 text-center">
                                                                <Badge variant={getStatusBadgeVariant(r.status)}>
                                                                    {getStatusLabel(r.status)}
                                                                </Badge>
                                                            </td>

                                                            <td className="py-4 px-2 text-xs text-brand-inactive-text">
                                                                {formatDate(r.created_at)}
                                                            </td>

                                                            <td className="py-4 px-2 pr-6 text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleOpenReview(r)}
                                                                    >
                                                                        {r.status === "pending" || r.status === "under_review" ? "Julgar" : "Detalhes"}
                                                                    </Button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Mobile Cards */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((r) => {
                                        const stores = r.partner?.stores || []
                                        const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}

                                        return (
                                            <div
                                                key={r.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => handleOpenReview(r)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                                            <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                {hq.name || "Loja Parceira"}
                                                            </span>
                                                            <span className="text-xs text-brand-inactive-text truncate">
                                                                {r.purchase?.plan?.name ? `Plano ${r.purchase.plan.name}` : "Assinatura"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Badge variant={getStatusBadgeVariant(r.status)}>
                                                        {getStatusLabel(r.status)}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs pt-1">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(r.amount)}
                                                    </span>
                                                    <span className="font-semibold text-brand-green">Ver análise →</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal de Análise & Step-Up Auth */}
            {selectedRefund && (
                <AdminRefundReviewModal
                    isOpen={!!selectedRefund}
                    onClose={handleCloseReview}
                    refund={selectedRefund}
                    onSuccess={loadData}
                />
            )}
        </FadeIn>
    )
}

export default AdminRefundsPage
