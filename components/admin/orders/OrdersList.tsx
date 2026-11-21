"use client"

import { useState, useTransition, useMemo, useCallback, useEffect, useRef } from "react"
import { Button, Badge, IconPlaceholder, ThreeDotsLoader, Pagination, Checkbox, ActionsDropdown } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import OrderListRow from "./OrderListRow"
import OrdersPageControls, { type OrderFilterState } from "./OrdersPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { PackageIcon, StoreIcon, ExportFileIcon, ReturnIcon, TruckIcon, UserIcon, CancelCircleIcon, ShoppingCartIcon, ClockIcon, CheckCircleIcon, MoneyIcon } from "@/lib/icons"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { getAdminMarketplaceOrders, type AdminOrderStats } from "@/app/actions/admin/marketplace-ops"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency, formatDate, formatTime } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds } from "@/lib/utils/filter-date-period"
import { toast } from "@/hooks/use-notification"
import { useEntityState } from "@/hooks/use-entity-state"
import AdminOrderDetailClientWrapper from "./AdminOrderDetailClientWrapper"
import { AdminOrderDetailView } from "./AdminOrderDetailView"
import { PaymentMethodIndicator } from "@/components/erp/transactions/PaymentMethodIndicator"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { getOrderDeliveryBadgeMeta } from "@/lib/orders/delivery-badge"

type SortKey = "order_number" | "customer" | "channel" | "date" | "total" | "status" | "seller"
type SortDirection = "asc" | "desc"

interface OrdersListProps {
    initialData: CursorPaginatedResult<any>
    initialStats?: AdminOrderStats
}

const ITEMS_PER_PAGE = 8

