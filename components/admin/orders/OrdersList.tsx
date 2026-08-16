"use client"

import { useState, useTransition, useMemo, useEffect, useCallback } from "react"
import { Button, Badge, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import OrderListRow from "./OrderListRow"
import OrdersPageControls, { type OrderFilterState } from "./OrdersPageControls"
import AdminOrderDetailView from "./AdminOrderDetailView"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { PackageIcon, StoreIcon, ExportFileIcon, ListIcon, GridIcon } from "@/lib/icons"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { getAdminMarketplaceOrders, getAdminMarketplaceOrdersStats, type AdminOrderStats } from "@/app/actions/admin/marketplace-ops"
import { useMediaQuery } from "@/components/erp/hooks"
import { formatCurrency, formatDate } from "@/lib/utils"
import { EMPTY_DATE_PERIOD, isDatePeriodFilterActive, resolveDatePeriodBounds } from "@/lib/utils/filter-date-period"
import { toast } from "@/hooks/use-notification"

interface OrdersListProps {
    initialData: CursorPaginatedResult<any>
    initialStats?: AdminOrderStats
}

const INITIAL_FILTERS: OrderFilterState = {
    status: [],
    deliveryStatus: [],
    paymentMethod: [],
    channel: [],
    datePeriod: { ...EMPTY_DATE_PERIOD },
}

const OrdersList = ({ initialData, initialStats }: OrdersListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const [activeTab, setActiveTab] = useState<string>("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // Stats
    const [stats, setStats] = useState<AdminOrderStats | undefined>(initialStats)

    // Filters & Modals
    const [filters, setFilters] = useState<OrderFilterState>(INITIAL_FILTERS)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // Data State
    const [orders, setOrders] = useState<any[]>(initialData.data || [])
    const [isLoading, setIsLoading] = useState(false)
    const [page, setPage] = useState(1)
    const itemsPerPage = 12

    const fetchOrders = useCallback(() => {
        setIsLoading(true)
        startTransition(async () => {
            try {
                const dateBounds = isDatePeriodFilterActive(filters.datePeriod)
                    ? resolveDatePeriodBounds(filters.datePeriod)
                    : { startYmd: null, endYmd: null }

                const [res, statsRes] = await Promise.all([
                    getAdminMarketplaceOrders(null, 100, {
                        status: activeTab,
                        search: debouncedSearch,
                        deliveryStatus: filters.deliveryStatus[0],
                        paymentMethod: filters.paymentMethod[0],
                        channel: filters.channel[0],
                        startDate: dateBounds.startYmd || undefined,
                        endDate: dateBounds.endYmd || undefined,
                    }),
                    getAdminMarketplaceOrdersStats(),
                ])

                setOrders(res.data || [])
                setStats(statsRes)
            } catch (err) {
                console.error("Failed to fetch admin orders:", err)
                toast.error("Erro ao carregar pedidos")
            } finally {
                setIsLoading(false)
            }
        })
    }, [activeTab, debouncedSearch, filters])

    useEffect(() => {
        fetchOrders()
        setPage(1)
    }, [fetchOrders])

    // Filter Config for FilterSheet
    const filterSections: FilterSectionConfig[] = useMemo(() => [
        {
            id: "status",
            title: "Situação do Pedido",
            type: "checkbox-list",
            options: ["Pendente", "Pago", "Enviado", "Cancelado"],
        },
        {
            id: "deliveryStatus",
            title: "Status de Entrega",
            type: "checkbox-list",
            options: ["not_sent", "in_transit", "delivered", "ready_for_pickup"],
        },
        {
            id: "paymentMethod",
            title: "Método de Pagamento",
            type: "checkbox-list",
            options: ["credit_card", "pix", "boleto", "Mercado Pago"],
        },
        {
            id: "channel",
            title: "Origem / Canal",
            type: "checkbox-list",
            options: ["Marketplace", "Loja Virtual", "PDV", "Manual"],
        },
        {
            id: "datePeriod",
            title: "Período do Pedido",
            type: "date-period",
        },
    ], [])

    const hasActiveFilters = useMemo(() => {
        return (
            filters.status.length > 0 ||
            filters.deliveryStatus.length > 0 ||
            filters.paymentMethod.length > 0 ||
            filters.channel.length > 0 ||
            isDatePeriodFilterActive(filters.datePeriod)
        )
    }, [filters])

    // Pagination
    const totalPages = Math.ceil(orders.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return orders.slice(start, start + itemsPerPage)
    }, [orders, page])

    // If viewing detail of a specific order
    if (selectedOrderId) {
        const currentOrder = orders.find(o => o.id === selectedOrderId)
        return (
            <AdminOrderDetailView
                orderId={selectedOrderId}
                initialOrder={currentOrder}
                onBack={() => setSelectedOrderId(null)}
            />
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
                    search={search}
                    onSearchChange={setSearch}
                    onOpenFilter={() => setIsFilterSheetOpen(true)}
                    filters={filters}
                    setFilters={setFilters}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    hasActiveFilters={hasActiveFilters}
                    tabCounts={stats}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Nenhum pedido"
                                    title="Nenhum pedido encontrado"
                                    subtitle={search || hasActiveFilters ? "Tente ajustar seus filtros de busca." : "Nenhum pedido registrado nesta categoria."}
                                    itemButton={search || hasActiveFilters ? {
                                        text: "Limpar Filtros",
                                        action: () => {
                                            setSearch("")
                                            setFilters(INITIAL_FILTERS)
                                        },
                                        variant: "outline",
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full space-y-4">
                                {/* Mobile View (Cards) */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((order) => {
                                        const returns = Array.isArray(order.return_requests) ? order.return_requests : []
                                        return (
                                            <div
                                                key={order.id}
                                                className="py-4 flex flex-col gap-2.5 cursor-pointer active:bg-brand-gray/50 dark:active:bg-dark-border/20 transition-colors"
                                                onClick={() => setSelectedOrderId(order.id)}
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
                                                    <Badge variant={order.situation === "paid" ? "green" : order.situation === "cancelled" ? "red" : "orange"}>
                                                        {order.situation === "paid" ? "Pago" : order.situation === "cancelled" ? "Cancelado" : "Pendente"}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center justify-between text-xs text-brand-inactive-text">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <StoreIcon size={12} className="shrink-0" />
                                                        <span className="truncate">{order.stores?.name || "-"}</span>
                                                    </div>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm shrink-0">
                                                        {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] text-brand-inactive-text pt-1">
                                                    <span>{formatDate(order.created_at)}</span>
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
                                            <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                                <thead>
                                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                        <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Pedido</th>
                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Cliente</th>
                                                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Loja / Seller</th>
                                                        <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Pagamento</th>
                                                        <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Entrega</th>
                                                        <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Total</th>
                                                        <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Itens</th>
                                                        <th className="py-3 px-2 w-28 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Trocas</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedItems.map((order) => (
                                                        <OrderListRow
                                                            key={order.id}
                                                            order={order}
                                                            isPending={isPending}
                                                            onDetail={() => setSelectedOrderId(order.id)}
                                                        />
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    /* Desktop View: Grid */
                                    <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {paginatedItems.map((order) => (
                                            <div
                                                key={order.id}
                                                onClick={() => setSelectedOrderId(order.id)}
                                                className="bg-white dark:bg-dark-surface p-5 rounded-2xl border border-brand-border dark:border-dark-border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-4"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                                            #{order.order_number || order.id.slice(0, 8)}
                                                        </h3>
                                                        <p className="text-xs text-brand-inactive-text mt-0.5">{order.customer_name || "Cliente"}</p>
                                                    </div>
                                                    <Badge variant={order.situation === "paid" ? "green" : order.situation === "cancelled" ? "red" : "orange"}>
                                                        {order.situation === "paid" ? "Pago" : order.situation === "cancelled" ? "Cancelado" : "Pendente"}
                                                    </Badge>
                                                </div>

                                                <div className="text-xs space-y-1.5 text-brand-inactive-text border-t border-b border-brand-border/50 dark:border-dark-border/50 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <StoreIcon size={12} />
                                                        <span className="truncate">{order.stores?.name || "-"}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Itens: {order.order_items?.length || 0}</span>
                                                        <span>{formatDate(order.created_at)}</span>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs text-brand-inactive-text">Valor total</span>
                                                    <span className="font-bold text-base text-brand-green">
                                                        {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

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
        </FadeIn>
    )
}

export default OrdersList

