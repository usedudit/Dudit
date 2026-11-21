"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "@/components/erp/hooks"
import { useToast } from "@/hooks/use-toast"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { Button, Checkbox, DefaultModal, FormDropdown, IconPlaceholder, Input, SelectionBanner, ThreeDotsLoader } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { FadeIn } from "@/components/animations/FadeIn"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { ShareModal } from "@/components/marketplace/ShareModal"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import { BulkEditActionsModal, BulkActionPayload } from "@/components/reusable/BulkEditActionsModal"
import ServiceOrderListRow from "@/components/erp/service-orders/ServiceOrderListRow"
import ServiceOrderGridCard from "@/components/erp/service-orders/ServiceOrderGridCard"
import ServiceOrderForm from "@/components/erp/service-orders/ServiceOrderForm"
import ServiceOrderDetail from "@/components/erp/service-orders/ServiceOrderDetail"
import ServiceOrderPageControls from "@/components/erp/service-orders/ServiceOrderPageControls"
import {
    PlusIcon, WrenchIcon, SearchIcon, FilterIcon, TrashIcon,
    ListIcon, GridIcon, ArrowUpDownIcon, ClockIcon, CheckCircleIcon, BlockedIcon, ExportFileIcon,
} from "@/lib/icons"
import { useErpExport } from "@/hooks/use-erp-export"
import { usePermissions, PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"
import {
    EMPTY_DATE_PERIOD,
    isDatePeriodFilterActive,
    resolveDatePeriodBounds,
    summarizeDatePeriodFilter,
    type DatePeriodFilterValue,
} from "@/lib/utils/filter-date-period"
import {
    getAdminServiceOrders,
    getAdminServiceOrderDetail,
    updateAdminServiceOrder,
    deleteAdminServiceOrder,
    updateAdminServiceOrderStatus,
    type AdminServiceOrderStats,
} from "@/app/actions/admin/service-orders"
import { SERVICE_ORDER_STATUS_META, getServiceOrderNextStatuses, type ServiceOrderStatus } from "@/lib/types/service-order"
import OSSPrintModal from "@/components/erp/service-orders/OSSPrintModal"
import { useAdminActionModal } from "@/components/admin/AdminActionModal"
import { diffChangedFields } from "@/lib/admin/changed-fields"
import { useDebouncedSearch } from "@/hooks/use-debounced-search"

const SERVICE_STATUS_ORDER: string[] = [
    "aberta", "aguardando_aprovacao", "aprovada", "em_andamento",
    "aguardando_peca", "concluida", "entregue"
]

function doesServiceTransitionRequireReason(currentStatus: string, nextStatus: string): boolean {
    if (currentStatus === "cancelada" || nextStatus === "cancelada") return false
    const currentIdx = SERVICE_STATUS_ORDER.indexOf(currentStatus)
    const nextIdx = SERVICE_STATUS_ORDER.indexOf(nextStatus)
    if (currentIdx === -1 || nextIdx === -1) return false
    return nextIdx < currentIdx
}

const CHANGE_STATUS_REASONS = [
    { value: "operational_error", label: "Erro operacional / Clique acidental" },
    { value: "client_request", label: "Solicitação do cliente" },
    { value: "rework", label: "Retrabalho necessário" },
    { value: "logistics_issue", label: "Problema logístico" },
    { value: "other", label: "Outro" }
]

const TAB_STATUSES: Record<string, string[]> = {
    all: [],
    aberta: ["aberta", "aguardando_aprovacao", "aprovada"],
    em_andamento: ["em_andamento", "aguardando_peca"],
    concluida: ["concluida", "entregue"],
    cancelada: ["cancelada"],
}

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
    { id: "order_number", label: "Nº OS", align: "left", width: "150px" },
    { id: "title", label: "Título", align: "left", width: "230px" },
    { id: "seller", label: "Vendedor", align: "left", width: "180px" },
    { id: "customer", label: "Cliente", align: "left", width: "180px" },
    { id: "assigned", label: "Responsável", align: "left", width: "160px" },
    { id: "date", label: "Data Prev.", align: "left", width: "120px" },
    { id: "total", label: "Total", align: "left", width: "120px" },
    { id: "status", label: "Status", align: "center", width: "140px" },
    { id: "actions", label: "Ações", align: "center", width: "80px" },
]

