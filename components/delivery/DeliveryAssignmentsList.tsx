"use client"

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, IconPlaceholder, ThreeDotsLoader, FormDropdown } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import {
    listMyDeliveryAssignmentsAction,
    getDeliveryDashboardAction,
    setMyDeliveryAvailabilityAction,
    getMyDeliveryAssignmentAction,
} from "@/app/actions/delivery-drivers"
import { toast } from "@/hooks/use-notification"
import {
    ReloadIcon,
    ArrowUpDownIcon,
} from "@/lib/icons"
import { useMediaQuery } from "@/components/erp/hooks"
import { useEntityState } from "@/hooks/use-entity-state"
import DeliveryPageControls, {
    type DeliveryTab,
    type DeliveryFilterState,
    INITIAL_DELIVERY_FILTERS,
} from "./DeliveryPageControls"
import DeliveryAssignmentListRow, { type DeliveryAssignmentItem } from "./DeliveryAssignmentListRow"
import DeliveryAssignmentGridCard from "./DeliveryAssignmentGridCard"
import DeliveryAssignmentDetail from "./DeliveryAssignmentDetail"

type SortKey = "order" | "partner" | "customer" | "values" | "status"
type SortDirection = "asc" | "desc"

const ITEMS_PER_PAGE = 8

const FIXED_COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order", label: "Pedido", align: "left" as const, width: "180px" },
    { id: "partner", label: "Estabelecimento", align: "left" as const, width: "180px" },
    { id: "customer", label: "Cliente", align: "left" as const, width: "200px" },
    { id: "address", label: "Endereço", align: "left" as const, width: "240px" },
    { id: "values", label: "Valores", align: "left" as const, width: "130px" },
    { id: "status", label: "Status", align: "center" as const, width: "160px" },
    { id: "actions", label: "Ações", align: "center" as const, width: "70px" },
]

