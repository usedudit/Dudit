"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEntityState } from "@/hooks/use-entity-state"
import { motion, AnimatePresence } from "framer-motion"
import { Button, IconPlaceholder, AlertModal, FormDropdown, Input } from "@/components/reusable"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { resolveDatePeriodBounds, isDatePeriodFilterActive, type DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import { FadeIn } from "@/components/animations/FadeIn"
import { ExportFileIcon, PlusIcon, SparklesIcon, MapPinIcon } from "@/lib/icons"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getERPDeliveriesPageAction, type ERPDeliveryListCursor, updateERPDeliveryStatusAction, getERPDeliveryPlanAccessAction, getSmartDeliverySuggestionsAction } from "@/app/actions/erp/deliveries"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import DeliveryPageControls from "./DeliveryPageControls"
import DeliveryKanbanBoard from "./DeliveryKanbanBoard"
import CreateDeliveryPage from "./CreateDeliveryPage"
import DeliveryDetailPage from "./DeliveryDetailPage"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import { formatDistance } from "@/lib/services/location.service"
import { toast } from "@/hooks/use-notification"

const CHANGE_STATUS_REASONS = [
    { value: "operational_error", label: "Erro operacional / Clique acidental" },
    { value: "rescheduling", label: "Cliente solicitou reagendamento" },
    { value: "logistics_issue", label: "Problema logístico / Rota" },
    { value: "payment_issue", label: "Problema com pagamento" },
    { value: "other", label: "Outro" }
]

function doesTransitionRequireReason(currentStatus: string, nextStatus: string): boolean {
    if (currentStatus === "delivered" && nextStatus !== "delivered") {
        return true;
    }
    if (currentStatus === "delivery_failed" && nextStatus !== "delivery_failed") {
        return true;
    }
    if (currentStatus === "sent" && ["preparing", "pickup_available", "delivery_failed", "not_sent", "pending"].includes(nextStatus)) {
        return true;
    }
    if (currentStatus === "pickup_available" && ["preparing", "sent", "delivery_failed", "not_sent", "pending"].includes(nextStatus)) {
        return true;
    }
    if (currentStatus === "preparing" && ["not_sent", "pending", "delivery_failed"].includes(nextStatus)) {
        return true;
    }
    return false;
}

type SortKey = "order_id" | "delivery_fee" | "status" | "delivery_person" | "estimated_time" | "dates" | "delivered_at"

