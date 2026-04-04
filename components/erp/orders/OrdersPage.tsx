"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useStore } from "@/lib/store-context"

// Components
import { Button, IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
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
    ShoppingCart
} from "@/lib/icons"
import { useRouter } from "next/navigation"

// --- TYPES & INTERFACES ---

interface Order {
    originalId: string;
    displayId: string;
    customer_name: string;
    customer_id: string | null;
    total_amount: number;
    statusLabel: string;
    statusColor: any;
    isUnfulfilled: boolean;
    formattedDate: string;
    store_name: string;
    items_count: number;
    created_at_time: number;
    situation: string;
}

interface FilterState {
    status: string[]
    channel: string[]
}

const INITIAL_FILTERS: FilterState = {
    status: [],
    channel: [],
}

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_id", label: "Pedido", align: "left", width: "200px" },
    { id: "total", label: "Total", align: "left", width: "150px" },
    { id: "status", label: "Status", align: "left", width: "220px" },
    { id: "customer", label: "Cliente", align: "left", width: "250px" },
    { id: "date", label: "Data", align: "left", width: "150px" },
    { id: "channel", label: "Canal", align: "left", width: "150px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

export default function OrdersPage({ orders: rawOrders, partnerId }: { orders: any[], partnerId: string }) {
    const { toast } = useToast()
    const router = useRouter()
    const { selectedStore, isLoading: storeLoading } = useStore()
    const isMobile = useMediaQuery("(max-width: 767px)")

    // State
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [activeTab, setActiveTab] = useState<"Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado">("Todos")
    const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
    const [page, setPage] = useState(1)
    const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS)
    const [modals, setModals] = useState({ filter: false })
    const [selection, setSelection] = useState({ ids: new Set<string>() })
    const [wrapperMode, setWrapperMode] = useState<'create' | 'edit' | 'view' | null>(null)
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

    const isLoading = storeLoading && rawOrders === undefined
    const itemsPerPage = 12

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

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
    }, [checkScroll, viewMode, rawOrders])

    const filterSections: FilterSectionConfig[] = [
        { id: "status", title: "Status", type: "checkbox-list", options: ["Pago", "Pendente", "Enviado", "Cancelado", "Em análise"] },
        { id: "channel", title: "Canal", type: "checkbox-list", options: Array.from(new Set(rawOrders?.map(o => o.stores?.name || "Loja Principal") || [])) as string[] },
    ]

    const filteredOrders: Order[] = useMemo(() => {
        if (!rawOrders) return []

        const term = debouncedSearch.toLowerCase()

        return rawOrders
            .map((o: any): Order => {
                const statusMap: Record<string, { label: string; color: string }> = {
                    paid: { label: "Pago", color: "green" },
                    shipped: { label: "Enviado", color: "blue" },
                    delivered: { label: "Entregue", color: "green" },
                    cancelled: { label: "Cancelado", color: "red" },
                    in_process: { label: "Em análise", color: "yellow" },
                    pending: { label: "Pendente", color: "gray" },
                }
                const statusInfo = statusMap[o.situation] || { label: o.situation, color: "gray" }

                return {
                    originalId: o.id,
                    displayId: o.mp_payment_id || o.order_number || `#${o.id.substring(0, 8)}`,
                    customer_name: o.customer_name || "Cliente Balcão",
                    customer_id: o.buyer_id ? `CST-${o.buyer_id.substring(0, 4).toUpperCase()}` : "-",
                    total_amount: Number(o.total_amount),
                    statusLabel: statusInfo.label,
                    statusColor: statusInfo.color,
                    isUnfulfilled: (o.situation === "pending" || o.situation === "in_process"),
                    formattedDate: new Date(o.order_date || o.created_at).toLocaleDateString('pt-BR'),
                    store_name: o.stores?.name || "Loja Principal",
                    items_count: o.order_items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || o.quantity || 0,
                    created_at_time: new Date(o.order_date || o.created_at).getTime(),
                    situation: o.situation
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
                const channelFilterMatch = filters.channel.length === 0 || filters.channel.includes(o.store_name)

                return tabMatch && statusFilterMatch && channelFilterMatch
            })
            .sort((a, b) => b.created_at_time - a.created_at_time)
    }, [rawOrders, debouncedSearch, activeTab, filters])

    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage)
    const paginated = filteredOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    const hasActiveFilters = filters.status.length > 0 || filters.channel.length > 0 || debouncedSearch.length > 0
    const hasOrders = (rawOrders?.length || 0) > 0

    // Handlers
    const handleAddOrder = () => {
        setWrapperMode('create')
    }
    const handleEditOrder = (order: Order) => {
        router.push(`/erp/orders/${order.originalId}`)
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

    const handleClearFilters = () => {
        setSearch("")
        setFilters(INITIAL_FILTERS)
        setActiveTab("Todos")
    }

    if (wrapperMode === 'view' && selectedOrderId) {
        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key="view-order"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full h-full bg-white dark:bg-dark-background fixed inset-0 z-[60]"
                >
                    <OrderDetailView
                        orderId={selectedOrderId}
                        partnerId={partnerId}
                        onBack={() => {
                            setWrapperMode(null)
                            setSelectedOrderId(null)
                            router.refresh()
                        }}
                        onEditOrder={(order: any) => {
                            setSelectedOrderId(order.id)
                            setWrapperMode('edit')
                        }}
                    />
                </motion.div>
            </AnimatePresence>
        )
    }

    if (wrapperMode === 'create') {
        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key="create-order"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full h-full bg-white dark:bg-dark-background"
                >
                    <CreateOrder
                        partnerId={partnerId}
                        onBack={() => {
                            setWrapperMode(null)
                            router.refresh()
                        }}
                    />
                </motion.div>
            </AnimatePresence>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
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
                            <ThreeDotsLoader key="loading" />
                        ) : !hasOrders ? (
                            <motion.div key="empty-no-data" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                                    imageAlt="Sem pedidos"
                                    title="Você ainda não tem pedidos"
                                    subtitle="Seus pedidos aparecerão aqui assim que seus clientes começarem a comprar."
                                />
                            </motion.div>
                        ) : paginated.length === 0 ? (
                            <motion.div key="empty-results" className="w-full h-full flex items-center justify-center min-h-[500px]">
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/clientes/NaoEncontrado.png"
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
                                key={viewMode}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-full"
                            >
                                {viewMode === "grid" ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                        {paginated.map((o: Order) => (
                                            <OrderGridCard
                                                key={o.originalId}
                                                order={o}
                                                selected={selection.ids.has(o.originalId)}
                                                onSelect={() => handleSelectRow(o.originalId)}
                                                onDetails={() => handleDetailsOrder(o)}
                                                onEdit={() => handleEditOrder(o)}
                                                onDelete={() => { }}
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
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 rounded border-brand-border"
                                                                    checked={selection.ids.size === paginated.length && paginated.length > 0}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked
                                                                        setSelection({ ids: checked ? new Set(paginated.map((x: Order) => x.originalId)) : new Set() })
                                                                    }}
                                                                />
                                                            </div>
                                                        </th>
                                                        {COLUMNS.map((col, idx) => (
                                                            <th
                                                                key={col.id}
                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""}`}
                                                                style={{ width: col.width }}
                                                            >
                                                                <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : ""}`}>
                                                                    {col.label}
                                                                </div>
                                                            </th>
                                                        ))}
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
                                                            onDelete={() => { }}
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

                {!isLoading && filteredOrders.length > itemsPerPage && (
                    <div className="flex justify-center mb-8 mt-4">
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </div>

            <FilterSheet
                isOpen={modals.filter}
                onClose={() => setModals({ filter: false })}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => setFilters(INITIAL_FILTERS)}
            />
        </motion.div>
    )
}
