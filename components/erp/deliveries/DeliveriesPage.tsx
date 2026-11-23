"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEntityState } from "@/hooks/use-entity-state"
import { motion, AnimatePresence } from "framer-motion"
import { Button, IconPlaceholder, AlertModal, FormDropdown, Input, Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { EMPTY_DATE_PERIOD, resolveDatePeriodBounds, isDatePeriodFilterActive, type DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import { FadeIn } from "@/components/animations/FadeIn"
import { ExportFileIcon, PlusIcon, SparklesIcon, MapPinIcon, ArrowUpDownIcon, LinkIcon, TruckIcon, PrinterIcon, ShieldIcon } from "@/lib/icons"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import {
    getERPDeliveriesPageAction,
    type ERPDeliveryListCursor,
    updateERPDeliveryStatusAction,
    getSmartDeliverySuggestionsAction,
    getERPCarrierDeliveriesPageAction,
    type ERPCarrierDeliveryListCursor,
} from "@/app/actions/erp/deliveries"
import { checkDeliveryOtpRequirementAction } from "@/app/actions/delivery-otp"
import ErpDeliveryOtpSection from "./ErpDeliveryOtpSection"
import { getDeliveryStatusMeta, getDeliveryStatusIcon } from "@/lib/orders/status"
import { resolveEffectiveDeliveryStatus } from "@/lib/delivery/status-resolver"
import { getCarrierStatusLabel, getCarrierStatusVariant, getDeliveryStatusForCarrier } from "@/lib/orders/carrier-status"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { formatCurrency, formatDeliveryDaysRange } from "@/lib/utils"
import DeliveryPageControls from "./DeliveryPageControls"
import DeliveryKanbanBoard from "./DeliveryKanbanBoard"
import DeliveryGridCard from "./DeliveryGridCard"
import DeliveryListItem from "./DeliveryListRow"
import CarrierDeliveryBoard from "./CarrierDeliveryBoard"
import CarrierDeliveryCard, { getEstimatedDeliveryDate } from "./CarrierDeliveryCard"
import CreateDeliveryPage from "./CreateDeliveryPage"
import DeliveryDetailPage from "./DeliveryDetailPage"

import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { useMediaQuery } from "@/components/erp/hooks"
import DefaultModal from "@/components/reusable/DefaultModal"
import { formatDistance } from "@/lib/services/location.service"
import { toast } from "@/hooks/use-notification"
import { useErpExport } from "@/hooks/use-erp-export"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"

const CHANGE_STATUS_REASONS = [
    { value: "operational_error", label: "Erro operacional / Clique acidental" },
    { value: "rescheduling", label: "Cliente solicitou reagendamento" },
    { value: "logistics_issue", label: "Problema logístico / Rota" },
    { value: "payment_issue", label: "Problema com pagamento" },
    { value: "other", label: "Outro" },
]

function doesTransitionRequireReason(currentStatus: string, nextStatus: string): boolean {
    if (currentStatus === "delivered" && nextStatus !== "delivered") {
        return true
    }
    if (currentStatus === "delivery_failed" && nextStatus !== "delivery_failed") {
        return true
    }
    if (currentStatus === "sent" && ["preparing", "pickup_available", "delivery_failed", "not_sent", "pending"].includes(nextStatus)) {
        return true
    }
    if (currentStatus === "pickup_available" && ["preparing", "sent", "delivery_failed", "not_sent", "pending"].includes(nextStatus)) {
        return true
    }
    if (currentStatus === "preparing" && ["not_sent", "pending", "delivery_failed"].includes(nextStatus)) {
        return true
    }
    return false
}

type SortKey = "order_id" | "address" | "delivery_person" | "dates" | "delivered_at" | "delivery_fee" | "status"

const COLUMNS: Array<{ id: SortKey | "actions"; label: string; align?: "left" | "center" | "right"; width?: string }> = [
    { id: "order_id", label: "Pedido / Cliente", align: "left", width: "240px" },
    { id: "address", label: "Endereço", align: "left", width: "220px" },
    { id: "delivery_person", label: "Entregador", align: "left", width: "160px" },
    { id: "dates", label: "Saída / Previsão", align: "left", width: "160px" },
    { id: "delivered_at", label: "Conclusão", align: "left", width: "150px" },
    { id: "delivery_fee", label: "Taxa de Entrega", align: "left", width: "130px" },
    { id: "status", label: "Status", align: "left", width: "160px" },
    { id: "actions", label: "Ações", align: "center", width: "70px" },
]

export default function DeliveriesPage({
    partnerId,
    deliveries: initialDeliveries = [],
    initialNextCursor = null,
    initialHasMore = false,
    planGate: propPlanGate,
    userRole: initialUserRole,
    planSlug: initialPlanSlug,
    carrierEnabled: initialCarrierEnabled = false,
    initialPrefillOrders = [],
}: {
    partnerId: string
    deliveries?: any[]
    initialNextCursor?: ERPDeliveryListCursor | null
    initialHasMore?: boolean
    planGate?: { requiredPlanSlug: "crescer" | "escalar"; message: string }
    userRole?: string
    planSlug?: string
    carrierEnabled?: boolean
    initialPrefillOrders?: any[]
}) {
    const router = useRouter()
    const { openPlanUpgrade } = usePlanUpgrade()

    const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
    const isCreatingEntity = entityState.isOpen && entityState.action === "create"
    const isEditingEntity = entityState.isOpen && entityState.action === "edit"
    const selectedDeliveryId = entityState.isOpen && entityState.action === "view" ? entityState.entityId : null
    const editDeliveryId = isEditingEntity ? entityState.entityId : null
    const wrapper = isCreatingEntity ? "create" : isEditingEntity ? "edit" : selectedDeliveryId ? "detail" : "list"

    const [createPrefillOrderIds, setCreatePrefillOrderIds] = useState<string[] | null>(() => {
        if (typeof window === "undefined") return null
        const params = new URLSearchParams(window.location.search)
        const ordersParam = params.get("orders")
        if (!ordersParam) return null
        const ids = ordersParam.split(",").map((id) => id.trim()).filter(Boolean)
        return ids.length > 0 ? ids : null
    })

    const searchParams = useSearchParams()
    const lastConsumedOrdersParamRef = useRef<string | null>(
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("orders") : null
    )
    useEffect(() => {
        const liveOrdersParam = typeof window !== "undefined"
            ? (new URLSearchParams(window.location.search).get("orders") || new URLSearchParams(window.location.search).get("order"))
            : (searchParams?.get("orders") || searchParams?.get("order"))
        if (!liveOrdersParam) {
            return
        }
        if (liveOrdersParam === lastConsumedOrdersParamRef.current) return
        lastConsumedOrdersParamRef.current = liveOrdersParam
        const ids = liveOrdersParam.split(",").map((id) => id.trim()).filter(Boolean)
        if (ids.length > 0) {
            setCreatePrefillOrderIds(ids)
            openEntity("create")
        }
    }, [searchParams, openEntity])

    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [filters, setFilters] = useState<{
        status: string[]
        timing: string[]
        driverType: string[]
        grouping: string[]
        carrierName: string[]
        hasTracking: string[]
        feeMin: string
        feeMax: string
        datePeriod: DatePeriodFilterValue
    }>({
        status: [],
        timing: [],
        driverType: [],
        grouping: [],
        carrierName: [],
        hasTracking: [],
        feeMin: "",
        feeMax: "",
        datePeriod: { ...EMPTY_DATE_PERIOD },
    })
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [viewMode, setViewMode] = useState<"list" | "grid" | "kanban">(isTabletOrMobile ? "grid" : "list")
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

    const [mode, setMode] = useState<"deliveries" | "carriers">("deliveries")
    const carrierEnabled = initialCarrierEnabled
    const planSlug = initialPlanSlug || "free"

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" } | null>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })
    const [suggestionsOpen, setSuggestionsOpen] = useState(false)
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    const [suggestions, setSuggestions] = useState<any[]>([])

    const [statusModal, setStatusModal] = useState<{ deliveryId: string; currentStatus: string; nextStatus: string } | null>(null)
    const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})
    const [deliveryWarningModal, setDeliveryWarningModal] = useState<{
        isOpen: boolean
        deliveryId: string
        currentStatus: string
        nextStatus: string
        reasonDropdownValue: string
        customReasonText: string
    } | null>(null)
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{
        isOpen: boolean
        deliveryId: string
        nextStatus: string
        checkingOtp?: boolean
        requiresOtp?: boolean
        otpOrderCount?: number
        orderNumber?: string | null
        customerName?: string | null
    } | null>(null)
    const [deliveryOtpInput, setDeliveryOtpInput] = useState("")
    const [bypassDeliveryOtp, setBypassDeliveryOtp] = useState(false)
    const [bypassReasonInput, setBypassReasonInput] = useState("")
    const isOwnerOrAdmin = initialUserRole === "owner" || initialUserRole === "admin"

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const observerTarget = useRef<HTMLDivElement>(null)

    const queryKey = useMemo(() => ["erp", "deliveries", partnerId] as const, [partnerId])
    const {
        items,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        refetch: refetchDeliveries,
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

    const carrierQueryKey = useMemo(() => ["erp", "carrier-deliveries", partnerId] as const, [partnerId])
    const {
        items: carrierShipments,
        isLoading: carrierLoading,
        isFetchingNextPage: carrierFetchingNextPage,
        hasNextPage: carrierHasNextPage,
        fetchNextPage: fetchCarrierNextPage,
    } = useInfiniteList<any, ERPCarrierDeliveryListCursor>({
        queryKey: carrierQueryKey,
        enabled: carrierEnabled || mode === "carriers",
        fetchFn: async ({ cursor }) => {
            const res = await getERPCarrierDeliveriesPageAction(partnerId, { cursor, limit: 25 })
            if (!res.success) throw new Error(res.error || "Erro ao carregar envios.")
            return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((d: any) => String(d?.id || ""), []),
    })

    const planGate = propPlanGate

    const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm } =
        useErpExport(planSlug || "free")

    const handleExportDeliveries = useCallback(() => {
        const statusFilter = filters.status.length ? filters.status : undefined

        void exportData({
            partnerId,
            module: "deliveries",
            format: "xlsx",
            filters: {
                search: debouncedSearch,
                status: statusFilter,
                datePeriod: filters.datePeriod,
            },
        })
    }, [exportData, partnerId, debouncedSearch, filters.status, filters.datePeriod])

    const isDelivery = initialUserRole === "delivery"

    useInfiniteScrollObserver(observerTarget, {
        enabled: mode === "deliveries",
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
        fetchNextPage: () => fetchNextPage(),
        rootMargin: "320px",
        threshold: 0,
    })

    const carrierObserverTarget = useRef<HTMLDivElement>(null)

    useInfiniteScrollObserver(carrierObserverTarget, {
        enabled: mode === "carriers",
        hasNextPage: !!carrierHasNextPage,
        isFetchingNextPage: carrierFetchingNextPage,
        fetchNextPage: () => fetchCarrierNextPage(),
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
    }, [effectiveViewMode, items, carrierShipments])

    const carrierOptions = useMemo(() => {
        const set = new Set<string>()
            ; (carrierShipments || []).forEach((s: any) => {
                if (s.carrierName) set.add(s.carrierName)
            })
        const list = Array.from(set)
        return list.length > 0 ? list : ["Correios", "Jadlog", "Loggi", "Total Express", "Latam Cargo"]
    }, [carrierShipments])

    const filterSections: FilterSectionConfig[] = useMemo(() => {
        if (mode === "carriers") {
            return [
                {
                    id: "status",
                    title: "Status do envio",
                    type: "checkbox-list",
                    options: [
                        "Aguardando etiqueta",
                        "Aguardando postagem",
                        "Postado",
                        "Em trânsito",
                        "Entregue",
                        "Envio cancelado",
                        "Falha no envio",
                    ],
                },
                {
                    id: "carrierName",
                    title: "Transportadora",
                    type: "checkbox-list",
                    options: carrierOptions,
                },
                {
                    id: "hasTracking",
                    title: "Rastreio",
                    type: "checkbox-list",
                    options: [
                        "Com rastreio",
                        "Sem rastreio",
                    ],
                },
                {
                    id: "feeRange",
                    title: "Valor do Frete",
                    type: "range",
                    rangeConfig: {
                        minKey: "feeMin",
                        maxKey: "feeMax",
                        inputType: "money",
                        minPlaceholder: "Min",
                        maxPlaceholder: "Max",
                    },
                },
                {
                    id: "datePeriod",
                    title: "Período",
                    type: "date-period",
                },
            ]
        }
        return [
            {
                id: "status",
                title: "Status da entrega",
                type: "checkbox-list",
                options: [
                    "Não enviado",
                    "Em preparação",
                    "Enviado",
                    "Entregue",
                    "Cancelada",
                    "Falha na entrega",
                ],
            },
            {
                id: "timing",
                title: "Pontualidade",
                type: "checkbox-list",
                options: [
                    "Atrasadas",
                    "No prazo",
                ],
            },
            {
                id: "driverType",
                title: "Tipo de entregador",
                type: "checkbox-list",
                options: [
                    "Entrega própria",
                    "Rede Dudit",
                ],
            },
            {
                id: "grouping",
                title: "Agrupamento de pedidos",
                type: "checkbox-list",
                options: [
                    "Pedido único",
                    "Múltiplos pedidos",
                ],
            },
            {
                id: "feeRange",
                title: "Taxa de Entrega",
                type: "range",
                rangeConfig: {
                    minKey: "feeMin",
                    maxKey: "feeMax",
                    inputType: "money",
                    minPlaceholder: "Min",
                    maxPlaceholder: "Max",
                },
            },
            {
                id: "datePeriod",
                title: "Período",
                type: "date-period",
            },
        ]
    }, [mode, carrierOptions])

    const mapDeliveryRows = useCallback((sourceItems: any[]) => {
        const nowMs = Date.now()
        return (sourceItems || []).map((raw: any) => {
            const links = Array.isArray(raw.delivery_orders) ? raw.delivery_orders : []
            if (links.length === 0) return null
            const firstLink = [...links].sort((a: any, b: any) => Number(a.position || 9999) - Number(b.position || 9999))[0]
            const order = firstLink?.orders || {}
            const deliveryPersonName = raw.partner_users?.user_profiles?.full_name || null
            const resolvedStatus = resolveEffectiveDeliveryStatus(raw.status, links)
            const effectiveStatus = statusOverrides[raw.id] || resolvedStatus
            const isDispatched = !["pending", "not_sent", "preparing"].includes(effectiveStatus)
            const rawStartedAt = isDispatched ? (raw.departure_time || raw.started_at || null) : null
            const baseDuration = Number(raw.estimated_duration_minutes || 0)
            const estimatedDuration = baseDuration > 0 ? baseDuration : (links.length * 10)
            const startedMs = rawStartedAt ? new Date(rawStartedAt).getTime() : NaN
            const estimatedArrivalAt = rawStartedAt && Number.isFinite(startedMs) && estimatedDuration > 0
                ? new Date(startedMs + estimatedDuration * 60000).toISOString()
                : null
            const isClosed = ["cancelled", "delivery_failed"].includes(effectiveStatus)
            const showTimingBadge = ["sent", "partially_delivered", "delivered"].includes(effectiveStatus)
            const isLate = !!estimatedArrivalAt && showTimingBadge && !isClosed && nowMs > new Date(estimatedArrivalAt).getTime()
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
                isPlatformDriver: Boolean(raw.is_platform_driver || raw.platform_driver),
                is_platform_driver: Boolean(raw.is_platform_driver || raw.platform_driver),
                platformDriver: raw.platform_driver || null,
                estimatedDurationMinutes: Number(raw.estimated_duration_minutes || 0),
                startedAt: rawStartedAt,
                deliveredAt: raw.delivered_at,
                completedAt: raw.completed_at || raw.delivered_at || null,
                estimatedArrivalAt,
                deliveryFee: links.reduce((sum: number, l: any) => sum + Number(l.orders?.delivery_fee || 0), 0),
                createdAtMs: new Date(raw.created_at).getTime(),
                deliveryTimingState: isLate ? "late" : "on_time",
                deliveryTimingLabel: estimatedArrivalAt && showTimingBadge ? (isLate ? "Atrasada" : "No prazo") : "",
                deliveryTimingDetail: estimatedArrivalAt && showTimingBadge && effectiveStatus === "sent" && !isLate ? remainingLabel : "",
            }
        }).filter(Boolean)
    }, [statusOverrides])

    const mapped = useMemo(() => {
        const term = debouncedSearch.toLowerCase().trim()
        let list = mapDeliveryRows(items || [])

        list = list.filter((d: any) => {
            const matchSearch = !term ||
                d.orderDisplayId.toLowerCase().includes(term) ||
                d.customerName.toLowerCase().includes(term) ||
                (d.customerAddress && d.customerAddress.toLowerCase().includes(term)) ||
                (d.deliveryPersonName && d.deliveryPersonName.toLowerCase().includes(term))

            const statusLabel = getDeliveryStatusMeta(d.status).label
            const matchStatus = filters.status.length === 0 || filters.status.includes(statusLabel) || filters.status.includes(d.status)

            const matchTiming = filters.timing.length === 0 ||
                (filters.timing.includes("Atrasadas") && d.deliveryTimingState === "late") ||
                (filters.timing.includes("No prazo") && d.deliveryTimingState !== "late")

            const matchDriver = filters.driverType.length === 0 ||
                (filters.driverType.includes("Rede Dudit") && d.isPlatformDriver) ||
                (filters.driverType.includes("Entrega própria") && !d.isPlatformDriver)

            const matchGrouping = filters.grouping.length === 0 ||
                (filters.grouping.includes("Pedido único") && d.orderCount === 1) ||
                (filters.grouping.includes("Múltiplos pedidos") && d.orderCount > 1)

            const minFee = filters.feeMin ? Number(filters.feeMin) : null
            const maxFee = filters.feeMax ? Number(filters.feeMax) : null
            const matchFee = (minFee == null || d.deliveryFee >= minFee) && (maxFee == null || d.deliveryFee <= maxFee)

            const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
            const createdYmd = d.createdAtMs ? new Date(d.createdAtMs).toISOString().slice(0, 10) : null
            const matchDate = !startYmd && !endYmd
                ? true
                : createdYmd
                    ? createdYmd >= (startYmd || "") && createdYmd <= (endYmd || "9999-12-31")
                    : false

            return matchSearch && matchStatus && matchTiming && matchDriver && matchGrouping && matchFee && matchDate
        })

        if (sortConfig) {
            list = [...list].sort((a: any, b: any) => {
                let aVal: any
                let bVal: any
                switch (sortConfig.key) {
                    case "order_id":
                        aVal = a.orderDisplayId || a.orderId || ""
                        bVal = b.orderDisplayId || b.orderId || ""
                        break
                    case "address":
                        aVal = a.customerAddress || ""
                        bVal = b.customerAddress || ""
                        break
                    case "delivery_person":
                        aVal = a.deliveryPersonName || ""
                        bVal = b.deliveryPersonName || ""
                        break
                    case "dates":
                        aVal = a.startedAt || a.estimatedArrivalAt || a.createdAtMs || 0
                        bVal = b.startedAt || b.estimatedArrivalAt || b.createdAtMs || 0
                        break
                    case "delivered_at":
                        aVal = a.completedAt || a.deliveredAt || ""
                        bVal = b.completedAt || b.deliveredAt || ""
                        break
                    case "delivery_fee":
                        aVal = a.deliveryFee || 0
                        bVal = b.deliveryFee || 0
                        break
                    case "status":
                        aVal = a.status || ""
                        bVal = b.status || ""
                        break
                    default:
                        aVal = a[sortConfig.key]
                        bVal = b[sortConfig.key]
                }
                if (typeof aVal === "string") aVal = aVal.toLowerCase()
                if (typeof bVal === "string") bVal = bVal.toLowerCase()
                if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1
                if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1
                return 0
            })
        }

        return list
    }, [items, mapDeliveryRows, debouncedSearch, filters, sortConfig])

    const tabCounts = useMemo(() => {
        const deliveriesCount = items?.length || 0
        const carriersCount = carrierShipments?.length || 0
        return { Delivery: deliveriesCount, Transportadora: carriersCount }
    }, [items, carrierShipments])

    const PAGE_SIZE = 8
    const [page, setPage] = useState(1)
    const [carrierPage, setCarrierPage] = useState(1)

    const totalPages = Math.max(1, Math.ceil(mapped.length / PAGE_SIZE))

    const isListLoading = isLoading

    const filteredCarrierShipments = useMemo(() => {
        const term = debouncedSearch.toLowerCase().trim()
        let list = carrierShipments || []
        if (term) {
            list = list.filter((shipment: any) => {
                const haystack = [
                    shipment.orderNumber,
                    shipment.customerName,
                    shipment.customerAddress,
                    shipment.trackingNumber,
                    shipment.carrierName,
                    shipment.serviceName,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                return haystack.includes(term)
            })
        }
        if (filters.status.length > 0) {
            list = list.filter((shipment: any) => {
                const isCancelled = shipment.situation === "cancelled" || shipment.carrierStatus === "cancelled"
                const label = isCancelled ? "Envio cancelado" : getCarrierStatusLabel(shipment.carrierStatus)
                return filters.status.includes(label) || filters.status.includes(shipment.carrierStatus) || (isCancelled && (filters.status.includes("Cancelado") || filters.status.includes("Envio cancelado")))
            })
        }
        if (filters.carrierName.length > 0) {
            list = list.filter((shipment: any) => {
                const name = String(shipment.carrierName || "").toLowerCase()
                const service = String(shipment.serviceName || "").toLowerCase()
                return filters.carrierName.some((c: string) => name.includes(c.toLowerCase()) || service.includes(c.toLowerCase()))
            })
        }
        if (filters.hasTracking.length > 0) {
            list = list.filter((shipment: any) => {
                const has = Boolean(shipment.trackingNumber)
                if (filters.hasTracking.includes("Com rastreio") && has) return true
                if (filters.hasTracking.includes("Sem rastreio") && !has) return true
                return false
            })
        }
        const minFee = filters.feeMin ? Number(filters.feeMin) : null
        const maxFee = filters.feeMax ? Number(filters.feeMax) : null
        if (minFee != null || maxFee != null) {
            list = list.filter((shipment: any) => {
                const fee = Number(shipment.deliveryFee != null ? shipment.deliveryFee : (shipment.price || 0))
                return (minFee == null || fee >= minFee) && (maxFee == null || fee <= maxFee)
            })
        }
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.datePeriod)
        if (startYmd || endYmd) {
            list = list.filter((shipment: any) => {
                const createdYmd = shipment.createdAtMs ? new Date(shipment.createdAtMs).toISOString().slice(0, 10) : null
                return createdYmd ? createdYmd >= (startYmd || "") && createdYmd <= (endYmd || "9999-12-31") : false
            })
        }
        return list
    }, [carrierShipments, debouncedSearch, filters])

    const carrierTotalPages = Math.max(1, Math.ceil(filteredCarrierShipments.length / PAGE_SIZE))

    useEffect(() => {
        setPage(1)
        setCarrierPage(1)
    }, [debouncedSearch, filters, sortConfig, mode])

    const paginated = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE
        return mapped.slice(start, start + PAGE_SIZE)
    }, [mapped, page])

    const paginatedCarriers = useMemo(() => {
        const start = (carrierPage - 1) * PAGE_SIZE
        return filteredCarrierShipments.slice(start, start + PAGE_SIZE)
    }, [filteredCarrierShipments, carrierPage])

    const hasActiveFilters = useMemo(() => {
        if (filters.status.length > 0) return true
        if (isDatePeriodFilterActive(filters.datePeriod)) return true
        if (filters.feeMin || filters.feeMax) return true
        if (mode === "deliveries") {
            if (filters.timing.length > 0) return true
            if (filters.driverType.length > 0) return true
            if (filters.grouping.length > 0) return true
        } else {
            if (filters.carrierName.length > 0) return true
            if (filters.hasTracking.length > 0) return true
        }
        return false
    }, [filters, mode])

    const executeStatusChange = async (
        deliveryId: string,
        nextStatus: string,
        reason?: string,
        deliveryOtp?: string,
        bypassOtp?: boolean,
        bypassReason?: string
    ) => {
        setStatusOverrides(prev => ({ ...prev, [deliveryId]: nextStatus }))
        const res = await updateERPDeliveryStatusAction({
            deliveryId,
            partnerId,
            status: nextStatus as any,
            changeReason: reason || undefined,
            deliveryOtp,
            bypassOtp,
            bypassReason,
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
                variant: "destructive",
            })
        } else {
            toast({
                title: "Status atualizado",
                description: `A entrega foi atualizada para "${getDeliveryStatusMeta(nextStatus).label}".`,
            })
            setDeliveryOtpInput("")
            setBypassDeliveryOtp(false)
            setBypassReasonInput("")
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

    const handleCloseCreate = useCallback(() => {
        setCreatePrefillOrderIds(null)
        closeEntity()
    }, [closeEntity])

    const handleCreateSuccess = useCallback(() => {
        setCreatePrefillOrderIds(null)
        closeEntity()
        void refetchDeliveries()
    }, [closeEntity, refetchDeliveries])

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
        } else if (nextStatus === "delivered") {
            setDeliveryOtpInput("")
            setBypassDeliveryOtp(false)
            setBypassReasonInput("")
            setSimpleConfirmModal({
                isOpen: true,
                deliveryId,
                nextStatus,
                checkingOtp: true,
                requiresOtp: false,
            })
            void checkDeliveryOtpRequirementAction({ deliveryId }).then((res) => {
                setSimpleConfirmModal((prev) => {
                    if (!prev || prev.deliveryId !== deliveryId || prev.nextStatus !== "delivered") return prev
                    return {
                        ...prev,
                        checkingOtp: false,
                        requiresOtp: Boolean(res.success && res.requiresOtp),
                        otpOrderCount: res.otpOrderCount ?? 0,
                        orderNumber: res.orderNumber ?? null,
                        customerName: res.customerName ?? null,
                    }
                })
            }).catch(() => {
                setSimpleConfirmModal((prev) => {
                    if (!prev || prev.deliveryId !== deliveryId) return prev
                    return { ...prev, checkingOtp: false, requiresOtp: false }
                })
            })
        } else {
            setSimpleConfirmModal({
                isOpen: true,
                deliveryId,
                nextStatus,
                checkingOtp: false,
                requiresOtp: false,
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
        <>
            <AnimatePresence mode="wait">
                {wrapper === "create" || wrapper === "edit" ? (
                    <FadeIn key={wrapper} className="w-full h-full">
                        <CreateDeliveryPage
                            partnerId={partnerId}
                            editDeliveryId={editDeliveryId || undefined}
                            onBack={handleCloseCreate}
                            onSuccess={handleCreateSuccess}
                            initialOrderIds={createPrefillOrderIds || undefined}
                            initialPrefillOrders={initialPrefillOrders}
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
                            userRole={initialUserRole}
                        />
                    </FadeIn>
                ) : (
                    <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
                            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                                <div className="flex flex-col gap-2 pt-1">
                                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Entregas</h1>
                                    <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                        {mode === "carriers"
                                            ? "Acompanhe os envios atendidos por transportadora."
                                            : "Gerencie as entregas vinculadas aos pedidos."}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {!isDelivery && (
                                        <Button variant="outline" onClick={handleExportDeliveries} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                                            {isExporting ? "Exportando..." : "Exportar"}
                                        </Button>
                                    )}
                                    {mode === "deliveries" && !isDelivery && (
                                        <Button
                                            variant="outline"
                                            onClick={loadSuggestions}
                                            disabled={!!planGate}
                                            leftIcon={<SparklesIcon size={18} />}
                                        >
                                            Gerar sugestões
                                        </Button>
                                    )}
                                    {mode === "deliveries" && !isDelivery && (
                                        <Button onClick={() => openEntity("create")} disabled={!!planGate} leftIcon={<PlusIcon size={18} />}>
                                            Nova entrega
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <DeliveryPageControls
                                search={search}
                                onSearchChange={setSearch}
                                onOpenFilter={() => setIsFilterOpen(true)}
                                onAdd={() => openEntity("create")}
                                onOpenSuggestions={loadSuggestions}
                                canSmartSuggest={canSmartSuggest}
                                addDisabled={!!planGate}
                                userRole={initialUserRole}
                                filters={filters}
                                setFilters={setFilters}
                                hasActiveFilters={hasActiveFilters}
                                mode={mode}
                                setMode={setMode}
                                tabCounts={tabCounts}
                                viewMode={effectiveViewMode}
                                onViewModeChange={setViewMode}
                                isTabletOrMobile={isTabletOrMobile}
                            />

                            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
                                {mode === "carriers" ? (
                                    <>
                                        <AnimatePresence mode="wait">
                                            {filteredCarrierShipments.length === 0 ? (
                                                <FadeIn key="empty-carrier" className="flex flex-col items-center justify-center h-[500px] text-center p-8 w-full">
                                                    <IconPlaceholder
                                                        placeholderType="image"
                                                        imageSrc="https://img.dudit.com.br/static/mascots/Entregas.png"
                                                        imageAlt="Sem envios"
                                                        title={carrierLoading ? "Carregando envios..." : !carrierEnabled ? "Transportadora não configurada" : "Nenhum envio encontrado"}
                                                        subtitle={
                                                            carrierLoading
                                                                ? "Buscando os pedidos atendidos por transportadora."
                                                                : !carrierEnabled
                                                                    ? "Configure a integração com a transportadora para acompanhar os envios aqui."
                                                                    : "Nenhum envio corresponde aos filtros selecionados."
                                                        }
                                                    />
                                                </FadeIn>
                                            ) : effectiveViewMode === "kanban" ? (
                                                <FadeIn key="carrier-kanban" className="w-full">
                                                    <CarrierDeliveryBoard
                                                        shipments={filteredCarrierShipments}
                                                        isLoading={carrierLoading}
                                                        integrationEnabled={carrierEnabled}
                                                        onOpenOrder={(orderId) => {
                                                            router.push(`/erp/pedidos?view=${orderId}&tab=delivery`)
                                                        }}
                                                    />
                                                </FadeIn>
                                            ) : effectiveViewMode === "grid" ? (
                                                <FadeIn key="carrier-grid" className="w-full">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                        {paginatedCarriers.map((shipment: any) => (
                                                            <CarrierDeliveryCard
                                                                key={shipment.id}
                                                                shipment={shipment}
                                                                onOpenOrder={(orderId) => {
                                                                    router.push(`/erp/pedidos?view=${orderId}&tab=delivery`)
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </FadeIn>
                                            ) : (
                                                <FadeIn key="carrier-list" className="w-full">
                                                    <div className="w-full overflow-hidden rounded-xl relative">
                                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-l-lg pl-4">
                                                                            Pedido / Cliente
                                                                        </th>
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                                            Transportadora
                                                                        </th>
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                                            Rastreio
                                                                        </th>
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                                            Prazo / Previsão
                                                                        </th>
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                                            Frete
                                                                        </th>
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50">
                                                                            Status
                                                                        </th>
                                                                        <th className="py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 rounded-r-lg pr-4 text-center">
                                                                            Ações
                                                                        </th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {paginatedCarriers.map((shipment: any) => {
                                                                        const isCancelled = shipment.situation === "cancelled" || shipment.carrierStatus === "cancelled"
                                                                        const statusVariant = isCancelled ? "red" : getCarrierStatusVariant(shipment.carrierStatus)
                                                                        const statusLabel = isCancelled ? "Cancelado" : getCarrierStatusLabel(shipment.carrierStatus)
                                                                        const brandIcon = getCarrierBrandIcon(shipment.carrierName, shipment.serviceName)
                                                                        const daysRange = formatDeliveryDaysRange(shipment.deliveryMinDays, shipment.deliveryMaxDays)
                                                                        const estimatedDate = getEstimatedDeliveryDate(shipment.createdAt, shipment.deliveryMaxDays)

                                                                        return (
                                                                            <tr
                                                                                key={shipment.id}
                                                                                className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                                                                                onClick={() => router.push(`/erp/pedidos?view=${shipment.orderId}&tab=delivery`)}
                                                                            >
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border pl-4">
                                                                                    <div className="flex flex-col min-w-0">
                                                                                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                                                                                            {shipment.orderNumber}
                                                                                        </span>
                                                                                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                                            {shipment.customerName}
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border">
                                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                                        <img src={brandIcon} alt={shipment.carrierName} className="w-4 h-4 object-contain shrink-0" />
                                                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate">
                                                                                            {shipment.serviceName || shipment.carrierName}
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border">
                                                                                    {shipment.trackingNumber ? (
                                                                                        shipment.trackingUrl ? (
                                                                                            <a
                                                                                                href={shipment.trackingUrl}
                                                                                                target="_blank"
                                                                                                rel="noreferrer"
                                                                                                onClick={(e) => e.stopPropagation()}
                                                                                                className="text-xs font-bold text-brand-primary hover:underline inline-flex items-center gap-1"
                                                                                            >
                                                                                                {shipment.trackingNumber}
                                                                                                <LinkIcon size={12} />
                                                                                            </a>
                                                                                        ) : (
                                                                                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                                                                                                {shipment.trackingNumber}
                                                                                            </span>
                                                                                        )
                                                                                    ) : (
                                                                                        <span className="text-xs text-brand-inactive-text">—</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border">
                                                                                    <div className="flex flex-col text-left">
                                                                                        <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate">
                                                                                            {daysRange || "—"}
                                                                                        </span>
                                                                                        {estimatedDate && (
                                                                                            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                                                                                Prev.: {estimatedDate}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border">
                                                                                    <span className="text-[13px] font-bold text-brand-primary">
                                                                                        {formatCurrency(shipment.deliveryFee != null ? shipment.deliveryFee : (shipment.price || 0))}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border">
                                                                                    <Badge
                                                                                        variant={statusVariant}
                                                                                        icon={brandIcon ? <img src={brandIcon} alt="Transportadora" className="w-3.5 h-3.5 object-contain" /> : <TruckIcon size={12} />}
                                                                                    >
                                                                                        {statusLabel}
                                                                                    </Badge>
                                                                                </td>
                                                                                <td className="p-3 border-b border-brand-border dark:border-dark-border pr-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                                                    <div className="flex justify-center">
                                                                                        <ActionsDropdown
                                                                                            onView={() => router.push(`/erp/pedidos?view=${shipment.orderId}&tab=delivery`)}
                                                                                        >
                                                                                            {shipment.trackingUrl && (
                                                                                                <DropdownItem onClick={() => window.open(shipment.trackingUrl, "_blank")}>
                                                                                                    <LinkIcon size={18} /> Rastrear envio
                                                                                                </DropdownItem>
                                                                                            )}
                                                                                            {shipment.labelUrl && (
                                                                                                <DropdownItem onClick={() => window.open(shipment.labelUrl, "_blank")}>
                                                                                                    <PrinterIcon size={18} /> Imprimir etiqueta
                                                                                                </DropdownItem>
                                                                                            )}
                                                                                        </ActionsDropdown>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </FadeIn>
                                            )}
                                        </AnimatePresence>
                                        {effectiveViewMode !== "kanban" && filteredCarrierShipments.length > 0 && carrierTotalPages > 1 && (
                                            <div className="mt-4 pb-2">
                                                <Pagination
                                                    currentPage={carrierPage}
                                                    totalPages={carrierTotalPages}
                                                    onPageChange={(p) => {
                                                        setCarrierPage(p)
                                                        if (p === carrierTotalPages && carrierHasNextPage && !carrierFetchingNextPage) {
                                                            void fetchCarrierNextPage()
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
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
                                                        title={isListLoading ? "Carregando entregas..." : planGate ? "Plano necessário" : "Nenhuma entrega encontrada"}
                                                        subtitle={
                                                            isListLoading
                                                                ? "Buscando as entregas mais recentes."
                                                                : planGate
                                                                    ? planGate.message
                                                                    : isDelivery
                                                                        ? "Nenhuma entrega atribuída a você no momento."
                                                                        : "Nenhuma entrega corresponde aos filtros ou crie uma entrega para começar."
                                                        }
                                                        itemButton={
                                                            isListLoading
                                                                ? undefined
                                                                : planGate
                                                                    ? {
                                                                        text: "Ver Plano Escalar",
                                                                        action: () => openPlanUpgrade("escalar"),
                                                                    }
                                                                    : isDelivery
                                                                        ? undefined
                                                                        : {
                                                                            text: "Adicionar primeira entrega",
                                                                            action: () => openEntity("create"),
                                                                        }
                                                        }
                                                    />
                                                </FadeIn>
                                            ) : effectiveViewMode === "kanban" ? (
                                                <FadeIn key="kanban" className="w-full">
                                                    <DeliveryKanbanBoard
                                                        deliveries={mapped}
                                                        onDetails={(id) => openEntity("view", id)}
                                                        onEdit={isDelivery ? undefined : (id) => openEntity("edit", id)}
                                                        onQuickStatusChange={handleQuickStatusChange}
                                                    />
                                                </FadeIn>
                                            ) : effectiveViewMode === "grid" ? (
                                                <FadeIn key="grid" className="w-full">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                                        {paginated.map((delivery: any) => (
                                                            <DeliveryGridCard
                                                                key={delivery.id}
                                                                delivery={delivery}
                                                                onDetails={() => openEntity("view", delivery.id)}
                                                                onEdit={isDelivery ? undefined : () => openEntity("edit", delivery.id)}
                                                                onQuickStatusChange={handleQuickStatusChange}
                                                            />
                                                        ))}
                                                    </div>
                                                </FadeIn>
                                            ) : (
                                                <FadeIn key="list" className="w-full">
                                                    <div className="w-full overflow-hidden rounded-xl relative">
                                                        <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                        <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                        <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                                <thead>
                                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                                        {COLUMNS.map((col, idx) => {
                                                                            const isSortable = col.id !== "actions"
                                                                            const isSorted = sortConfig?.key === col.id
                                                                            const isFirst = idx === 0
                                                                            const isLast = idx === COLUMNS.length - 1

                                                                            return (
                                                                                <th
                                                                                    key={col.id}
                                                                                    className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${isSortable ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors" : ""} ${isFirst ? "rounded-l-lg pl-4" : ""} ${isLast ? "rounded-r-lg pr-4" : ""}`}
                                                                                    style={{ width: col.width }}
                                                                                    onClick={() => {
                                                                                        if (!isSortable) return
                                                                                        setSortConfig(prev => ({
                                                                                            key: col.id as SortKey,
                                                                                            direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                                        }))
                                                                                    }}
                                                                                >
                                                                                    <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                                        <span>{col.label}</span>
                                                                                        {isSortable && (
                                                                                            <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                                                <ArrowUpDownIcon
                                                                                                    size={14}
                                                                                                    className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig?.direction === "desc" ? "rotate-180" : ""}`}
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
                                                                    {paginated.map((delivery: any) => (
                                                                        <DeliveryListItem
                                                                            key={delivery.id}
                                                                            delivery={delivery}
                                                                            columns={COLUMNS}
                                                                            onDetails={() => openEntity("view", delivery.id)}
                                                                            onEdit={isDelivery ? undefined : () => openEntity("edit", delivery.id)}
                                                                            onQuickStatusChange={handleQuickStatusChange}
                                                                        />
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </FadeIn>
                                            )}
                                        </AnimatePresence>
                                        {effectiveViewMode !== "kanban" && mapped.length > 0 && totalPages > 1 && (
                                            <div className="mt-4 pb-2">
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
                                            </div>
                                        )}
                                    </>
                                )}

                                {mode === "carriers" ? (
                                    carrierHasNextPage ? (
                                        <div ref={carrierObserverTarget} className="h-12 w-full shrink-0" aria-hidden />
                                    ) : null
                                ) : (
                                    hasNextPage ? (
                                        <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden />
                                    ) : null
                                )}
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

                {simpleConfirmModal?.isOpen && simpleConfirmModal.nextStatus === "delivered" && simpleConfirmModal.requiresOtp ? (
                    <DefaultModal
                        isOpen={true}
                        title="Código de Entrega Obrigatório"
                        maxWidth="md"
                        onClose={() => {
                            setSimpleConfirmModal(null)
                            setDeliveryOtpInput("")
                            setBypassDeliveryOtp(false)
                            setBypassReasonInput("")
                        }}
                        footer={
                            <div className="flex justify-end gap-3 w-full">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setSimpleConfirmModal(null)
                                        setDeliveryOtpInput("")
                                        setBypassDeliveryOtp(false)
                                        setBypassReasonInput("")
                                    }}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={async () => {
                                        const { deliveryId, nextStatus } = simpleConfirmModal
                                        const effectiveBypass = isOwnerOrAdmin && bypassDeliveryOtp
                                        setSimpleConfirmModal(null)
                                        await executeStatusChange(
                                            deliveryId,
                                            nextStatus,
                                            undefined,
                                            effectiveBypass ? undefined : deliveryOtpInput.trim() || undefined,
                                            effectiveBypass,
                                            effectiveBypass ? bypassReasonInput.trim() || undefined : undefined
                                        )
                                    }}
                                    disabled={
                                        (isOwnerOrAdmin && bypassDeliveryOtp)
                                            ? !bypassReasonInput.trim()
                                            : ((simpleConfirmModal.otpOrderCount ?? 1) > 1 || deliveryOtpInput.trim().length !== 6)
                                    }
                                >
                                    Confirmar Entrega
                                </Button>
                            </div>
                        }
                    >
                        <ErpDeliveryOtpSection
                            code={deliveryOtpInput}
                            onCodeChange={setDeliveryOtpInput}
                            bypassOtp={bypassDeliveryOtp}
                            onBypassOtpChange={setBypassDeliveryOtp}
                            bypassReason={bypassReasonInput}
                            onBypassReasonChange={setBypassReasonInput}
                            canBypass={isOwnerOrAdmin}
                            orderNumber={simpleConfirmModal.orderNumber}
                            customerName={simpleConfirmModal.customerName}
                            otpOrderCount={simpleConfirmModal.otpOrderCount ?? 1}
                            checkboxId="erp-bypass-otp-page"
                        />
                    </DefaultModal>
                ) : (
                    <AlertModal
                        isOpen={Boolean(simpleConfirmModal?.isOpen && !simpleConfirmModal?.checkingOtp)}
                        title="Confirmar Alteração de Status"
                        description={`Tem certeza que deseja alterar o status desta entrega para ${getDeliveryStatusMeta(simpleConfirmModal?.nextStatus || "").label}?`}
                        confirmText="Confirmar"
                        cancelText="Cancelar"
                        onClose={() => setSimpleConfirmModal(null)}
                        onConfirm={async () => {
                            if (simpleConfirmModal) {
                                const { deliveryId, nextStatus } = simpleConfirmModal
                                setSimpleConfirmModal(null)
                                await executeStatusChange(deliveryId, nextStatus)
                            }
                        }}
                        variant="warning"
                    />
                )}
            </AnimatePresence>

            <FilterSheet
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters}
                onClear={() => setFilters({
                    status: [],
                    timing: [],
                    driverType: [],
                    grouping: [],
                    carrierName: [],
                    hasTracking: [],
                    feeMin: "",
                    feeMax: "",
                    datePeriod: { ...EMPTY_DATE_PERIOD },
                })}
            />

            <ExportColumnSelectionModal
                isOpen={columnSelectionModal.isOpen}
                canExportAllColumns={columnSelectionModal.canExportAllColumns}
                defaultFormat={columnSelectionModal.defaultFormat}
                onConfirm={handleColumnConfirm}
                onClose={closeColumnSelectionModal}
            />
        </>
    )
}