export default function DeliveriesPage({
    partnerId,
    deliveries: initialDeliveries = [],
    initialNextCursor = null,
    initialHasMore = false,
    planGate: propPlanGate,
    userRole: initialUserRole,
}: {
    partnerId: string
    deliveries?: any[]
    initialNextCursor?: ERPDeliveryListCursor | null
    initialHasMore?: boolean
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
    userRole?: string
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { openPlanUpgrade } = usePlanUpgrade()

    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
    const isCreatingEntity = entityState.isOpen && entityState.action === "create"
    const isEditingEntity = entityState.isOpen && entityState.action === "edit"
    const selectedDeliveryId = entityState.isOpen && entityState.action === "view" ? entityState.entityId : null
    const editDeliveryId = isEditingEntity ? entityState.entityId : null
    const wrapper = isCreatingEntity ? "create" : isEditingEntity ? "edit" : selectedDeliveryId ? "detail" : "list"

    const [createPrefillOrderIds, setCreatePrefillOrderIds] = useState<string[] | null>(null)

    const initialSearch = searchParams?.get("search") || ""
    const [search, setSearchState] = useState(initialSearch)

    const setSearch = useCallback((val: string) => {
        setSearchState(val)
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href)
            if (val.trim()) {
                url.searchParams.set("search", val.trim())
            } else {
                url.searchParams.delete("search")
            }
            router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false })
        }
    }, [router])

    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)
    const [filters, setFilters] = useState<{ status: string[]; datePeriod: DatePeriodFilterValue }>({
        status: [],
        datePeriod: { presets: ["Últimos 3 dias"], from: "", to: "" },
    })
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [viewMode, setViewMode] = useState<"kanban">("kanban")

    const [activeTab, setActiveTabState] = useState<"active" | "closed">("active")

    // Sync search with URL searchParams
    useEffect(() => {
        const currentSearchParam = searchParams?.get("search") || ""
        if (currentSearchParam !== search) {
            setSearchState(currentSearchParam)
            setDebouncedSearch(currentSearchParam)
        }
    }, [searchParams])

    const setActiveTab = useCallback((tab: "active" | "closed") => {
        setActiveTabState(tab)
    }, [])
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const [planSlug, setPlanSlug] = useState<string>("free")
    const [suggestionsOpen, setSuggestionsOpen] = useState(false)
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<any[]>([])

    const [statusModal, setStatusModal] = useState<{ deliveryId: string; currentStatus: string; nextStatus: string } | null>(null)
    const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})
    const [deliveryWarningModal, setDeliveryWarningModal] = useState<{
        isOpen: boolean;
        deliveryId: string;
        currentStatus: string;
        nextStatus: string;
        reasonDropdownValue: string;
        customReasonText: string;
    } | null>(null)
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{
        isOpen: boolean;
        deliveryId: string;
        nextStatus: string;
    } | null>(null)

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const observerTarget = useRef<HTMLDivElement>(null)

    const queryKey = useMemo(() => ["erp", "deliveries", partnerId] as const, [partnerId])
    const {
        items,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteList<any, ERPDeliveryListCursor>({
        queryKey,
        initialPage: { items: initialDeliveries, nextCursor: initialNextCursor, hasMore: initialHasMore },
        fetchFn: async ({ cursor }) => {
            const res = await getERPDeliveriesPageAction(partnerId, { cursor, limit: 25 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar entregas.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((d: any) => String(d?.id || ""), []),
    })

    const planGate = propPlanGate
    const isDelivery = initialUserRole === "delivery"

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const checkScroll = () => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const nextLeft = scrollLeft > 0
            const nextRight = scrollLeft < scrollWidth - clientWidth - 2
            if (prev.left === nextLeft && prev.right === nextRight) return prev
            return { left: nextLeft, right: nextRight }
        })
    }

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => {
        let mounted = true
        const run = async () => {
            const res = await getERPDeliveryPlanAccessAction(partnerId)
            if (!mounted) return
            if (res.success) setPlanSlug(String(res.planSlug || "free"))
        }
        run()
        return () => { mounted = false }
    }, [partnerId])

    const canSmartSuggest = planSlug === "escalar"

    const loadSuggestions = async () => {
        if (!canSmartSuggest) {
            openPlanUpgrade("escalar")
            return
        }
        setSuggestionsOpen(true)
        setSuggestionsLoading(true)
        try {
            const res = await getSmartDeliverySuggestionsAction({ partnerId, maxOrdersPerDelivery: 5 })
            if (res.success) setSuggestions(res.items || [])
            else setSuggestions([])
        } finally {
            setSuggestionsLoading(false)
        }
    }

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [viewMode, items])

    const tabCounts = useMemo(() => {
        let active = 0
        let closed = 0
        for (const raw of items || []) {
            const links = Array.isArray(raw.delivery_orders) ? raw.delivery_orders : []
            if (links.length === 0) continue
            const effectiveStatus = statusOverrides[raw.id] || raw.status || "not_sent"
            const isClosed = ["cancelled", "delivery_failed"].includes(effectiveStatus)
            if (isClosed) closed++
            else active++
        }
        return { active, closed }
    }, [items, statusOverrides])

    const filterSections: FilterSectionConfig[] = [
        {
            id: "datePeriod",
            title: "Período",
            type: "date-period",
        },
    ]

    const mapped = useMemo(() => {
        const term = debouncedSearch.toLowerCase().trim()
        const nowMs = Date.now()
        let list = (items || []).map((raw: any) => {
            const links = Array.isArray(raw.delivery_orders) ? raw.delivery_orders : []
            if (links.length === 0) return null
            const firstLink = [...links].sort((a: any, b: any) => Number(a.position || 9999) - Number(b.position || 9999))[0]
            const order = firstLink?.orders || {}
            const deliveryPersonName = raw.partner_users?.user_profiles?.full_name || null
            const effectiveStatus = statusOverrides[raw.id] || raw.status || "not_sent"
            const estimatedArrivalAt = raw.started_at && raw.estimated_duration_minutes
                ? new Date(new Date(raw.started_at).getTime() + Number(raw.estimated_duration_minutes) * 60000).toISOString()
                : null
            const isClosed = ["delivered", "cancelled", "delivery_failed"].includes(effectiveStatus)
            const isLate = !!estimatedArrivalAt && !isClosed && nowMs > new Date(estimatedArrivalAt).getTime()
            const remainingMs = estimatedArrivalAt ? Math.max(0, new Date(estimatedArrivalAt).getTime() - nowMs) : 0
            const remainingMinutes = Math.ceil(remainingMs / 60000)
            const remainingHoursPart = Math.floor(remainingMinutes / 60)
            const remainingMinutesPart = remainingMinutes % 60
            const remainingLabel = remainingHoursPart > 0
                ? `Vence em ${remainingHoursPart}h ${remainingMinutesPart}m`
                : `Vence em ${remainingMinutes} min`
            const customerNames = Array.from(new Set(links.map((l: any) => l.orders?.customer_name).filter(Boolean)))
            const displayCustomerName = customerNames.length > 1 ? "Múltiplos clientes" : (customerNames[0] || "Cliente")

            const addresses = Array.from(new Set(links.map((l: any) => l.orders?.delivery_address).filter(Boolean)))
            const displayAddress = addresses.length > 1 ? "Múltiplos endereços" : (addresses[0] || "")

            return {
                id: raw.id,
                orderId: firstLink?.order_id || null,
                orderCount: links.length,
                orderDisplayId: order.order_number || (firstLink?.order_id ? `#${String(firstLink.order_id).slice(0, 8).toUpperCase()}` : "-"),
                customerName: displayCustomerName,
                customerAddress: displayAddress,
                orderSource: order.order_source || "Manual",
                status: effectiveStatus,
                deliveryPersonName,
                estimatedDurationMinutes: Number(raw.estimated_duration_minutes || 0),
                startedAt: raw.started_at,
                deliveredAt: raw.delivered_at,
                estimatedArrivalAt,
                deliveryFee: links.reduce((sum: number, l: any) => sum + Number(l.orders?.delivery_fee || 0), 0),
                createdAtMs: new Date(raw.created_at).getTime(),
                deliveryTimingState: isLate ? "late" : "on_time",
                deliveryTimingLabel: estimatedArrivalAt ? (isLate ? "Atrasada" : "No prazo") : "",
                deliveryTimingDetail: estimatedArrivalAt && !isLate && !isClosed ? remainingLabel : "",
            }
        }).filter(Boolean)

        list = list.filter((d: any) => {
            const matchSearch = !term || d.orderDisplayId.toLowerCase().includes(term) || d.customerName.toLowerCase().includes(term)
            const statusLabel = getDeliveryStatusMeta(d.status).label
            const matchStatus = filters.status.length === 0 || filters.status.includes(statusLabel)

            const isClosedTab = ["cancelled", "delivery_failed"].includes(d.status)
            const matchTab = activeTab === "closed" ? isClosedTab : !isClosedTab

            const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
            const createdYmd = d.createdAtMs ? new Date(d.createdAtMs).toISOString().slice(0, 10) : null
            const matchDate = !startYmd && !endYmd
                ? true
                : createdYmd
                    ? createdYmd >= (startYmd || "") && createdYmd <= (endYmd || "9999-12-31")
                    : false

            return matchSearch && matchStatus && matchTab && matchDate
        })

        if (sortConfig) {
            list = [...list].sort((a: any, b: any) => {
                let aVal = a[sortConfig.key]
                let bVal = b[sortConfig.key]
                if (typeof aVal === "string") aVal = aVal.toLowerCase()
                if (typeof bVal === "string") bVal = bVal.toLowerCase()
                if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1
                if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1
                return 0
            })
        }

        return list
    }, [items, debouncedSearch, filters, sortConfig, statusOverrides, activeTab])

    const totalPages = Math.ceil(mapped.length / 100) || 1
    const [page, setPage] = useState(1)

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, filters, sortConfig, activeTab])

    const paginated = useMemo(() => {
        const start = (page - 1) * 100
        return mapped.slice(start, start + 100)
    }, [mapped, page])

    const executeStatusChange = async (deliveryId: string, nextStatus: string, reason?: string) => {
        setStatusOverrides(prev => ({ ...prev, [deliveryId]: nextStatus }))
        const res = await updateERPDeliveryStatusAction({
            deliveryId,
            partnerId,
            status: nextStatus as any,
            changeReason: reason || undefined
        })

        if (!res.success) {
            setStatusOverrides(prev => {
                const next = { ...prev }
                delete next[deliveryId]
                return next
            })
            toast({
                title: "Erro ao atualizar status",
                description: res.error || "Não foi possível atualizar o status da entrega.",
                variant: "destructive"
            })
        } else {
            toast({
                title: "Status atualizado",
                description: `A entrega foi atualizada para "${getDeliveryStatusMeta(nextStatus).label}".`,
            })
        }
    }

    const handleQuickStatusChange = (deliveryId: string, targetOrCurrentStatus?: string) => {
        const item = (mapped || []).find((d: any) => d.id === deliveryId)
        const currentStatus = item ? item.status : "pending"

        if (targetOrCurrentStatus && targetOrCurrentStatus !== currentStatus) {
            handleStatusTransition(deliveryId, currentStatus, targetOrCurrentStatus)
        } else {
            setStatusModal({ deliveryId, currentStatus, nextStatus: currentStatus })
        }
    }

    const handleStatusTransition = (deliveryId: string, currentStatus: string, nextStatus: string) => {
        setStatusModal(null)
        if (currentStatus === nextStatus) return

        if (doesTransitionRequireReason(currentStatus, nextStatus)) {
            setDeliveryWarningModal({
                isOpen: true,
                deliveryId,
                currentStatus,
                nextStatus,
                reasonDropdownValue: "",
                customReasonText: "",
            })
        } else {
            setSimpleConfirmModal({
                isOpen: true,
                deliveryId,
                nextStatus,
            })
        }
    }

    const confirmDeliveryWarningStatusChange = async () => {
        if (!deliveryWarningModal) return
        const { deliveryId, nextStatus, reasonDropdownValue, customReasonText } = deliveryWarningModal
        let finalReason = reasonDropdownValue
        if (reasonDropdownValue === "other" && customReasonText.trim()) {
            finalReason = `Outro: ${customReasonText.trim()}`
        } else {
            const foundLabel = CHANGE_STATUS_REASONS.find(r => r.value === reasonDropdownValue)?.label
            if (foundLabel) finalReason = foundLabel
        }

        setDeliveryWarningModal(null)
        await executeStatusChange(deliveryId, nextStatus, finalReason)
    }

    return (
        <AnimatePresence mode="wait">
            {wrapper === "create" || wrapper === "edit" ? (
                <FadeIn key={wrapper} className="w-full h-full">
                    <CreateDeliveryPage
                        partnerId={partnerId}
                        editDeliveryId={editDeliveryId || undefined}
                        onBack={() => { setCreatePrefillOrderIds(null); closeEntity() }}
                        onSuccess={() => { setCreatePrefillOrderIds(null); closeEntity() }}
                        initialOrderIds={createPrefillOrderIds || undefined}
                    />
                </FadeIn>
            ) : wrapper === "detail" && selectedDeliveryId ? (
                <FadeIn key="detail" className="w-full h-full">
                    <DeliveryDetailPage
                        deliveryId={selectedDeliveryId}
                        partnerId={partnerId}
                        onBack={() => closeEntity()}
                        onEdit={isDelivery ? undefined : (id) => openEntity("edit", id)}
                        planSlug={planSlug}
                    />
                </FadeIn>
            ) : (
                <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                    <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                            <div className="flex flex-col gap-2 pt-1">
                                <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Entregas</h1>
                                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Gerencie as entregas vinculadas aos pedidos.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isDelivery && (
                                    <Button variant="outline" leftIcon={<ExportFileIcon size={18} />}>
                                        Exportar
                                    </Button>
                                )}
                                {!isDelivery && (
                                    <Button
                                        variant="outline"
                                        onClick={loadSuggestions}
                                        disabled={!!planGate}
                                        leftIcon={<SparklesIcon size={18} />}
                                    >
                                        Gerar sugestões
                                    </Button>
                                )}
                                {!isDelivery && (
                                    <Button onClick={() => openEntity("create")} disabled={!!planGate} leftIcon={<PlusIcon size={18} />}>
                                        Nova entrega
                                    </Button>
                                )}
                            </div>
                        </div>

                        <DeliveryPageControls
                            activeTab={activeTab}
                            onActiveTabChange={setActiveTab}
                            search={search}
                            onSearchChange={setSearch}
                            onOpenFilter={() => setIsFilterOpen(true)}
                            onAdd={() => openEntity("create")}
                            onOpenSuggestions={loadSuggestions}
                            canSmartSuggest={canSmartSuggest}
                            addDisabled={!!planGate}
                            tabCounts={tabCounts}
                            userRole={initialUserRole}
                            filters={filters}
                            setFilters={setFilters}
                            hasActiveFilters={filters.status.length > 0 || isDatePeriodFilterActive(filters.datePeriod)}
                        />

                        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                            <AnimatePresence mode="wait">
                                {paginated.length === 0 ? (
                                    <FadeIn key="empty" className="flex flex-col items-center justify-center h-[500px] text-center p-8 w-full">
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc={
                                                planGate
                                                    ? "https://img.dudit.com.br/static/mascots/PlanoVender.png"
                                                    : "https://img.dudit.com.br/static/mascots/Entregas.png"
                                            }
                                            imageAlt={planGate ? "Plano necessário" : "Sem entregas"}
                                            title={planGate ? "Plano necessário" : "Nenhuma entrega encontrada"}
                                            subtitle={
                                                planGate
                                                    ? planGate.message
                                                    : isDelivery
                                                        ? "Nenhuma entrega atribuída a você no momento."
                                                        : activeTab === "closed"
                                                            ? "Nenhuma entrega cancelada ou com falha encontrada."
                                                            : "Crie uma entrega a partir de um pedido para começar."
                                            }
                                            itemButton={
                                                planGate ? {
                                                    text: "Ver Plano Crescer",
                                                    action: () => openPlanUpgrade("crescer"),
                                                } : isDelivery ? undefined : {
                                                    text: "Adicionar primeira entrega",
                                                    action: () => openEntity("create"),
                                                }
                                            }
                                        />
                                    </FadeIn>
                                ) : (
                                    <FadeIn key="kanban" className="w-full">
                                        <DeliveryKanbanBoard
                                            deliveries={mapped}
                                            activeTab={activeTab}
                                            onDetails={(id) => openEntity("view", id)}
                                            onEdit={isDelivery ? undefined : (id) => openEntity("edit", id)}
                                            onQuickStatusChange={handleQuickStatusChange}
                                        />
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                            {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                        </div>
                    </div>
                </FadeIn>
            )}

            <DefaultModal
                isOpen={suggestionsOpen}
                onClose={() => setSuggestionsOpen(false)}
                title="Sugestões de entregas"
                maxWidth="4xl"
            >
                <div className="space-y-4">
                    {suggestionsLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface shadow-xs flex flex-col justify-between space-y-3">
                                    <div className="h-[84px] w-full bg-gray-200 dark:bg-dark-border rounded-xl animate-pulse" />
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-2 flex-1 min-w-0">
                                            <div className="h-4 w-[65%] bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                                            <div className="flex gap-1.5 pt-1">
                                                <div className="h-5 w-[70px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                                                <div className="h-5 w-[50px] bg-gray-200 dark:bg-dark-border rounded-full animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="h-8 w-[90px] bg-gray-200 dark:bg-dark-border rounded-lg shrink-0 animate-pulse" />
                                    </div>
                                    <div className="space-y-2 border-t border-brand-border/40 dark:border-dark-border/40 pt-2.5">
                                        <div className="flex justify-between items-center">
                                            <div className="h-3.5 w-[55%] bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                                            <div className="h-3.5 w-10 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="h-3.5 w-[65%] bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                                            <div className="h-3.5 w-10 bg-gray-200 dark:bg-dark-border rounded-md animate-pulse" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Nenhuma sugestão encontrada</p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Não há pedidos pendentes suficientes com CEPs agrupáveis no momento.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {suggestions.map((sug, idx) => (
                                <motion.div
                                    key={`${sug.groupKey}-${idx}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                                    className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface shadow-xs flex flex-col justify-between hover:border-brand-primary/40 transition-all duration-200"
                                >
                                    <div>
                                        {/* Map Thumbnail Decorator */}
                                        <div className="w-full h-[84px] bg-brand-gray dark:bg-dark-border/40 rounded-xl relative overflow-hidden mb-3.5 flex items-center justify-center group">
                                            <img
                                                src="https://img.dudit.com.br/static/MapLarge.png"
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                                                alt="Mapa"
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                                                <div className="w-7 h-7 bg-brand-primary rounded-full border-2 border-white flex items-center justify-center text-white z-10 shadow-md group-hover:scale-110 transition-transform">
                                                    <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                                                </div>
                                            </div>
                                            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                                <MapPinIcon size={10} />
                                                <span>{sug.groupLabel}</span>
                                            </div>
                                        </div>

                                        {/* Header Info */}
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                    {sug.groupLabel}
                                                </h4>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    <span className="bg-brand-primary/10 text-brand-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                        {sug.orders?.length || 0} pedido(s)
                                                    </span>
                                                    {sug.totalDistanceKm != null ? (
                                                        <span className="bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                            {formatDistance(Number(sug.totalDistanceKm))}
                                                        </span>
                                                    ) : null}
                                                    {sug.estimatedDurationMinutes != null ? (
                                                        <span className="bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                            ~{sug.estimatedDurationMinutes} min
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    const ids = (sug.orders || []).map((o: any) => o.id).filter(Boolean)
                                                    setSuggestionsOpen(false)
                                                    setCreatePrefillOrderIds(ids)
                                                    openEntity("create")
                                                }}
                                                className="shrink-0 font-bold"
                                            >
                                                Criar entrega
                                            </Button>
                                        </div>

                                        {/* Order Items List */}
                                        <div className="space-y-2 border-t border-brand-border/40 dark:border-dark-border/40 pt-2.5">
                                            {(sug.orders || []).map((o: any) => (
                                                <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                                                    <div className="min-w-0 flex items-center gap-1.5">
                                                        <span className="font-bold text-brand-dark dark:text-dark-heading shrink-0">{o.displayId}</span>
                                                        <span className="text-brand-inactive-text dark:text-dark-body truncate">• {o.customerName}</span>
                                                    </div>
                                                    <div className="text-[11px] font-bold text-brand-primary shrink-0 bg-brand-primary/5 px-2 py-0.5 rounded">
                                                        {o.distanceKm == null ? "-" : `${Number(o.distanceKm).toFixed(1)} km`}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={!!statusModal}
                onClose={() => setStatusModal(null)}
                title="Alterar Status de Entrega"
                maxWidth="sm"
                footer={
                    <div className="flex gap-3 justify-end w-full">
                        <Button variant="outline" onClick={() => setStatusModal(null)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={() => {
                                if (statusModal) {
                                    handleStatusTransition(statusModal.deliveryId, statusModal.currentStatus, statusModal.nextStatus)
                                }
                            }}
                            disabled={!statusModal?.nextStatus}
                        >
                            Confirmar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4 py-2">
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Selecione o novo status para esta entrega:
                    </p>
                    <FormDropdown
                        label="Status de Entrega"
                        value={statusModal?.nextStatus || ""}
                        setValue={(val) => setStatusModal(prev => prev ? { ...prev, nextStatus: val } : null)}
                        options={[
                            { value: "pending", label: "Não enviado" },
                            { value: "preparing", label: "Em preparação" },
                            { value: "sent", label: "Enviado" },
                            { value: "delivered", label: "Entregue" },
                            { value: "cancelled", label: "Cancelada" },
                            { value: "delivery_failed", label: "Falha na entrega" },
                        ]}
                        placeholder="Selecione o status"
                    />
                </div>
            </DefaultModal>

            <AlertModal
                isOpen={deliveryWarningModal?.isOpen ?? false}
                onClose={() => setDeliveryWarningModal(null)}
                onConfirm={confirmDeliveryWarningStatusChange}
                title="Atenção: Alteração de Status"
                message={
                    <div className="flex flex-col gap-4 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Esta entrega já estava como{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {getDeliveryStatusMeta(deliveryWarningModal?.currentStatus || "").label}
                            </strong>{" "}
                            e você está alterando para{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {getDeliveryStatusMeta(deliveryWarningModal?.nextStatus || "").label}
                            </strong>.
                            Esta ação requer uma justificativa.
                        </p>
                        <div className="flex flex-col gap-4 mt-2">
                            <FormDropdown
                                label="Motivo da alteração"
                                options={CHANGE_STATUS_REASONS}
                                value={deliveryWarningModal?.reasonDropdownValue || ""}
                                setValue={(val) => setDeliveryWarningModal(prev => prev ? { ...prev, reasonDropdownValue: val } : null)}
                                placeholder="Selecione o motivo"
                            />
                            {deliveryWarningModal?.reasonDropdownValue === "other" && (
                                <Input
                                    label="Descreva o motivo"
                                    placeholder="Digite o motivo aqui..."
                                    value={deliveryWarningModal?.customReasonText || ""}
                                    onChange={(e) => setDeliveryWarningModal(prev => prev ? { ...prev, customReasonText: e.target.value } : null)}
                                />
                            )}
                        </div>
                    </div>
                }
                confirmText="Confirmar Alteração"
                cancelText="Cancelar"
                variant="warning"
                disabled={
                    !deliveryWarningModal?.reasonDropdownValue ||
                    (deliveryWarningModal.reasonDropdownValue === "other" && !deliveryWarningModal.customReasonText.trim())
                }
            />

            <AlertModal
                isOpen={simpleConfirmModal?.isOpen ?? false}
                title="Confirmar Alteração de Status"
                description={`Tem certeza que deseja alterar o status desta entrega para ${getDeliveryStatusMeta(simpleConfirmModal?.nextStatus || "").label}?`}
                confirmText="Confirmar"
                cancelText="Cancelar"
                onClose={() => setSimpleConfirmModal(null)}
                onConfirm={async () => {
                    if (simpleConfirmModal) {
                        const { deliveryId, nextStatus } = simpleConfirmModal;
                        setSimpleConfirmModal(null);
                        await executeStatusChange(deliveryId, nextStatus);
                    }
                }}
                variant="info"
            />

            <FilterSheet
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters({ status: [], datePeriod: { presets: [], from: "", to: "" } })}
            />
        </AnimatePresence>
    )
}