interface ServiceOrdersListProps {
    initialData: any[]
    initialStats?: AdminServiceOrderStats
    initialNextCursor?: any
    initialHasMore?: boolean
}

export default function ServiceOrdersList({
    initialData: rawOrders,
    initialStats,
    initialNextCursor,
    initialHasMore = false,
}: ServiceOrdersListProps) {
    const { toast } = useToast()
    const { modal: actionModal, runAction } = useAdminActionModal()
    const [isDeleting, setIsDeleting] = useState(false)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const isTabletOrMobile = useMediaQuery("(max-width: 1024px)")

    // Search - DECLARED BEFORE useEntityPage
    const { search, setSearch, debouncedSearch } = useDebouncedSearch()

    // Filters - DECLARED BEFORE useEntityPage
    const [filters, setFilters] = useState<any>({
        status: [],
        total: { min: "", max: "" },
        expected_completion_date: { presets: [], from: "", to: "" },
    })
    const [activeTab, setActiveTab] = useState<"all" | "aberta" | "em_andamento" | "concluida" | "cancelada">("all")
    const [viewMode, setViewMode] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
    const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode
    const [page, setPage] = useState(1)
    const [selection, setSelection] = useState<Set<string>>(new Set())
    const [showFilters, setShowFilters] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [showShareModal, setShowShareModal] = useState<{ id: string; token: string; loading?: boolean } | null>(null)
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
    const [statusModal, setStatusModal] = useState<{ orderId: string; currentStatus: string; nextStatus: string } | null>(null)
    const [statusWarningModal, setStatusWarningModal] = useState<{ isOpen: boolean; orderId: string; currentStatus: string; nextStatus: string; reasonValue: string; customReason: string } | null>(null)
    const [simpleConfirmModal, setSimpleConfirmModal] = useState<{ isOpen: boolean; orderId: string; nextStatus: string } | null>(null)
    const [printOrderId, setPrintOrderId] = useState<string | null>(null)
    const itemsPerPage = 10

    const isDefaultView = activeTab === "all" && !isDatePeriodFilterActive(filters.expected_completion_date)

    const entityPage = useEntityPage<any, any, any>({
        entityType: "service_orders",
        partnerId: "admin",
        queryKey: ["admin-service-orders", activeTab, debouncedSearch, filters.expected_completion_date],
        initialItems: rawOrders,
        initialNextCursor,
        initialHasMore,
        skipInitialData: !isDefaultView,
        search: debouncedSearch,
        setSearch,
        fetchPageFn: async ({ cursor }) => {
            const res = await getAdminServiceOrders(cursor, 100, {
                statuses: TAB_STATUSES[activeTab] || [],
                search: debouncedSearch || undefined,
                startDate: filters.expected_completion_date?.from || undefined,
                endDate: filters.expected_completion_date?.to || undefined,
            })
            return { items: res.data || [], nextCursor: res.nextCursor, hasMore: res.hasMore }
        },
        dedupeKey: useCallback((o: any) => String(o?.id || ""), []),
        getDetailFn: async (id: string) => {
            const data = await getAdminServiceOrderDetail(id)
            return data || null
        },
        listToDetail: (item) => ({ ...item, __partial: true }),
        staleTime: 30_000,
    })

    const {
        items: effectiveOrders,
        fetchNextPage, hasNextPage, isFetchingNextPage,
        entityState, openEntity, closeEntity,
        currentEntity, isLoadingDetail,
        afterMutation, queryClient,
        getPrefetchProps,
    } = entityPage

    const activeOrder = useMemo(() => {
        if (!entityState.isOpen || !entityState.entityId) return null
        if (currentEntity) return currentEntity
        return (effectiveOrders || []).find((o: any) => o.id === entityState.entityId) || null
    }, [entityState.isOpen, entityState.entityId, currentEntity, effectiveOrders])

    const handleMutation = useCallback(() => {
        afterMutation()
        queryClient.invalidateQueries({ queryKey: ["admin-service-orders"] })
    }, [afterMutation, queryClient])

    const handleSearchChange = useCallback((val: string) => {
        setSearch(val)
    }, [setSearch])

    const sortedOrders = useMemo(() => {
        let result = [...(effectiveOrders || [])]

        // Filter Sheet: status
        if (filters.status && filters.status.length > 0) {
            result = result.filter(o => {
                const meta = SERVICE_ORDER_STATUS_META[o.status as ServiceOrderStatus]
                const label = meta?.label || o.status
                return filters.status.includes(label)
            })
        }

        // Filter Sheet: total range
        if (filters.total?.min) {
            const minVal = parseFloat(filters.total.min)
            if (!isNaN(minVal)) {
                result = result.filter(o => Number(o.total_amount || 0) >= minVal)
            }
        }
        if (filters.total?.max) {
            const maxVal = parseFloat(filters.total.max)
            if (!isNaN(maxVal)) {
                result = result.filter(o => Number(o.total_amount || 0) <= maxVal)
            }
        }

        if (sortConfig) {
            result.sort((a, b) => {
                let valA: any
                let valB: any

                switch (sortConfig.key) {
                    case "order_number":
                        valA = a.order_number || 0
                        valB = b.order_number || 0
                        break
                    case "title":
                        valA = (a.title || "").toLowerCase()
                        valB = (b.title || "").toLowerCase()
                        break
                    case "seller":
                        valA = (a.store_name || a.stores?.name || "").toLowerCase()
                        valB = (b.store_name || b.stores?.name || "").toLowerCase()
                        break
                    case "customer":
                        valA = (a.customer_snapshot?.name || "").toLowerCase()
                        valB = (b.customer_snapshot?.name || "").toLowerCase()
                        break
                    case "assigned":
                        valA = (a.assigned_user_name || "").toLowerCase()
                        valB = (b.assigned_user_name || "").toLowerCase()
                        break
                    case "date":
                        valA = a.expected_completion_date || ""
                        valB = b.expected_completion_date || ""
                        break
                    case "total":
                        valA = Number(a.total_amount || 0)
                        valB = Number(b.total_amount || 0)
                        break
                    case "status":
                        valA = a.status || ""
                        valB = b.status || ""
                        break
                    default:
                        return 0
                }

                if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1
                if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1
                return 0
            })
        }

        return result
    }, [effectiveOrders, filters.status, filters.total, sortConfig])

    const totalPages = Math.ceil(sortedOrders.length / itemsPerPage)
    const paginatedOrders = useMemo(() => {
        const start = (page - 1) * itemsPerPage
        return sortedOrders.slice(start, start + itemsPerPage)
    }, [sortedOrders, page, itemsPerPage])

    const tabCounts = useMemo(() => {
        let Todas = (effectiveOrders || []).length
        let Abertas = 0
        let EmAndamento = 0
        let Concluidas = 0
        let Canceladas = 0
        for (const o of (effectiveOrders || [])) {
            if (TAB_STATUSES.aberta.includes(o.status)) Abertas++
            else if (TAB_STATUSES.em_andamento.includes(o.status)) EmAndamento++
            else if (TAB_STATUSES.concluida.includes(o.status)) Concluidas++
            else if (TAB_STATUSES.cancelada.includes(o.status)) Canceladas++
        }
        return { Todas, Abertas, "Em Andamento": EmAndamento, Concluidas, Canceladas }
    }, [effectiveOrders])

    const handleStatusChange = async (id: string, newStatus: string, reason?: string) => {
        setIsUpdatingStatus(true)
        try {
            const res = await updateAdminServiceOrderStatus(id, newStatus, reason)
            if (res.success) {
                toast({ description: "Status alterado pela administração" })
                handleMutation()
            } else {
                toast({ description: res.error || "Erro ao alterar status" })
            }
        } finally {
            setIsUpdatingStatus(false)
        }
    }

    const handleStatusTransition = (orderId: string, currentStatus: string, nextStatus: string) => {
        setStatusModal(null)
        if (currentStatus === nextStatus) return

        if (doesServiceTransitionRequireReason(currentStatus, nextStatus)) {
            setStatusWarningModal({
                isOpen: true,
                orderId,
                currentStatus,
                nextStatus,
                reasonValue: "",
                customReason: "",
            })
        } else {
            setSimpleConfirmModal({
                isOpen: true,
                orderId,
                nextStatus,
            })
        }
    }

    const confirmStatusWarning = async () => {
        if (!statusWarningModal) return
        const { orderId, nextStatus, reasonValue, customReason } = statusWarningModal
        let finalReason = reasonValue
        if (reasonValue === "other" && customReason.trim()) {
            finalReason = `Outro: ${customReason.trim()}`
        } else {
            const foundLabel = CHANGE_STATUS_REASONS.find(r => r.value === reasonValue)?.label
            if (foundLabel) finalReason = foundLabel
        }
        setStatusWarningModal(null)
        await handleStatusChange(orderId, nextStatus, finalReason)
    }

    const handleOpenStatusModal = (orderId: string) => {
        const order = effectiveOrders?.find((o: any) => o.id === orderId)
        if (!order) return
        const currentStatus = order.status || "aberta"
        setStatusModal({ orderId, currentStatus, nextStatus: currentStatus })
    }

    const handleDelete = async (id: string) => {
        const order = effectiveOrders?.find((o: any) => o.id === id)
        const result = await runAction({
            title: "Excluir ordem de serviço",
            description: `OS #${order?.order_number || id.slice(0, 8)}. O time do vendedor será notificado.`,
            requireReason: true,
            confirmLabel: "Excluir",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await deleteAdminServiceOrder(id, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                return res.success ? { success: true } : { success: false, error: res.error }
            },
        })
        if (result.success) {
            toast({ description: "OS excluída pela administração" })
            handleMutation()
        }
        setConfirmDelete(null)
    }

    // Admin save override handler with diff, modal and logging
    const handleAdminSaveOS = async (payload: any, originalData: any): Promise<{ success: boolean; error?: string }> => {
        const changedFields = diffChangedFields(originalData, payload)
        const result = await runAction({
            title: "Salvar alterações na OS",
            description: `OS #${originalData.order_number || String(originalData.id).slice(0, 8)} (${originalData.store_name || originalData.stores?.name || "Loja"})`,
            changedFields,
            force: true,
            confirmLabel: "Salvar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (actionPayload) => {
                const res = await updateAdminServiceOrder(originalData.id, payload, {
                    reason: actionPayload.reason || null,
                    riskScore: actionPayload.riskScore,
                    notifySeller: actionPayload.notifySeller,
                    changedFields,
                })
                if (res.success) return { success: true }
                return { success: false, error: res.error || "Erro ao salvar alterações da OS" }
            },
        })

        if (result.cancelled) return { success: false }
        if (result.success) {
            toast({ description: "Alterações salvas com sucesso pela administração!" })
            handleMutation()
            return { success: true }
        }
        return { success: false, error: result.error }
    }

    const observerRef = useRef<HTMLDivElement>(null)
    useInfiniteScrollObserver(observerRef, {
        fetchNextPage: () => fetchNextPage(),
        enabled: true,
        hasNextPage: !!hasNextPage,
        isFetchingNextPage,
    })

    const filterSections: FilterSectionConfig[] = useMemo(() => {
        const statusLabels = [...new Set((effectiveOrders || []).map((o: any) => {
            const meta = SERVICE_ORDER_STATUS_META[o.status as ServiceOrderStatus]
            return meta?.label || o.status
        }))]

        const hasMultipleTotals = (effectiveOrders || []).some((o: any, i, arr) =>
            i > 0 && Number(o.total_amount || 0) !== Number(arr[0].total_amount || 0)
        )

        const hasDates = (effectiveOrders || []).some((o: any) => o.expected_completion_date)

        const sections: FilterSectionConfig[] = []

        if (statusLabels.length > 1) {
            sections.push({
                id: "status",
                title: "Status",
                type: "checkbox-list",
                options: statusLabels,
            })
        }

        if (hasMultipleTotals) {
            sections.push({
                id: "total",
                title: "Valor Total",
                type: "range",
                rangeConfig: {
                    minKey: "min",
                    maxKey: "max",
                    minPlaceholder: "Mín (R$)",
                    maxPlaceholder: "Máx (R$)",
                },
            })
        }

        if (hasDates) {
            sections.push({
                id: "expected_completion_date",
                title: "Data Prevista",
                type: "date-period",
            })
        }

        return sections
    }, [effectiveOrders])

    const hasActiveFilters = useMemo(() => {
        return (
            (filters.status && filters.status.length > 0) ||
            Boolean(filters.total?.min || filters.total?.max) ||
            isDatePeriodFilterActive(filters.expected_completion_date)
        )
    }, [filters])

    const renderGroupedBadge = (label: string, items: string[], key: string) => {
        if (!items || items.length === 0) return null
        const displayValue = items.length <= 3 ? items.join(", ") : `${items.slice(0, 3).join(", ")}...`
        const fullValue = items.join(", ")
        return (
            <FilterChip
                key={key}
                label={label}
                value={displayValue}
                onRemove={() => setFilters((p: any) => ({ ...p, [key]: [] }))}
            />
        )
    }

    const renderRangeBadge = (label: string, range: { min: string; max: string }, key: string) => {
        if (!range?.min && !range?.max) return null
        const val = range.min && range.max
            ? `${range.min} - ${range.max}`
            : range.min
            ? `>= ${range.min}`
            : `<= ${range.max}`
        return (
            <FilterChip
                key={key}
                label={label}
                value={val}
                onRemove={() => setFilters((p: any) => ({ ...p, [key]: { min: "", max: "" } }))}
            />
        )
    }

    const renderDatePeriodBadge = (label: string, period: any, key: string) => {
        if (!isDatePeriodFilterActive(period)) return null
        const summary = summarizeDatePeriodFilter(period)
        if (!summary) return null
        return (
            <FilterChip
                key={key}
                label={label}
                value={summary}
                onRemove={() => setFilters((p: any) => ({ ...p, [key]: { presets: [], from: "", to: "" } }))}
            />
        )
    }

    const BadgeList = () => (
        <>
            {renderGroupedBadge("Status", filters.status, "status")}
            {renderRangeBadge("Valor", filters.total, "total")}
            {renderDatePeriodBadge("Data Prevista", filters.expected_completion_date, "expected_completion_date")}
        </>
    )

    const activePartnerId = activeOrder?.partner_id || activeOrder?.stores?.partner_id || "admin"
    const activeStore = activeOrder?.stores || null

    return (
        <>
            <AnimatePresence mode="wait">
                {entityState.isOpen && (entityState.action === "create" || entityState.action === "edit") ? (
                    <FadeIn key={entityState.action} className="w-full h-full bg-white dark:bg-dark-background">
                        {entityState.action === "edit" && isLoadingDetail && !activeOrder ? (
                            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                                <ThreeDotsLoader />
                            </div>
                        ) : entityState.action === "edit" && !isLoadingDetail && !activeOrder ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[200px] w-full gap-4">
                                <p className="text-brand-inactive-text">Ordem de serviço não encontrada.</p>
                                <Button variant="outline" onClick={() => closeEntity()}>Voltar</Button>
                            </div>
                        ) : (
                            <PermissionProvider
                                role="OWNER"
                                routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
                                partnerId={activePartnerId}
                                businessInfo={{}}
                                planSlug="escalar"
                            >
                                <StoreProvider
                                    partnerId={activePartnerId}
                                    initialStores={activeStore ? [activeStore] : []}
                                    activeStoreId={activeOrder?.store_id || activeStore?.id || null}
                                >
                                    <ServiceOrderForm
                                        partnerId={activePartnerId}
                                        storeId={activeOrder?.store_id || null}
                                        onBack={() => closeEntity()}
                                        onSaved={() => {
                                            closeEntity()
                                            handleMutation()
                                        }}
                                        editData={entityState.action === "edit" ? activeOrder : undefined}
                                        onSaveOverride={handleAdminSaveOS}
                                    />
                                </StoreProvider>
                            </PermissionProvider>
                        )}
                    </FadeIn>
                ) : entityState.isOpen && entityState.action === "view" ? (
                    <FadeIn key="detail" className="w-full h-full bg-white dark:bg-dark-background">
                        {isLoadingDetail && !activeOrder ? (
                            <div className="flex items-center justify-center h-full min-h-[200px] w-full">
                                <ThreeDotsLoader />
                            </div>
                        ) : !isLoadingDetail && !activeOrder ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[200px] w-full gap-4">
                                <p className="text-brand-inactive-text">Ordem de serviço não encontrada.</p>
                                <Button variant="outline" onClick={() => closeEntity()}>Voltar</Button>
                            </div>
                        ) : (
                            <PermissionProvider
                                role="OWNER"
                                routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
                                partnerId={activePartnerId}
                                businessInfo={{}}
                                planSlug="escalar"
                            >
                                <StoreProvider
                                    partnerId={activePartnerId}
                                    initialStores={activeStore ? [activeStore] : []}
                                    activeStoreId={activeOrder?.store_id || activeStore?.id || null}
                                >
                                    <ServiceOrderDetail
                                        data={activeOrder}
                                        partnerId={activePartnerId}
                                        onBack={() => closeEntity()}
                                        onMutation={() => handleMutation()}
                                        onEdit={(id) => openEntity("edit", id)}
                                    />
                                </StoreProvider>
                            </PermissionProvider>
                        )}
                    </FadeIn>
                ) : (
                    <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
                        {/* Desktop Header */}
                        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8 pt-4">
                            <div className="flex flex-col gap-2 pt-1">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                                        Ordens de Serviço
                                    </h1>
                                </div>
                                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                                    Gerencie todas as ordens de serviço da plataforma, acompanhando clientes, vendedores e status de execução.
                                </p>
                            </div>
                        </div>

                        {/* Controls Header */}
                        <ServiceOrderPageControls
                            activeTab={activeTab as any}
                            setActiveTab={(tab: any) => {
                                setActiveTab(tab)
                                setPage(1)
                            }}
                            search={search}
                            onSearchChange={handleSearchChange}
                            onOpenFilter={() => setShowFilters(true)}
                            onExport={() => {}}
                            onAddOrder={() => openEntity("create")}
                            filters={filters as any}
                            setFilters={setFilters as any}
                            viewMode={effectiveViewMode}
                            onViewModeChange={(m) => setViewMode(m)}
                            hasActiveFilters={hasActiveFilters}
                            tabCounts={tabCounts}
                        />

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-24 md:pb-8">
                            {paginatedOrders.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-12 text-center min-h-[350px]">
                                    <IconPlaceholder
                                        icon={WrenchIcon}
                                        containerSize="w-16 h-16 mb-2"
                                        iconSize="w-6 h-6"
                                        title="Nenhuma ordem de serviço encontrada"
                                        subtitle="Não encontramos ordens de serviço para os filtros selecionados."
                                    />
                                </div>
                            ) : effectiveViewMode === "grid" ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {paginatedOrders.map((order) => {
                                        const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]
                                        const statusColor = statusMeta?.variant || "gray"
                                        const statusLabel = statusMeta?.label || order.status
                                        return (
                                            <ServiceOrderGridCard
                                                key={order.id}
                                                order={order}
                                                selected={selection.has(order.id)}
                                                onSelect={() => {
                                                    setSelection(p => {
                                                        const next = new Set(p)
                                                        next.has(order.id) ? next.delete(order.id) : next.add(order.id)
                                                        return next
                                                    })
                                                }}
                                                onDetails={() => openEntity("view", order.id)}
                                                onEdit={() => openEntity("edit", order.id)}
                                                onStatus={() => handleOpenStatusModal(order.id)}
                                                onPrint={() => setPrintOrderId(order.id)}
                                                onDelete={() => handleDelete(order.id)}
                                                statusColor={statusColor}
                                                statusLabel={statusLabel}
                                                {...getPrefetchProps(order.id)}
                                            />
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="w-full overflow-hidden rounded-xl relative">
                                    <div className="overflow-x-auto no-scrollbar">
                                        <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-brand-gray dark:bg-dark-border/50">
                                                    <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                                                        <Checkbox
                                                            checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selection.has(o.id))}
                                                            onChange={() => {
                                                                const allSelected = paginatedOrders.every(o => selection.has(o.id))
                                                                setSelection(p => {
                                                                    const next = new Set(p)
                                                                    paginatedOrders.forEach(o => allSelected ? next.delete(o.id) : next.add(o.id))
                                                                    return next
                                                                })
                                                            }}
                                                            className="bg-white dark:bg-dark-background"
                                                        />
                                                    </th>
                                                    {COLUMNS.map((col, idx) => {
                                                        const isSorted = sortConfig?.key === col.id
                                                        return (
                                                            <th
                                                                key={col.id}
                                                                className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""}`}
                                                                style={{ width: col.width, minWidth: col.width }}
                                                                onClick={() => {
                                                                    if (col.id === "actions") return
                                                                    setSortConfig((prev) => ({
                                                                        key: col.id,
                                                                        direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc",
                                                                    }))
                                                                }}
                                                            >
                                                                <div className={`relative flex items-center ${col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"}`}>
                                                                    <span>{col.label}</span>
                                                                    {col.id !== "actions" && (
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
                                                {paginatedOrders.map((order) => {
                                                    const statusMeta = SERVICE_ORDER_STATUS_META[order.status as ServiceOrderStatus]
                                                    const statusColor = statusMeta?.variant || "gray"
                                                    const statusLabel = statusMeta?.label || order.status
                                                    return (
                                                        <ServiceOrderListRow
                                                            key={order.id}
                                                            order={order}
                                                            columns={COLUMNS}
                                                            selected={selection.has(order.id)}
                                                            onSelect={() => {
                                                                setSelection(p => {
                                                                    const next = new Set(p)
                                                                    next.has(order.id) ? next.delete(order.id) : next.add(order.id)
                                                                    return next
                                                                })
                                                            }}
                                                            onDetails={() => openEntity("view", order.id)}
                                                            onEdit={() => openEntity("edit", order.id)}
                                                            onStatus={() => handleOpenStatusModal(order.id)}
                                                            onPrint={() => setPrintOrderId(order.id)}
                                                            onDelete={() => handleDelete(order.id)}
                                                            statusColor={statusColor}
                                                            statusLabel={statusLabel}
                                                            {...getPrefetchProps(order.id)}
                                                        />
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center pt-6">
                                    <Pagination
                                        currentPage={page}
                                        totalPages={totalPages}
                                        onPageChange={(p) => setPage(p)}
                                    />
                                </div>
                            )}
                        </div>
                    </FadeIn>
                )}
            </AnimatePresence>

            {/* Filter Sheet */}
            <FilterSheet
                isOpen={showFilters}
                onClose={() => setShowFilters(false)}
                sections={filterSections}
                filters={filters}
                setFilters={setFilters as any}
                onClear={() => {
                    setFilters({ status: [], total: { min: "", max: "" }, expected_completion_date: { presets: [], from: "", to: "" } })
                    setPage(1)
                }}
            />

            {/* Status Change Modal */}
            {statusModal && (
                <DefaultModal
                    isOpen={true}
                    onClose={() => setStatusModal(null)}
                    title="Alterar Status da OS"
                    maxWidth="md"
                >
                    <div className="space-y-4 pt-2">
                        <FormDropdown
                            label="Novo Status"
                            value={statusModal.nextStatus}
                            options={Object.entries(SERVICE_ORDER_STATUS_META).map(([key, meta]) => ({
                                value: key,
                                label: meta.label,
                            }))}
                            setValue={(val) => setStatusModal(p => p ? { ...p, nextStatus: val } : null)}
                        />
                        <div className="flex justify-end gap-3 pt-4">
                            <Button variant="outline" onClick={() => setStatusModal(null)}>Cancelar</Button>
                            <Button onClick={() => handleStatusTransition(statusModal.orderId, statusModal.currentStatus, statusModal.nextStatus)}>
                                Confirmar
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Status Warning Modal (reason required) */}
            {statusWarningModal && (
                <DefaultModal
                    isOpen={statusWarningModal.isOpen}
                    onClose={() => setStatusWarningModal(null)}
                    title="Regressão de Status"
                    maxWidth="md"
                >
                    <div className="space-y-4 pt-2">
                        <p className="text-sm text-brand-inactive-text">
                            Você está regredindo o status da OS. Informe o motivo desta alteração:
                        </p>
                        <FormDropdown
                            label="Motivo"
                            value={statusWarningModal.reasonValue}
                            options={CHANGE_STATUS_REASONS}
                            setValue={(val) => setStatusWarningModal(p => p ? { ...p, reasonValue: val } : null)}
                        />
                        {statusWarningModal.reasonValue === "other" && (
                            <Input
                                label="Descreva o motivo"
                                value={statusWarningModal.customReason}
                                onChange={(e) => setStatusWarningModal(p => p ? { ...p, customReason: e.target.value } : null)}
                            />
                        )}
                        <div className="flex justify-end gap-3 pt-4">
                            <Button variant="outline" onClick={() => setStatusWarningModal(null)}>Cancelar</Button>
                            <Button onClick={confirmStatusWarning} disabled={!statusWarningModal.reasonValue}>
                                Confirmar
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            )}

            {/* Simple Confirm Modal */}
            {simpleConfirmModal && (
                <AlertModal
                    isOpen={simpleConfirmModal.isOpen}
                    onClose={() => setSimpleConfirmModal(null)}
                    onConfirm={() => {
                        const { orderId, nextStatus } = simpleConfirmModal
                        setSimpleConfirmModal(null)
                        void handleStatusChange(orderId, nextStatus)
                    }}
                    title="Alterar Status"
                    description={`Deseja realmente alterar o status para "${SERVICE_ORDER_STATUS_META[simpleConfirmModal.nextStatus as ServiceOrderStatus]?.label || simpleConfirmModal.nextStatus}"?`}
                    confirmText="Confirmar"
                    cancelText="Cancelar"
                />
            )}

            {/* Print OS Modal */}
            {printOrderId && (
                <OSSPrintModal
                    isOpen={true}
                    onClose={() => setPrintOrderId(null)}
                    orderId={printOrderId}
                    partnerId={activePartnerId}
                />
            )}

            {/* Admin Action Modal (Salvar alterações na OS, Excluir) */}
            {actionModal}
        </>
    )
}