"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"

// Components
import { Button, Checkbox, IconPlaceholder, ThreeDotsLoader, Badge, Input, InfoCard, Tooltip, SelectionBanner } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import OrderListItem from "./OrderListRow"
import OrderGridCard from "./OrderGridCard"
import OrderPageControls from "./OrderPageControls"
import CreateOrder from "./CreateOrder"
import OrderDetailView from "./OrderDetailView"

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
    ReturnIcon
} from "@/lib/icons"

import { formatCurrency, formatDate, formatTime } from "@/lib/utils"
import {
    EMPTY_DATE_PERIOD,
    resolveDatePeriodBounds,
    ymdInBounds,
    msToBrazilYmd,
    isDatePeriodFilterActive,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"

import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import AlertModal from "../../reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import { DropdownItem } from "@/components/reusable/Dropdown"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import NotesSheet from "@/components/erp/shared/NotesSheet"
import { updateOrderNotesAction, updateOrdersStatusInBatchAction, getERPOrdersPageAction, getOrderDetailsAction, type ERPOrderListCursor } from "@/app/actions/erp/orders"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import { FadeIn } from "@/components/animations/FadeIn"
import SaleReceiptPrintModal from "./receipt/SaleReceiptPrintModal"
import { buildSaleReceiptFromOrder } from "@/lib/sales/sale-receipt"

// --- TYPES & INTERFACES ---

interface Order {
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
    situation: string;
    delivery_status?: string;
    notes?: string;
    previousSituationBeforeCancel?: string | null;
    returnCount: number;
    canEdit: boolean;
    paidAmount: number;
    statusIcon?: React.ReactNode;
    deliveryStatusIcon?: React.ReactNode;
}

interface FilterState {
    status: string[]
    channel: string[]
    datePeriod: DatePeriodFilterValue
}

type SortKey = "order_id" | "total" | "status" | "customer" | "date" | "channel";
type SortDirection = "asc" | "desc";

const INITIAL_FILTERS: FilterState = {
    status: [],
    channel: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_id", label: "Pedido", align: "left", width: "200px" },
    { id: "total", label: "Total", align: "left", width: "150px" },
    { id: "customer", label: "Cliente", align: "left", width: "250px" },
    { id: "channel", label: "Canal", align: "left", width: "150px" },
    { id: "date", label: "Data", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "left", width: "80px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

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
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const { profile: userProfile } = useUserProfile()
    const currentUserName = userProfile?.full_name || "Usuário"

    // ── Entity Page (URL-driven state + cache + infinite list) ─────────
    const ordersQueryKey = useMemo(() => ['erp', 'orders', partnerId] as const, [partnerId])

    const entityPage = useEntityPage<any, any, ERPOrderListCursor>({
        entityType: 'orders',
        partnerId,
        queryKey: ordersQueryKey,
        initialItems: rawOrders,
        initialNextCursor: initialNextCursor,
        initialHasMore: initialHasMore,
        fetchPageFn: async ({ cursor }) => {
            const res = await getERPOrdersPageAction(partnerId, { cursor, limit: 100 })
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

    // State
    const [activeTab, setActiveTab] = useState<"Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const effectiveViewMode = isMobile ? "grid" : viewMode
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
    const [notesSheet, setNotesSheet] = useState<{ open: boolean; orderId: string | null; notes: string }>({ open: false, orderId: null, notes: "" })
    const [notesSheetSaving, setNotesSheetSaving] = useState(false)
    const [receiptPrintOpen, setReceiptPrintOpen] = useState(false)
    const [receiptPrintData, setReceiptPrintData] = useState<ReturnType<typeof buildSaleReceiptFromOrder> | null>(null)

    const isLoading = storeLoading || entityPage.isListLoading

    const itemsPerPage = 8

    const observerTarget = useRef<HTMLDivElement>(null)
    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const invalidateAndRefresh = useCallback(() => {
        if (entityState.entityId) cache.invalidateEntity(entityState.entityId)
        afterMutation(entityState.entityId || undefined)
        closeEntity()
    }, [entityState.entityId, cache, afterMutation, closeEntity])

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

    // Aggressive prefetch: pre-warm cache for first 10 visible items
    const prefetchedRef = useRef(false)
    useEffect(() => {
        if (prefetchedRef.current || !effectiveOrders?.length) return
        prefetchedRef.current = true
        const first10 = effectiveOrders.slice(0, 10)
        for (const o of first10) {
            if (o?.id) cache.prefetchEntity(o.id)
        }
    }, [effectiveOrders, cache])


    const filterSections: FilterSectionConfig[] = useMemo(
        () => [
            { id: "datePeriod", title: "Data do pedido", type: "date-period" },
            { id: "status", title: "Status", type: "checkbox-list", options: ["Pago", "Pendente", "Enviado", "Cancelado", "Em análise"] },
            {
                id: "channel",
                title: "Canal",
                type: "checkbox-list",
                options: Array.from(
                    new Set(effectiveOrders?.map((o: any) => o.order_source || "Manual") || []),
                ) as string[],
            },
        ],
        [effectiveOrders],
    )

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
                }
                const statusInfo = statusMap[o.situation] || { label: o.situation, icon: <ClockIcon size={12} />, color: "gray" }
                const deliveryInfo = getDeliveryStatusMeta(o.delivery_status) as any

                const deliveryIconMap: Record<string, React.ReactNode> = {
                    not_sent: <BlockedIcon size={12} />,
                    preparing: <ClockIcon size={12} />,
                    sent: <DeliverySentIcon size={12} />,
                    delivered: <CheckCircleIcon size={12} />,
                    pickup_available: <DeliveryPickupIcon size={12} />,
                    delivery_failed: <DeliveryFailedIcon size={12} />,
                    cancelled: <CancelCircleIcon size={12} />,
                }

                if (o.situation === "partially_paid") {
                    statusInfo.label = "Parcialmente Pago"
                    statusInfo.color = "orange"
                    statusInfo.icon = <PartiallyPaidIcon size={12} />
                }

                return {
                    originalId: o.id,
                    displayId: o.order_number || o.mp_payment_id || `#${o.id.substring(0, 8)}`,
                    customer_name: o.customer_name || "Consumidor final",
                    customer_id: o.buyer_id || "-",
                    total_amount: Number(o.total_amount),
                    statusLabel: statusInfo.label,
                    statusColor: statusInfo.color,
                    statusIcon: statusInfo.icon,
                    deliveryStatusLabel: deliveryInfo.label,
                    deliveryStatusColor: deliveryInfo.variant,
                    deliveryStatusIcon: deliveryIconMap[o.delivery_status || "not_sent"] || <BlockedIcon size={12} />,
                    isUnfulfilled: false,
                    formattedDate: formatDate(o.order_date || o.created_at),
                    formattedTime: formatTime(o.order_date || o.created_at),
                    store_name: o.stores?.name || "-",
                    order_source: o.order_source || "Manual",
                    items_count: o.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || o.quantity || 0,
                    created_at_time: new Date(o.order_date || o.created_at).getTime(),
                    situation: o.situation,
                    delivery_status: o.delivery_status,
                    notes: o.notes || "",
                    previousSituationBeforeCancel: o.previous_situation_before_cancel || null,
                    returnCount: Number(o.return_count || 0),
                    canEdit: o.situation !== "cancelled",
                    paidAmount: Number(o.paid_amount || 0)
                }
            })
            .filter((o: Order) => {
                const searchMatch =
                    o.displayId.toLowerCase().includes(term) ||
                    o.customer_name.toLowerCase().includes(term) ||
                    (o.customer_id || "").toLowerCase().includes(term)

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
                const orderYmd = msToBrazilYmd(o.created_at_time)
                const matchesDate = !dateBoundsActive || ymdInBounds(orderYmd, startYmd, endYmd)

                return tabMatch && statusFilterMatch && channelFilterMatch && matchesDate
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

    useEffect(() => {
        if (page === totalPages && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage()
        }
    }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage])

    const hasActiveFilters =
        filters.status.length > 0 ||
        filters.channel.length > 0 ||
        debouncedSearch.length > 0 ||
        isDatePeriodFilterActive(filters.datePeriod)
    const hasOrders = (effectiveOrders?.length || 0) > 0

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
        const statusLabel = order.deliveryStatusLabel
        setDeliveryStatusValue(
            statusLabel === "Não enviado" ? "not_sent"
                : statusLabel === "Preparando" ? "preparing"
                    : statusLabel === "Enviado" ? "sent"
                        : statusLabel === "Entregue" ? "delivered"
                            : statusLabel === "Disponível para retirada" || statusLabel === "Pronto retirada" ? "pickup_available"
                                : statusLabel === "Entrega não realizada" || statusLabel === "Falha na entrega" ? "delivery_failed"
                                    : "not_sent"
        )
    }
    const submitDeliveryStatusChange = async () => {
        const targetOrder = deliveryStatusModal.order
        if (!targetOrder) return
        setActionModal({ open: true, text: "Atualizando status de entrega..." })
        try {
            const result = await updateOrdersStatusInBatchAction({
                orderIds: [targetOrder.originalId],
                partnerId,
                actionType: "delivery_status",
                statusValue: deliveryStatusValue,
            })
            if (result.success) {
                afterMutation(targetOrder.originalId)
                toast({ title: "Sucesso", description: "Status de entrega atualizado." })
                setDeliveryStatusModal({ open: false, order: null })
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
        return cancellableOrdersSelection.every((order) => order.situation === "paid" || order.situation === "partially_paid" || order.paidAmount > 0.009)
    }, [cancellableOrdersSelection])

    const selectedOrdersForBulkActions = useMemo(() => {
        const selectedIds = selection.ids
        if (selectedIds.size === 0) return [] as Order[]
        return filteredOrders.filter((order) => selectedIds.has(order.originalId))
    }, [filteredOrders, selection.ids])

    const openNotesSheet = (order: { originalId?: string; id?: string; notes?: string | null }) => {
        const orderId = order.originalId || order.id || null
        if (!orderId) return
        const cleanNotes = String(order.notes || "").replace(/\n*Pedido cancelado por:[\s\S]*$/, "").trim()
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
            if (notesSheet.orderId) cache.invalidateEntity(notesSheet.orderId)
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

        setActionModal({ open: true, text: "Aplicando alterações..." })

        try {
            if (payload.type === 'order_payment' || payload.type === 'order_delivery') {
                const actionType = payload.type === 'order_payment' ? 'payment_status' : 'delivery_status'
                const result = await updateOrdersStatusInBatchAction({
                    orderIds: ids,
                    partnerId,
                    actionType,
                    statusValue: payload.orderStatus
                })
                if (result.success) {
                    afterMutation()
                    setSelection({ ids: new Set() })
                    toast({ title: "Sucesso", description: "Status alterado com sucesso" })
                    if ((result as any).warning) {
                        toast({ title: "Atenção", description: (result as any).warning, variant: "destructive" })
                    }
                    setBulkEditModal({ isOpen: false })
                } else {
                    toast({ title: "Erro", description: result.error, variant: "destructive" })
                }
            } else {
                toast({ title: "Ação inválida", description: "Essa ação em massa não é suportada para pedidos.", variant: "destructive" })
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Falha ao aplicar ação em massa", variant: "destructive" })
        } finally {
            setActionModal({ open: false, text: "" })
        }
    }

    const confirmBulk = async (action: 'cancel', explicitIds?: string[]) => {
        const ids = explicitIds?.length ? explicitIds : (singleCancelId ? [singleCancelId] : Array.from(selection.ids))
        if (ids.length === 0) return

        setActionModal({ open: true, text: "Cancelando pedidos..." })

        try {
            const result = await updateOrdersStatusInBatchAction({
                orderIds: ids,
                partnerId,
                actionType: 'cancel',
                cancelReason: cancelReason.trim() || undefined,
                restoreStock: restoreStockOnCancel,
                generateAutomaticRefund: shouldShowAutomaticRefundCheckbox ? generateAutomaticRefundOnCancel : false,
                userName: currentUserName
            })

            if (result.success) {
                afterMutation()
                if (!singleCancelId) setSelection({ ids: new Set() })
                toast({
                    title: "Sucesso",
                    description: "Pedidos cancelados"
                })
                if ((result as any).warning) {
                    toast({ title: "Atenção", description: (result as any).warning, variant: "destructive" })
                }
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Ocorreu um erro.", variant: "destructive" })
        } finally {
            setConfirmations(p => ({ ...p, bulkCancel: false }))
            setSingleCancelId(null)
            setCancelReason("")
            setRestoreStockOnCancel(true)
            setGenerateAutomaticRefundOnCancel(true)
            setActionModal({ open: false, text: "" })
        }
    }

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    const handlePrintReceipt = useCallback(
        async (order: Order) => {
            setReceiptPrintOpen(true)
            setReceiptPrintData(null)
            try {
                const res = await getOrderDetailsAction(order.originalId, partnerId)
                if (res.success && res.data) {
                    setReceiptPrintData(
                        buildSaleReceiptFromOrder(
                            res.data,
                            {
                                fantasyName: "",
                                legalName: "",
                                addressLine: "",
                                taxIdLine: "",
                            },
                            { partnerAvatar: selectedStore?.image_url || undefined },
                        ),
                    )
                } else {
                    toast({
                        title: "Erro",
                        description: res.error || "Não foi possível carregar o pedido para impressão.",
                        variant: "destructive",
                    })
                    setReceiptPrintOpen(false)
                }
            } catch {
                toast({
                    title: "Erro",
                    description: "Não foi possível carregar o pedido para impressão.",
                    variant: "destructive",
                })
                setReceiptPrintOpen(false)
            }
        },
        [partnerId, selectedStore?.image_url, toast],
    )

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && (entityState.action === 'view' || entityState.action === 'edit') && isLoadingDetail ? (
                    <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
                        <ThreeDotsLoader />
                    </div>
                ) : entityState.isOpen && entityState.action === 'view' && entityState.entityId ? (
                    <FadeIn key="view-order" className="w-full h-full bg-white dark:bg-dark-background">
                        <OrderDetailView
                            orderId={entityState.entityId}
                            partnerId={partnerId}
                            onBack={invalidateAndRefresh}
                            onEditOrder={(order: any) => {
                                openEntity('edit', order.id)
                            }}
                            onUpdateDeliveryStatus={(order: any) => {
                                openDeliveryStatusModal({
                                    originalId: order.id,
                                    displayId: order.order_number || `#${String(order.id).substring(0, 8)}`,
                                    customer_name: order.customer_name || "Consumidor final",
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
                                    notes: order.notes || "",
                                    previousSituationBeforeCancel: order.previous_situation_before_cancel || null,
                                    returnCount: Number(order.return_count || order.return_requests?.length || 0),
                                    canEdit: order.situation !== "cancelled",
                                    paidAmount: Number(order.paid_amount || 0),
                                })
                            }}
                            onCancelOrder={(order: any) => openCancelModal(order.id)}
                            onOpenNotes={(order: any) => openNotesSheet(order)}
                            initialOrder={currentEntity || effectiveOrders?.find((o: any) => o.id === entityState.entityId) || undefined}
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
                                    <Button variant="outline" onClick={() => { }}>
                                        <ExportFileIcon className="w-[18px] h-[18px]" /> Exportar
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
                                    onExport={() => { }}
                                    onAddOrder={handleAddOrder}
                                    filters={filters}
                                    setFilters={setFilters as any}
                                    viewMode={viewMode}
                                    onViewModeChange={setViewModeState}
                                    hasActiveFilters={hasActiveFilters}
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
                                                key={activeTab + (isMobile ? "mobile" : effectiveViewMode)}
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
                                                {isMobile ? (
                                                    <div className="flex flex-col border-b border-brand-border dark:border-dark-border">
                                                        {paginated.map((o: Order) => (
                                                            <div
                                                                key={o.originalId}
                                                                className="py-5 flex items-start gap-4 border-b border-gray-50 dark:border-dark-border/50 last:border-none cursor-pointer"
                                                                onClick={() => handleDetailsOrder(o)}
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex justify-between items-start mb-0.5">
                                                                        <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate pr-2">
                                                                            {o.displayId}
                                                                        </h3>
                                                                        <div className="flex gap-1.5 shrink-0 items-center">
                                                                            {Number(o.returnCount || 0) > 0 && (
                                                                                <Tooltip text="Possui histórico de trocas/devoluções">
                                                                                    <Badge variant="gray" icon={<ReturnIcon />} className="h-5 text-[10px] px-1.5 whitespace-nowrap">
                                                                                        {Number(o.returnCount || 0) > 1 && (
                                                                                            <span>{o.returnCount}</span>
                                                                                        )}
                                                                                    </Badge>
                                                                                </Tooltip>
                                                                            )}
                                                                            {o.situation === "cancelled" ? (
                                                                                <Badge variant="red" className="h-5 text-[10px] px-1.5">
                                                                                    Cancelado
                                                                                </Badge>
                                                                            ) : (
                                                                                <>
                                                                                    <Badge variant={o.statusColor} icon={o.statusIcon as any} className="h-5 text-[10px] px-1.5">
                                                                                        {o.statusLabel}
                                                                                    </Badge>
                                                                                    <Badge variant={o.deliveryStatusColor} icon={o.deliveryStatusIcon as any} className="h-5 text-[10px] px-1.5">
                                                                                        {o.deliveryStatusLabel}
                                                                                    </Badge>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center text-sm text-brand-inactive-text dark:text-dark-body font-medium truncate mb-1">
                                                                        {o.customer_name} • {o.formattedDate}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[14px]">
                                                                        <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                                                            {o.items_count} {o.items_count === 1 ? 'item' : 'itens'}
                                                                        </span>
                                                                        <span className="text-gray-300 dark:text-gray-600 font-medium font-bold">•</span>
                                                                        <span className="font-bold text-brand-primary">
                                                                            {formatCurrency(o.total_amount)}
                                                                        </span>

                                                                        <div className="flex-none ml-auto -mb-1" onClick={(e) => e.stopPropagation()}>
                                                                            <Checkbox checked={selection.ids.has(o.originalId)} onChange={() => handleSelectRow(o.originalId)} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : effectiveViewMode === "grid" ? (
                                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
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
                                                                extraActions={o.situation !== "cancelled" ? (
                                                                    <DropdownItem onClick={() => openDeliveryStatusModal(o)}>
                                                                        Alterar status de entrega
                                                                    </DropdownItem>
                                                                ) : null}
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
                                                                            extraActions={o.situation !== "cancelled" ? (
                                                                                <DropdownItem onClick={() => openDeliveryStatusModal(o)}>
                                                                                    Alterar status de entrega
                                                                                </DropdownItem>
                                                                            ) : null}
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
                    leftIcon={<EditIcon className="w-4 h-4" />}
                    className="h-10 px-3"
                >
                    Ações em massa
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => setConfirmations((p) => ({ ...p, bulkCancel: true }))}
                    leftIcon={<BlockedIcon className="w-4 h-4" />}
                    className="h-10 px-3 text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-surface"
                >
                    Cancelar
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => { }}
                    leftIcon={<TrashIcon className="w-4 h-4" />}
                    className="hidden"
                >
                    Excluir
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
                                label="Motivo do cancelamento (opcional)"
                                placeholder="Descreva o motivo..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                maxLength={120}
                            />
                            <label className="flex items-center gap-3 py-2 cursor-pointer">
                                <Checkbox checked={restoreStockOnCancel} onChange={(checked) => setRestoreStockOnCancel(Boolean(checked))} />
                                <span className="text-sm text-brand-dark dark:text-dark-heading">Restaurar estoque dos itens</span>
                            </label>
                            {shouldShowAutomaticRefundCheckbox && (
                                <label className="flex items-center gap-3 py-2 cursor-pointer">
                                    <Checkbox checked={generateAutomaticRefundOnCancel} onChange={(checked) => setGenerateAutomaticRefundOnCancel(Boolean(checked))} />
                                    <span className="text-sm text-brand-dark dark:text-dark-heading">Gerar reembolso automático</span>
                                </label>
                            )}
                        </div>
                    </div>
                }
                confirmText={singleCancelId ? "Cancelar Pedido" : "Cancelar Pedidos"}
                variant="danger"
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
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button variant="outline" onClick={() => setDeliveryStatusModal({ open: false, order: null })}>
                            Cancelar
                        </Button>
                        <Button onClick={submitDeliveryStatusChange}>
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
                    <select
                        value={deliveryStatusValue}
                        onChange={(e) => setDeliveryStatusValue(e.target.value)}
                        className="w-full rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm"
                    >
                        <option value="not_sent">Não enviado</option>
                        <option value="preparing">Preparando</option>
                        <option value="sent">Enviado</option>
                        <option value="delivered">Entregue</option>
                        <option value="pickup_available">Disponível para retirada</option>
                        <option value="delivery_failed">Entrega não realizada</option>
                    </select>
                </div>
            </DefaultModal>

            <SaleReceiptPrintModal
                isOpen={receiptPrintOpen}
                onClose={() => {
                    setReceiptPrintOpen(false)
                    setReceiptPrintData(null)
                }}
                receiptData={receiptPrintOpen ? receiptPrintData : null}
            />
        </>
    )
}