const INITIAL_FILTERS: OrderFilterState = {
    orderNumber: "",
    customerName: "",
    storeName: "",
    status: [],
    deliveryStatus: [],
    paymentMethod: [],
    channel: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

const DELIVERY_STATUS_FILTER_OPTIONS = [
    { value: "not_sent", label: "Não enviado" },
    { value: "preparing", label: "Em preparação" },
    { value: "sent", label: "Enviado" },
    { value: "pickup_available", label: "Pronto para retirada" },
    { value: "delivered", label: "Entregue" },
    { value: "delivery_failed", label: "Falha na entrega" },
]

const STATUS_FILTER_OPTIONS = ["Pago", "Pendente", "Enviado", "Cancelado", "Em análise", "Parcialmente Pago", "Entregue"]

export default function OrdersList({ initialData, initialStats }: OrdersListProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const isTablet = useMediaQuery("(max-width: 1023px)")
    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()

    const [activeTab, setActiveTab] = useState<string>("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isTablet ? "grid" : "list")
    const [isPending, startTransition] = useTransition()

    // Filters & Modals
    const [filters, setFilters] = useState<OrderFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Server-side filters derived from the UI state
    const buildServerFilters = useCallback(() => {
        const bounds = isDatePeriodFilterActive(filters.datePeriod)
            ? resolveDatePeriodBounds(filters.datePeriod)
            : { startYmd: null as string | null, endYmd: null as string | null }

        const tabStatus =
            activeTab === "pending" ? "Pendente"
                : activeTab === "paid" ? "Pago"
                    : activeTab === "shipped" ? "Enviado"
                        : activeTab === "cancelled" ? "Cancelado"
                            : null

        const status = filters.status.length > 0 ? filters.status : tabStatus ? [tabStatus] : undefined

        return {
            orderNumber: filters.orderNumber.trim() || undefined,
            customerName: filters.customerName.trim() || undefined,
            storeName: filters.storeName.trim() || undefined,
            status,
            deliveryStatus: filters.deliveryStatus.length > 0 ? filters.deliveryStatus : undefined,
            paymentMethod: filters.paymentMethod.length > 0 ? filters.paymentMethod : undefined,
            channel: filters.channel.length > 0 ? filters.channel : undefined,
            startDate: bounds.startYmd || undefined,
            endDate: bounds.endYmd || undefined,
        }
    }, [activeTab, filters])

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({
        key: "date",
        direction: "desc",
    })

    // Selection state
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
    const [showSelectionBanner, setShowSelectionBanner] = useState(false)

    // Data State (initialized from SSR)
    const [orders, setOrders] = useState<any[]>(initialData?.data || [])
    const [isLoading, setIsLoading] = useState(false)
    const [hasMore, setHasMore] = useState<boolean>(initialData?.hasMore || false)
    const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor || null)
    const [isFetchingMore, setIsFetchingMore] = useState(false)
    const [page, setPage] = useState(1)
    const isFirstFetchRef = useRef(true)

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" }
            }
            return { key, direction: "desc" }
        })
    }

    // Selection handlers
    const toggleSelectAll = () => {
        if (selectedOrders.size === filteredOrders.length) {
            setSelectedOrders(new Set())
            setShowSelectionBanner(false)
        } else {
            setSelectedOrders(new Set(filteredOrders.map(o => o.id)))
            setShowSelectionBanner(true)
        }
    }

    const toggleSelectOrder = (orderId: string) => {
        setSelectedOrders(prev => {
            const next = new Set(prev)
            if (next.has(orderId)) next.delete(orderId)
            else next.add(orderId)
            return next
        })
    }

    const clearSelection = () => {
        setSelectedOrders(new Set())
        setShowSelectionBanner(false)
    }

    // Server-side search / filters: only query when at least one filter or non-default tab is active
    useEffect(() => {
        const isDefaultView =
            activeTab === "all" &&
            filters.orderNumber.trim().length === 0 &&
            filters.customerName.trim().length === 0 &&
            filters.storeName.trim().length === 0 &&
            filters.status.length === 0 &&
            filters.deliveryStatus.length === 0 &&
            filters.paymentMethod.length === 0 &&
            filters.channel.length === 0 &&
            !isDatePeriodFilterActive(filters.datePeriod)

        if (isDefaultView) {
            setOrders([])
            setNextCursor(null)
            setHasMore(false)
            setPage(1)
            setIsLoading(false)
            return
        }

        let cancelled = false
        setIsLoading(true)

        getAdminMarketplaceOrders(null, 20, buildServerFilters())
            .then((res) => {
                if (cancelled) return
                setOrders(res.data || [])
                setNextCursor(res.nextCursor)
                setHasMore(res.hasMore)
                setPage(1)
            })
            .catch((err) => {
                if (!cancelled) console.error("Failed to load admin orders:", err)
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [activeTab, filters, buildServerFilters])

    const loadMoreOrders = useCallback(async () => {
        if (!hasMore || !nextCursor || isFetchingMore) return
        setIsFetchingMore(true)
        try {
            const res = await getAdminMarketplaceOrders(nextCursor, 20, buildServerFilters())
            setOrders((prev) => {
                const existing = new Set(prev.map((order) => order.id))
                return [...prev, ...(res.data || []).filter((order: any) => !existing.has(order.id))]
            })
            setNextCursor(res.nextCursor)
            setHasMore(res.hasMore)
        } catch (err) {
            console.error("Failed to load more admin orders:", err)
        } finally {
            setIsFetchingMore(false)
        }
    }, [hasMore, nextCursor, isFetchingMore, buildServerFilters])

    // Table columns matching ERP + seller column
    interface AdminColumn {
        id: string
        label: string
        align: "left" | "center" | "right"
        width: string
        sortable: boolean
    }

    const ADMIN_COLUMNS = useMemo<AdminColumn[]>(() => [
        { id: "order_number", label: "Pedido", align: "left", width: "230px", sortable: true },
        { id: "customer", label: "Cliente", align: "left", width: "220px", sortable: true },
        { id: "channel", label: "Origem", align: "left", width: "130px", sortable: false },
        { id: "date", label: "Data", align: "left", width: "140px", sortable: true },
        { id: "total", label: "Total", align: "left", width: "140px", sortable: true },
        { id: "status", label: "Status", align: "left", width: "240px", sortable: true },
        { id: "seller", label: "Vendedor", align: "left", width: "180px", sortable: true },
        { id: "actions", label: "Ações", align: "center", width: "80px", sortable: false },
    ], [])

    // Filter Config for FilterSheet
    const filterSections: FilterSectionConfig[] = useMemo(() => [
        {
            id: "orderNumber",
            title: "Número do Pedido",
            type: "text",
            placeholder: "Ex: 1042 ou ID do pedido...",
        },
        {
            id: "customerName",
            title: "Nome do Cliente",
            type: "text",
            placeholder: "Buscar por nome do cliente...",
        },
        {
            id: "storeName",
            title: "Nome da Loja",
            type: "text",
            placeholder: "Buscar por nome da loja...",
        },
        {
            id: "datePeriod",
            title: "Data do pedido",
            type: "date-period",
        },
        {
            id: "status",
            title: "Status do pagamento",
            type: "checkbox-list",
            options: STATUS_FILTER_OPTIONS,
        },
        {
            id: "deliveryStatus",
            title: "Status de entrega",
            type: "checkbox-list",
            options: DELIVERY_STATUS_FILTER_OPTIONS.map(o => o.value),
        },
        {
            id: "paymentMethod",
            title: "Método de pagamento",
            type: "checkbox-list",
            options: ["credit_card", "pix", "boleto", "Mercado Pago"],
        },
        {
            id: "channel",
            title: "Origem",
            type: "checkbox-list",
            options: ["Marketplace", "Loja Virtual", "PDV", "Manual"],
        },
    ], [])

    const hasActiveFilters = useMemo(() => {
        return (
            filters.orderNumber.trim().length > 0 ||
            filters.customerName.trim().length > 0 ||
            filters.storeName.trim().length > 0 ||
            activeTab !== "all" ||
            filters.status.length > 0 ||
            filters.deliveryStatus.length > 0 ||
            filters.paymentMethod.length > 0 ||
            filters.channel.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [activeTab, filters])

    // In-memory sorting (filtering is done server-side)
    const filteredOrders = useMemo(() => {
        let result = [...orders]

        // In-memory sorting
        if (sortConfig) {
            result = [...result].sort((a, b) => {
                let aVal: any = ""
                let bVal: any = ""
                switch (sortConfig.key) {
                    case "order_number":
                        aVal = Number(a.order_number || 0) || a.id
                        bVal = Number(b.order_number || 0) || b.id
                        break
                    case "customer":
                        aVal = (a.customer_name || "").toLowerCase()
                        bVal = (b.customer_name || "").toLowerCase()
                        break
                    case "channel":
                        aVal = (a.order_source || "").toLowerCase()
                        bVal = (b.order_source || "").toLowerCase()
                        break
                    case "seller":
                        aVal = (a.stores?.name || "").toLowerCase()
                        bVal = (b.stores?.name || "").toLowerCase()
                        break
                    case "date":
                        aVal = new Date(a.created_at).getTime()
                        bVal = new Date(b.created_at).getTime()
                        break
                    case "total":
                        aVal = Number(a.amount_paid || a.paid_amount || a.total_amount || 0)
                        bVal = Number(b.amount_paid || b.paid_amount || b.total_amount || 0)
                        break
                    case "status":
                        aVal = a.situation || ""
                        bVal = b.situation || ""
                        break
                }
                if (aVal === bVal) return 0
                const cmp = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? cmp : -cmp
            })
        }

        return result
    }, [orders, sortConfig])

    // Pagination (Strict 8 items) - matching ERP
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE))
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE
        return filteredOrders.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredOrders, page])

    // If viewing detail of a specific order via URL (?view=id)
    if (entityState.isOpen && entityState.action === "view" && entityState.entityId) {
        return (
            <AdminOrderDetailView
                orderId={entityState.entityId}
                onBack={closeEntity}
                onEdit={(id) => openEntity("edit", id)}
            />
        )
    }

    // If editing - use admin edit form
    if (entityState.isOpen && entityState.action === "edit" && entityState.entityId) {
        return (
            <AdminOrderDetailClientWrapper
                orderId={entityState.entityId}
                onBack={closeEntity}
            />
        )
    }

    // Grid card component (matching ERP OrderGridCard exactly, plus seller column)
    const renderGridCard = (order: any) => {
        const paymentMeta = getPaymentStatusMeta(order.situation)
        const deliveryBadge = getOrderDeliveryBadgeMeta(order)
        const returns = Array.isArray(order.return_requests) ? order.return_requests : []
        const hasRefund = Boolean(
            order.is_refunded ||
            Number(order.refunded_amount || 0) > 0 ||
            order.situation === "refunded" ||
            order.situation === "chargeback" ||
            returns.some((req: any) =>
                ["APPROVED", "RESOLVED"].includes(req.status) &&
                (req.approved_resolution === "refund" || req.desired_resolution === "refund" || Number(req.refund_amount || 0) > 0)
            )
        )
        const store = order.stores || {}
        const sellerName = store.name || "—"
        const isSelected = selectedOrders.has(order.id)
        const orderSource = order.order_source || "Manual"

        return (
            <div
                key={order.id}
                onClick={() => openEntity("view", order.id)}
                className="bg-white dark:bg-dark-surface p-4 rounded-2xl border border-brand-border dark:border-dark-border hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all cursor-pointer flex flex-col h-full relative group"
            >
                <div className="flex gap-4 mb-2">
                    {/* Order Visual Indicator */}
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <ShoppingCartIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Row 1: ID + Badges + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3
                                    className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                                >
                                    #{order.order_number || order.id.slice(0, 8)}
                                </h3>
                                {returns.length > 0 && (
                                    <Badge variant="purple" icon={<ReturnIcon />} className="whitespace-nowrap" />
                                )}
                                {hasRefund && (
                                    <Badge variant="red" icon={<ReturnIcon />} className="whitespace-nowrap" />
                                )}
                                <div className="flex items-center gap-1 shrink-0">
                                    {order.situation === "cancelled" ? (
                                        <Badge variant="red" icon={<CancelCircleIcon />} className="whitespace-nowrap" />
                                    ) : (
                                        <Badge variant={paymentMeta.variant} icon={<MoneyIcon />} className="whitespace-nowrap" />
                                    )}
                                    {deliveryBadge.show && (
                                        <Badge variant={deliveryBadge.variant} icon={
                                            deliveryBadge.isCarrierDelivery && deliveryBadge.carrierBrandIcon
                                                ? <img src={deliveryBadge.carrierBrandIcon} alt="Transportadora" className="object-contain" />
                                                : deliveryBadge.isPickup
                                                    ? <StoreIcon />
                                                    : <TruckIcon />
                                        } className="whitespace-nowrap">
                                            {deliveryBadge.label}
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Checkbox for selection */}
                            <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={isSelected} onChange={() => toggleSelectOrder(order.id)} />
                            </div>
                        </div>

                        {/* Row 2: Stats (Payment Method • Total) */}
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center">
                                {(() => {
                                    const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
                                    const methodEntries = breakdown.filter((b: any) => b?.method && !b?.checkoutPricing)
                                    const paidMethodEntries = methodEntries.filter((b: any) => Number(b?.amountReceived ?? b?.amount ?? 0) > 0.009)
                                    const paidLabels = Array.from(new Set(paidMethodEntries.map((b: any) => String(b?.method || "").toLowerCase().trim()).filter(Boolean)))
                                    let pmLabel: string | null = null

                                    if (paidLabels.length > 1) {
                                        pmLabel = "Múltiplos meios"
                                    } else if (paidMethodEntries.length === 1) {
                                        pmLabel = paidMethodEntries[0]?.method || order.payment_method || null
                                    } else {
                                        pmLabel = methodEntries[0]?.method || order.payment_method || null
                                    }

                                    if (pmLabel && methodEntries.length === 1 && methodEntries[0]?.installmentNumber > 1) {
                                        pmLabel = `${pmLabel} - ${methodEntries[0].installmentNumber}x`
                                    }
                                    return <PaymentMethodIndicator label={pmLabel} provider={order.payment_provider} simplify compact />
                                })()}
                            </div>
                            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
                            <span className="text-sm font-bold text-brand-primary">
                                {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Info Rows */}
                <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Row 1: Cliente & Data */}
                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                    {order.customer_name || "Cliente"}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end shrink-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Data</span>
                            <div className="flex flex-col items-end text-right">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                    {formatDate(order.created_at)} - {formatTime(order.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Canal (Origem) & Vendedor & Actions - matching ERP + seller column */}
                    <div className="flex justify-between items-end gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Origem</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                                    {orderSource}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Vendedor</span>
                            <div className="flex items-center gap-1.5">
                                <UserIcon size={12} className="shrink-0" />
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate max-w-[120px]">
                                    {sellerName}
                                </span>
                            </div>
                        </div>

                        {/* Actions button at same height as info */}
                        <div
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onPrint={() => toast.info("Imprimir não implementado")}
                                onEdit={() => openEntity("edit", order.id)}
                                onCancel={() => toast.info("Cancelar não implementado")}
                                onPaymentStatus={() => toast.info("Status pagamento não implementado")}
                                onDeliveryStatus={() => toast.info("Status entrega não implementado")}
                            />
                        </div>
                    </div>
                </div>
            </div>
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
                            Pedidos
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie os pedidos do marketplace com pagamento, estoque e histórico.
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
                <OrdersPageControls
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    hasActiveFilters={hasActiveFilters}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 lg:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <FadeIn key="loading" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : paginatedItems.length === 0 ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum pedido"
                                    title={hasActiveFilters ? "Nenhum pedido encontrado" : "Busque pedidos usando os filtros"}
                                    subtitle={hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Clique em Filtros e Busca para pesquisar por número do pedido, cliente, loja ou status."}
                                    itemButton={hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setFilters(INITIAL_FILTERS)
                                            setActiveTab("all")
                                        },
                                        variant: "outline",
                                    } : {
                                        text: "Abrir Filtros",
                                        action: () => setIsFilterSheetOpen(true),
                                        variant: "outline",
                                    }}
                                />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((order) => {
                                        const paymentMeta = getPaymentStatusMeta(order.situation)
                                        const store = order.stores || {}
                                        const sellerName = store.name || "—"
                                        const orderSource = order.order_source || "Manual"
                                        return (
                                            <div
                                                key={order.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => openEntity("view", order.id)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                            #{order.order_number || order.id.slice(0, 8)}
                                                        </span>
                                                        <span className="text-xs text-brand-inactive-text truncate">
                                                            {order.customer_name || "Consumidor"}
                                                        </span>
                                                    </div>
                                                    <Badge variant={paymentMeta.variant}>
                                                        {paymentMeta.label}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="truncate">{orderSource}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 min-w-0 ml-2">
                                                        <UserIcon size={12} className="shrink-0" />
                                                        <span className="truncate">{sellerName}</span>
                                                    </div>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm shrink-0">
                                                        {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                    <span>{formatDate(order.created_at)} - {formatTime(order.created_at)}</span>
                                                    <span>{order.order_items?.length || 0} produto(s)</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop View: Table */}
                                {viewMode === "list" ? (
                                    <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                        <div className="overflow-x-auto pb-4 custom-scrollbar">
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1300px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50 select-none">
                                                        <th className="py-3 px-2 pl-6 rounded-l-lg text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">
                                                            <Checkbox
                                                                checked={selectedOrders.size === paginatedItems.length && paginatedItems.length > 0}
                                                                onChange={toggleSelectAll}
                                                            />
                                                        </th>
                                                        {ADMIN_COLUMNS.map((col) => (
                                                            <th
                                                                key={col.id}
                                                                onClick={col.sortable ? () => handleSort(col.id as SortKey) : undefined}
                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight ${col.sortable ? "cursor-pointer hover:text-brand-dark dark:hover:text-dark-heading transition-colors" : ""} ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"} ${col.id === "actions" ? "pr-6 rounded-r-lg" : ""}`}
                                                                style={{ width: col.width }}
                                                            >
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <span>{col.label}</span>
                                                                    {col.sortable && sortConfig?.key === col.id && (
                                                                        <span>{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                                                                    )}
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((order) => (
                                                        <OrderListRow
                                                            key={order.id}
                                                            order={order}
                                                            columns={ADMIN_COLUMNS}
                                                            isPending={isPending}
                                                            onDetail={() => openEntity("view", order.id)}
                                                            selected={selectedOrders.has(order.id)}
                                                            onSelect={toggleSelectOrder}
                                                            showCheckbox
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    /* Desktop View: Grid - matching ERP */
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((order) => renderGridCard(order))}
                                    </div>
                                )}

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
                                            onClick={loadMoreOrders}
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