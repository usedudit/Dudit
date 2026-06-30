"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button, IconPlaceholder, AlertModal, FormDropdown, Input } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import Pagination from "@/components/reusable/Pagination"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { ExportFileIcon, PlusIcon, ArrowUpDownIcon, SparklesIcon } from "@/lib/icons"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getERPDeliveriesPageAction, type ERPDeliveryListCursor, updateERPDeliveryStatusAction, getERPDeliveryPlanAccessAction, getSmartDeliverySuggestionsAction } from "@/app/actions/erp/deliveries"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import DeliveryPageControls from "./DeliveryPageControls"
import DeliveryListItem from "./DeliveryListRow"
import DeliveryGridCard from "./DeliveryGridCard"
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
type SortDirection = "asc" | "desc"

const ITEMS_PER_PAGE = 8

const COLUMNS: Array<{ id: SortKey | "actions"; label: string; align: "left" | "center" | "right"; width: string }> = [
    { id: "order_id", label: "Pedido", align: "left", width: "240px" },
    { id: "delivery_fee", label: "Valor Envio", align: "left", width: "140px" },
    { id: "status", label: "Status", align: "left", width: "130px" },
    { id: "delivery_person", label: "Entregador", align: "left", width: "220px" },
    { id: "estimated_time", label: "Tempo Estimado", align: "left", width: "140px" },
    { id: "dates", label: "Data saída / Prevista", align: "left", width: "220px" },
    { id: "delivered_at", label: "Data Entrega", align: "left", width: "170px" },
    { id: "actions", label: "Ações", align: "center", width: "70px" },
]

