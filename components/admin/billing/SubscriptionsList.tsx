"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, IconPlaceholder, Pagination } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import SubscriptionsListRow from "./SubscriptionsListRow"
import SubscriptionsPageControls, { type SubscriptionFilterState } from "./SubscriptionsPageControls"
import AdminSubscriptionDetailView from "./AdminSubscriptionDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { ExportFileIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDate } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds } from "@/lib/utils/filter-date-period"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import { adminListBillingSubscriptionsAction } from "@/app/actions/billing/admin-subscriptions"
import { useMediaQuery } from "@/components/erp/hooks"

type SortKey = "store" | "plan" | "status" | "amount" | "period_end" | "date"
type SortDirection = "asc" | "desc"

interface SubscriptionsListProps {
    initialData: any[]
    initialStats?: {
        total: number
        active: number
        past_due: number
        cancelled: number
        trial: number
    }
    initialTotalCount?: number
}

const ITEMS_PER_PAGE = 8

const INITIAL_FILTERS: SubscriptionFilterState = {
    status: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

export default function SubscriptionsList({ initialData, initialStats, initialTotalCount }: SubscriptionsListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [activeTab, setActiveTab] = useState<string>("all")
    const [isPending, startTransition] = useTransition()

    // Stats
    const [stats, setStats] = useState(initialStats || { total: 0, active: 0, past_due: 0, cancelled: 0, trial: 0 })

    // Filters & Modals
    const [filters, setFilters] = useState<SubscriptionFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Search state
    const [search, setSearch] = useState("")

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State (initialized from SSR)
    const [subscriptions, setSubscriptions] = useState<any[]>(initialData || [])
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
                const res = await adminListBillingSubscriptionsAction({ status: "all", limit: 100 })
                if (res.success) {
                    setSubscriptions(res.data || [])
                    if (res.stats) setStats(res.stats)
                }
            } catch (err) {
                console.error("Failed to refresh admin subscriptions:", err)
            }
        })
    }, [])

    // Filter Config for FilterSheet
    const filterSections = useMemo(() => [
        {
            id: "status",
            title: "Status da Assinatura",
            type: "checkbox-list" as const,
            options: ["active", "past_due", "cancelled", "trialing", "incomplete", "incomplete_expired"],
            optionLabels: {
                active: "Ativa",
                past_due: "Em atraso",
                cancelled: "Cancelada",
                trialing: "Trial",
                incomplete: "Incompleta",
                incomplete_expired: "Trial expirado",
            } as Record<string, string>,
        } as FilterSectionConfig,
        {
            id: "datePeriod",
            title: "Período",
            type: "date-period" as const,
        } as FilterSectionConfig,
    ], [])

    const hasActiveFilters = useMemo(() => {
        return (
            search.trim().length > 0 ||
            activeTab !== "all" ||
            filters.status.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [search, activeTab, filters])

    // Instant in-memory filtering (0ms)
    const filteredSubscriptions = useMemo(() => {
        const term = search.trim().toLowerCase()
        const dateBounds = isDatePeriodFilterActive(filters.datePeriod)
            ? resolveDatePeriodBounds(filters.datePeriod)
            : { startYmd: null, endYmd: null }

        let result = subscriptions.filter((s) => {
            // Tab filter - map tab to subscription status
            const subStatus = s.subscription?.status || "unknown"
            if (activeTab === "active" && subStatus !== "active") return false
            if (activeTab === "past_due" && subStatus !== "past_due") return false
            if (activeTab === "cancelled" && subStatus !== "cancelled") return false
            if (activeTab === "trial" && subStatus !== "trialing") return false

            // Search filter
            if (term) {
                const stores = s.partner?.stores || []
                const storeName = String(stores[0]?.name || "").toLowerCase()
                const planName = String(s.plan?.name || s.description || "").toLowerCase()
                const partnerId = String(s.partner_id || "").toLowerCase()
                const protocol = String(s.id || "").slice(0, 8).toLowerCase()

                if (!storeName.includes(term) && !planName.includes(term) && !partnerId.includes(term) && !protocol.includes(term)) {
                    return false
                }
            }

            // FilterSheet status
            if (filters.status.length > 0 && !filters.status.includes(subStatus)) {
                return false
            }

            // Date Period (filter by purchase created_at)
            if (dateBounds.startYmd && new Date(s.created_at) < new Date(dateBounds.startYmd)) return false
            if (dateBounds.endYmd && new Date(s.created_at) > new Date(dateBounds.endYmd + "T23:59:59")) return false

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
                        aVal = (a.plan?.name || a.description || "").toLowerCase()
                        bVal = (b.plan?.name || b.description || "").toLowerCase()
                        break
                    case "status":
                        aVal = (a.subscription?.status || "").toLowerCase()
                        bVal = (b.subscription?.status || "").toLowerCase()
                        break
                    case "amount":
                        aVal = Number(a.total_amount || a.amount || 0)
                        bVal = Number(b.total_amount || b.amount || 0)
                        break
                    case "period_end":
                        aVal = a.subscription?.current_period_end ? new Date(a.subscription.current_period_end).getTime() : 0
                        bVal = b.subscription?.current_period_end ? new Date(b.subscription.current_period_end).getTime() : 0
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
    }, [subscriptions, activeTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredSubscriptions.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredSubscriptions.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredSubscriptions, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [activeTab, search, filters])

    // If viewing detail of a specific subscription via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentSub = subscriptions.find(s => s.id === entityState.entityId)
        if (currentSub) {
            return (
                <AdminSubscriptionDetailView
                    detail={currentSub}
                    onBack={closeEntity}
                />
            )
        }
    }

    const getTabLabel = (tab: string) => {
        switch (tab) {
            case "all": return "Todas"
            case "active": return "Ativas"
            case "past_due": return "Em atraso"
            case "cancelled": return "Canceladas"
            case "trial": return "Trial"
            default: return tab
        }
    }

    const getTabCount = (tab: string) => {
        switch (tab) {
            case "all": return stats.total
            case "active": return stats.active
            case "past_due": return stats.past_due
            case "cancelled": return stats.cancelled
            case "trial": return stats.trial
            default: return 0
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
                            Assinaturas
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie assinaturas recorrentes dos parceiros e seus ciclos de cobrança.
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
                <SubscriptionsPageControls
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    hasActiveFilters={hasActiveFilters}
                    tabCounts={stats}
                    getTabLabel={getTabLabel}
                    getTabCount={getTabCount}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhuma assinatura"
                                    title="Nenhuma assinatura encontrada"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhuma assinatura registrada nesta categoria."}
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
                                    {paginatedItems.map((s) => {
                                        const stores = s.partner?.stores || []
                                        const hq = stores.find((st: any) => st.is_headquarters) || stores[0] || {}
                                        const logoUrl = hq.logo_url
                                        const subStatus = s.subscription?.status || "unknown"
                                        const periodEnd = s.subscription?.current_period_end

                                        return (
                                            <div
                                                key={s.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", s.id)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                            {logoUrl ? (
                                                                <img src={getR2ImageUrl(logoUrl)} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <svg className="w-5 h-5 text-brand-inactive-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                {hq.name || "Loja Parceira"}
                                                            </span>
                                                            <span className="text-xs text-brand-inactive-text truncate">
                                                                {s.plan?.name || s.description || "Assinatura"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Badge variant={subStatus === "active" ? "green" : subStatus === "past_due" ? "red" : subStatus === "cancelled" ? "gray" : subStatus === "trialing" ? "blue" : "orange"}>
                                                        {subStatus === "active" ? "Ativa" : subStatus === "past_due" ? "Em atraso" : subStatus === "cancelled" ? "Cancelada" : subStatus === "trialing" ? "Trial" : subStatus}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs pt-1">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(s.total_amount || s.amount || 0)}/{s.plan?.interval === "month" ? "mês" : "período"}
                                                    </span>
                                                    <span className="font-semibold text-brand-green">Ver detalhes &rarr;</span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                    <span>Próx. cobrança: {periodEnd ? formatDate(periodEnd) : "—"}</span>
                                                    <span>{formatDate(s.created_at)}</span>
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
                                                <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                    <th
                                                        onClick={() => handleSort("store")}
                                                        className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Loja / Parceiro {sortConfig?.key === "store" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("plan")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Plano {sortConfig?.key === "plan" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("amount")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Valor {sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("period_end")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Próx. Cobrança {sortConfig?.key === "period_end" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Criada em {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((s) => (
                                                    <SubscriptionsListRow
                                                        key={s.id}
                                                        subscription={s}
                                                        isPending={isPending}
                                                        onDetail={() => openEntity("view", s.id)}
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
                                            fixedUntil="lg"
                                        />
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
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
            </div>
        </FadeIn>
    )
}