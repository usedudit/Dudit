"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useUndoGracePeriod } from "@/hooks/use-undo-grace-period"
import { replaceUrl } from "@/lib/navigation/history"

// Components
import { Button, Checkbox, IconPlaceholder, ThreeDotsLoader, Input, InfoCard, SelectionBanner, MoneyInput, FormDropdown, Badge, UndoGracePeriodToast, ListItem, RadioButton } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import OrderListItem from "./OrderListRow"
import OrderGridCard from "./OrderGridCard"
import { OrderShippingSection } from "./OrderShippingSection"
import OrderPageControls from "./OrderPageControls"
import CreateOrder from "./CreateOrder"
import OrderDetailView from "./OrderDetailView"
import PaymentStatusModal from "./PaymentStatusModal"

// Icons
import {
    PlusIcon,
    ExportFileIcon,
    ArrowUpDownIcon,
    EditIcon,
    TrashIcon,
    BlockedIcon,
    DeliverySentIcon,
    CancelCircleIcon,
    ClockIcon,
    CheckCircleIcon,
    DeliveryPickupIcon,
    DeliveryFailedIcon,
    PartiallyPaidIcon,
    StarIcon,
    ShieldIcon,
} from "@/lib/icons"
import { checkOrderDeliveryOtpRequirementAction } from "@/app/actions/delivery-otp"

import { formatDate, formatTime, formatCurrency } from "@/lib/utils"
import { getOrderDepositSummary, canPaySinal } from "@/lib/payments/order-financial-state"
import SaleReceiptPrintModal from "@/components/erp/orders/receipt/SaleReceiptPrintModal"
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import { cleanOrderNotes, normalizeOrderSource, resolveOrderPaymentMethodLabel, UNDEFINED_PAYMENT_PLACEHOLDERS } from "@/lib/orders/order-utils"

import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import AlertModal from "../../reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"

import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import NotesSheet from "@/components/erp/shared/NotesSheet"
import { updateOrderNotesAction, updateOrdersStatusInBatchAction, getERPOrdersPageAction, getOrderDetailsAction, type ERPOrderListCursor } from "@/app/actions/erp/orders"
import { getDeliveryStatusMeta, getDeliveryStatusLabelForType, DELIVERY_STATUS_OPTIONS, PICKUP_STATUS_OPTIONS, MIXED_STATUS_OPTIONS, getDeliveryStatusLabel, canonicalDeliveryStatus, DELIVERY_STATUS_FILTER_OPTIONS, getFulfillmentModeLabel } from "@/lib/orders/status"
import { getCarrierStatusLabel, getCarrierStatusVariant, getDeliveryStatusForCarrier } from "@/lib/orders/carrier-status"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { CARRIER_SHIPMENT_STATUS_OPTIONS } from "@/lib/services/shipping/superfrete"
import { updateOrderCarrierStatusAction } from "@/app/actions/shipping/superfrete"
import { FadeIn } from "@/components/animations/FadeIn"

import { useErpExport } from "@/hooks/use-erp-export"
import { usePermissions } from "@/lib/permission-context"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { OrdersSuggestionsSheet } from "./OrdersSuggestionsSheet"

// --- TYPES & INTERFACES ---

interface Order {
    id?: string;
    originalId: string;
    displayId: string;
    customer_name: string;
    customer_id: string | null;
    total_amount: number;
    statusLabel: string;
    statusColor: any;
    deliveryStatusLabel: string;
    deliveryStatusColor: any;
    isUnfulfilled: boolean;
    formattedDate: string;
    formattedTime: string;
    store_name: string;
    order_source: string;
    items_count: number;
    created_at_time: number;
    updated_at?: string | null;
    situation: string;
    delivery_status?: string;
    delivery_type?: string;
    notes?: string;
    previousSituationBeforeCancel?: string | null;
    returnCount: number;
    canEdit: boolean;
    paidAmount: number;
    statusIcon?: React.ReactNode;
    deliveryStatusIcon?: React.ReactNode;
    carrierBrandIcon?: string | null;
    hasOnlyServices?: boolean;
    is_refunded?: boolean;
    refunded_amount?: number;
    payment_method?: string;
    payment_method_label?: string;
    payment_breakdown?: any;
    payment_provider?: string;
    has_items_to_restore?: boolean;
    checkout_fulfillment?: Record<string, unknown> | null;
    tracking_number?: string | null;
    tracking_url?: string | null;
    delivery_breakdown?: any;
    order_shipments?: any[];
    isCarrierDelivery?: boolean;
    carrier_status?: string | null;
    order_items?: any[];
    customer_email?: string | null;
    customer_phone?: string | null;
}

interface FilterState {
    status: string[]
    channel: string[]
    deliveryStatus: string[]
    deliveryType: string[]
    paymentMethod: string[]
    totalRange: { min: string; max: string }
    datePeriod: DatePeriodFilterValue
}

type SortKey = "order_id" | "total" | "status" | "customer" | "date" | "channel";
type SortDirection = "asc" | "desc";