export default function DeliveriesPage({
    partnerId,
    deliveries: initialDeliveries,
    initialNextCursor,
    initialHasMore,
    planGate,
}: {
    partnerId: string
    deliveries: any[]
    initialNextCursor: ERPDeliveryListCursor | null
    initialHasMore: boolean
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const { openPlanUpgrade } = usePlanUpgrade()
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [viewMode, setViewMode] = useState<"list" | "grid" | "kanban">("kanban")
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [filters, setFilters] = useState<{ status: string[] }>({ status: [] })
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [wrapper, setWrapper] = useState<"list" | "create" | "detail">("list")
    const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)

    // Sync URL search params -> wrapper state
    useEffect(() => {
        const createParam = searchParams.get("create")
        const viewParam = searchParams.get("view")
        if (createParam === "true") {
            setWrapper("create")
            setSelectedDeliveryId(null)
        } else if (viewParam) {
            setWrapper("detail")
            setSelectedDeliveryId(viewParam)
        } else {
            setWrapper("list")
            setSelectedDeliveryId(null)
        }
    }, [searchParams])

    const navigateTo = useCallback((newWrapper: "list" | "create" | "detail", deliveryId: string | null = null) => {
        const params = new URLSearchParams(searchParams.toString())
        if (newWrapper === "create") {
            params.set("create", "true")
            params.delete("view")
        } else if (newWrapper === "detail" && deliveryId) {
            params.set("view", deliveryId)
            params.delete("create")
        } else {
            params.delete("create")
            params.delete("view")
        }
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
    }, [router, searchParams])

    const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const observerTarget = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const [planSlug, setPlanSlug] = useState<string>("free")
    const [suggestionsOpen, setSuggestionsOpen] = useState(false)
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<any[]>([])
    const [createPrefillOrderIds, setCreatePrefillOrderIds] = useState<string[] | null>(null)

    const queryKey = useMemo(() => ["erp", "deliveries", partnerId] as const, [partnerId])
    const { items, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteList<any, ERPDeliveryListCursor>({
        queryKey,
        initialPage: { items: initialDeliveries, nextCursor: initialNextCursor, hasMore: initialHasMore },
        fetchFn: async ({ cursor }) => {
            const res = await getERPDeliveriesPageAction(partnerId, { cursor, limit: 100 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar entregas.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((d: any) => String(d?.id || ""), []),
    })

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

    const mapped = useMemo(() => {
        const term = debouncedSearch.toLowerCase().trim()
        const nowMs = Date.now()
        let list = (items || []).map((raw: any) => {
            const links = Array.isArray(raw.delivery_orders) ? raw.delivery_orders : []
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
                deliveryFee: Number(order.delivery_fee || 0),
                createdAtMs: new Date(raw.created_at).getTime(),
                deliveryTimingState: isLate ? "late" : "on_time",
                deliveryTimingLabel: estimatedArrivalAt ? (isLate ? "Atrasada" : "No prazo") : "",
                deliveryTimingDetail: estimatedArrivalAt && !isLate && !isClosed ? remainingLabel : "",
            }
        })

        list = list.filter((d: any) => {
            const matchSearch = !term || d.orderDisplayId.toLowerCase().includes(term) || d.customerName.toLowerCase().includes(term)
            const statusLabel = getDeliveryStatusMeta(d.status).label
            const matchStatus = filters.status.length === 0 || filters.status.includes(statusLabel)
            return matchSearch && matchStatus
        })

        if (sortConfig) {
            list = [...list].sort((a: any, b: any) => {
                let aVal: any = a[sortConfig.key]
                let bVal: any = b[sortConfig.key]
                if (sortConfig.key === "dates") {
                    aVal = new Date(a.startedAt || 0).getTime()
                    bVal = new Date(b.startedAt || 0).getTime()
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }
        return list
    }, [items, search, filters, sortConfig, statusOverrides])

    const [statusModal, setStatusModal] = useState<{ isOpen: boolean; deliveryId: string; currentStatus: string; nextStatus: string } | null>(null)
    const [deliveryWarningModal, setDeliveryWarningModal] = useState<{
        isOpen: boolean
        deliveryId: string
        nextStatus: string
        currentStatus: string
        reasonDropdownValue: string
        customReasonText: string
    } | null>(null)
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{ isOpen: boolean; deliveryId: string; nextStatus: string } | null>(null)

    const handleStatusChangeClick = useCallback((deliveryId: string, currentStatus: string) => {
        setStatusModal({
            isOpen: true,
            deliveryId,
            currentStatus,
            nextStatus: currentStatus
        })
    }, [])

    const handleStatusTransition = useCallback((deliveryId: string, currentStatus: string, nextStatus: string) => {
        setStatusModal(null)
        if (currentStatus === nextStatus) return

        if (doesTransitionRequireReason(currentStatus, nextStatus)) {
            setDeliveryWarningModal({
                isOpen: true,
                deliveryId,
                nextStatus,
                currentStatus,
                reasonDropdownValue: "",
                customReasonText: ""
            })
        } else {
            setSimpleConfirmModal({
                isOpen: true,
                deliveryId,
                nextStatus
            })
        }
    }, [])

    const confirmDeliveryWarningStatusChange = useCallback(async () => {
        if (!deliveryWarningModal) return
        const { deliveryId, nextStatus, reasonDropdownValue, customReasonText } = deliveryWarningModal
        const reason = reasonDropdownValue === "other"
            ? customReasonText.trim()
            : CHANGE_STATUS_REASONS.find(r => r.value === reasonDropdownValue)?.label || ""

        setDeliveryWarningModal(null)
        await executeStatusChange(deliveryId, nextStatus, reason)
    }, [deliveryWarningModal])

    const executeStatusChange = useCallback(async (deliveryId: string, nextStatus: string, reason?: string) => {
        const previous = statusOverrides[deliveryId]
        setStatusOverrides((prev) => ({ ...prev, [deliveryId]: nextStatus }))
        const res = await updateERPDeliveryStatusAction({
            partnerId,
            deliveryId,
            status: nextStatus as any,
            changeReason: reason
        })
        if (!res.success) {
            toast.error(res.error || "Erro ao atualizar status da entrega.")
            setStatusOverrides((prev) => {
                const next = { ...prev }
                if (previous) next[deliveryId] = previous
                else delete next[deliveryId]
                return next
            })
        } else {
            toast.success("Status da entrega atualizado com sucesso!")
        }
    }, [partnerId, statusOverrides])

    const handleQuickStatusChange = handleStatusChangeClick

    const totalPages = Math.max(1, Math.ceil(mapped.length / ITEMS_PER_PAGE))
    const paginated = mapped.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

    const filterSections: FilterSectionConfig[] = [{ id: "status", title: "Status", type: "checkbox-list", options: ["Pendente", "Em preparação", "Saiu para entrega", "Concluída", "Cancelada"] }]

    return (
        <AnimatePresence mode="wait">
            {wrapper === "create" ? (
                <FadeIn key="create" className="w-full h-full">
                    <CreateDeliveryPage
                        partnerId={partnerId}
                        onBack={() => { setCreatePrefillOrderIds(null); navigateTo("list") }}
                        onSuccess={() => { setCreatePrefillOrderIds(null); navigateTo("list") }}
                        initialOrderIds={createPrefillOrderIds || undefined}
                    />
                </FadeIn>
            ) : wrapper === "detail" && selectedDeliveryId ? (
                <FadeIn key="detail" className="w-full h-full">
                    <DeliveryDetailPage deliveryId={selectedDeliveryId} partnerId={partnerId} onBack={() => navigateTo("list")} />
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
                                <Button variant="outline" leftIcon={<ExportFileIcon size={18} />}>
                                    Exportar
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={loadSuggestions}
                                    disabled={!!planGate}
                                    leftIcon={<SparklesIcon size={18} />}
                                >
                                    Gerar sugestões
                                </Button>
                                <Button onClick={() => navigateTo("create")} disabled={!!planGate} leftIcon={<PlusIcon size={18} />}>
                                    Nova entrega
                                </Button>
                            </div>
                        </div>

                        <DeliveryPageControls
                            search={search}
                            onSearchChange={setSearch}
                            onOpenFilter={() => setIsFilterOpen(true)}
                            onAdd={() => navigateTo("create")}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            addDisabled={!!planGate}
                        />

                        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                            <AnimatePresence mode="wait">
                                {paginated.length === 0 ? (
                                    <FadeIn key="empty" className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full">
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
                                                    : "Crie uma entrega a partir de um pedido para começar."
                                            }
                                            itemButton={
                                                planGate ? {
                                                    text: "Ver Plano Crescer",
                                                    action: () => openPlanUpgrade("crescer"),
                                                } : {
                                                    text: "Adicionar primeira entrega",
                                                    action: () => navigateTo("create"),
                                                }
                                            }
                                        />
                                    </FadeIn>
                                ) : viewMode === "kanban" ? (
                                    <FadeIn key="kanban" className="w-full">
                                        <DeliveryKanbanBoard
                                            deliveries={mapped}
                                            onDetails={(id) => navigateTo("detail", id)}
                                            onQuickStatusChange={handleQuickStatusChange}
                                        />
                                    </FadeIn>
                                ) : viewMode === "grid" ? (
                                    <FadeIn key="grid" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginated.map((delivery) => <DeliveryGridCard key={delivery.id} delivery={delivery} onQuickStatusChange={handleQuickStatusChange} onDetails={() => navigateTo("detail", delivery.id)} />)}
                                    </FadeIn>
                                ) : (
                                    <FadeIn key="list-table" className="w-full overflow-hidden rounded-xl relative">
                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />
                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1400px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        {COLUMNS.map((col, idx) => {
                                                            const sortable = col.id !== "actions"
                                                            const sorted = sortConfig?.key === col.id
                                                            return (
                                                                <th
                                                                    key={col.id}
                                                                    style={{ width: col.width }}
                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === 0 ? "rounded-l-lg" : ""} ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${sortable ? "cursor-pointer group" : ""}`}
                                                                    onClick={() => {
                                                                        if (!sortable) return
                                                                        setSortConfig((prev) => ({ key: col.id as SortKey, direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc" }))
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span>{col.label}</span>
                                                                        {sortable ? <ArrowUpDownIcon size={14} className={`transition-all duration-200 ${sorted ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-40 group-hover:opacity-100"}`} /> : null}
                                                                    </div>
                                                                </th>
                                                            )
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginated.map((delivery) => (
                                                        <DeliveryListItem key={delivery.id} delivery={delivery} columns={COLUMNS as any} onQuickStatusChange={handleQuickStatusChange} onDetails={() => navigateTo("detail", delivery.id)} />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </FadeIn>
                                )}
                            </AnimatePresence>
                            {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                        </div>

                        {mapped.length > 0 && viewMode !== "kanban" ? (
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={(p) => {
                                    setPage(p)
                                    if (p === totalPages && hasNextPage && !isFetchingNextPage) void fetchNextPage()
                                }}
                            />
                        ) : null}

                        <FilterSheet
                            isOpen={isFilterOpen}
                            onClose={() => setIsFilterOpen(false)}
                            sections={filterSections}
                            filters={filters}
                            setFilters={setFilters as any}
                            onClear={() => setFilters({ status: [] })}
                        />
                    </div>
                </FadeIn>
            )}

            <DefaultModal
                isOpen={suggestionsOpen}
                onClose={() => setSuggestionsOpen(false)}
                title="Sugestões de entregas"
                maxWidth="3xl"
                footer={
                    <Button variant="outline" onClick={() => setSuggestionsOpen(false)}>
                        Fechar
                    </Button>
                }
            >
                <div className="space-y-4">
                    {suggestionsLoading ? (
                        <div className="text-sm text-brand-inactive-text">Gerando sugestões...</div>
                    ) : suggestions.length === 0 ? (
                        <div className="text-sm text-brand-inactive-text">Nenhuma sugestão encontrada para os pedidos atuais.</div>
                    ) : (
                        suggestions.map((sug, idx) => (
                            <div key={`${sug.groupKey}-${idx}`} className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                            {sug.groupLabel}
                                        </div>
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            {sug.orders?.length || 0} pedido(s)
                                            {sug.totalDistanceKm != null ? ` • ${formatDistance(Number(sug.totalDistanceKm))}` : ""}
                                            {sug.estimatedDurationMinutes != null ? ` • ${sug.estimatedDurationMinutes} min` : ""}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => {
                                            const ids = (sug.orders || []).map((o: any) => o.id).filter(Boolean)
                                            setSuggestionsOpen(false)
                                            setCreatePrefillOrderIds(ids)
                                            navigateTo("create")
                                        }}
                                    >
                                        Criar entrega
                                    </Button>
                                </div>

                                <div className="mt-3 space-y-2">
                                    {(sug.orders || []).map((o: any) => (
                                        <div key={o.id} className="flex items-start justify-between gap-3 text-sm">
                                            <div className="min-w-0">
                                                <div className="font-bold text-brand-dark dark:text-dark-heading truncate">{o.displayId}</div>
                                                <div className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                                    {o.customerName}
                                                </div>
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body shrink-0">
                                                {o.distanceKm == null ? "-" : `${Number(o.distanceKm).toFixed(1)} km`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
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
                <div className="p-4 space-y-4">
                    <FormDropdown
                        label="Status da entrega"
                        value={statusModal?.nextStatus || ""}
                        setValue={(val) => setStatusModal(prev => prev ? { ...prev, nextStatus: val } : null)}
                        options={[
                            { value: "pending", label: "Pendente" },
                            { value: "preparing", label: "Em preparação" },
                            { value: "sent", label: "Saiu para entrega" },
                            { value: "delivered", label: "Concluída" },
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
        </AnimatePresence>
    )
}
