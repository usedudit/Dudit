"use client"

import { useState, useTransition, useMemo, useCallback } from "react"
import { Button, Badge, IconPlaceholder, Pagination } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import PurchasesListRow from "./PurchasesListRow"
import PurchasesPageControls, { type PurchaseFilterState } from "./PurchasesPageControls"
import AdminPurchaseDetailView from "./AdminPurchaseDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { ExportFileIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency, formatDate } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds } from "@/lib/utils/filter-date-period"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import { adminListPurchasesAction } from "@/app/actions/billing/admin-purchases"
import { useMediaQuery } from "@/components/erp/hooks"

type SortKey = "store" | "plan" | "type" | "amount" | "status" | "payment_method" | "date"
type SortDirection = "asc" | "desc"

interface PurchasesListProps {
    initialData: any[]
    initialStats?: {
        total: number
        completed: number
        pending: number
        failed: number
        refunded: number
        cancelled: number
    }
    initialTotalCount?: number
}

const ITEMS_PER_PAGE = 8

const INITIAL_FILTERS: PurchaseFilterState = {
    status: [],
    purchaseType: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

export default function PurchasesList({ initialData, initialStats, initialTotalCount }: PurchasesListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [activeTab, setActiveTab] = useState<string>("all")
    const [isPending, startTransition] = useTransition()

    // Stats
    const [stats, setStats] = useState(initialStats || { total: 0, completed: 0, pending: 0, failed: 0, refunded: 0, cancelled: 0 })

    // Filters & Modals
    const [filters, setFilters] = useState<PurchaseFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Search state
    const [search, setSearch] = useState("")

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Data State (initialized from SSR)
    const [purchases, setPurchases] = useState<any[]>(initialData || [])
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
                const res = await adminListPurchasesAction({ status: "all", limit: 100 })
                if (res.success) {
                    setPurchases(res.data || [])
                    if (res.stats) setStats(res.stats)
                }
            } catch (err) {
                console.error("Failed to refresh admin purchases:", err)
            }
        })
    }, [])

    // Filter Config for FilterSheet
    const filterSections = useMemo(() => [
        {
            id: "status",
            title: "Status",
            type: "checkbox-list" as const,
            options: ["completed", "pending", "failed", "refunded", "cancelled", "partially_refunded"],
            optionLabels: {
                completed: "Pago",
                pending: "Pendente",
                failed: "Falhou",
                refunded: "Reembolsado",
                cancelled: "Cancelado",
                partially_refunded: "Reembolso parcial",
            } as Record<string, string>,
        } as FilterSectionConfig,
        {
            id: "purchaseType",
            title: "Tipo de Compra",
            type: "checkbox-list" as const,
            options: ["subscription", "addon", "credit_pack", "order_payment", "service", "marketplace_feature"],
            optionLabels: {
                subscription: "Assinatura",
                addon: "Add-on",
                credit_pack: "Pacote de Créditos",
                order_payment: "Pedido",
                service: "Serviço",
                marketplace_feature: "Funcionalidade Marketplace",
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
            filters.purchaseType.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [search, activeTab, filters])

    // Instant in-memory filtering (0ms)
    const filteredPurchases = useMemo(() => {
        const term = search.trim().toLowerCase()
        const dateBounds = isDatePeriodFilterActive(filters.datePeriod)
            ? resolveDatePeriodBounds(filters.datePeriod)
            : { startYmd: null, endYmd: null }

        let result = purchases.filter((p) => {
            // Tab filter
            const st = String(p.status || "").toLowerCase()
            if (activeTab === "completed" && st !== "completed") return false
            if (activeTab === "pending" && st !== "pending") return false
            if (activeTab === "failed" && !["failed", "rejected"].includes(st)) return false
            if (activeTab === "refunded" && !["refunded", "partially_refunded"].includes(st)) return false
            if (activeTab === "cancelled" && st !== "cancelled") return false

            // Search filter
            if (term) {
                const stores = p.partner?.stores || []
                const storeName = String(stores[0]?.name || "").toLowerCase()
                const planName = String(p.plan?.name || p.description || "").toLowerCase()
                const partnerId = String(p.partner_id || "").toLowerCase()
                const protocol = String(p.id || "").slice(0, 8).toLowerCase()
                const typeName = String(p.purchase_type || "").toLowerCase()

                if (!storeName.includes(term) && !planName.includes(term) && !partnerId.includes(term) && !protocol.includes(term) && !typeName.includes(term)) {
                    return false
                }
            }

            // FilterSheet status
            if (filters.status.length > 0 && !filters.status.includes(st)) {
                return false
            }

            // FilterSheet purchase type
            if (filters.purchaseType.length > 0 && !filters.purchaseType.includes(p.purchase_type)) {
                return false
            }

            // Date Period
            if (dateBounds.startYmd && new Date(p.created_at) < new Date(dateBounds.startYmd)) return false
            if (dateBounds.endYmd && new Date(p.created_at) > new Date(dateBounds.endYmd + "T23:59:59")) return false

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
                    case "type":
                        aVal = (a.purchase_type || "").toLowerCase()
                        bVal = (b.purchase_type || "").toLowerCase()
                        break
                    case "amount":
                        aVal = Number(a.total_amount || a.amount || 0)
                        bVal = Number(b.total_amount || b.amount || 0)
                        break
                    case "status":
                        aVal = a.status || ""
                        bVal = b.status || ""
                        break
                    case "payment_method": {
                        const aPayments = a.payments || []
                        const bPayments = b.payments || []
                        aVal = (aPayments[0]?.payment_method_type || "").toLowerCase()
                        bVal = (bPayments[0]?.payment_method_type || "").toLowerCase()
                        break
                    }
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
    }, [purchases, activeTab, search, filters, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredPurchases.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredPurchases, page])

    // Reset to page 1 on filter/tab/search change
    useMemo(() => {
        setPage(1)
    }, [activeTab, search, filters])

    // If viewing detail of a specific purchase via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        const currentPurchase = purchases.find(p => p.id === entityState.entityId)
        if (currentPurchase) {
            return (
                <AdminPurchaseDetailView
                    detail={currentPurchase}
                    onBack={closeEntity}
                />
            )
        }
    }

    const getTabLabel = (tab: string) => {
        switch (tab) {
            case "all": return "Todas"
            case "completed": return "Pagas"
            case "pending": return "Pendentes"
            case "failed": return "Falhou"
            case "refunded": return "Reembolsadas"
            case "cancelled": return "Canceladas"
            default: return tab
        }
    }

    const getTabCount = (tab: string) => {
        switch (tab) {
            case "all": return stats.total
            case "completed": return stats.completed
            case "pending": return stats.pending
            case "failed": return stats.failed
            case "refunded": return stats.refunded
            case "cancelled": return stats.cancelled
            default: return 0
        }
    }

    const getTabIcon = (tab: string) => {
        switch (tab) {
            case "all": return "📋"
            case "completed": return "✅"
            case "pending": return "⏳"
            case "failed": return "❌"
            case "refunded": return "🔄"
            case "cancelled": return "🚫"
            default: return "📋"
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
                            Compras
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie todas as compras, faturas e pagamentos dos parceiros.
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
                <PurchasesPageControls
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
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhuma compra"
                                    title="Nenhuma compra encontrada"
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhuma compra registrada nesta categoria."}
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
                                    {paginatedItems.map((p) => {
                                        const stores = p.partner?.stores || []
                                        const hq = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
                                        const logoUrl = hq.logo_url
                                        const typeLabel = p.purchase_type === "subscription" ? "Assinatura" : 
                                                          p.purchase_type === "addon" ? "Add-on" :
                                                          p.purchase_type === "credit_pack" ? "Créditos" :
                                                          p.purchase_type === "order_payment" ? "Pedido" : p.purchase_type

                                        return (
                                            <div
                                                key={p.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", p.id)}
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
                                                                {typeLabel} - {p.plan?.name || p.description || "N/A"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Badge variant={p.status === "completed" ? "green" : p.status === "pending" ? "orange" : p.status === "failed" ? "red" : p.status === "refunded" || p.status === "partially_refunded" ? "purple" : "gray"}>
                                                        {p.status === "completed" ? "Pago" : p.status === "pending" ? "Pendente" : p.status === "failed" ? "Falhou" : p.status === "refunded" ? "Reembolsado" : p.status === "partially_refunded" ? "Reembolso parcial" : "Cancelado"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs pt-1">
                                                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(p.total_amount || p.amount || 0)}
                                                    </span>
                                                    <span className="font-semibold text-brand-green">Ver detalhes &rarr;</span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                    <span>{formatDate(p.created_at)}</span>
                                                    {p.payment_method_type && (
                                                        <span className="font-medium">{p.payment_method_type}</span>
                                                    )}
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
                                                        Plano / Descrição {sortConfig?.key === "plan" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("type")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Tipo {sortConfig?.key === "type" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("amount")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Valor {sortConfig?.key === "amount" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("status")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Status {sortConfig?.key === "status" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("payment_method")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Meio Pag. {sortConfig?.key === "payment_method" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort("date")}
                                                        className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors"
                                                    >
                                                        Data {sortConfig?.key === "date" ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                                                    </th>
                                                    <th className="py-3 px-2 pr-6 rounded-r-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((p) => (
                                                    <PurchasesListRow
                                                        key={p.id}
                                                        purchase={p}
                                                        isPending={isPending}
                                                        onDetail={() => openEntity("view", p.id)}
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