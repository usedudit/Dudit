"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery, useERPData } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"
import { fetchERPOrdersClient } from "@/app/actions/erp/client-loaders"
import { useQueryClient } from "@tanstack/react-query"
import { useUserProfile } from "@/hooks/use-user-profile"

// Components
import { Button, Checkbox, IconPlaceholder, ThreeDotsLoader, Badge, Input } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import OrderListItem from "./OrderListItem"
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
    BlockedIcon
} from "@/lib/icons"
import { useRouter } from "next/navigation"
import { formatCurrency, formatDate, formatTime } from "@/lib/utils"

import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import AlertModal from "../../reusable/AlertModal"
import DefaultModal from "@/components/reusable/DefaultModal"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import { deleteOrdersInBatchAction, updateOrdersStatusInBatchAction } from "@/app/actions/erp/orders"
import { getDeliveryStatusMeta } from "@/lib/orders/status"

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
    previousSituationBeforeCancel?: string | null;
    canEdit: boolean;
    canReopen: boolean;
}

interface FilterState {
    status: string[]
    channel: string[]
}

type SortKey = "order_id" | "total" | "status" | "customer" | "date" | "channel";
type SortDirection = "asc" | "desc";

const INITIAL_FILTERS: FilterState = {
    status: [],
    channel: [],
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

export default function OrdersPage({ orders: rawOrders, partnerId }: { orders: any[], partnerId: string }) {
    const { toast } = useToast()
    const router = useRouter()
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")
    const { profile: userProfile } = useUserProfile()
    const currentUserName = userProfile?.full_name || "Usuário"

    // State
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
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
    const [singleCancelId, setSingleCancelId] = useState<string | null>(null)
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [wrapperMode, setWrapperMode] = useState<'create' | 'edit' | 'view' | null>(null)
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)

    const queryClient = useQueryClient()

    const { data: queryOrders, isLoading: isQueryLoading } = useERPData(
        ['erp', 'orders', partnerId],
        () => fetchERPOrdersClient(),
        { initialData: rawOrders, isCritical: true }
    )

    const effectiveOrders = queryOrders ?? rawOrders
    const isLoading = storeLoading || isQueryLoading

    const itemsPerPage = 8

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const invalidateAndRefresh = () => {
        setWrapperMode(null)
        setSelectedOrderId(null)
        queryClient.invalidateQueries({ queryKey: ['erp', 'orders', partnerId] })
    }

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 500)
        return () => clearTimeout(t)
    }, [search])

    const checkScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    useEffect(() => {
        checkScroll()
        window.addEventListener("resize", checkScroll)
        return () => window.removeEventListener("resize", checkScroll)
    }, [checkScroll, effectiveViewMode, effectiveOrders])

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Pago", "Pendente", "Enviado", "Cancelado", "Em análise"] },
        { id: "channel", title: "Canal", type: "checkbox-list", options: Array.from(new Set(effectiveOrders?.map((o: any) => o.order_source || "Venda Direta") || [])) as string[] },
    ]

    const filteredOrders: Order[] = useMemo(() => {
        if (!effectiveOrders) return []

        const term = debouncedSearch.toLowerCase()

        const result = effectiveOrders
            .map((o: any): Order => {
                const statusMap: Record<string, { label: string; color: string }> = {
                    paid: { label: "Pago", color: "green" },
                    shipped: { label: "Enviado", color: "blue" },
                    delivered: { label: "Entregue", color: "green" },
                    cancelled: { label: "Cancelado", color: "gray" },
                    in_process: { label: "Em análise", color: "yellow" },
                    pending: { label: "Pendente", color: "gray" },
                }
                const statusInfo = statusMap[o.situation] || { label: o.situation, color: "gray" }
                const deliveryInfo = getDeliveryStatusMeta(o.delivery_status)

                if (o.situation === "partially_paid") {
                    statusInfo.label = "Parcialmente Pago"
                    statusInfo.color = "orange"
                }

                return {
                    originalId: o.id,
                    displayId: o.mp_payment_id || o.order_number || `#${o.id.substring(0, 8)}`,
                    customer_name: o.customer_name || "Cliente Balcão",
                    customer_id: o.buyer_id || "-",
                    total_amount: Number(o.total_amount),
                    statusLabel: statusInfo.label,
                    statusColor: statusInfo.color,
                    deliveryStatusLabel: deliveryInfo.label,
                    deliveryStatusColor: deliveryInfo.variant,
                    isUnfulfilled: (o.situation === "pending" || o.situation === "in_process"),
                    formattedDate: formatDate(o.order_date || o.created_at),
                    formattedTime: formatTime(o.order_date || o.created_at),
                    store_name: o.stores?.name || "-",
                    order_source: o.order_source || "Venda Direta",
                    items_count: o.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || o.quantity || 0,
                    created_at_time: new Date(o.order_date || o.created_at).getTime(),
                    situation: o.situation,
                    previousSituationBeforeCancel: o.previous_situation_before_cancel || null,
                    canEdit: o.situation !== "paid" && o.previous_situation_before_cancel !== "paid",
                    canReopen: o.situation === "cancelled"
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

                return tabMatch && statusFilterMatch && channelFilterMatch
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

    const hasActiveFilters = filters.status.length > 0 || filters.channel.length > 0 || debouncedSearch.length > 0
    const hasOrders = (effectiveOrders?.length || 0) > 0

    // Handlers
    const handleAddOrder = () => {
        setWrapperMode('create')
    }
    const handleEditOrder = (order: Order) => {
        if (!order.canEdit) {
            toast({ title: "Edição bloqueada", description: "Pedidos pagos não podem mais ser editados.", variant: "destructive" })
            return
        }
        setSelectedOrderId(order.originalId)
        setWrapperMode('edit')
    }
    const handleDetailsOrder = (order: Order) => {
        setSelectedOrderId(order.originalId)
        setWrapperMode('view')
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
        setConfirmations(p => ({ ...p, bulkCancel: true }))
    }

    const handleReopenOrder = async (orderId: string) => {
        setSingleCancelId(orderId)
        await confirmBulk("reopen", [orderId])
    }

    const handleBulkEditApply = async (payload: BulkActionPayload) => {
        const ids = Array.from(selection.ids)
        if (ids.length === 0) return

        setActionModal({ open: true, text: "Aplicando alterações..." })

        try {
            if (payload.type === 'delete') {
                const result = await deleteOrdersInBatchAction(ids, partnerId)
                if (result.success) {
                    queryClient.invalidateQueries({ queryKey: ['erp', 'orders', partnerId] })
                    setSelection({ ids: new Set() })
                    toast({ title: "Sucesso", description: `${ids.length} pedidos excluídos` })
                    setBulkEditModal({ isOpen: false })
                } else {
                    toast({ title: "Erro", description: result.error, variant: "destructive" })
                }
            } else if (payload.type === 'order_payment' || payload.type === 'order_delivery') {
                const actionType = payload.type === 'order_payment' ? 'payment_status' : 'delivery_status'
                const result = await updateOrdersStatusInBatchAction({
                    orderIds: ids,
                    partnerId,
                    actionType,
                    statusValue: payload.orderStatus
                })
                if (result.success) {
                    await queryClient.invalidateQueries({ queryKey: ['erp', 'orders', partnerId] })
                    await queryClient.refetchQueries({ queryKey: ['erp', 'orders', partnerId], type: 'active' })
                    setSelection({ ids: new Set() })
                    toast({ title: "Sucesso", description: "Status alterado com sucesso" })
                    setBulkEditModal({ isOpen: false })
                } else {
                    toast({ title: "Erro", description: result.error, variant: "destructive" })
                }
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Falha ao aplicar ação em massa", variant: "destructive" })
        } finally {
            setActionModal({ open: false, text: "" })
        }
    }

    const confirmBulk = async (action: 'delete' | 'cancel' | 'reopen', explicitIds?: string[]) => {
        const ids = explicitIds?.length ? explicitIds : (singleCancelId ? [singleCancelId] : Array.from(selection.ids))
        if (ids.length === 0) return

        setActionModal({ open: true, text: action === 'delete' ? "Excluindo pedidos..." : action === 'reopen' ? "Reabrindo pedidos..." : "Cancelando pedidos..." })

        try {
            let result;
            if (action === 'delete') {
                result = await deleteOrdersInBatchAction(ids, partnerId)
            } else if (action === 'reopen') {
                result = await updateOrdersStatusInBatchAction({
                    orderIds: ids,
                    partnerId,
                    actionType: 'reopen',
                    userName: currentUserName
                })
            } else {
                result = await updateOrdersStatusInBatchAction({
                    orderIds: ids,
                    partnerId,
                    actionType: 'cancel',
                    cancelReason: cancelReason.trim() || undefined,
                    restoreStock: restoreStockOnCancel,
                    userName: currentUserName
                })
            }

            if (result.success) {
                queryClient.invalidateQueries({ queryKey: ['erp', 'orders', partnerId] })
                if (!singleCancelId) setSelection({ ids: new Set() })
                toast({ title: "Sucesso", description: action === 'delete' ? "Pedidos excluídos" : "Pedidos cancelados" })
            } else {
                toast({ title: "Erro", description: result.error, variant: "destructive" })
            }
        } catch (error) {
            console.error(error)
            toast({ title: "Erro", description: "Ocorreu um erro.", variant: "destructive" })
        } finally {
            setConfirmations(p => ({ ...p, bulkDelete: false, bulkCancel: false }))
            setSingleCancelId(null)
            setCancelReason("")
            setRestoreStockOnCancel(true)
            setActionModal({ open: false, text: "" })
        }
    }

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300 overflow-hidden"
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

            <AnimatePresence mode="wait">
                {wrapperMode === 'view' && selectedOrderId ? (
                    <motion.div
                        key="view-order"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-full bg-white dark:bg-dark-background"
                    >
                        <OrderDetailView
                            orderId={selectedOrderId}
                            partnerId={partnerId}
                            onBack={invalidateAndRefresh}
                            onEditOrder={(order: any) => {
                                setSelectedOrderId(order.id)
                                setWrapperMode('edit')
                            }}
                            initialOrder={effectiveOrders?.find((o: any) => o.id === selectedOrderId) || undefined}
                        />
                    </motion.div>
                ) : wrapperMode === 'edit' && selectedOrderId ? (
                    <motion.div
                        key="edit-order"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-full bg-white dark:bg-dark-background"
                    >
                        <CreateOrder
                            partnerId={partnerId}
                            editOrderId={selectedOrderId}
                            onBack={invalidateAndRefresh}
                        />
                    </motion.div>
                ) : wrapperMode === 'create' ? (
                    <motion.div
                        key="create-order"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-full bg-white dark:bg-dark-background"
                    >
                        <CreateOrder
                            partnerId={partnerId}
                            onBack={invalidateAndRefresh}
                        />
                    </motion.div>
                ) : (
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

                                <Button onClick={handleAddOrder}>
                                    <PlusIcon className="w-[18px] h-[18px]" strokeWidth={3} />
                                    Novo Pedido
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

                        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-8 px-4 md:px-8">
                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <motion.div
                                        key="loading"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="flex-1 flex items-center justify-center p-8"
                                    >
                                        <ThreeDotsLoader />
                                    </motion.div>
                                ) : !hasOrders ? (
                                    <motion.div
                                        key="empty-no-data"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                    >
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                            imageAlt="Sem pedidos"
                                            title="Você ainda não tem pedidos"
                                            subtitle="Seus pedidos aparecerão aqui assim que seus clientes começarem a comprar."
                                        />
                                    </motion.div>
                                ) : paginated.length === 0 ? (
                                    <motion.div
                                        key="empty-results"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.4, ease: "easeOut" }}
                                        className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                                    >
                                        <IconPlaceholder
                                            placeholderType="image"
                                            imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                            imageAlt="Nenhum pedido encontrado"
                                            title="Nenhum pedido encontrado"
                                            subtitle="Tente ajustar seus filtros ou termos de busca."
                                            itemButton={{
                                                text: "Limpar Filtros",
                                                action: handleClearFilters,
                                                variant: "outline"
                                            }}
                                        />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key={activeTab + (isMobile ? "mobile" : effectiveViewMode)}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="w-full"
                                    >
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
                                                                    <Badge variant={o.statusColor} className="h-5 text-[10px] px-1.5">
                                                                        {o.statusLabel}
                                                                    </Badge>
                                                                    <Badge variant={o.deliveryStatusColor} className="h-5 text-[10px] px-1.5">
                                                                        {o.deliveryStatusLabel}
                                                                    </Badge>
                                                                    {o.isUnfulfilled && (
                                                                        <Badge variant="gray" className="h-5 text-[10px] px-1.5 opacity-70">
                                                                            Pendente
                                                                        </Badge>
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
                                                        onEdit={() => handleEditOrder(o)}
                                                        canEdit={o.canEdit}
                                                        cancelLabel={o.canReopen ? "Reabrir" : "Cancelar"}
                                                        onCancel={() => o.canReopen ? handleReopenOrder(o.originalId) : openCancelModal(o.originalId)}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="w-full overflow-hidden rounded-xl relative">
                                                <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                                                <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                                                <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                                                    <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
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
                                                                            <div className={`flex items-center gap-1.5 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                                                                                {col.label}
                                                                                {isSortable && (
                                                                                    <ArrowUpDownIcon
                                                                                        size={14}
                                                                                        className={`transition-all duration-200 ${isSorted ? 'text-brand-dark dark:text-dark-heading opacity-100 block' : 'text-brand-inactive-text hidden group-hover:block opacity-40'
                                                                                            } ${isSorted && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`}
                                                                                    />
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
                                                                    canEdit={o.canEdit}
                                                                    cancelLabel={o.canReopen ? "Reabrir" : "Cancelar"}
                                                                    onCancel={() => o.canReopen ? handleReopenOrder(o.originalId) : openCancelModal(o.originalId)}
                                                                    onDetails={handleDetailsOrder}
                                                                />
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {hasOrders && paginated.length > 0 && (
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setPage}
                            />
                        )}
                    </div>
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
                isOpen={false}
                onClose={() => setConfirmations((p) => ({ ...p, bulkDelete: false }))}
                onConfirm={() => confirmBulk("delete")}
                title="Excluir Pedidos"
                message={`Tem certeza que deseja excluir ${selection.ids.size} pedido(s)? Esta ação não pode ser desfeita e pode afetar as estatísticas.`}
                confirmText="Excluir"
                variant="danger"
            />

            <AlertModal
                isOpen={confirmations.bulkCancel}
                onClose={() => {
                    setConfirmations((p) => ({ ...p, bulkCancel: false }))
                    setSingleCancelId(null)
                    setCancelReason("")
                    setRestoreStockOnCancel(true)
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
                            />
                            <label className="flex items-center gap-3 py-2 cursor-pointer">
                                <Checkbox checked={restoreStockOnCancel} onChange={(checked) => setRestoreStockOnCancel(Boolean(checked))} />
                                <span className="text-sm text-brand-dark dark:text-dark-heading">Restaurar estoque dos itens</span>
                            </label>
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
                onApply={handleBulkEditApply}
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
        </motion.div>
    )
}