const INITIAL_FILTERS: FilterState = {
    status: [],
    channel: [],
    deliveryStatus: [],
    deliveryType: [],
    paymentMethod: [],
    totalRange: { min: "", max: "" },
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

const DELIVERY_TYPE_ORDER = ["delivery", "pickup", "on_site", "customer_location"]

const sortDeliveryTypes = (values: string[]) =>
    [...values].sort((a, b) => {
        const ai = DELIVERY_TYPE_ORDER.indexOf(a)
        const bi = DELIVERY_TYPE_ORDER.indexOf(b)
        return (ai === -1 ? DELIVERY_TYPE_ORDER.length : ai) - (bi === -1 ? DELIVERY_TYPE_ORDER.length : bi)
    })

const STATUS_FILTER_OPTIONS = ["Pago", "Pendente", "Enviado", "Cancelado", "Em análise", "Parcialmente Pago", "Entregue"]

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_id", label: "Pedido", align: "left", width: "200px" },
    { id: "customer", label: "Cliente", align: "left", width: "250px" },
    { id: "channel", label: "Origem", align: "left", width: "150px" },
    { id: "date", label: "Data", align: "left", width: "150px" },
    { id: "total", label: "Total", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "left", width: "80px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

const CHANGE_STATUS_REASONS = [
    { value: "operational_error", label: "Erro operacional / Clique acidental" },
    { value: "rescheduling", label: "Cliente solicitou reagendamento" },
    { value: "logistics_issue", label: "Problema logístico / Rota" },
    { value: "payment_issue", label: "Problema com pagamento" },
    { value: "other", label: "Outro" }
]

const hasDefinedPaymentMethod = (order: {
    payment_method?: string;
    payment_breakdown?: any;
    checkout_fulfillment?: Record<string, unknown> | null;
}): boolean => {
    const isPlaceholder = (value?: string | null) => {
        const normalized = String(value ?? "")
            .trim()
            .toLowerCase();
        return UNDEFINED_PAYMENT_PLACEHOLDERS.some((placeholder) => normalized === placeholder);
    };

    const breakdown = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : [];
    const hasRealLeg = breakdown.some((leg: any) => {
        const method = String(leg?.method ?? "").trim();
        if (!method || isPlaceholder(method)) return false;
        if (Number(leg?.amountReceived ?? leg?.amount ?? 0) <= 0.009) return false;
        return true;
    });
    if (hasRealLeg) return true;

    if (!isPlaceholder(order?.payment_method)) return true;

    const deposit = order?.checkout_fulfillment as any;
    const checkoutMethod = deposit?.depositCheckout?.paymentMethod || deposit?.paymentMethod;
    return !isPlaceholder(checkoutMethod);
};

const ONLINE_ORDER_SOURCES = ["marketplace", "vitrine online", "online store", "loja online"];

const isOnlineMarketplaceOrder = (source?: string | null): boolean => {
    const normalized = String(source ?? "").trim().toLowerCase();
    return ONLINE_ORDER_SOURCES.includes(normalized);
};

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


export default function OrdersPage({
    orders: rawOrders,
    initialNextCursor,
    initialHasMore,
    partnerId
}: {
    orders: any[]
    initialNextCursor: ERPOrderListCursor | null
    initialHasMore: boolean
    partnerId: string
}) {
    const { toast } = useToast()
    const router = useRouter()
    const [initialDetailTab, setInitialDetailTab] = useState<string | undefined>(undefined)

    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const hasEscalarPlan = hasMinimumPlan(planSlug, "escalar")
    const [showSuggestions, setShowSuggestions] = useState(false)

    const handleOpenSuggestions = useCallback(() => {
        if (hasEscalarPlan) setShowSuggestions(true)
        else openPlanUpgrade("escalar")
    }, [hasEscalarPlan, openPlanUpgrade])
    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm } = useErpExport(planSlug)
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const { profile: userProfile } = useUserProfile()
    const currentUserName = userProfile?.full_name || "Usuário"

    // ── Entity Page (URL-driven state + cache + infinite list) ─────────
    const ordersQueryKey = useMemo(() => ['erp', 'orders', partnerId, selectedStore?.id] as const, [partnerId, selectedStore?.id])

    const entityPage = useEntityPage<any, any, ERPOrderListCursor>({
        entityType: 'orders',
        partnerId,
        queryKey: ordersQueryKey,
        initialItems: rawOrders,
        initialNextCursor: initialNextCursor,
        initialHasMore: initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getERPOrdersPageAction(partnerId, { cursor, limit: 100, storeId: selectedStore?.id || undefined })
            if (!res.success) throw new Error(res.error || "Erro ao carregar pedidos.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((o: any) => String(o?.id || ""), []),
        getDetailFn: async (id: string) => {
            const res = await getOrderDetailsAction(id, partnerId)
            if (res.success && res.data) return res.data
            return null
        },
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    })

    const {
        items: effectiveOrders, fetchNextPage, hasNextPage, isFetchingNextPage,
        entityState, openEntity, closeEntity,
        currentEntity, isLoadingDetail,
        cache, getPrefetchProps,
        search, setSearch, debouncedSearch,
        afterMutation, queryClient,
    } = entityPage

    useEffect(() => {
        if (!entityState.isOpen || entityState.action !== 'view' || !entityState.entityId) return
        if (typeof window === "undefined") return
        const tabFromUrl = new URLSearchParams(window.location.search).get("tab") || undefined
        setInitialDetailTab(tabFromUrl)
        if (tabFromUrl) {
            const url = new URL(window.location.href)
            url.searchParams.delete("tab")
            replaceUrl(`${url.pathname}${url.search}${url.hash}`)
        }
    }, [entityState.isOpen, entityState.action, entityState.entityId])

    // State
    const [activeTab, setActiveTab] = useState<"Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [bulkEditModal, setBulkEditModal] = useState({ isOpen: false })
    const [confirmations, setConfirmations] = useState({ bulkCancel: false })
    const [actionModal, setActionModal] = useState<{ open: boolean; text: string }>({ open: false, text: "" })
    const [cancelReason, setCancelReason] = useState("")
    const [restoreStockOnCancel, setRestoreStockOnCancel] = useState(true)
    const [generateAutomaticRefundOnCancel, setGenerateAutomaticRefundOnCancel] = useState(true)
    const [singleCancelId, setSingleCancelId] = useState<string | null>(null)
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
    const [deliveryStatusModal, setDeliveryStatusModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null })
    const [deliveryStatusValue, setDeliveryStatusValue] = useState("not_sent")
    const [carrierStatusValue, setCarrierStatusValue] = useState("pending")
    const [deliveryOtpInput, setDeliveryOtpInput] = useState("")
    const [bypassDeliveryOtp, setBypassDeliveryOtp] = useState(false)
    const [bypassReasonInput, setBypassReasonInput] = useState("")
    const [orderRequiresOtp, setOrderRequiresOtp] = useState(false)
    const [checkingOtpRequirement, setCheckingOtpRequirement] = useState(false)
    const [paymentStatusModal, setPaymentStatusModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null })
    const [paymentStatusValue, setPaymentStatusValue] = useState("pending")
    const [sinalActionModal, setSinalActionModal] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null })
    const [sinalAction, setSinalAction] = useState<"keep" | "cancel" | "cancel_order">("keep")
    const [notesSheet, setNotesSheet] = useState<{ open: boolean; orderId: string | null; notes: string }>({ open: false, orderId: null, notes: "" })
    const [notesSheetSaving, setNotesSheetSaving] = useState(false)
    const [printOrderId, setPrintOrderId] = useState<string | null>(null)
    const [shippingLabelModal, setShippingLabelModal] = useState<Order | null>(null)
    const [paidAmountValue, setPaidAmountValue] = useState<number>(0)
    const [deliveryWarningModal, setDeliveryWarningModal] = useState<{
        isOpen: boolean
        order: Order
        nextStatus: string
        currentStatus: string
        reasonDropdownValue: string
        customReasonText: string
    } | null>(null)

    // Volta para a primeira página quando os filtros/busca mudam, evitando
    // exibir uma página vazia quando o resultado cai para menos de 8 itens.
    useEffect(() => {
        setPage(1)
    }, [filters, activeTab, debouncedSearch])

    const undoManager = useUndoGracePeriod(10000)



    const isLoading = storeLoading || entityPage.isListLoading

    const itemsPerPage = 8

    const observerTarget = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const invalidateAndRefresh = useCallback(() => {
        afterMutation(entityState.entityId || undefined)
        closeEntity()
        // Ensure URL is fully clean - closeEntity() uses window.history.replaceState
        // which doesn't notify Next.js router, so we also use router.replace as a
        // belt-and-suspenders cleanup if any entity params remain.
        if (typeof window !== "undefined") {
            const hasStaleParams = /[?&](edit|view|create|duplicate|payment|type)=/.test(window.location.search)
            if (hasStaleParams) {
                router.replace("/erp/pedidos", { scroll: false })
            }
        }
    }, [entityState.entityId, afterMutation, closeEntity, router])

    useEffect(() => {
        const handleReset = () => closeEntity()
        window.addEventListener('erp-sidebar-reset', handleReset)
        return () => window.removeEventListener('erp-sidebar-reset', handleReset)
    }, [closeEntity])

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState((prev) => {
            const nextLeft = scrollLeft > 0
            const nextRight = scrollLeft < scrollWidth - clientWidth - 2
            if (prev.left === nextLeft && prev.right === nextRight) return prev
            return { left: nextLeft, right: nextRight }
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, effectiveViewMode, effectiveOrders])

    useInfiniteScrollObserver(observerTarget, {
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    // Aggressive prefetch: pre-warm cache for first 3 visible items
    const prefetchedRef = useRef(false)
    useEffect(() => {
        if (prefetchedRef.current || !effectiveOrders?.length) return
        prefetchedRef.current = true
        const first3 = effectiveOrders.slice(0, 3)
        for (const o of first3) {
            if (o?.id) cache.prefetchEntity(o.id)
        }
    }, [effectiveOrders, cache])


    const filterSections: FilterSectionConfig[] = useMemo(() => {
        const rows: any[] = effectiveOrders || []

        const channelOptions = Array.from(
            new Set(rows.map((o) => normalizeOrderSource(o.order_source))),
        ) as string[]

        const deliveryTypeValues = sortDeliveryTypes(
            Array.from(new Set(rows.map((o) => o.delivery_type || "delivery"))) as string[],
        )

        const paymentMethodOptions = Array.from(
            new Set(rows.map((o) => resolveOrderPaymentMethodLabel(o))),
        ).sort((a, b) => a.localeCompare(b, "pt-BR"))

        const deliveryStatusValues = DELIVERY_STATUS_FILTER_OPTIONS.map((o) => o.value)

        return [
            { id: "datePeriod", title: "Data do pedido", type: "date-period" },
            { id: "status", title: "Status do pagamento", type: "checkbox-list", options: STATUS_FILTER_OPTIONS },
            {
                id: "deliveryStatus",
                title: "Status de entrega",
                type: "checkbox-list",
                options: deliveryStatusValues,
                optionLabels: Object.fromEntries(
                    DELIVERY_STATUS_FILTER_OPTIONS.map((o) => [o.value, o.label]),
                ),
            },
            {
                id: "paymentMethod",
                title: "Método de pagamento",
                type: "checkbox-list",
                options: paymentMethodOptions,
            },
            { id: "channel", title: "Origem", type: "checkbox-list", options: channelOptions },
            {
                id: "deliveryType",
                title: "Tipo de entrega",
                type: "checkbox-list",
                options: deliveryTypeValues,
                optionLabels: Object.fromEntries(
                    deliveryTypeValues.map((value) => [value, getFulfillmentModeLabel(value)]),
                ),
            },
            {
                id: "totalRange",
                title: "Valor do pedido",
                type: "range",
                rangeConfig: { minKey: "min", maxKey: "max", minPlaceholder: "Mín (R$)", maxPlaceholder: "Máx (R$)" },
            },
        ]
    }, [effectiveOrders])

    const filteredOrders: Order[] = useMemo(() => {
        if (!effectiveOrders) return []

        const term = debouncedSearch.toLowerCase()
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
        const dateBoundsActive = startYmd !== null || endYmd !== null

        const result = effectiveOrders
            .map((o: any): Order => {
                const statusMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
                    paid: { label: "Pago", icon: <CheckCircleIcon size={12} />, color: "green" },
                    shipped: { label: "Enviado", icon: <DeliverySentIcon size={12} />, color: "blue" },
                    delivered: { label: "Entregue", icon: <CheckCircleIcon size={12} />, color: "green" },
                    cancelled: { label: "Cancelado", icon: <CancelCircleIcon size={12} />, color: "red" },
                    in_process: { label: "Em análise", icon: <ClockIcon size={12} />, color: "yellow" },
                    pending: { label: "Pendente", icon: <ClockIcon size={12} />, color: "gray" },
                    unpaid: { label: "Pendente", icon: <ClockIcon size={12} />, color: "gray" },
                }
                const statusInfo = statusMap[o.situation] || { label: o.situation, icon: <ClockIcon size={12} />, color: "gray" }

                if (o.situation === "partially_paid") {
                    statusInfo.label = "Parcialmente Pago"
                    statusInfo.color = "orange"
                    statusInfo.icon = <PartiallyPaidIcon size={12} />
                }

                const deliveryInfo = getDeliveryStatusMeta(o.delivery_status) as any

                const deliveryIconMap: Record<string, React.ReactNode> = {
                    not_sent: <BlockedIcon size={12} />,
                    preparing: <ClockIcon size={12} />,
                    sent: <DeliverySentIcon size={12} />,
                    delivered: <CheckCircleIcon size={12} />,
                    pickup_available: <DeliveryPickupIcon size={12} />,
                    delivery_failed: <DeliveryFailedIcon size={12} />,
                }

                const orderItems = o.order_items || []
                const hasOnlyServices = o.order_source === "admin_service_order" || o.order_source === "Ordem de Serviço" || (orderItems.length > 0 && orderItems.every((item: any) => item.service_id || item.line_type === "service_booking"))
                const deliveryType = o.delivery_type || "delivery"
                const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers
                const resolvedCustomerName = (o.customer_name && o.customer_name !== "Consumidor final")
                    ? o.customer_name
                    : (cust?.name || cust?.email || o.buyer_email || o.customer_name || "Consumidor final")

                const shipments = Array.isArray(o.order_shipments)
                    ? o.order_shipments.filter((s: any) => s.kind !== "return")
                    : []
                shipments.sort((a: any, b: any) =>
                    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
                )
                const trackedShipment = shipments.find((s: any) => s.tracking_number) || null

                const carrierBreakdown = (o.delivery_breakdown as any)?.source === "superfrete"
                    ? (o.delivery_breakdown as any)
                    : null
                const isCarrierDelivery = Boolean(carrierBreakdown) || shipments.length > 0
                const latestShipment = shipments[0] || null
                const carrierStatus = isCarrierDelivery
                    ? (latestShipment?.status || "awaiting_label")
                    : null
                const carrierStatusLabel = carrierStatus
                    ? getCarrierStatusLabel(carrierStatus)
                    : null
                const carrierStatusVariant = carrierStatus
                    ? getCarrierStatusVariant(carrierStatus)
                    : null
                const carrierStatusIconMap: Record<string, React.ReactNode> = {
                    awaiting_label: <ClockIcon size={12} />,
                    pending: <ClockIcon size={12} />,
                    released: <ClockIcon size={12} />,
                    posted: <DeliverySentIcon size={12} />,
                    in_transit: <DeliverySentIcon size={12} />,
                    delivered: <CheckCircleIcon size={12} />,
                    cancelled: <BlockedIcon size={12} />,
                    failed: <DeliveryFailedIcon size={12} />,
                }

                return {
                    id: o.id,
                    originalId: o.id,
                    displayId: o.order_number || o.mp_payment_id || `#${o.id.substring(0, 8)}`,
                    customer_name: resolvedCustomerName,
                    customer_id: o.buyer_id || "-",
                    total_amount: Number(o.total_amount),
                    statusLabel: statusInfo.label,
                    statusColor: statusInfo.color,
                    statusIcon: statusInfo.icon,
                    deliveryStatusLabel: carrierStatusLabel
                        ? carrierStatusLabel
                        : getDeliveryStatusLabelForType(o.delivery_status, deliveryType),
                    deliveryStatusColor: carrierStatusVariant
                        ? carrierStatusVariant
                        : deliveryInfo.variant,
                    deliveryStatusIcon: carrierStatus
                        ? (carrierStatusIconMap[carrierStatus] || <BlockedIcon size={12} />)
                        : (deliveryIconMap[o.delivery_status || "not_sent"] || <BlockedIcon size={12} />),
                    carrierBrandIcon: isCarrierDelivery
                        ? getCarrierBrandIcon(
                            carrierBreakdown?.companyName,
                            carrierBreakdown?.serviceName,
                            shipments[0]?.carrier,
                            carrierBreakdown?.carrier,
                        )
                        : null,
                    isUnfulfilled: false,
                    formattedDate: formatDate(o.order_date || o.created_at),
                    formattedTime: formatTime(o.order_date || o.created_at),
                    store_name: o.stores?.name || "-",
                    order_source: normalizeOrderSource(o.order_source),
                    items_count: o.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || o.quantity || 0,
                    created_at_time: new Date(o.order_date || o.created_at).getTime(),
                    situation: o.situation,
                    delivery_status: o.delivery_status,
                    delivery_type: deliveryType,
                    notes: o.notes || "",
                    previousSituationBeforeCancel: o.previous_situation_before_cancel || null,
                    returnCount: Number(o.return_count || 0),
                    canEdit: o.situation !== "cancelled",
                    paidAmount: Number(o.paid_amount || 0),
                    updated_at: o.updated_at,
                    hasOnlyServices,
                    is_refunded: Boolean(o.is_refunded),
                    refunded_amount: Number(o.refunded_amount || 0),
                    payment_method: o.payment_method || "",
                    payment_method_label: resolveOrderPaymentMethodLabel(o),
                    payment_breakdown: o.payment_breakdown || null,
                    payment_provider: o.payment_provider || "",
                    has_items_to_restore: Boolean(o.has_items_to_restore),
                    checkout_fulfillment: o.checkout_fulfillment || null,
                    tracking_number: trackedShipment?.tracking_number || null,
                    tracking_url: trackedShipment?.tracking_url || null,
                    delivery_breakdown: (o.delivery_breakdown as any) || null,
                    order_shipments: shipments,
                    isCarrierDelivery,
                    carrier_status: carrierStatus,
                    order_items: orderItems,
                    customer_email: cust?.email || (typeof o.buyer_email === "string" ? o.buyer_email : null),
                    customer_phone: cust?.phone || null,
                }
            })
            .filter((o: Order) => {
                const itemMatch = Array.isArray(o.order_items) && o.order_items.some((item: any) =>
                    (typeof item?.product_name === "string" && item.product_name.toLowerCase().includes(term)) ||
                    (typeof item?.name === "string" && item.name.toLowerCase().includes(term))
                )
                const emailMatch = typeof (o as any).customer_email === "string" && (o as any).customer_email.toLowerCase().includes(term)
                const phoneMatch = typeof (o as any).customer_phone === "string" && (o as any).customer_phone.toLowerCase().includes(term)
                const paymentMatch = (
                    (typeof o.payment_method_label === "string" && o.payment_method_label.toLowerCase().includes(term)) ||
                    (typeof o.payment_method === "string" && o.payment_method.toLowerCase().includes(term)) ||
                    (typeof o.payment_provider === "string" && o.payment_provider.toLowerCase().includes(term))
                )
                const storeMatch = typeof o.store_name === "string" && o.store_name.toLowerCase().includes(term)
                const notesMatch = typeof o.notes === "string" && o.notes.toLowerCase().includes(term)

                const searchMatch = !term || (
                    o.displayId.toLowerCase().includes(term) ||
                    o.customer_name.toLowerCase().includes(term) ||
                    (o.customer_id || "").toLowerCase().includes(term) ||
                    (o.tracking_number || "").toLowerCase().includes(term) ||
                    itemMatch ||
                    emailMatch ||
                    phoneMatch ||
                    paymentMatch ||
                    storeMatch ||
                    notesMatch
                )

                return searchMatch
            })
            .filter((o: Order) => {
                let tabMatch = true
                if (activeTab === "Pendente") tabMatch = o.situation === "pending" || o.situation === "in_process"
                else if (activeTab === "Pago") tabMatch = o.situation === "paid" || o.situation === "delivered"
                else if (activeTab === "Enviado") tabMatch = o.situation === "shipped"
                else if (activeTab === "Cancelado") tabMatch = o.situation === "cancelled"

                const statusFilterMatch = filters.status.length === 0 || filters.status.includes(o.statusLabel)
                const channelFilterMatch = filters.channel.length === 0 || filters.channel.includes(o.order_source)
                const deliveryStatusMatch =
                    filters.deliveryStatus.length === 0 ||
                    filters.deliveryStatus.includes(
                        o.carrier_status
                            ? getDeliveryStatusForCarrier(o.carrier_status)
                            : canonicalDeliveryStatus(o.delivery_status)
                    )
                const deliveryTypeMatch =
                    filters.deliveryType.length === 0 ||
                    filters.deliveryType.includes(o.delivery_type || "delivery")
                const paymentMethodMatch =
                    filters.paymentMethod.length === 0 ||
                    filters.paymentMethod.includes(o.payment_method_label || "")
                const minTotal = filters.totalRange.min ? Number.parseFloat(filters.totalRange.min) : 0
                const maxTotal = filters.totalRange.max ? Number.parseFloat(filters.totalRange.max) : Number.POSITIVE_INFINITY
                const totalMatch = o.total_amount >= minTotal && o.total_amount <= maxTotal
                const orderYmd = msToBrazilYmd(o.created_at_time)
                const matchesDate = !dateBoundsActive || ymdInBounds(orderYmd, startYmd, endYmd)

                return (
                    tabMatch &&
                    statusFilterMatch &&
                    channelFilterMatch &&
                    deliveryStatusMatch &&
                    deliveryTypeMatch &&
                    paymentMethodMatch &&
                    totalMatch &&
                    matchesDate
                )
            })

        let sortedResult = result
        if (sortConfig) {
            sortedResult = [...result].sort((a, b) => {
                let aVal: any
                let bVal: any

                switch (sortConfig.key) {
                    case "order_id": aVal = a.displayId; bVal = b.displayId; break
                    case "total": aVal = a.total_amount; bVal = b.total_amount; break
                    case "status": aVal = a.statusLabel; bVal = b.statusLabel; break
                    case "customer": aVal = a.customer_name; bVal = b.customer_name; break
                    case "date": aVal = a.created_at_time; bVal = b.created_at_time; break
                    case "channel": aVal = a.order_source; bVal = b.order_source; break

                    default: return 0
                }

                if (aVal === bVal) return 0
                const comparison = aVal < bVal ? -1 : 1
                return sortConfig.direction === "asc" ? comparison : -comparison
            })
        }

        return sortedResult
    }, [effectiveOrders, debouncedSearch, activeTab, filters, sortConfig])

    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage)
    const paginated = filteredOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const prevFilteredLengthRef = useRef(0)
    useEffect(() => {
        const lengthChanged = filteredOrders.length !== prevFilteredLengthRef.current
        prevFilteredLengthRef.current = filteredOrders.length
        if (lengthChanged) return

        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filteredOrders.length])

    const hasActiveFilters =
        filters.status.length > 0 ||
        filters.channel.length > 0 ||
        filters.deliveryStatus.length > 0 ||
        filters.deliveryType.length > 0 ||
        filters.paymentMethod.length > 0 ||
        !!filters.totalRange.min ||
        !!filters.totalRange.max ||
        debouncedSearch.length > 0 ||
        isDatePeriodFilterActive(filters.datePeriod)
    const hasOrders = (effectiveOrders?.length || 0) > 0

    const tabCounts = useMemo(() => {
        if (!effectiveOrders) return { Todos: 0, Pendente: 0, Pago: 0, Enviado: 0, Cancelado: 0 }
        let Todos = effectiveOrders.length, Pendente = 0, Pago = 0, Enviado = 0, Cancelado = 0
        for (const o of effectiveOrders) {
            const s = (o as any).situation
            if (s === "pending" || s === "in_process") Pendente++
            else if (s === "paid" || s === "delivered") Pago++
            else if (s === "shipped") Enviado++
            else if (s === "cancelled") Cancelado++
        }
        return { Todos, Pendente, Pago, Enviado, Cancelado }
    }, [effectiveOrders])

    const handleExport = useCallback(() => {
        void exportData({
            partnerId,
            module: "orders",
            format: "xlsx",
            filters: {
                storeId: selectedStore?.id || null,
                search: debouncedSearch,
                activeTab,
                status: filters.status,
                channels: filters.channel,
                deliveryStatus: filters.deliveryStatus,
                deliveryType: filters.deliveryType,
                paymentMethods: filters.paymentMethod,
                totalMin: filters.totalRange.min,
                totalMax: filters.totalRange.max,
                datePeriod: filters.datePeriod,
            },
        })
    }, [exportData, partnerId, selectedStore?.id, debouncedSearch, activeTab, filters])

    // Handlers
    const handleAddOrder = useCallback(() => {
        openEntity('create')
    }, [openEntity])
    const handleEditOrder = useCallback((order: Order) => {
        if (!order.canEdit) {
            toast({ title: "Edição bloqueada", description: "Pedidos cancelados não podem ser editados.", variant: "destructive" })
            return
        }
        openEntity('edit', order.originalId)
    }, [openEntity, toast])
    const handleDetailsOrder = useCallback((order: Order) => {
        openEntity('view', order.originalId)
    }, [openEntity])

    const openDeliveryStatusModal = (order: Order) => {
        setDeliveryStatusModal({ open: true, order })
        setDeliveryOtpInput("")
        setBypassDeliveryOtp(false)
        setBypassReasonInput("")
        setOrderRequiresOtp(false)
        setCheckingOtpRequirement(true)

        checkOrderDeliveryOtpRequirementAction({ orderId: order.originalId })
            .then((res) => {
                if (res.success && res.requiresOtp && !res.isConfirmed) {
                    setOrderRequiresOtp(true)
                }
            })
            .catch(() => {})
            .finally(() => setCheckingOtpRequirement(false))

        const outboundShipment = order.order_shipments?.[0]
        if (order.isCarrierDelivery && outboundShipment) {
            setCarrierStatusValue(outboundShipment.status || "pending")
            return
        }
        const status = order.delivery_status
        const isPickup = order.delivery_type === "pickup"
        setDeliveryStatusValue(
            status === "not_sent" || status === "pending" ? "not_sent"
                : status === "preparing" ? "preparing"
                    : isPickup && status === "pickup_available" ? "pickup_available"
                        : status === "sent" || status === "pickup_available" ? "sent"
                            : status === "delivered" ? "delivered"
                                : status === "delivery_failed" ? "delivery_failed"
                                    : "not_sent"
        )
    }

    const saveDeliveryStatusChange = async (targetOrder: Order, nextStatus: string, reason?: string) => {
        setActionModal({ open: true, text: "Atualizando status de entrega..." })
        try {
            const result = await updateOrdersStatusInBatchAction({
                orderIds: [targetOrder.originalId],
                partnerId,
                actionType: "delivery_status",
                statusValue: nextStatus,
                changeReason: reason,
                deliveryOtp: bypassDeliveryOtp ? undefined : deliveryOtpInput.trim() || undefined,
                bypassOtp: bypassDeliveryOtp,
                bypassReason: bypassReasonInput.trim() || undefined,
            })
            if (result.success) {
                afterMutation(targetOrder.originalId)
                toast({ title: "Sucesso", description: "Status de entrega atualizado." })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Falha ao atualizar status de entrega.", variant: "destructive" })
        } finally {
            setActionModal({ open: false, text: "" })
        }
    }

    const confirmDeliveryWarningStatusChange = async () => {
        if (!deliveryWarningModal) return
        const targetOrder = deliveryWarningModal.order
        const nextStatus = deliveryWarningModal.nextStatus
        const reason = deliveryWarningModal.reasonDropdownValue === "other"
            ? deliveryWarningModal.customReasonText.trim()
            : CHANGE_STATUS_REASONS.find(r => r.value === deliveryWarningModal.reasonDropdownValue)?.label || ""

        setDeliveryWarningModal(null)
        await saveDeliveryStatusChange(targetOrder, nextStatus, reason)
    }

    const submitDeliveryStatusChange = async () => {
        const targetOrder = deliveryStatusModal.order
        if (!targetOrder) return

        // Pedidos com entrega por transportadora usam os status da própria
        // transportadora (postado/em trânsito/entregue...).
        if (targetOrder.isCarrierDelivery) {
            setDeliveryStatusModal({ open: false, order: null })
            setActionModal({ open: true, text: "Atualizando status de envio..." })
            try {
                const result = await updateOrderCarrierStatusAction({
                    orderId: targetOrder.originalId,
                    status: carrierStatusValue,
                })
                if (result.success) {
                    afterMutation(targetOrder.originalId)
                    toast({ title: "Sucesso", description: "Status de envio atualizado." })
                } else {
                    toast({ title: "Erro", description: result.error, variant: "destructive" })
                }
            } catch (error) {
                console.error(error)
                toast({ title: "Erro", description: "Falha ao atualizar status de envio.", variant: "destructive" })
            } finally {
                setActionModal({ open: false, text: "" })
            }
            return
        }

        const currentStatus = targetOrder.delivery_status || "not_sent"
        const nextStatus = deliveryStatusValue

        if (doesTransitionRequireReason(currentStatus, nextStatus)) {
            setDeliveryStatusModal({ open: false, order: null })
            setDeliveryWarningModal({
                isOpen: true,
                order: targetOrder,
                nextStatus,
                currentStatus,
                reasonDropdownValue: "",
                customReasonText: "",
            })
        } else {
            setDeliveryStatusModal({ open: false, order: null })
            await saveDeliveryStatusChange(targetOrder, nextStatus)
        }
    }

    const openPaymentStatusModal = (order: Order) => {
        setPaymentStatusModal({ open: true, order })
    }

    const handlePaymentStatusClick = useCallback((order: Order) => {
        if (!order.canEdit) return
        const depositSummary = getOrderDepositSummary(order)
        if (canPaySinal(depositSummary)) {
            setSinalAction("keep")
            setSinalActionModal({ open: true, order })
            return
        }
        // Nothing received yet (no sinal, no payments)
        const paidAmount = Number(order.paidAmount || 0)
        const totalAmount = Number(order.total_amount || 0)
        const isFullyPaid = order.situation === "paid" || (totalAmount > 0 && paidAmount >= totalAmount - 0.009)
        if (paidAmount <= 0.009 && !isFullyPaid) {
            // Pedido online (marketplace) com método já escolhido pelo comprador → não pode mudar o método,
            // então mostra o PaymentStatusModal em vez de abrir o PaymentModal com &payment=1.
            // Exceção: pedidos de sinal (o método vem do MP do sinal, não do comprador).
            const isOnlineOrder = isOnlineMarketplaceOrder(order.order_source)
            const methodAlreadyDefined = !depositSummary?.usesDeposit && hasDefinedPaymentMethod(order)
            if (isOnlineOrder && methodAlreadyDefined) {
                openPaymentStatusModal(order)
                return
            }
            router.push(`/erp/pedidos?edit=${order.originalId}&payment=1`)
            return
        }
        openPaymentStatusModal(order)
    }, [router, openPaymentStatusModal])

    const handleSinalActionConfirm = useCallback(async () => {
        const order = sinalActionModal.order
        if (!order) return
        setSinalActionModal({ open: false, order: null })
        if (sinalAction === "keep") {
            // Pedido já com valor recebido → mostra o que já entrou (PaymentStatusModal),
            // não abre um PaymentModal novo com &payment=1.
            if (Number(order.paidAmount || 0) > 0.009) {
                openPaymentStatusModal(order)
                return
            }
            router.push(`/erp/pedidos?edit=${order.originalId}&payment=1`)
        } else if (sinalAction === "cancel") {
            try {
                const res = await fetch("/api/orders/cancel-deposit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId: order.originalId }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err.error || "Erro ao cancelar sinal")
                }
                toast({ title: "Sinal cancelado", description: "O pedido agora pode ser pago normalmente." })
                afterMutation(order.originalId)
                // Abre o pagamento normal do pedido (sem sinal).
                router.push(`/erp/pedidos?edit=${order.originalId}&payment=1`)
            } catch (err: any) {
                toast({ title: "Erro", description: err?.message || "Não foi possível cancelar o sinal.", variant: "destructive" })
            }
        } else if (sinalAction === "cancel_order") {
            try {
                const res = await fetch("/api/orders/cancel-deposit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId: order.originalId }),
                })
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err.error || "Erro ao cancelar sinal")
                }
                const cancelResult = await updateOrdersStatusInBatchAction({
                    orderIds: [order.originalId],
                    partnerId,
                    actionType: 'cancel',
                    cancelReason: 'Sinal cancelado pelo vendedor',
                    userName: currentUserName,
                })
                if (!cancelResult.success) {
                    throw new Error(cancelResult.error || "Erro ao cancelar pedido")
                }
                toast({ title: "Sinal e pedido cancelados", description: "O sinal e o pedido foram cancelados com sucesso." })
                afterMutation()
            } catch (err: any) {
                toast({ title: "Erro", description: err?.message || "Não foi possível cancelar o sinal e o pedido.", variant: "destructive" })
            }
        }
    }, [sinalActionModal.order, sinalAction, router, afterMutation, toast, partnerId, currentUserName, openPaymentStatusModal])

    const handleSelectRow = (id: string) => {
        setSelection((p) => {
            const s = new Set(p.ids)
            s.has(id) ? s.delete(id) : s.add(id)
            return { ids: s }
        })
    }

    const openCancelModal = (orderId: string) => {
        setSingleCancelId(orderId)
        setCancelReason("")
        setRestoreStockOnCancel(true)
        setGenerateAutomaticRefundOnCancel(true)
        setConfirmations(p => ({ ...p, bulkCancel: true }))
    }

    const getCurrentCancelOrderIds = () => {
        return singleCancelId ? [singleCancelId] : Array.from(selection.ids)
    }

    const cancellableOrdersSelection = useMemo(() => {
        const selectedIds = new Set(getCurrentCancelOrderIds())
        return filteredOrders.filter((order) => selectedIds.has(order.originalId))
    }, [filteredOrders, singleCancelId, selection.ids])

    const shouldShowAutomaticRefundCheckbox = useMemo(() => {
        if (cancellableOrdersSelection.length === 0) return false
        return cancellableOrdersSelection.every((order) => {
            const hasPayment = order.situation === "paid" || order.situation === "partially_paid" || order.paidAmount > 0.009
            const remainingRefund = Math.max(0, order.paidAmount - (order.refunded_amount || 0))
            return hasPayment && remainingRefund > 0.009
        })
    }, [cancellableOrdersSelection])

    const automaticRefundLabel = useMemo(() => {
        if (cancellableOrdersSelection.length === 1) {
            const order = cancellableOrdersSelection[0]
            const remainingRefund = Math.max(0, order.paidAmount - (order.refunded_amount || 0))
            return `Gerar reembolso automático (${formatCurrency(remainingRefund)})`
        }
        const totalRemaining = cancellableOrdersSelection.reduce((sum, order) => sum + Math.max(0, order.paidAmount - (order.refunded_amount || 0)), 0)
        return `Gerar reembolso automático (${formatCurrency(totalRemaining)})`
    }, [cancellableOrdersSelection])

    const shouldShowRestoreStockCheckbox = useMemo(() => {
        if (cancellableOrdersSelection.length === 0) return false
        return cancellableOrdersSelection.some((order) => order.has_items_to_restore && order.items_count > 0)
    }, [cancellableOrdersSelection])

    const selectedOrdersForBulkActions = useMemo(() => {
        const selectedIds = selection.ids
        if (selectedIds.size === 0) return [] as Order[]
        return filteredOrders.filter((order) => selectedIds.has(order.originalId))
    }, [filteredOrders, selection.ids])

    const openNotesSheet = (order: { originalId?: string; id?: string; notes?: string | null }) => {
        const orderId = order.originalId || order.id || null
        if (!orderId) return
        const cleanNotes = cleanOrderNotes(order.notes)
        setNotesSheet({ open: true, orderId, notes: cleanNotes })
    }

    const handleSaveOrderNotes = async () => {
        if (!notesSheet.orderId) return
        setNotesSheetSaving(true)
        try {
            const result = await updateOrderNotesAction({
                orderId: notesSheet.orderId,
                partnerId,
                notes: notesSheet.notes,
            })
            if (!result.success) {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
                return
            }
            afterMutation(notesSheet.orderId || undefined)
            setNotesSheet({ open: false, orderId: null, notes: "" })
            toast({ title: "Sucesso", description: "Observação salva com sucesso." })
        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Falha ao salvar observação.", variant: "destructive" })
        } finally {
            setNotesSheetSaving(false)
        }
    }

    const handleBulkEditApply = async (payload: BulkActionPayload) => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        if (payload.type !== 'order_payment' && payload.type !== 'order_delivery') {
            toast({ title: "Ação inválida", description: "Essa ação em massa não é suportada para pedidos.", variant: "destructive" })
            return
        }

        const actionType = payload.type === 'order_payment' ? 'payment_status' : 'delivery_status'
        const actionTitle = payload.type === 'order_payment' ? 'Alterando status de pagamento' : 'Alterando status de envio'

        setBulkEditModal({ isOpen: false })
        setSelection({ ids: new Set() })

        undoManager.schedule({
            id: `orders-status-${Date.now()}`,
            title: `${actionTitle} (${ids.length} pedidos)...`,
            description: "Você tem 10 segundos para desfazer.",
            itemCount: ids.length,
            payload: { ids, actionType, statusValue: payload.orderStatus },
            onExecute: async (p) => {
                const result = await updateOrdersStatusInBatchAction({
                    orderIds: p.ids,
                    partnerId,
                    actionType: p.actionType,
                    statusValue: p.statusValue
                })
                if (!result.success) {
                    throw new Error(result.error || "Erro ao aplicar ação em massa")
                }
                return result
            },
            onUndo: () => {
                toast({ title: "Ação desfeita", description: "Nenhuma alteração foi realizada nos pedidos." })
                afterMutation()
            },
            onSuccess: (result: any) => {
                afterMutation()
                toast({ title: "Sucesso", description: "Status alterado com sucesso" })
                if (result?.warning) {
                    toast({ title: "Atenção", description: result.warning, variant: "destructive" })
                }
            },
            onError: (err: any) => {
                toast({ title: "Erro", description: err?.message || "Falha ao aplicar ação em massa", variant: "destructive" })
                afterMutation()
            }
        })
    }

    const confirmBulk = async (action: 'cancel', explicitIds?: string[]) => {
        const ids = explicitIds?.length ? explicitIds : (singleCancelId ? [singleCancelId] : Array.from(selection.ids))
        if (ids.length === 0) return

        // Cancelamento com janela de 10s para desfazer (individual ou em massa)
        const savedReason = cancelReason.trim() || undefined
        const savedRestoreStock = shouldShowRestoreStockCheckbox ? restoreStockOnCancel : false
        const savedRefund = shouldShowAutomaticRefundCheckbox ? generateAutomaticRefundOnCancel : false
        const isSingle = ids.length === 1

        setConfirmations(p => ({ ...p, bulkCancel: false }))
        setSingleCancelId(null)
        setCancelReason("")
        setRestoreStockOnCancel(true)
        setGenerateAutomaticRefundOnCancel(true)
        setSelection({ ids: new Set() })

        undoManager.schedule({
            id: `orders-cancel-${Date.now()}`,
            title: isSingle ? "Cancelando pedido..." : `Cancelando ${ids.length} pedidos...`,
            description: "Você tem 10 segundos para desfazer.",
            itemCount: ids.length,
            payload: { ids, savedReason, savedRestoreStock, savedRefund },
            onExecute: async (p) => {
                const result = await updateOrdersStatusInBatchAction({
                    orderIds: p.ids,
                    partnerId,
                    actionType: 'cancel',
                    cancelReason: p.savedReason,
                    restoreStock: p.savedRestoreStock,
                    generateAutomaticRefund: p.savedRefund,
                    userName: currentUserName
                })
                if (!result.success) {
                    throw new Error(result.error || "Erro ao cancelar pedidos")
                }
                return result
            },
            onUndo: () => {
                toast({ title: "Cancelamento desfeito", description: "Nenhuma alteração foi realizada nos pedidos." })
                afterMutation()
            },
            onSuccess: (result: any) => {
                afterMutation()
                toast({
                    title: "Sucesso",
                    description: isSingle ? "Pedido cancelado com sucesso." : `${result.processedCount || ids.length} pedidos cancelados.`
                })
                if (result.warning) {
                    toast({ title: "Atenção", description: result.warning, variant: "destructive" })
                }
            },
            onError: (err: any) => {
                toast({ title: "Erro", description: err?.message || "Ocorreu um erro ao cancelar pedidos.", variant: "destructive" })
                afterMutation()
            }
        })
    }

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    const handlePrintReceipt = useCallback(
        (order: Order) => {
            setPrintOrderId(order.originalId)
        },
        [],
    )

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && entityState.action === 'view' && entityState.entityId ? (
                    <FadeIn key="view-order" className="w-full h-full bg-white dark:bg-dark-background">
                        <OrderDetailView
                            orderId={entityState.entityId}
                            partnerId={partnerId}
                            onBack={invalidateAndRefresh}
                            onEditOrder={(order: any) => {
                                openEntity('edit', order.id)
                            }}
                            onUpdateDeliveryStatus={(order: any) => {
                                const cust = Array.isArray(order.customers) ? order.customers[0] : order.customers
                                const resolvedCustName = (order.customer_name && order.customer_name !== "Consumidor final")
                                    ? order.customer_name
                                    : (cust?.name || cust?.email || order.buyer_email || order.customer_name || "Consumidor final")
                                openDeliveryStatusModal({
                                    originalId: order.id,
                                    displayId: order.order_number || `#${String(order.id).substring(0, 8)}`,
                                    customer_name: resolvedCustName,
                                    customer_id: order.buyer_id || "-",
                                    total_amount: Number(order.total_amount || 0),
                                    statusLabel: "",
                                    statusColor: "gray",
                                    deliveryStatusLabel: getDeliveryStatusMeta(order.delivery_status).label,
                                    deliveryStatusColor: getDeliveryStatusMeta(order.delivery_status).variant,
                                    isUnfulfilled: false,
                                    formattedDate: "",
                                    formattedTime: "",
                                    store_name: "",
                                    order_source: order.order_source || "Manual",
                                    items_count: Number(order.order_items?.length || 0),
                                    created_at_time: new Date(order.created_at || Date.now()).getTime(),
                                    situation: order.situation || "pending",
                                    delivery_status: order.delivery_status || "not_sent",
                                    delivery_type: order.delivery_type || "delivery",
                                    notes: order.notes || "",
                                    previousSituationBeforeCancel: order.previous_situation_before_cancel || null,
                                    returnCount: Number(order.return_count || order.return_requests?.length || 0),
                                    canEdit: order.situation !== "cancelled",
                                    paidAmount: Number(order.paid_amount || 0),
                                })
                            }}
                            onUpdatePaymentStatus={(order: any) => {
                                const depositSummary = getOrderDepositSummary(order)
                                if (canPaySinal(depositSummary)) {
                                    setSinalAction("keep")
                                    setSinalActionModal({ open: true, order: { originalId: order.id, checkout_fulfillment: order.checkout_fulfillment, paidAmount: Number(order.paid_amount || 0), total_amount: Number(order.total_amount || 0), payment_expires_at: order.payment_expires_at, updated_at: order.updated_at } as any })
                                    return
                                }
                                // Nothing received yet (no sinal, no payments)
                                const paidAmount = Number(order.paid_amount || order.paidAmount || 0)
                                const totalAmount = Number(order.total_amount || 0)
                                const isFullyPaid = order.situation === "paid" || (totalAmount > 0 && paidAmount >= totalAmount - 0.009)
                                if (paidAmount <= 0.009 && !isFullyPaid) {
                                    const isOnlineOrder = isOnlineMarketplaceOrder(order.order_source)
                                    const methodAlreadyDefined = !depositSummary?.usesDeposit && hasDefinedPaymentMethod(order)
                                    if (isOnlineOrder && methodAlreadyDefined) {
                                        openPaymentStatusModal({
                                            originalId: order.id,
                                            displayId: order.order_number || `#${String(order.id).substring(0, 8)}`,
                                            customer_name: order.customer_name || "Consumidor final",
                                            customer_id: order.buyer_id || "-",
                                            total_amount: Number(order.total_amount || 0),
                                            statusLabel: "",
                                            statusColor: "gray",
                                            deliveryStatusLabel: "",
                                            deliveryStatusColor: "gray",
                                            isUnfulfilled: false,
                                            formattedDate: "",
                                            formattedTime: "",
                                            store_name: "",
                                            order_source: order.order_source || "Manual",
                                            items_count: Number(order.order_items?.length || 0),
                                            created_at_time: new Date(order.created_at || Date.now()).getTime(),
                                            situation: order.situation || "pending",
                                            delivery_status: order.delivery_status || "not_sent",
                                            delivery_type: order.delivery_type || "delivery",
                                            notes: order.notes || "",
                                            previousSituationBeforeCancel: order.previous_situation_before_cancel || null,
                                            returnCount: Number(order.return_count || order.order_requests?.length || 0),
                                            canEdit: order.situation !== "cancelled",
                                            paidAmount: Number(order.paid_amount || 0),
                                            updated_at: order.updated_at,
                                            payment_method: order.payment_method || "",
                                            payment_breakdown: order.payment_breakdown || [],
                                            payment_provider: order.payment_provider || "",
                                            checkout_fulfillment: order.checkout_fulfillment || null,
                                            order_items: order.order_items || [],
                                        })
                                        return
                                    }
                                    router.push(`/erp/pedidos?edit=${order.id}&payment=1`)
                                    return
                                }
                                const cust = Array.isArray(order.customers) ? order.customers[0] : order.customers
                                const resolvedCustName = (order.customer_name && order.customer_name !== "Consumidor final")
                                    ? order.customer_name
                                    : (cust?.name || cust?.email || order.buyer_email || order.customer_name || "Consumidor final")
                                openPaymentStatusModal({
                                    originalId: order.id,
                                    displayId: order.order_number || `#${String(order.id).substring(0, 8)}`,
                                    customer_name: resolvedCustName,
                                    customer_id: order.buyer_id || "-",
                                    total_amount: Number(order.total_amount || 0),
                                    statusLabel: "",
                                    statusColor: "gray",
                                    deliveryStatusLabel: "",
                                    deliveryStatusColor: "gray",
                                    isUnfulfilled: false,
                                    formattedDate: "",
                                    formattedTime: "",
                                    store_name: "",
                                    order_source: order.order_source || "Manual",
                                    items_count: Number(order.order_items?.length || 0),
                                    created_at_time: new Date(order.created_at || Date.now()).getTime(),
                                    situation: order.situation || "pending",
                                    delivery_status: order.delivery_status || "not_sent",
                                    delivery_type: order.delivery_type || "delivery",
                                    notes: order.notes || "",
                                    previousSituationBeforeCancel: order.previous_situation_before_cancel || null,
                                    returnCount: Number(order.return_count || order.order_requests?.length || 0),
                                    canEdit: order.situation !== "cancelled",
                                    paidAmount: Number(order.paid_amount || 0),
                                    updated_at: order.updated_at,
                                    payment_method: order.payment_method || "",
                                    payment_breakdown: order.payment_breakdown || [],
                                    payment_provider: order.payment_provider || "",
                                    checkout_fulfillment: order.checkout_fulfillment || null,
                                    order_items: order.order_items || [],
                                })
                            }}
                            onCancelOrder={(order: any) => openCancelModal(order.id)}
                            onOpenNotes={(order: any) => openNotesSheet(order)}
                            initialOrder={currentEntity || effectiveOrders?.find((o: any) => o.id === entityState.entityId) || undefined}
                            detailLoading={isLoadingDetail}
                            initialTab={initialDetailTab}
                            key={`order-detail-${entityState.entityId}`}
                        />
                    </FadeIn>
                ) : entityState.isOpen && entityState.action === 'edit' && entityState.entityId ? (
                    <FadeIn key="edit-order" className="w-full h-full bg-white dark:bg-dark-background">
                        <CreateOrder
                            partnerId={partnerId}
                            editOrderId={entityState.entityId}
                            onBack={invalidateAndRefresh}
                        />
                    </FadeIn>
                ) : entityState.isOpen && entityState.action === 'create' ? (
                    <FadeIn key="create-order" className="w-full h-full bg-white dark:bg-dark-background">
                        <CreateOrder
                            partnerId={partnerId}
                            onBack={invalidateAndRefresh}
                        />
                    </FadeIn>
                ) : (
                    <FadeIn
                        key="list"
                        className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300"
                    >
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
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                            Pedidos
                                        </h1>
                                    </div>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        Gerencie as vendas e pedidos da sua loja.
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outlineorange"
                                        className="w-[42px] h-[42px]"
                                        onClick={handleOpenSuggestions}
                                        leftIcon={<StarIcon size={18} />}
                                    >
                                    </Button>
                                    <Button variant="outline" onClick={() => handleExport()} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                                        {isExporting ? "Exportando..." : "Exportar"}
                                    </Button>
                                    <Button onClick={handleAddOrder} leftIcon={<PlusIcon size={18} />} >
                                        Novo pedido
                                    </Button>
                                </div>
                            </div>

                            {hasOrders && (
                                <OrderPageControls
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenFilter={() => setModals({ filter: true })}
                                    onExport={handleExport}
                                    onAddOrder={handleAddOrder}
                                    filters={filters}
                                    setFilters={setFilters as any}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewModeState}
                                    hasActiveFilters={hasActiveFilters}
                                    tabCounts={tabCounts}
                                    onOpenSuggestions={handleOpenSuggestions}
                                />
                            )}

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                <AnimatePresence mode="wait">
                                    {isLoading ? (
                                        <FadeIn key="loading" className="flex-1 flex items-center justify-center p-8">
                                            <ThreeDotsLoader />
                                        </FadeIn>
                                    ) : !hasOrders ? (
                                        <FadeIn
                                            key="empty-no-data"
                                            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                        >
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                                imageAlt="Sem pedidos"
                                                title="Você ainda não tem pedidos"
                                                subtitle="Seus pedidos aparecerão aqui assim que seus clientes começarem a comprar."
                                                itemButton={{
                                                    text: "Adicionar primeiro pedido",
                                                    action: handleAddOrder,
                                                }}
                                            />
                                        </FadeIn>
                                    ) : paginated.length === 0 ? (
                                        <FadeIn
                                            key="empty-results"
                                            className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                        >
                                            <IconPlaceholder
                                                placeholderType="image"
                                                imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                                imageAlt="Nenhum pedido encontrado"
                                                title="Nenhum pedido encontrado"
                                                subtitle="Tente ajustar seus filtros ou termos de busca."
                                                itemButton={{
                                                    text: "Limpar filtros",
                                                    action: handleClearFilters,
                                                    variant: "outline"
                                                }}
                                            />
                                        </FadeIn>
                                    ) : (
                                        <AnimatePresence mode="wait">
                                            <FadeIn
                                                key={activeTab + effectiveViewMode}
                                                className="w-full"
                                            >
                                                <SelectionBanner
                                                    selectedCount={selection.ids.size}
                                                    totalCount={filteredOrders.length}
                                                    onSelectAll={() => setSelection({ ids: new Set(filteredOrders.map(o => o.originalId)) })}
                                                    onClearSelection={() => setSelection({ ids: new Set() })}
                                                    itemName="pedidos"
                                                    singularItemName="pedido"
                                                />
                                                {effectiveViewMode === "grid" ? (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                        {paginated.map((o: Order) => (
                                                            <OrderGridCard
                                                                key={o.originalId}
                                                                order={o}
                                                                selected={selection.ids.has(o.originalId)}
                                                                onSelect={() => handleSelectRow(o.originalId)}
                                                                onDetails={() => handleDetailsOrder(o)}
                                                                onPrint={() => handlePrintReceipt(o)}
                                                                onEdit={() => handleEditOrder(o)}
                                                                canEdit={o.canEdit}
                                                                cancelLabel={o.situation === "cancelled" ? "Observação" : "Cancelar"}
                                                                onCancel={() => o.situation === "cancelled" ? openNotesSheet(o) : openCancelModal(o.originalId)}
                                                                onPaymentStatus={o.situation !== "cancelled" ? () => handlePaymentStatusClick(o) : undefined}
                                                                onDeliveryStatus={o.situation !== "cancelled" && !o.hasOnlyServices ? () => openDeliveryStatusModal(o) : undefined}
                                                                onPrefetchMouseEnter={getPrefetchProps(o.originalId).onMouseEnter}
                                                                onPrefetchMouseLeave={getPrefetchProps(o.originalId).onMouseLeave}
                                                                onPrefetchTouchStart={getPrefetchProps(o.originalId).onTouchStart}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="w-full overflow-hidden rounded-xl relative">
                                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1200px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 px-2 w-12 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50">
                                                                            <div className="flex items-center">
                                                                                <Checkbox
                                                                                    checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                                    onChange={(checked) => {
                                                                                        setSelection({ ids: checked ? new Set(paginated.map((x: Order) => x.originalId)) : new Set() })
                                                                                    }}
                                                                                    className="bg-white dark:bg-dark-background"
                                                                                />
                                                                            </div>
                                                                        </th>
                                                                        {COLUMNS.map((col, idx) => {
                                                                            const isSortable = col.id !== 'actions';
                                                                            const isSorted = sortConfig?.key === col.id;
                                                                            const isLast = idx === COLUMNS.length - 1;

                                                                            return (
                                                                                <th
                                                                                    key={col.id}
                                                                                    className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isLast ? "rounded-r-lg" : ""}`}
                                                                                    style={{ width: col.width }}
                                                                                    onClick={() => {
                                                                                        if (!isSortable) return
                                                                                        setSortConfig(prev => ({
                                                                                            key: col.id as SortKey,
                                                                                            direction: prev?.key === col.id && prev.direction === 'asc' ? 'desc' : 'asc'
                                                                                        }))
                                                                                    }}
                                                                                >
                                                                                    <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                        <span>{col.label}</span>
                                                                                        {isSortable && (
                                                                                            <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                                                <ArrowUpDownIcon
                                                                                                    size={14}
                                                                                                    className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100 block' : 'text-brand-inactive-text hidden group-hover:block opacity-40'
                                                                                                        } ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                                                />
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </th>
                                                                            )
                                                                        })}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginated.map((o: Order) => (
                                                                        <OrderListItem
                                                                            key={o.originalId}
                                                                            order={o}
                                                                            columns={COLUMNS}
                                                                            selected={selection.ids.has(o.originalId)}
                                                                            onSelect={handleSelectRow}
                                                                            onEdit={handleEditOrder}
                                                                            onPrint={handlePrintReceipt}
                                                                            canEdit={o.canEdit}
                                                                            cancelLabel={o.situation === "cancelled" ? "Observação" : "Cancelar"}
                                                                            onCancel={() => o.situation === "cancelled" ? openNotesSheet(o) : openCancelModal(o.originalId)}
                                                                            onDetails={handleDetailsOrder}
                                                                            onPaymentStatus={o.situation !== "cancelled" ? () => handlePaymentStatusClick(o) : undefined}
                                                                            onDeliveryStatus={o.situation !== "cancelled" && !o.hasOnlyServices ? () => openDeliveryStatusModal(o) : undefined}
                                                                            onGenerateLabel={(row) => setShippingLabelModal(row)}
                                                                            onPrefetchMouseEnter={getPrefetchProps(o.originalId).onMouseEnter}
                                                                            onPrefetchMouseLeave={getPrefetchProps(o.originalId).onMouseLeave}
                                                                            onPrefetchTouchStart={getPrefetchProps(o.originalId).onTouchStart}
                                                                        />
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )}
                                            </FadeIn>
                                        </AnimatePresence>
                                    )}
                                </AnimatePresence>
                                {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
                            </div>

                            {hasOrders && paginated.length > 0 && (
                                <Pagination
                                    currentPage={page}
                                    totalPages={totalPages}
                                    onPageChange={(p) => {
                                        setPage(p)
                                        if (p === totalPages && hasNextPage && !isFetchingNextPage) {
                                            void fetchNextPage()
                                        }
                                    }}
                                />
                            )}
                            {hasNextPage && page === totalPages && isFetchingNextPage ? (
                                <div className="flex flex-col gap-2 py-2 px-4">
                                    <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse" />
                                    <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse opacity-70" />
                                </div>
                            ) : null}
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />

            <FloatingActionBar
                selectedCount={selection.ids.size}
                onClearSelection={() => setSelection({ ids: new Set() })}
            >
                <Button
                    variant="ghost"
                    onClick={() => setBulkEditModal({ isOpen: true })}
                    leftIcon={<EditIcon size={18} />}
                    className="h-10 px-3"
                >
                    Ações em massa
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkCancel: true }))}
                    leftIcon={<BlockedIcon size={18} />}
                    className="h-10 px-3"
                >
                    Cancelar
                </Button>
            </FloatingActionBar>

            <AlertModal
                isOpen={confirmations.bulkCancel}
                onClose={() => {
                    setConfirmations((p) => ({ ...p, bulkCancel: false }))
                    setSingleCancelId(null)
                    setCancelReason("")
                    setRestoreStockOnCancel(true)
                    setGenerateAutomaticRefundOnCancel(true)
                }}
                onConfirm={() => confirmBulk("cancel")}
                title={singleCancelId ? "Cancelar Pedido" : "Cancelar Pedidos"}
                message={
                    <div className="flex flex-col gap-4">
                        <p>Tem certeza que deseja cancelar {singleCancelId ? "este pedido" : `${selection.ids.size} pedido(s)`}?</p>
                        <div className="text-left space-y-1.5">
                            <Input
                                label="Motivo do cancelamento"
                                placeholder="Descreva o motivo..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                maxLength={120}
                            />
                            {shouldShowRestoreStockCheckbox && (
                                <label className="flex items-center gap-3 py-2 cursor-pointer">
                                    <Checkbox checked={restoreStockOnCancel} onChange={(checked) => setRestoreStockOnCancel(Boolean(checked))} />
                                    <span className="text-sm text-brand-dark dark:text-dark-heading">Restaurar estoque dos itens</span>
                                </label>
                            )}
                            {shouldShowAutomaticRefundCheckbox && (
                                <label className="flex items-center gap-3 py-2 cursor-pointer">
                                    <Checkbox checked={generateAutomaticRefundOnCancel} onChange={(checked) => setGenerateAutomaticRefundOnCancel(Boolean(checked))} />
                                    <span className="text-sm text-brand-dark dark:text-dark-heading">{automaticRefundLabel}</span>
                                </label>
                            )}
                        </div>
                    </div>
                }
                confirmText={singleCancelId ? "Cancelar Pedido" : "Cancelar Pedidos"}
                variant="danger"
                disabled={!cancelReason.trim()}
            />

            <BulkEditActionsModal
                isOpen={bulkEditModal.isOpen}
                onClose={() => setBulkEditModal({ isOpen: false })}
                selectedCount={selection.ids.size}
                targetType="order"
                orderSelectionGuards={{
                    totalCount: selectedOrdersForBulkActions.length,
                    paidCount: selectedOrdersForBulkActions.filter((order) => order.situation === "paid").length,
                    deliveredCount: selectedOrdersForBulkActions.filter((order) => order.delivery_status === "delivered").length,
                    cancelledCount: selectedOrdersForBulkActions.filter((order) => order.situation === "cancelled").length,
                    deliveryTypes: selectedOrdersForBulkActions.map((order) => order.delivery_type || "delivery"),
                }}
                onApply={handleBulkEditApply}
            />

            <NotesSheet
                isOpen={notesSheet.open}
                onClose={() => setNotesSheet({ open: false, orderId: null, notes: "" })}
                onConfirm={handleSaveOrderNotes}
                title="Adicionar Observação"
                value={notesSheet.notes}
                onChange={(value) => setNotesSheet((current) => ({ ...current, notes: value }))}
                placeholder="Digite alguma observação que sairá no pedido..."
                confirmText={notesSheetSaving ? "Salvando..." : "Confirmar"}
            />

            <DefaultModal
                isOpen={actionModal.open}
                onClose={() => { }}
                title=""
                hideHeader
            >
                <div className="flex flex-col items-center justify-center p-6 gap-6 h-full mt-4">
                    <img src="https://img.dudit.com.br/static/mascots/Aguarde.png" alt="Aguarde" className="w-36 h-36 object-contain" />
                    <p className="text-lg font-semibold text-brand-dark dark:text-dark-heading text-center leading-tight">{actionModal.text}</p>
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={deliveryStatusModal.open}
                onClose={() => setDeliveryStatusModal({ open: false, order: null })}
                title="Alterar status de entrega"
                maxWidth="sm"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setDeliveryStatusModal({ open: false, order: null })}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={submitDeliveryStatusChange}
                            disabled={deliveryStatusValue === "delivered" && orderRequiresOtp && !bypassDeliveryOtp && deliveryOtpInput.trim().length !== 6}
                        >
                            Salvar
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4 p-4">
                    <InfoCard
                        title="Pedido"
                        message={deliveryStatusModal.order?.displayId || "-"}
                        color="gray"
                    />
                    {deliveryStatusModal.order?.isCarrierDelivery ? (
                        <FormDropdown
                            options={CARRIER_SHIPMENT_STATUS_OPTIONS}
                            value={carrierStatusValue}
                            setValue={setCarrierStatusValue}
                            placeholder="Selecione o status"
                        />
                    ) : (
                        <FormDropdown
                            options={deliveryStatusModal.order?.delivery_type === "pickup" ? PICKUP_STATUS_OPTIONS : DELIVERY_STATUS_OPTIONS}
                            value={deliveryStatusValue}
                            setValue={setDeliveryStatusValue}
                            placeholder="Selecione o status"
                        />
                    )}

                    {deliveryStatusValue === "delivered" && orderRequiresOtp && (
                        <div className="flex flex-col gap-3 p-3 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-lg border border-brand-primary/20">
                            <div className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
                                <ShieldIcon size={18} />
                                <span>Confirmação de Entrega (OTP)</span>
                            </div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Este pedido exige o código de 6 dígitos fornecido pelo cliente para confirmar a entrega.
                            </p>
                            {!bypassDeliveryOtp ? (
                                <Input
                                    label="Código de 6 dígitos"
                                    placeholder="000000"
                                    value={deliveryOtpInput}
                                    onChange={(e) => setDeliveryOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    maxLength={6}
                                    className="tracking-widest font-mono text-center text-lg font-bold"
                                />
                            ) : (
                                <Input
                                    label="Motivo do Bypass Administrativo"
                                    placeholder="Ex: Cliente sem celular / autorizado por telefone"
                                    value={bypassReasonInput}
                                    onChange={(e) => setBypassReasonInput(e.target.value)}
                                />
                            )}
                            <div className="flex items-center gap-2 pt-1 border-t border-brand-border/40 dark:border-dark-border/40">
                                <input
                                    type="checkbox"
                                    id="erp-bypass-otp-orders"
                                    checked={bypassDeliveryOtp}
                                    onChange={(e) => setBypassDeliveryOtp(e.target.checked)}
                                    className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary h-4 w-4"
                                />
                                <label htmlFor="erp-bypass-otp-orders" className="text-xs font-medium text-brand-dark dark:text-dark-heading cursor-pointer">
                                    Bypassar código (Autorização de Administrador)
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </DefaultModal>

            <DefaultModal
                isOpen={sinalActionModal.open}
                onClose={() => setSinalActionModal({ open: false, order: null })}
                title={`Sinal - ${formatCurrency(Number((sinalActionModal.order?.checkout_fulfillment as any)?.depositCheckout?.initialChargeAmount || 0))}`}
                maxWidth="sm"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setSinalActionModal({ open: false, order: null })}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSinalActionConfirm}>
                            Confirmar
                        </Button>
                    </div>
                }
            >
                <div className="space-y-4">
                    <ListItem
                        icon={<img src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png" alt="Mercado Pago" className="w-5 h-5 object-contain shrink-0" />}
                        title={`Sinal - ${formatCurrency(Number((sinalActionModal.order?.checkout_fulfillment as any)?.depositCheckout?.initialChargeAmount || 0))}`}
                        description="Mercado Pago"
                        className="px-4 py-3"
                    />
                    <ListItem
                        title="Manter sinal"
                        description="Manter o sinal ativo e continuar para o pagamento do pedido."
                        className="px-4 py-3"
                        right={
                            <RadioButton name="sinal-action" value="keep" checked={sinalAction === "keep"} onChange={() => setSinalAction("keep")} />
                        }
                        onClick={() => setSinalAction("keep")}
                    />
                    <ListItem
                        title="Cancelar sinal"
                        description="Cancelar apenas o sinal. O pedido pode ser pago normalmente sem o sinal."
                        className="px-4 py-3"
                        right={
                            <RadioButton name="sinal-action" value="cancel" checked={sinalAction === "cancel"} onChange={() => setSinalAction("cancel")} />
                        }
                        onClick={() => setSinalAction("cancel")}
                    />
                    <ListItem
                        title="Cancelar sinal e o pedido"
                        description="Cancelar o sinal e o pedido. Esta ação não pode ser desfeita."
                        className="px-4 py-3"
                        right={
                            <RadioButton name="sinal-action" value="cancel_order" checked={sinalAction === "cancel_order"} onChange={() => setSinalAction("cancel_order")} />
                        }
                        onClick={() => setSinalAction("cancel_order")}
                    />
                </div>
            </DefaultModal>

            <PaymentStatusModal
                isOpen={paymentStatusModal.open}
                onClose={() => setPaymentStatusModal({ open: false, order: null })}
                order={paymentStatusModal.order}
                partnerId={partnerId}
                onSuccess={() => {
                    if (paymentStatusModal.order) {
                        afterMutation(paymentStatusModal.order.originalId)
                    }
                }}
            />

            <AlertModal
                isOpen={deliveryWarningModal?.isOpen ?? false}
                onClose={() => setDeliveryWarningModal(null)}
                onConfirm={confirmDeliveryWarningStatusChange}
                title="Atenção: Alteração de Status"
                message={
                    <div className="flex flex-col gap-4 text-left">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Este pedido já estava como{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {getDeliveryStatusLabel(deliveryWarningModal?.currentStatus)}
                            </strong>{" "}
                            e você está alterando para{" "}
                            <strong className="text-brand-dark dark:text-dark-heading">
                                {getDeliveryStatusLabel(deliveryWarningModal?.nextStatus)}
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

            <DefaultModal
                isOpen={!!shippingLabelModal}
                onClose={() => setShippingLabelModal(null)}
                title="Etiqueta de envio"
            >
                {shippingLabelModal && (
                    <div className="p-2">
                        <OrderShippingSection
                            orderId={shippingLabelModal.originalId}
                            partnerId={partnerId}
                            order={shippingLabelModal}
                            onRefresh={() => afterMutation(shippingLabelModal.originalId)}
                        />
                    </div>
                )}
            </DefaultModal>

            {printOrderId && (
                <SaleReceiptPrintModal
                    isOpen={!!printOrderId}
                    onClose={() => setPrintOrderId(null)}
                    orderId={printOrderId}
                />
            )}

            <ExportColumnSelectionModal
                isOpen={columnSelectionModal.isOpen}
                canExportAllColumns={columnSelectionModal.canExportAllColumns}
                supportDetail={columnSelectionModal.supportDetail}
                defaultDetail={columnSelectionModal.defaultDetail}
                onConfirm={handleColumnConfirm}
                onClose={closeColumnSelectionModal}
            />

            <OrdersSuggestionsSheet
                isOpen={showSuggestions}
                onClose={() => setShowSuggestions(false)}
                partnerId={partnerId}
                storeId={selectedStore?.id || undefined}
                onOpenOrder={(orderId) => openEntity("view", orderId)}
            />

            <UndoGracePeriodToast
                isOpen={Boolean(undoManager.pendingAction)}
                title={undoManager.pendingAction?.title || ""}
                description={undoManager.pendingAction?.description}
                remainingSeconds={undoManager.remainingSeconds}
                progressPct={undoManager.progressPct}
                isExecuting={undoManager.isExecuting}
                onUndo={undoManager.undo}
                onConfirmNow={undoManager.flush}
            />
        </>
    )
}