export default function DeliveryAssignmentsList() {
    const isTabletOrMobile = useMediaQuery("(max-width: 1023px)")
    const { state: entityState, open: openEntity, close: closeEntity, isViewing } = useEntityState()
    const viewedId = isViewing ? entityState.entityId : null

    const [activeTab, setActiveTab] = useState<DeliveryTab>("todas")
    const [search, setSearch] = useState("")
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const [currentPage, setCurrentPage] = useState(1)
    const [allItems, setAllItems] = useState<DeliveryAssignmentItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [filters, setFilters] = useState<DeliveryFilterState>(INITIAL_DELIVERY_FILTERS)

    // Detailed item state for ?view=id
    const [viewedAssignment, setViewedAssignment] = useState<any | null>(null)
    const [isLoadingViewed, setIsLoadingViewed] = useState(false)

    // Availability State
    const [availability, setAvailability] = useState<string>("available")
    const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: "status",
        direction: "desc",
    })

    const tableContainerRef = useRef<HTMLDivElement>(null)
    const [scrollState, setScrollState] = useState({ left: false, right: false })

    const handleScroll = useCallback(() => {
        if (!tableContainerRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
        setScrollState({
            left: scrollLeft > 0,
            right: scrollLeft < scrollWidth - clientWidth - 2,
        })
    }, [])

    const loadData = useCallback(async (isRefresh = false) => {
        if (isRefresh) setIsRefreshing(true)
        else setIsLoading(true)

        try {
            const [assignmentsRes, dashboardRes] = await Promise.all([
                listMyDeliveryAssignmentsAction({ bucket: "all", limit: 50 }),
                getDeliveryDashboardAction(),
            ])

            if (assignmentsRes.success) {
                setAllItems(assignmentsRes.items || [])
            } else {
                toast.error(assignmentsRes.error || "Erro ao carregar entregas.")
            }

            if (dashboardRes.success && dashboardRes.data) {
                setAvailability(String(dashboardRes.data.availability || "available"))
            }
        } catch (e: any) {
            toast.error(e?.message || "Erro inesperado ao buscar dados.")
        } finally {
            setIsLoading(false)
            setIsRefreshing(false)
        }
    }, [])

    useEffect(() => {
        if (!viewedId) {
            setViewedAssignment(null)
            return
        }

        const local = allItems.find((it) => it.assignment_id === viewedId)
        if (local) {
            setViewedAssignment(local)
        }

        async function fetchDetails() {
            setIsLoadingViewed(true)
            try {
                const res = await getMyDeliveryAssignmentAction(viewedId!)
                if (res.success && res.data) {
                    setViewedAssignment(res.data)
                }
            } catch (err) {
                console.error("Erro ao buscar detalhes da entrega:", err)
            } finally {
                setIsLoadingViewed(false)
            }
        }
        void fetchDetails()
    }, [viewedId, allItems])

    useEffect(() => {
        void loadData()
    }, [loadData])

    // Reset pagination when tab, search or filters change
    useEffect(() => {
        setCurrentPage(1)
    }, [activeTab, search, filters])

    const changeAvailability = async (value: string) => {
        const nextStatus = value as "available" | "offline"
        setIsAvailabilityLoading(true)
        const result = await setMyDeliveryAvailabilityAction(nextStatus)
        setIsAvailabilityLoading(false)

        if (!result.success) {
            toast.error(result.error || "Não foi possível atualizar a disponibilidade.")
            return
        }

        setAvailability(nextStatus)
        toast.success(
            nextStatus === "available"
                ? "Você está Disponível para receber pedidos!"
                : "Você está Offline."
        )
    }

    // List of partner names for dynamic filter options
    const partnerOptions = useMemo(() => {
        const set = new Set<string>()
        allItems.forEach((it) => {
            if (it.partner_name) set.add(it.partner_name)
        })
        return Array.from(set)
    }, [allItems])

    // Counts per tab
    const tabCounts = useMemo(() => {
        const counts = {
            todas: allItems.length,
            pending: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
        }

        for (const it of allItems) {
            if (["assigned", "accepted"].includes(it.status)) {
                counts.pending++
            } else if (["picked_up", "out_for_delivery"].includes(it.status)) {
                counts.in_progress++
            } else if (it.status === "delivered") {
                counts.completed++
            } else if (["failed", "cancelled"].includes(it.status)) {
                counts.failed++
            }
        }

        return counts
    }, [allItems])

    // Filter by tab, search query & advanced filters
    const filteredItems = useMemo(() => {
        return allItems.filter((item) => {
            // Tab filtering
            if (activeTab === "pending" && !["assigned", "accepted"].includes(item.status)) return false
            if (activeTab === "in_progress" && !["picked_up", "out_for_delivery"].includes(item.status)) return false
            if (activeTab === "completed" && item.status !== "delivered") return false
            if (activeTab === "failed" && !["failed", "cancelled"].includes(item.status)) return false

            // Partner name filter
            if (
                filters.partnerNames.length > 0 &&
                !filters.partnerNames.includes(item.partner_name || "")
            ) {
                return false
            }

            // Payment method filter
            if (filters.paymentMethods.length > 0) {
                const method = String(item.payment_method || "").toLowerCase()
                const matches = filters.paymentMethods.some((pm) => {
                    const normalized = pm.toLowerCase()
                    if (normalized.includes("dinheiro") && method.includes("dinheiro")) return true
                    if (normalized.includes("pix") && method.includes("pix")) return true
                    if (normalized.includes("crédito") && (method.includes("crédito") || method.includes("credito"))) return true
                    if (normalized.includes("débito") && (method.includes("débito") || method.includes("debito"))) return true
                    return method.includes(normalized)
                })
                if (!matches) return false
            }

            // Status filter
            if (filters.status.length > 0) {
                const statusMap: Record<string, string> = {
                    "Atribuída": "assigned",
                    "Aceita": "accepted",
                    "Retirada no Local": "picked_up",
                    "Em Rota de Entrega": "out_for_delivery",
                    "Entregue": "delivered",
                    "Falha na Entrega": "failed",
                    "Cancelada": "cancelled",
                }
                const selectedCodes = filters.status.map((s) => statusMap[s] || s)
                if (!selectedCodes.includes(item.status)) return false
            }

            // Search filtering
            if (search.trim()) {
                const q = search.trim().toLowerCase()
                const orderNum = String(item.order_number || item.order_id || "").toLowerCase()
                const partner = String(item.partner_name || "").toLowerCase()
                const customer = String(item.customer_name || "").toLowerCase()
                const address = String(item.delivery_address || "").toLowerCase()
                const phone = String(item.customer_phone || "").replace(/\D/g, "")
                const qPhone = q.replace(/\D/g, "")

                const matchesText =
                    orderNum.includes(q) ||
                    partner.includes(q) ||
                    customer.includes(q) ||
                    address.includes(q)
                const matchesPhone = qPhone && phone.includes(qPhone)

                if (!matchesText && !matchesPhone) return false
            }

            return true
        })
    }, [allItems, activeTab, search, filters])

    // Sorted items
    const sortedItems = useMemo(() => {
        const list = [...filteredItems]
        const { key, direction } = sortConfig

        list.sort((a, b) => {
            let res = 0
            if (key === "status") {
                const dateA = new Date(a.assigned_at || 0).getTime()
                const dateB = new Date(b.assigned_at || 0).getTime()
                res = dateA - dateB
            } else if (key === "values") {
                res = (a.total_amount || 0) - (b.total_amount || 0)
            } else if (key === "order") {
                const numA = Number(a.order_number) || 0
                const numB = Number(b.order_number) || 0
                res = numA - numB
            } else if (key === "partner") {
                res = String(a.partner_name || "").localeCompare(String(b.partner_name || ""))
            } else if (key === "customer") {
                res = String(a.customer_name || "").localeCompare(String(b.customer_name || ""))
            }
            return direction === "asc" ? res : -res
        })

        return list
    }, [filteredItems, sortConfig])

    // Paginated slice
    const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE) || 1
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return sortedItems.slice(start, start + ITEMS_PER_PAGE)
    }, [sortedItems, currentPage])

    const handleSort = (key: SortKey) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }))
    }

    const hasAnyDeliveries = allItems.length > 0
    const isOccupied = availability === "occupied"
    const isAvailable = availability === "available"

    // Effective view mode: on tablet/mobile it's always grid
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode

    if (isViewing && viewedId) {
        if (isLoadingViewed && !viewedAssignment) {
            return (
                <div className="w-full h-full flex items-center justify-center min-h-[400px]">
                    <ThreeDotsLoader />
                </div>
            )
        }

        if (viewedAssignment) {
            return (
                <DeliveryAssignmentDetail
                    assignment={viewedAssignment}
                    onBack={closeEntity}
                />
            )
        }
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
                {/* DESKTOP HEADER */}
                <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
                    <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                Minhas Entregas
                            </h1>
                        </div>
                        <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                            Gerencie e acompanhe todos os pedidos e rotas atribuídos a você.
                        </p>
                    </div>

                    {/* TOP CONTROLS: AVAILABILITY & REFRESH */}
                    <div className="flex items-center gap-3">
                        {/* AVAILABILITY SELECTOR VIA FORMDROPDOWN */}
                        <div className="flex items-center gap-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-1 shadow-xs">
                            <div className="flex items-center gap-2 pl-2 pr-1">
                                <span
                                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOccupied
                                        ? "bg-amber-500 animate-pulse"
                                        : isAvailable
                                            ? "bg-emerald-500 animate-pulse"
                                            : "bg-gray-400"
                                        }`}
                                />
                            </div>
                            <div className="w-36">
                                <FormDropdown
                                    value={isOccupied ? "available" : availability}
                                    setValue={changeAvailability}
                                    disabled={isAvailabilityLoading || isOccupied}
                                    options={[
                                        { value: "available", label: "Disponível" },
                                        { value: "offline", label: "Offline" },
                                    ]}
                                    className="border-0 bg-transparent text-xs font-semibold"
                                />
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadData(true)}
                            disabled={isRefreshing || isLoading}
                            className="shrink-0"
                        >
                            <ReloadIcon size={15} className={isRefreshing ? "animate-spin" : ""} />
                        </Button>
                    </div>
                </div>

                {/* MOBILE AVAILABILITY BAR */}
                <div className="md:hidden flex items-center justify-between gap-2 px-4 mb-3">
                    <div className="flex-1 flex items-center gap-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-1 shadow-xs">
                        <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ml-2 ${isOccupied
                                ? "bg-amber-500 animate-pulse"
                                : isAvailable
                                    ? "bg-emerald-500 animate-pulse"
                                    : "bg-gray-400"
                                }`}
                        />
                        <div className="flex-1">
                            <FormDropdown
                                value={isOccupied ? "available" : availability}
                                setValue={changeAvailability}
                                disabled={isAvailabilityLoading || isOccupied}
                                options={[
                                    { value: "available", label: "Disponível" },
                                    { value: "offline", label: "Offline" },
                                ]}
                                className="border-0 bg-transparent text-xs font-semibold"
                            />
                        </div>
                    </div>

                    <Button
                        variant="outline"
                        onClick={() => loadData(true)}
                        disabled={isRefreshing || isLoading}
                        className="h-10 px-3 shrink-0"
                    >
                        <ReloadIcon size={16} className={isRefreshing ? "animate-spin" : ""} />
                    </Button>
                </div>

                {hasAnyDeliveries && (
                    <DeliveryPageControls
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        tabCounts={tabCounts}
                        search={search}
                        onSearchChange={setSearch}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        filters={filters}
                        setFilters={setFilters}
                        partnerOptions={partnerOptions}
                    />
                )}

                {/* CONTENT AREA */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-0 px-4 md:px-8">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                                <ThreeDotsLoader />
                            </FadeIn>
                        ) : !hasAnyDeliveries ? (
                            <FadeIn
                                key="empty-no-data"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/Entregas.png"
                                    imageAlt="Sem entregas"
                                    title="Você ainda não tem entregas"
                                    subtitle="Quando novos pedidos forem atribuídos a você pelos lojistas, eles aparecerão aqui."
                                    itemButton={{
                                        text: "Atualizar entregas",
                                        action: () => loadData(true),
                                    }}
                                />
                            </FadeIn>
                        ) : paginatedItems.length === 0 ? (
                            <FadeIn
                                key="empty-search"
                                className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full"
                            >
                                <IconPlaceholder
                                    placeholderType="image"
                                    imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                                    imageAlt="Nenhuma entrega encontrada"
                                    title="Nenhuma entrega encontrada"
                                    subtitle="Tente ajustar os termos de busca ou limpar os filtros selecionados."
                                    itemButton={{
                                        text: "Limpar filtros",
                                        action: () => {
                                            setSearch("")
                                            setActiveTab("todas")
                                            setFilters(INITIAL_DELIVERY_FILTERS)
                                        },
                                        variant: "outline",
                                    }}
                                />
                            </FadeIn>
                        ) : effectiveViewMode === "grid" ? (
                            /* GRID VIEW */
                            <FadeIn key={`grid-${activeTab}`} className="w-full">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                                    {paginatedItems.map((assignment) => (
                                        <DeliveryAssignmentGridCard
                                            key={assignment.assignment_id}
                                            assignment={assignment}
                                            onView={(item) => openEntity("view", item.assignment_id)}
                                        />
                                    ))}
                                </div>
                            </FadeIn>
                        ) : (
                            /* LIST / TABLE VIEW */
                            <FadeIn key={`list-${activeTab}`} className="w-full">
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div
                                        className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"
                                            }`}
                                    />
                                    <div
                                        className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"
                                            }`}
                                    />

                                    <div
                                        className="overflow-x-auto pb-4 custom-scrollbar"
                                        ref={tableContainerRef}
                                        onScroll={handleScroll}
                                    >
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    {FIXED_COLUMNS.map((col) => {
                                                        const isSorted = sortConfig.key === col.id
                                                        return (
                                                            <th
                                                                key={col.id}
                                                                className={`py-3 px-2 pl-6 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                                                                    } ${col.id !== "actions" ? "cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading" : ""} group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : col.id === "order" ? "rounded-l-lg" : ""
                                                                    }`}
                                                                style={{ width: col.width }}
                                                                onClick={() => {
                                                                    if (col.id === "actions") return
                                                                    const sortKey = col.id as SortKey
                                                                    handleSort(sortKey)
                                                                }}
                                                            >
                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                    <span>{col.label}</span>
                                                                    {col.id !== "actions" && (
                                                                        <div className={`flex items-center ${col.align === "center" ? "absolute -right-5" : "ml-1.5"}`}>
                                                                            <ArrowUpDownIcon
                                                                                size={14}
                                                                                className={`transition-all duration-200 ${isSorted ? "text-brand-dark dark:text-dark-heading opacity-100 block" : "text-brand-inactive-text hidden group-hover:block opacity-40"} ${isSorted && sortConfig.direction === "desc" ? "rotate-180" : ""}`}
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
                                                {paginatedItems.map((assignment) => (
                                                    <DeliveryAssignmentListRow
                                                        key={assignment.assignment_id}
                                                        assignment={assignment}
                                                        onView={(item) => openEntity("view", item.assignment_id)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </FadeIn>
                        )}
                    </AnimatePresence>

                    {/* PAGINATION */}
                    {!isLoading && hasAnyDeliveries && paginatedItems.length > 0 && totalPages > 1 && (
                        <div className="pt-4">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
                        </div>
                    )}
                </div>
            </div>
        </FadeIn>
    )
}