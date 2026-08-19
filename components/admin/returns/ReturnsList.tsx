"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import ReturnListRow from "./ReturnListRow"
import ReturnsPageControls, { type ReturnFilterState } from "./ReturnsPageControls"
import AdminReturnDetailView from "./AdminReturnDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { StoreIcon, ExportFileIcon } from "@/lib/icons"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { getAdminReturnRequests, getAdminReturnRequestsStats, type AdminReturnStats } from "@/app/actions/admin/marketplace-ops"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency, formatDate } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds } from "@/lib/utils/filter-date-period"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"

type SortKey = "id" | "order_number" | "customer" | "date" | "refund_type" | "status"
type SortDirection = "asc" | "desc"

interface ReturnsListProps {
    initialData: CursorPaginatedResult<any>
    initialStats?: AdminReturnStats
}

const ITEMS_PER_PAGE = 8

const INITIAL_FILTERS: ReturnFilterState = {
    status: [],
    type: [],
    source: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

export default function ReturnsList({ initialData, initialStats }: ReturnsListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [activeTab, setActiveTab] = useState<string>("all")
    const [isPending, startTransition] = useTransition()

    // Stats
    const [stats, setStats] = useState<AdminReturnStats | undefined>(initialStats)

    // Filters & Modals
    const [filters, setFilters] = useState<ReturnFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Search state
    const [search, setSearch] = useState("")

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State (initialized from SSR)
    const [requests, setRequests] = useState<any[]>(initialData?.data || [])
    const [isLoading, setIsLoading] = useState(false)
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
    const refreshRequests = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getAdminReturnRequests(null, 100),
                    getAdminReturnRequestsStats(),
                ])
                setRequests(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh admin returns:", err)
            }
        })
    }, [])

    // Filter Config for FilterSheet
    const filterSections: FilterSectionConfig[] = useMemo(() => [
        {
            id: "status",
            title: "Status da Solicitação",
            type: "checkbox-list",
            options: ["pending", "approved", "rejected", "completed"],
        },
        {
            id: "type",
            title: "Tipo",
            type: "checkbox-list",
            options: ["exchange", "return", "complaint"],
        },
        {
            id: "source",
            title: "Origem",
            type: "checkbox-list",
            options: ["customer_portal", "admin_override", "store_panel"],
        },
        {
            id: "datePeriod",
            title: "Período",
            type: "date-period",
        },
    ], [])

    const hasActiveFilters = useMemo(() => {
        return (
            search.trim().length > 0 ||
            activeTab !== "all" ||
            filters.status.length > 0 ||
            filters.type.length > 0 ||
            filters.source.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [search, activeTab, filters])

    // Instant in-memory filtering (0ms)
    const filteredRequests = useMemo(() => {
        const term = search.trim().toLowerCase()
        const dateBounds = isDatePeriodFilterActive(filters.datePeriod)
            ? resolveDatePeriodBounds(filters.datePeriod)
            : { startYmd: null, endYmd: null }

        let result = requests.filter((req) => {
            // Tab filter
            const st = String(req.status || "").toLowerCase()
            if (activeTab === "pending" && !["pending", "pending_review"].includes(st)) return false
            if (activeTab === "approved" && !["approved", "completed", "resolved"].includes(st)) return false
            if (activeTab === "rejected" && st !== "rejected") return false
            if (activeTab === "completed" && !["completed", "resolved"].includes(st)) return false

            // Search filter
            if (term) {
                const idStr = String(req.id || "").toLowerCase()
                const orderNum = String(req.order_number_snapshot || req.orders?.order_number || "").toLowerCase()
                const cust = String(req.customer_name_snapshot || req.customers?.name || req.buyer_profile?.full_name || "").toLowerCase()
                const stName = String(req.stores?.name || "").toLowerCase()
                const reason = String(req.customer_reason || "").toLowerCase()

                if (!idStr.includes(term) && !orderNum.includes(term) && !cust.includes(term) && !stName.includes(term) && !reason.includes(term)) {
                    return false
                }
            }

            // FilterSheet status
            if (filters.status.length > 0 && !filters.status.includes(st)) {
                return false
            }

            // FilterSheet type
            if (filters.type.length > 0 && !filters.type.includes(req.request_type)) {
                return false
            }

            // FilterSheet source
            if (filters.source.length > 0 && !filters.source.includes(req.source)) {
                return false
            }

            // Date Period
            if (dateBounds.startYmd && new Date(req.created_at) < new Date(dateBounds.startYmd)) return false
            if (dateBounds.endYmd && new Date(req.created_at) > new Date(dateBounds.endYmd + "T23:59:59")) return false

            return true
        })

        // In-memory sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "id":
                        aVal = a.id || ""
                        bVal = b.id || ""
                        break
                    case "order_number":
                        aVal = a.order_number_snapshot || a.orders?.order_number || ""
                        bVal = b.order_number_snapshot || b.orders?.order_number || ""
                        break
                    case "customer":
                        aVal = (a.customer_name_snapshot || "").toLowerCase()
                        bVal = (b.customer_name_snapshot || "").toLowerCase()
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "refund_type":
                        aVal = a.resolution_type || a.desired_resolution || ""
                        bVal = b.resolution_type || b.desired_resolution || ""
                        break
                    case "status":
                        aVal = a.status || ""
                        bVal = b.status || ""
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [requests, activeTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredRequests.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredRequests.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredRequests, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [activeTab, search, filters])

    // If viewing detail of a specific return via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentReq = requests.find(r => r.id === entityState.entityId)
        return (
            <AdminReturnDetailView
                detail={{ request: currentReq, id: entityState.entityId }}
                onBack={closeEntity}
            />
        )
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
                            Trocas & Devoluções
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Monitore e resolva disputas, trocas e solicitações de estorno de clientes.
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

                {/* Page Controls */}
                <ReturnsPageControls
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
                                    imageAlt="Nenhuma solicitação"
                                    title="Nenhuma solicitação encontrada"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhuma solicitação de troca ou devolução nesta categoria."}
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
                                    {paginatedItems.map((req) => (
                                        <div
                                            key={req.id}
                                            className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            onClick={() => openEntity("view", req.id)}
                                        >
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                        Solicitação #{req.id.slice(0, 8)}
                                                    </span>
                                                    <span className="text-xs text-brand-inactive-text truncate">
                                                        Pedido #{req.order_number_snapshot || req.orders?.order_number || "-"}
                                                    </span>
                                                </div>
                                                <Badge variant={req.status === "approved" || req.status === "completed" ? "green" : req.status === "rejected" ? "red" : "orange"}>
                                                    {req.status || "Pendente"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                <span className="truncate">{req.customer_name_snapshot || req.customers?.name || "Cliente"}</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-sm shrink-0">
                                                    {formatCurrency(Number(req.refund_amount || 0))}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                <span>{formatDate(req.created_at)}</span>
                                                <Badge variant="blue" className="text-[10px] py-0 px-1.5">
                                                    {req.request_type === "exchange" ? "Troca" : "Devolução"}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("id")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Código {sortConfig?.key === "id" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("order_number")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Pedido {sortConfig?.key === "order_number" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Loja
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("customer")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Cliente {sortConfig?.key === "customer" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Data {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("refund_type")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Resolução {sortConfig?.key === "refund_type" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors text-center"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Total
                                                    </th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Origem
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((req) => (
                                                    <ReturnListRow
                                                        key={req.id}
                                                        request={req}
                                                        isPending={isPending}
                                                        onDetail={() => openEntity("view", req.id)}
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
