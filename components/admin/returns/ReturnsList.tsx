"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
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

interface ReturnsListProps {
    initialData: CursorPaginatedResult<any>
    initialStats?: AdminReturnStats
}

const INITIAL_FILTERS: ReturnFilterState = {
    status: [],
    type: [],
    source: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

const ReturnsList = ({ initialData, initialStats }: ReturnsListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [activeTab, setActiveTab] = useState<string>("all")
    const [selectedRequest, setSelectedRequest] = useState<any | null>(null)
    const [isPending, startTransition] = useTransition()

    // Stats
    const [stats, setStats] = useState<AdminReturnStats | undefined>(initialStats)

    // Filters & Modals
    const [filters, setFilters] = useState<ReturnFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // Data State
    const [requests, setRequests] = useState<any[]>(initialData.data || [])
    const [isLoading, setIsLoading] = useState(false)
    const [page, setPage] = useState(1)
    const itemsPerPage = 12

    const fetchRequests = useCallback(() => {
        setIsLoading(true)
        startTransition(async () => {
            try {
                const dateBounds = isDatePeriodFilterActive(filters.datePeriod)
                    ? resolveDatePeriodBounds(filters.datePeriod)
                    : { startYmd: null, endYmd: null }

                const [res, statsRes] = await Promise.all([
                    getAdminReturnRequests(null, 100, {
                        status: activeTab,
                        search: debouncedSearch,
                        type: filters.type[0],
                        source: filters.source[0],
                        startDate: dateBounds.startYmd || undefined,
                        endDate: dateBounds.endYmd || undefined,
                    }),
                    getAdminReturnRequestsStats(),
                ])

                setRequests(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to fetch admin returns:", err)
                toast.error("Erro ao carregar devoluções")
            } finally {
                setIsLoading(false)
            }
        })
    }, [activeTab, debouncedSearch, filters])

    useEffect(() => {
        fetchRequests()
        setPage(1)
    }, [fetchRequests])

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
            filters.status.length > 0 ||
            filters.type.length > 0 ||
            filters.source.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [filters])

    // Pagination
    const totalPages = Math.ceil(requests.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return requests.slice(start, start + itemsPerPage)
    }, [requests, page])

    // If viewing detail of a specific return
    if (selectedRequest) {
        return (
            <AdminReturnDetailView
                detail={{ request: selectedRequest }}
                onBack={() => setSelectedRequest(null)}
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
                            Trocas e Devoluções
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie solicitações de pós-venda, elegibilidade, reembolsos e mediação.
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
                        {paginatedItems.length === 0 && !isLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemTrocas.png"
                                    imageAlt="Nenhuma solicitação"
                                    title="Nenhuma solicitação encontrada"
                                    subtitle={search || hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhuma troca ou devolução nesta categoria."}
                                    itemButton={search || hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_FILTERS)
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((request) => {
                                        const refundAmount = Number(request.refund_amount || 0)
                                        return (
                                            <div
                                                key={request.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => setSelectedRequest(request)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            #{request.id.slice(0, 8)} • Pedido #{request.order_number_snapshot || request.orders?.order_number || "-"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            {request.customer_name_snapshot || "Consumidor"}
                                                        </span>
                                                    </div>
                                                    <Badge variant={request.status === "APPROVED" || request.status === "approved" ? "green" : request.status === "REJECTED" || request.status === "rejected" ? "red" : "orange"}>
                                                        {request.status || "Pendente"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <StoreIcon size={12} className="shrink-0" />
                                                        <span className="truncate">{request.stores?.name || "-"}</span>
                                                    </div>
                                                    {refundAmount > 0 && (
                                                        <span className="font-bold text-brand-green text-sm shrink-0">
                                                            {formatCurrency(refundAmount)}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                    <span>{formatDate(request.created_at)}</span>
                                                    <span className="capitalize">{request.request_type === "exchange" ? "Troca" : "Devolução"}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1100px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Solicitação</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Pedido</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Cliente</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Loja / Seller</th>
                                                    <th className="py-3 px-2 w-20 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Tipo</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Status</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Resolução</th>
                                                    <th className="py-3 px-2 w-24 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Valor</th>
                                                    <th className="py-3 px-2 w-20 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Origem</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Timeline</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((request) => (
                                                    <ReturnListRow
                                                        key={request.id}
                                                        request={request}
                                                        isPending={isPending}
                                                        onDetail={() => setSelectedRequest(request)}
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

export default ReturnsList
