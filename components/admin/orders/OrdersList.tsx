"use client"

import { useState, useTransition, useRef, useMemo, useEffect } from "react"
import { Button, Badge, Input, IconPlaceholder, ThreeDotsLoader, Pagination } from "@/components/reusable"
import OrderListRow from "./OrderListRow"
import OrdersPageControls from "./OrdersPageControls"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import { PackageIcon, StoreIcon, XIcon, InfoIcon, ClockIcon, ReturnIcon } from "@/lib/icons"
import type { CursorPaginatedResult } from "@/lib/admin/types"
import { getAdminMarketplaceOrders } from "@/app/actions/admin/marketplace-ops"
import BottomSheet from "@/components/BottomSheet"
import Portal from "@/components/Portal"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityPage } from "@/hooks/use-entity-page"
import { toast } from "@/hooks/use-notification"
import { formatCurrency, formatDate } from "@/lib/utils"

// ─── Main Component ─────────────────────────────────────────────────────────

interface OrdersListProps {
    initialData: CursorPaginatedResult<any>
}

const OrdersList = ({ initialData }: OrdersListProps) => {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const observerTarget = useRef<HTMLDivElement>(null)
    const [statusTab, setStatusTab] = useState("all")
    const [detailOrder, setDetailOrder] = useState<any>(null)
    const [isPending, startTransition] = useTransition()

    // Search state
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(t)
    }, [search])

    // ─── Entity Page ──────────────────────────────────────────────────────────
    const entityPage = useEntityPage<any, any, string>({
        entityType: 'admin-orders',
        partnerId: 'admin',
        queryKey: ['admin', 'orders', statusTab, debouncedSearch],
        initialItems: (debouncedSearch === "" && statusTab === "all") ? initialData.data : [],
        initialNextCursor: (debouncedSearch === "" && statusTab === "all") ? initialData.nextCursor : null,
        initialHasMore: (debouncedSearch === "" && statusTab === "all") ? initialData.hasMore : true,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAdminMarketplaceOrders(cursor, 40, { status: statusTab === "all" ? undefined : statusTab, search: debouncedSearch })
            return { items: res.data, nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: (o) => o.id,
        getDetailFn: async () => null,
    })

    const {
        items: rawOrders, hasNextPage, isFetchingNextPage, isListLoading, fetchNextPage, afterMutation,
    } = entityPage

    // Pagination
    const [page, setPage] = useState(1)
    const itemsPerPage = 8
    const totalPages = Math.ceil(rawOrders.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return rawOrders.slice(start, start + itemsPerPage)
    }, [rawOrders, page])

    // Reset page when filters change
    useEffect(() => { setPage(1) }, [debouncedSearch, statusTab])

    return (
        <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
            <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">

                {/* Header Title/Subtitle (ERP Standard) */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                            Pedidos
                        </h1>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie os pedidos do marketplace com pagamento, estoque e histórico.
                        </p>
                    </div>
                </div>

                {/* Page Controls */}
                <OrdersPageControls
                    search={search}
                    setSearch={setSearch}
                    statusTab={statusTab}
                    setStatusTab={setStatusTab}
                />

                {/* List Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-6 relative">
                    <AnimatePresence mode="wait">
                        {paginatedItems.length === 0 && !isListLoading ? (
                            <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhum pedido"
                                    title="Nenhum pedido encontrado"
                                    subtitle={search ? "Tente ajustar sua busca." : "Nenhum pedido no momento."}
                                    itemButton={search ? {
                                        text: "Limpar Busca",
                                        action: () => setSearch(""),
                                        variant: "outline"
                                    } : undefined}
                                />
                            </FadeIn>
                        ) : isListLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[500px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : (
                            <FadeIn key="list" className="w-full">
                                {/* Mobile/Tablet View */}
                                <div className="md:hidden flex flex-col w-full divide-y divide-brand-border dark:divide-dark-border">
                                    {paginatedItems.map((order) => {
                                        const returns = Array.isArray(order.return_requests) ? order.return_requests : []
                                        const exchangeOrder = order.exchange_parent_order_id || order.exchange_return_request_id
                                        return (
                                            <div
                                                key={order.id}
                                                className="py-5 flex flex-col gap-3 cursor-pointer"
                                                onClick={() => setDetailOrder(order)}
                                            >
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                            {order.order_number || order.id.slice(0, 8)}
                                                        </span>
                                                        <span className="text-xs font-medium text-brand-inactive-text">
                                                            {order.customer_name || "Cliente"}
                                                        </span>
                                                    </div>
                                                    <Badge variant="blue">
                                                        {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                                                    </Badge>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Badge variant={order.situation === "paid" ? "green" : order.situation === "cancelled" ? "red" : "orange"}>
                                                        {order.situation || "N/A"}
                                                    </Badge>
                                                    <span className="text-xs text-brand-inactive-text ml-auto">
                                                        {formatDate(order.created_at)}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text">
                                                    <StoreIcon size={12} />
                                                    <span>{order.partners?.store_name || order.partners?.business_type || "-"}</span>
                                                    <span className="ml-auto">{order.order_items?.length || 0} itens</span>
                                                    {returns.length > 0 && (
                                                        <span className="text-brand-orange">{returns.length} troca(s)</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 px-2 pl-6 rounded-l-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight">Pedido</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Cliente</th>
                                                    <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight">Seller</th>
                                                    <th className="py-3 px-2 w-32 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Pagamento</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Entrega</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Total</th>
                                                    <th className="py-3 px-2 w-28 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 tracking-tight text-center">Impacto</th>
                                                    <th className="py-3 px-2 w-24 pr-6 rounded-r-lg bg-brand-gray dark:bg-dark-border/50 text-[13px] font-medium text-gray-500 dark:text-dark-body tracking-tight text-center">Histórico</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedItems.map((order) => (
                                                    <OrderListRow
                                                        key={order.id}
                                                        order={order}
                                                        isPending={isPending}
                                                        onDetail={setDetailOrder}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <Pagination
                                        currentPage={page}
                                        totalPages={totalPages}
                                        onPageChange={(p) => {
                                            setPage(p)
                                            if (p >= totalPages - 1 && hasNextPage && !isFetchingNextPage) {
                                                void fetchNextPage()
                                            }
                                        }}
                                    />
                                )}
                            </FadeIn>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Detail Sheet */}
            <OrderDetailsSheet
                order={detailOrder}
                isOpen={!!detailOrder}
                onClose={() => setDetailOrder(null)}
            />
        </FadeIn>
    )
}

export default OrdersList

// ─── Detail Sheet Sub-component ──────────────────────────────────────────────

interface OrderDetailsSheetProps {
    order: any | null
    isOpen: boolean
    onClose: () => void
}

function OrderDetailsSheet({ order, isOpen, onClose }: OrderDetailsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const returns = Array.isArray(order?.return_requests) ? order.return_requests : []
    const exchangeOrder = order?.exchange_parent_order_id || order?.exchange_return_request_id

    const content = order ? (
        <div className="flex flex-col h-full bg-white dark:bg-dark-surface">
            {/* Header */}
            <header className="z-10 shrink-0 flex items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Detalhes do Pedido</h2>
                    <p className="text-[10px] font-bold text-brand-inactive-text opacity-70 tracking-widest uppercase font-mono truncate max-w-[300px]">
                        {order.order_number || order.id.slice(0, 8)}
                    </p>
                </div>
                <Button variant="filled" onClick={onClose} size="icon">
                    <XIcon className="w-5 h-5" />
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {/* Header Info */}
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border/30 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <PackageIcon className="w-7 h-7 text-brand-inactive-text" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading leading-tight">
                            {order.order_number || order.id.slice(0, 8)}
                        </h3>
                        <p className="text-xs text-brand-inactive-text mt-0.5">
                            {formatDate(order.created_at)}
                        </p>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="p-4 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border space-y-4">
                    <div className="flex items-start gap-3">
                        <StoreIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Cliente</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{order.customer_name || "Cliente"}</span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <StoreIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Vendedor</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{order.partners?.store_name || order.partners?.business_type || "-"}</span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <InfoIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Pagamento</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {order.situation || "-"} — {order.payment_method || order.payment_provider || "-"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <InfoIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Entrega</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{order.delivery_status || "-"}</span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <InfoIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Total pago</span>
                            <span className="text-sm font-bold text-brand-green">
                                {formatCurrency(Number(order.amount_paid || order.paid_amount || order.total_amount || 0))}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pt-4 border-t border-brand-border/50 dark:border-dark-border/50">
                        <PackageIcon className="w-5 h-5 text-brand-inactive-text mt-0.5" />
                        <div>
                            <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body block">Itens</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {order.order_items?.length || 0} produto(s)
                            </span>
                            {order.order_items?.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {order.order_items.slice(0, 5).map((item: any) => (
                                        <div key={item.id} className="text-xs text-brand-inactive-text flex justify-between">
                                            <span className="truncate max-w-[180px]">{item.product_name || "Item"}</span>
                                            <span className="font-bold ml-2">x{item.quantity || 1}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Exchange/Return Info */}
                {exchangeOrder && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20">
                        <div className="flex gap-3">
                            <ReturnIcon className="text-blue-600 shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Pedido de Troca Vinculado</p>
                                <p className="text-xs text-blue-800 dark:text-blue-400 leading-relaxed mt-1">
                                    Este pedido possui uma solicitação de troca ativa.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {returns.length > 0 && (
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border border-orange-100 dark:border-orange-900/20">
                        <div className="flex gap-3">
                            <ReturnIcon className="text-orange-600 shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-bold text-orange-900 dark:text-orange-300">
                                    {returns.length} Solicitação(ões) de Troca/Devolução
                                </p>
                                <p className="text-xs text-orange-800 dark:text-orange-400 leading-relaxed mt-1">
                                    Este pedido possui solicitações de troca ou devolução registradas.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Order Source */}
                {order.order_source && (
                    <div className="bg-brand-gray/30 dark:bg-dark-border/10 rounded-xl p-3 text-center">
                        <span className="text-xs font-bold text-brand-inactive-text">
                            Origem: {order.order_source}
                        </span>
                    </div>
                )}
            </div>
        </div>
    ) : null

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-96 md:w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-transform duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0" : "translate-x-[120%]"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
