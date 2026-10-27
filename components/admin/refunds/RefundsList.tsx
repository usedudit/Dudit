"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, IconPlaceholder, Pagination } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import RefundListRow from "./RefundListRow"
import RefundsPageControls, { type RefundFilterState } from "./RefundsPageControls"
import AdminRefundDetailView from "./AdminRefundDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { StoreIcon, ExportFileIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDate } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds } from "@/lib/utils/filter-date-period"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import { adminListRefundRequestsAction } from "@/app/actions/billing/refunds"
import { useMediaQuery } from "@/components/erp/hooks"

type SortKey = "store" | "plan" | "amount" | "status" | "date"
type SortDirection = "asc" | "desc"

interface RefundsListProps {
    initialData: any[]
    initialStats?: {
        total: number
        pending: number
        approved: number
        rejected: number
    }
    initialTotalCount?: number
}

const ITEMS_PER_PAGE = 8

const INITIAL_FILTERS: RefundFilterState = {
    status: [],
    reasonCategory: [],
    cdcGuarantee: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

export default function RefundsList({ initialData, initialStats, initialTotalCount }: RefundsListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [activeTab, setActiveTab] = useState<string>("all")
    const [isPending, startTransition] = useTransition()

    // Stats
    const [stats, setStats] = useState(initialStats || { total: 0, pending: 0, approved: 0, rejected: 0 })

    // Filters & Modals
    const [filters, setFilters] = useState<RefundFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Search state
    const [search, setSearch] = useState("")

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State (initialized from SSR)
    const [refunds, setRefunds] = useState<any[]>(initialData || [])
    const [page, setPage] = useState(1)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    // Background refresh
    const refreshData = useCallback(() => {
        startTransition(async () => {
            try {
                const res = await adminListRefundRequestsAction({ status: "all", limit: 100 })
                if (res.success) {
                    setRefunds(res.data || [])
                    if (res.stats) setStats(res.stats)
                }
            } catch (err) {
                console.error("Failed to refresh admin refunds:", err)
            }
        })
    }, [])

    // Filter Config for FilterSheet
    const filterSections = useMemo(() => [
        {
            id: "status",
            title: "Status da Solicitacao",
            type: "checkbox-list" as const,
            options: ["pending", "approved", "rejected", "under_review", "cancelled"],
            optionLabels: {
                pending: "Pendente",
                approved: "Estornado",
                rejected: "Recusado",
                under_review: "Em Analise",
                cancelled: "Cancelado",
            } as Record<string, string>,
        } as FilterSectionConfig,
        {
            id: "reasonCategory",
            title: "Motivo",
            type: "checkbox-list" as const,
            options: ["repentance_7_days", "double_charge", "technical_issue", "commercial_agreement", "unsatisfied", "other"],
            optionLabels: {
                repentance_7_days: "Arrependimento (CDC 7d)",
                double_charge: "Cobranca duplicada",
                technical_issue: "Problema tecnico",
                commercial_agreement: "Acordo comercial",
                unsatisfied: "Insatisfacao",
                other: "Outro",
            } as Record<string, string>,
        } as FilterSectionConfig,
        {
            id: "cdcGuarantee",
            title: "Garantia CDC (7 dias)",
            type: "checkbox-list" as const,
            options: ["within", "outside"],
            optionLabels: {
                within: "Dentro de 7 dias",
                outside: "Fora de 7 dias",
            } as Record<string, string>,
        } as FilterSectionConfig,
        {
            id: "datePeriod",
            title: "Periodo",
            type: "date-period" as const,
        } as FilterSectionConfig,
    ], [])

    const hasActiveFilters = useMemo(() => {
        return (
            search.trim().length > 0 ||
            activeTab !== "all" ||
            filters.status.length > 0 ||
            filters.reasonCategory.length > 0 ||
            filters.cdcGuarantee.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [search, activeTab, filters])

    // Instant in-memory filtering (0ms)
    const filteredRefunds = useMemo(() => {
        const term = search.trim().toLowerCase()
        const dateBounds = isDatePeriodFilterActive(filters.datePeriod)
            ? resolveDatePeriodBounds(filters.datePeriod)
            : { startYmd: null, endYmd: null }

        let result = refunds.filter((r) => {
            // Tab filter
            const st = String(r.status || "").toLowerCase()
            if (activeTab === "pending" && !["pending", "under_review"].includes(st)) return false
            if (activeTab === "approved" && st !== "approved") return false
            if (activeTab === "rejected" && st !== "rejected") return false

            // Search filter
            if (term) {
                const stores = r.partner?.stores || []
                const storeName = String(stores[0]?.name || "").toLowerCase()
                const planName = String(r.purchase?.plan?.name || r.purchase?.description || "").toLowerCase()
                const partnerId = String(r.partner_id || "").toLowerCase()
                const protocol = String(r.id || "").slice(0, 8).toLowerCase()

                if (!storeName.includes(term) && !planName.includes(term) && !partnerId.includes(term) && !protocol.includes(term)) {
                    return false
                }
            }

            // FilterSheet status
            if (filters.status.length > 0 && !filters.status.includes(st)) {
                return false
            }

            // FilterSheet reason category
            if (filters.reasonCategory.length > 0 && !filters.reasonCategory.includes(r.reason_category)) {
                return false
            }

            // FilterSheet CDC guarantee
            if (filters.cdcGuarantee.length > 0) {
                const within = filters.cdcGuarantee.includes("within")
                const outside = filters.cdcGuarantee.includes("outside")
                if (within && !r.is_within_7_days) return false
                if (outside && r.is_within_7_days) return false
                if (!within && !outside) return false
            }

            // Date Period
            if (dateBounds.startYmd && new Date(r.created_at) < new Date(dateBounds.startYmd)) return false
            if (dateBounds.endYmd && new Date(r.created_at) > new Date(dateBounds.endYmd + "T23:59:59")) return false

            return true
        })

        // In-memory sorting
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
    }, [refunds, activeTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredRefunds.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredRefunds.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredRefunds, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [activeTab, search, filters])

    // If viewing detail of a specific refund via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentRefund = refunds.find(r => r.id === entityState.entityId)
        if (currentRefund) {
            return (
                <AdminRefundDetailView
                    detail={{ refund: currentRefund, events: [] }}
                    onBack={closeEntity}
                />
            )
        }
    }

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
                            Solicitacoes de Reembolso
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Analise pedidos de estorno de assinaturas e faturas com garantia legal do CDC e conciliacao bancaria.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => toast.success("Exportacao iniciada em segundo plano")}
                            leftIcon={<ExportFileIcon size={18} />}
                        >
                            Exportar
                        </Button>
                    </div>
                </div>

                {/* Page Controls */}
                <RefundsPageControls
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    tabCounts={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum reembolso"
                                    title="Nenhuma solicitacao encontrada"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhum pedido de reembolso registrado nesta categoria."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_FILTERS)
                                            setActiveTab("all")
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((r) => {
                                        const stores = r.partner?.stores || []
                                        const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
                                        const logoUrl = hq.logo_url

                                        return (
                                            <div
                                                key={r.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", r.id)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                            {logoUrl ? (
                                                                <img src={getR2ImageUrl(logoUrl)} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <StoreIcon className="w-5 h-5 text-brand-inactive-text" />
                                                            )}
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
                                                    <Badge variant={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : r.status === "under_review" ? "blue" : "orange"}>
                                                        {r.status === "approved" ? "Estornado" : r.status === "rejected" ? "Recusado" : r.status === "under_review" ? "Em Analise" : "Pendente"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs pt-1">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(r.amount)}
                                                    </span>
                                                    <span className="font-semibold text-brand-green">Ver detalhes &rarr;</span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                    <span>{formatDate(r.created_at)}</span>
                                                    {r.is_within_7_days && (
                                                        <Badge variant="green" className="text-[10px] py-0 px-1.5">
                                                            7d CDC
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("store")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Loja / Parceiro {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "\u2191" : "\u2193") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("plan")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Plano / Fatura {sortConfig?.key === "plan" ? (sortConfig.direction === "asc" ? "\u2191" : "\u2193") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("amount")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Valor {sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "\u2191" : "\u2193") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Motivo & Evidencias
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Garantia CDC
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "\u2191" : "\u2193") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Data {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "\u2191" : "\u2193") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Acoes
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((r) => (
                                                    <RefundListRow
                                                        key={r.id}
                                                        refund={r}
                                                        isPending={isPending}
                                                        onDetail={() => openEntity("view", r.id)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="pt-4">
                                        <Pagination
                                            currentPage={page}
                                            totalPages={totalPages}
                                            onPageChange={setPage}
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Filter Drawer / Sheet */}
            <FilterSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => {
                    setFilters(INITIAL_FILTERS)
                    setIsFilterSheetOpen(false)
                }}
            />
        </FadeIn>
    )
}
