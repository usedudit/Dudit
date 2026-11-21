"use client"

import { useState, useTransition, useMemo, useCallback, useEffect, useRef } from "react"
import Link from "next/link"
import {
    Button,
    Badge,
    Pagination,
    IconPlaceholder,
    AlertModal,
} from "@/components/reusable"
import SubscriptionsPageControls from "@/components/admin/subscriptions/SubscriptionsPageControls"
import { toast } from "@/hooks/use-notification"
import {
    ExportFileIcon,
    StoreIcon,
} from "@/lib/icons"
import type { SubscriptionEntry, CursorPaginatedResult } from "@/lib/admin/types"
import {
    getSubscriptions,
    getAdminSubscriptionStats,
    forceCancelSubscription,
    type AdminSubscriptionStats,
} from "@/app/actions/admin/subscriptions"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatDate } from "@/lib/utils"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds, DatePeriodFilterValue } from "@/lib/utils/filter-date-period"

type SortKey = "store" | "partner" | "gateway" | "status" | "date"
type SortDirection = "asc" | "desc"

interface SubscriptionListProps {
    initialData?: CursorPaginatedResult<SubscriptionEntry>
    initialStats?: AdminSubscriptionStats
}

const ITEMS_PER_PAGE = 8

export default function SubscriptionList({ initialData, initialStats }: SubscriptionListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [stats, setStats] = useState<AdminSubscriptionStats | undefined>(initialStats)
    const [statusTab, setStatusTab] = useState("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    const [disconnectTarget, setDisconnectTarget] = useState<SubscriptionEntry | null>(null)
    const [actionReason, setActionReason] = useState("")
    const [isPending, startTransition] = useTransition()

    // Search state (debounced so the server is only queried after typing stops)
    const { search, setSearch, debouncedSearch } = useDebouncedSearch()

    // Date period filter
    const [filters, setFilters] = useState<{ datePeriod: DatePeriodFilterValue }>({
        datePeriod: { ...EMPTY_DATE_PERIOD },
    })

    // Helper to compute derived fields from SubscriptionEntry
    const enrichSubscription = useCallback((sub: SubscriptionEntry) => {
        const isConnected = !!sub.mp_user_id
        const isSuspended = !!sub.suspended_at
        // The provider is not in the type, use a default
        const mpProvider = sub.mp_user_id ? "Mercado Pago" : "—"
        return { ...sub, is_connected: isConnected, is_suspended: isSuspended, mp_provider: mpProvider }
    }, [])

    // Server-side filters derived from the UI state
    const buildServerFilters = useCallback((term: string) => {
        const bounds = isDatePeriodFilterActive(filters.datePeriod)
            ? resolveDatePeriodBounds(filters.datePeriod)
            : { startYmd: null as string | null, endYmd: null as string | null }

        return {
            statusFilter: statusTab === "all" ? undefined : statusTab,
            search: term.trim() || undefined,
            startDate: bounds.startYmd || undefined,
            endDate: bounds.endYmd || undefined,
        }
    }, [statusTab, filters])

    // Data State (initialized from SSR)
    const [subscriptions, setSubscriptions] = useState<SubscriptionEntry[]>(initialData?.data || [])
    const [hasMore, setHasMore] = useState<boolean>(initialData?.hasMore || false)
    const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor || null)
    const [isFetchingMore, setIsFetchingMore] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const isFirstFetchRef = useRef(true)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    const refreshSubscriptions = useCallback(() => {
        startTransition(async () => {
            try {
                const [res, statsRes] = await Promise.all([
                    getSubscriptions(null, 50, buildServerFilters(debouncedSearch)),
                    getAdminSubscriptionStats(),
                ])
                setSubscriptions(res.data || [])
                setNextCursor(res.nextCursor)
                setHasMore(res.hasMore)
                setPage(1)
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to refresh subscriptions:", err)
            }
        })
    }, [buildServerFilters, debouncedSearch])

    // Server-side search / filters: refetch the first page whenever they change
    useEffect(() => {
        const isDefaultView =
            statusTab === "all" &&
            debouncedSearch.trim().length === 0 &&
            !isDatePeriodFilterActive(filters.datePeriod)

        if (isFirstFetchRef.current) {
            isFirstFetchRef.current = false
            if (isDefaultView) return
        }

        let cancelled = false
        setIsLoading(true)

        getSubscriptions(null, 50, buildServerFilters(debouncedSearch))
            .then((res) => {
                if (cancelled) return
                setSubscriptions(res.data || [])
                setNextCursor(res.nextCursor)
                setHasMore(res.hasMore)
                setPage(1)
            })
            .catch((err) => {
                if (!cancelled) console.error("Failed to load admin subscriptions:", err)
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [statusTab, debouncedSearch, filters, buildServerFilters])

    const loadMoreSubscriptions = useCallback(async () => {
        if (!hasMore || !nextCursor || isFetchingMore) return
        setIsFetchingMore(true)
        try {
            const res = await getSubscriptions(nextCursor, 50, buildServerFilters(debouncedSearch))
            setSubscriptions((prev) => {
                const existing = new Set(prev.map((s) => s.partner_id))
                return [...prev, ...(res.data || []).filter((s: SubscriptionEntry) => !existing.has(s.partner_id))]
            })
            setNextCursor(res.nextCursor)
            setHasMore(res.hasMore)
        } catch (err) {
            console.error("Failed to load more admin subscriptions:", err)
        } finally {
            setIsFetchingMore(false)
        }
    }, [hasMore, nextCursor, isFetchingMore, buildServerFilters, debouncedSearch])

    const handleConfirmDisconnect = () => {
        if (!disconnectTarget) return
        startTransition(async () => {
            try {
                const res = await forceCancelSubscription(disconnectTarget.partner_id, actionReason || "Revogação administrativa de gateway", "admin-confirmed")
                if (res.success) {
                    toast.success("Conexão do gateway revogada!")
                    setDisconnectTarget(null)
                    setActionReason("")
                    refreshSubscriptions()
                } else {
                    toast.error(res.error || "Erro ao revogar gateway")
                }
            } catch (err: any) {
                toast.error(err.message || "Erro inesperado")
            }
        })
    }

    // Enrich all subscriptions with computed fields
    const enrichedSubscriptions = useMemo(() => subscriptions.map(enrichSubscription), [subscriptions, enrichSubscription])

    // In-memory sorting (applied on top of server-sorted data)
    const sortedSubscriptions = useMemo(() => {
        if (!sortConfig) return enrichedSubscriptions
        return [...enrichedSubscriptions].sort((a, b) => {
            let aVal: any = ""
            let bVal: any = ""
            switch (sortConfig.key) {
                case "store":
                    aVal = (a.store_name || "").toLowerCase()
                    bVal = (b.store_name || "").toLowerCase()
                    break
                case "partner":
                    aVal = (a.partner_id || "").toLowerCase()
                    bVal = (b.partner_id || "").toLowerCase()
                    break
                case "gateway":
                    aVal = (a.mp_provider || "").toLowerCase()
                    bVal = (b.mp_provider || "").toLowerCase()
                    break
                case "status":
                    aVal = a.is_suspended ? 2 : a.is_connected ? 0 : 1
                    bVal = b.is_suspended ? 2 : b.is_connected ? 0 : 1
                    break
                case "date":
                    aVal = new Date(a.created_at).getTime()
                    bVal = new Date(b.created_at).getTime()
                    break
            }
            if (aVal === bVal) return 0
            const cmp = aVal < bVal ? -1 : 1
            return sortConfig.direction === "asc" ? cmp : -cmp
        })
    }, [enrichedSubscriptions, sortConfig])

    // Pagination (Strict 8 items)
    const totalPages = Math.max(1, Math.ceil(sortedSubscriptions.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return sortedSubscriptions.slice(start, start + ITEMS_PER_PAGE)
    }, [sortedSubscriptions, page])

    const getStatusBadgeVariant = (sub: ReturnType<typeof enrichSubscription>) => {
        if (sub.is_suspended) return "red" as const
        if (sub.is_connected) return "green" as const
        return "red" as const
    }

    const getStatusLabel = (sub: ReturnType<typeof enrichSubscription>) => {
        if (sub.is_suspended) return "Suspensa"
        if (sub.is_connected) return "Conectada"
        return "Desconectada"
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
                            Assinaturas & Gateways
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie conexões de gateways de pagamento dos parceiros.
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
                    activeTab={statusTab}
                    setActiveTab={setStatusTab}
                    search={search}
                    onSearchChange={setSearch}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    stats={stats}
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
                                    subtitle={statusTab !== "all" || debouncedSearch.trim().length > 0 || isDatePeriodFilterActive(filters.datePeriod)
                                        ? "Tente ajustar seus filtros de busca."
                                        : "Nenhuma assinatura registrada."}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((sub) => {
                                        const enriched = enrichSubscription(sub)
                                        return (
                                            <div
                                                key={sub.partner_id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            {sub.store_name || "Loja"}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            ID: {sub.partner_id.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                    <Badge variant={getStatusBadgeVariant(enriched)}>
                                                        {getStatusLabel(enriched)}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="truncate">Gateway: {enriched.mp_provider}</span>
                                                    </div>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm shrink-0">
                                                        {formatDate(sub.created_at)}
                                                    </span>
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
                                                    <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight rounded-l-lg">
                                                        Loja / Parceiro
                                                    </th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Gateway
                                                    </th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Status
                                                    </th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Conectado em
                                                    </th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                        Criado em
                                                    </th>
                                                    <th className="py-3 px-4 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-right pr-6 rounded-r-lg">
                                                        Ações
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((sub) => {
                                                    const enriched = enrichSubscription(sub)
                                                    return (
                                                        <tr key={sub.partner_id} className="border-t border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/30 transition-colors">
                                                            <td className="py-3 px-4">
                                                                <div className="font-medium text-brand-dark dark:text-dark-heading">
                                                                    {sub.store_name || "Loja"}
                                                                </div>
                                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                                    ID: {sub.partner_id.slice(0, 8)}
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <span className="text-sm text-brand-dark dark:text-dark-heading font-mono">
                                                                    {enriched.mp_provider}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <Badge variant={getStatusBadgeVariant(enriched)}>
                                                                    {getStatusLabel(enriched)}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-3 px-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                                                {sub.mp_connected_at ? formatDate(sub.mp_connected_at) : "—"}
                                                            </td>
                                                            <td className="py-3 px-4 text-sm text-brand-inactive-text dark:text-dark-body">
                                                                {formatDate(sub.created_at)}
                                                            </td>
                                                            <td className="py-3 px-4 text-right pr-6">
                                                                {enriched.is_connected && !enriched.is_suspended && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setDisconnectTarget(sub)
                                                                        }}
                                                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                                    >
                                                                        Revogar
                                                                    </Button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
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

                                {/* Load more from the server (cursor pagination) */}
                                {hasMore && page === totalPages && (
                                    <div className="pt-4 flex justify-center">
                                        <Button
                                            variant="outline"
                                            onClick={loadMoreSubscriptions}
                                            disabled={isFetchingMore}
                                        >
                                            {isFetchingMore ? "Carregando..." : "Carregar mais"}
                                        </Button>
                                    </div>
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Disconnect Modal */}
            <AlertModal
                isOpen={!!disconnectTarget}
                onClose={() => setDisconnectTarget(null)}
                title="Revogar conexão do gateway"
                description={`Tem certeza que deseja revogar a conexão do gateway para a loja "${disconnectTarget?.store_name}"? Esta ação desconectará o Mercado Pago e o parceiro precisará reconectar.`}
                confirmText="Revogar"
                cancelText="Cancelar"
                onConfirm={handleConfirmDisconnect}
                variant="danger"
            />
        </FadeIn>
    )
}