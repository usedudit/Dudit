"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { Button, Checkbox, IconPlaceholder, ThreeDotsLoader, Input, SelectionBanner, Tabs, TabsList, TabsTrigger, DropdownItem } from "@/components/reusable"
import FilterChip from "@/components/reusable/FilterChip"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { FadeIn } from "@/components/animations/FadeIn"
import AlertModal from "@/components/reusable/AlertModal"
import SavingStatusModal from "@/components/reusable/SavingStatusModal"
import { ShareModal } from "@/components/marketplace/ShareModal"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import ServiceOrderListRow from "./ServiceOrderListRow"
import ServiceOrderGridCard from "./ServiceOrderGridCard"
import ServiceOrderForm from "./ServiceOrderForm"
import ServiceOrderDetail from "./ServiceOrderDetail"
import {
  PlusIcon, WrenchIcon, SearchIcon, FilterIcon, TrashIcon,
  ListIcon, GridIcon, ArrowUpDownIcon, ClockIcon, CheckCircleIcon, BlockedIcon, ExportFileIcon,
} from "@/lib/icons"
import { useErpExport } from "@/hooks/use-erp-export"
import ExportSelectionModal from "@/components/erp/export/ExportSelectionModal"
import {
  isDatePeriodFilterActive,
  resolveDatePeriodBounds,
  ymdInBounds,
  summarizeDatePeriodFilter,
} from "@/lib/utils/filter-date-period"
import {
  getERPServiceOrdersPageAction,
  getServiceOrderDetailsAction,
} from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"



const STATUS_TRANSITIONS: Record<string, string[]> = {
  aberta: ["aguardando_aprovacao", "cancelada"],
  aguardando_aprovacao: ["aprovada", "cancelada"],
  aprovada: ["em_andamento", "cancelada"],
  em_andamento: ["aguardando_peca", "concluida", "cancelada"],
  aguardando_peca: ["em_andamento", "cancelada"],
  concluida: ["entregue"],
  entregue: [],
  cancelada: [],
}

const COLUMNS: { id: string; label: string; align: "left" | "center" | "right"; width: string }[] = [
  { id: "order_number", label: "Nº OS", align: "left", width: "150px" },
  { id: "title", label: "Título", align: "left", width: "250px" },
  { id: "customer", label: "Cliente", align: "left", width: "200px" },
  { id: "assigned", label: "Responsável", align: "left", width: "160px" },
  { id: "date", label: "Data Prev.", align: "left", width: "120px" },
  { id: "total", label: "Total", align: "left", width: "120px" },
  { id: "status", label: "Status", align: "center", width: "140px" },
  { id: "actions", label: "Ações", align: "center", width: "80px" },
]

interface ServiceOrdersPageProps {
  orders: any[]
  initialNextCursor: any
  initialHasMore: boolean
  partnerId: string
  storeId?: string | null
}

export default function ServiceOrdersPage({
  orders: rawOrders,
  initialNextCursor,
  initialHasMore,
  partnerId,
  storeId,
}: ServiceOrdersPageProps) {
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const isTabletOrMobile = useMediaQuery("(max-width: 1024px)")
  const [filters, setFilters] = useState<any>({
    status: [],
    total: { min: "", max: "" },
    expected_completion_date: { presets: [], from: "", to: "" },
  })
  const [activeTab, setActiveTab] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
  const effectiveViewMode = isTabletOrMobile ? "grid" : viewMode
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showShareModal, setShowShareModal] = useState<{ id: string; token: string } | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
  const { exportData, isExporting, selectionModal, closeSelectionModal, handleExportSelected, handleExportAll } = useErpExport()
  const itemsPerPage = 50

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['erp', 'team-members', partnerId],
    queryFn: async () => {
      try {
        const { getTeamMembers } = await import("@/app/actions/erp/team")
        const res = await getTeamMembers()
        return res.members ?? []
      } catch (err) {
        console.error("Erro ao carregar equipe:", err)
        return []
      }
    },
    staleTime: 120000,
    refetchOnWindowFocus: false,
  })

  const entityPage = useEntityPage<any, any, any>({
    entityType: "service_orders",
    partnerId,
    queryKey: ["service-orders", partnerId, storeId],
    initialItems: rawOrders,
    initialNextCursor,
    initialHasMore,
    fetchPageFn: async ({ cursor }) => {
      const res = await getERPServiceOrdersPageAction(partnerId, { cursor, limit: 100, storeId })
      if (!res.success) throw new Error(res.error || "Erro ao carregar OS")
      return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
    },
    dedupeKey: useCallback((o: any) => String(o?.id || ""), []),
    getDetailFn: async (id: string) => {
      const res = await getServiceOrderDetailsAction(id, partnerId)
      if (res.success && res.data) return res.data
      return null
    },
    listToDetail: (item) => ({ ...item, __partial: true }),
    staleTime: 30_000,
  })

  const {
    items: effectiveOrders,
    fetchNextPage, hasNextPage, isFetchingNextPage,
    entityState, openEntity, closeEntity,
    currentEntity, isLoadingDetail,
    search: searchVal, setSearch: setSearchVal,
    afterMutation, queryClient,
  } = entityPage

  const handleMutation = useCallback(() => {
    afterMutation()
    queryClient.invalidateQueries({ queryKey: ["service-orders", partnerId, storeId] })
  }, [afterMutation, queryClient, partnerId, storeId])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSearch(e.target.value)
    setDebouncedSearch(e.target.value)
  }, [])

  const filteredOrders = useMemo(() => {
    const term = debouncedSearch.toLowerCase()
    return (effectiveOrders || []).filter((o: any) => {
      const matchesSearch = !term || (
        String(o.order_number || "").toLowerCase().includes(term) ||
        String(o.title || "").toLowerCase().includes(term) ||
        String(o.customer_snapshot?.name || "").toLowerCase().includes(term)
      )
      const matchesTab = activeTab === "all" ||
        (activeTab === "aberta" && (o.status === "aberta" || o.status === "aguardando_aprovacao" || o.status === "aprovada")) ||
        (activeTab === "em_andamento" && (o.status === "em_andamento" || o.status === "aguardando_peca")) ||
        (activeTab === "concluida" && (o.status === "concluida" || o.status === "entregue")) ||
        (activeTab === "cancelada" && o.status === "cancelada")

      const statusMeta = SERVICE_ORDER_STATUS_META[o.status as ServiceOrderStatus]
      const statusLabel = statusMeta?.label || o.status
      const matchesFilterStatus = !filters.status || filters.status.length === 0 || filters.status.includes(statusLabel)

      const value = Number(o.total_amount || 0)
      const minVal = filters.total?.min ? Number(filters.total.min) : null
      const maxVal = filters.total?.max ? Number(filters.total.max) : null
      const matchesFilterTotal = (minVal === null || value >= minVal) && (maxVal === null || value <= maxVal)

      let matchesFilterDate = true
      if (isDatePeriodFilterActive(filters.expected_completion_date)) {
        const { startYmd, endYmd } = resolveDatePeriodBounds(filters.expected_completion_date)
        matchesFilterDate = ymdInBounds(o.expected_completion_date, startYmd, endYmd)
      }

      return matchesSearch && matchesTab && matchesFilterStatus && matchesFilterTotal && matchesFilterDate
    })
  }, [effectiveOrders, debouncedSearch, activeTab, filters])

  const sortedOrders = useMemo(() => {
    if (!sortConfig) return filteredOrders
    return [...filteredOrders].sort((a, b) => {
      let valA: any = a[sortConfig!.key]
      let valB: any = b[sortConfig!.key]

      if (sortConfig!.key === "customer") {
        valA = a.customer_snapshot?.name || ""
        valB = b.customer_snapshot?.name || ""
      } else if (sortConfig!.key === "total") {
        valA = Number(a.total_amount || 0)
        valB = Number(b.total_amount || 0)
      } else if (sortConfig!.key === "date") {
        valA = a.expected_completion_date || ""
        valB = b.expected_completion_date || ""
      }

      if (valA === valB) return 0
      const comparison = valA < valB ? -1 : 1
      return sortConfig!.direction === "asc" ? comparison : -comparison
    })
  }, [filteredOrders, sortConfig])

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage)
  const paginated = sortedOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const statusColor = (status: string) => SERVICE_ORDER_STATUS_META[status as ServiceOrderStatus]?.variant || "gray"
  const statusLabel = (status: string) => SERVICE_ORDER_STATUS_META[status as ServiceOrderStatus]?.label || status

  const handleExport = useCallback(() => {
    void exportData({
      partnerId,
      module: "service-orders",
      format: "xlsx",
      filters: { search: debouncedSearch, activeTab, status: filters.status },
    }, { selectedIds: selection, totalCount: sortedOrders.length })
  }, [exportData, partnerId, debouncedSearch, activeTab, filters.status, selection, sortedOrders.length])

  const handleStatusChange = async (id: string, newStatus: string) => {
    setIsUpdatingStatus(true)
    try {
      const { updateServiceOrderStatusAction } = await import("@/app/actions/erp/service-orders")
      const res = await updateServiceOrderStatusAction(partnerId, id, newStatus)
      if (res.success) {
        toast({ description: "Status alterado" })
        handleMutation()
      } else {
        toast({ description: res.error || "Erro ao alterar status" })
      }
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    try {
      const { deleteServiceOrderAction } = await import("@/app/actions/erp/service-orders")
      const res = await deleteServiceOrderAction(partnerId, id)
      if (res.success) {
        toast({ description: "OS deletada" })
        handleMutation()
      } else {
        toast({ description: res.error || "Erro ao deletar" })
      }
    } finally {
      setIsDeleting(false)
      setConfirmDelete(null)
    }
  }

  const observerRef = useRef<HTMLDivElement>(null)
  useInfiniteScrollObserver(observerRef, {
    fetchNextPage: () => fetchNextPage(),
    enabled: true,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
  })

  const filterSections: FilterSectionConfig[] = useMemo(() => {
    // Only show status filter if there are orders with different statuses
    const statusLabels = [...new Set((effectiveOrders || []).map((o: any) => {
      const meta = SERVICE_ORDER_STATUS_META[o.status as ServiceOrderStatus]
      return meta?.label || o.status
    }))]
    
    // Only show total filter if there are orders with different totals
    const hasMultipleTotals = (effectiveOrders || []).some((o: any, i, arr) => 
      i > 0 && Number(o.total_amount || 0) !== Number(arr[0].total_amount || 0)
    )
    
    // Only show date filter if there are orders with expected_completion_date
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
        tooltip={`${label}: ${fullValue}`}
        onRemove={() => setFilters((prev: any) => ({ ...prev, [key]: [] }))}
      />
    )
  }

  const renderRangeBadge = (label: string, range: { min: string; max: string }, key: string) => {
    if (!range || (!range.min && !range.max)) return null
    return (
      <FilterChip
        key={key}
        label={label}
        value={`${range.min ? `R$ ${range.min}` : "R$ 0"} - ${range.max ? `R$ ${range.max}` : "∞"}`}
        onRemove={() => setFilters((prev: any) => ({ ...prev, [key]: { min: "", max: "" } }))}
      />
    )
  }

  const renderDatePeriodBadge = (label: string, period: any, key: string) => {
    if (!isDatePeriodFilterActive(period)) return null
    const val = summarizeDatePeriodFilter(period) || ""
    return (
      <FilterChip
        key={key}
        label={label}
        value={val}
        onRemove={() => setFilters((prev: any) => ({ ...prev, [key]: { presets: [], from: "", to: "" } }))}
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

  return (
    <>
      <AnimatePresence mode="wait">
        {entityState.isOpen && (entityState.action === "create" || entityState.action === "edit") ? (
          isLoadingDetail ? (
            <FadeIn key="loading-form" className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
              <ThreeDotsLoader />
            </FadeIn>
          ) : (
            <FadeIn key={entityState.action} className="w-full h-full bg-white dark:bg-dark-background">
              <ServiceOrderForm
                partnerId={partnerId}
                storeId={storeId}
                onBack={() => closeEntity()}
                onSaved={() => {
                  closeEntity()
                  handleMutation()
                }}
                editData={entityState.action === "edit" ? currentEntity : undefined}
              />
            </FadeIn>
          )
        ) : entityState.isOpen && entityState.action === "view" && currentEntity ? (
          isLoadingDetail ? (
            <FadeIn key="loading-detail" className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
              <ThreeDotsLoader />
            </FadeIn>
          ) : (
            <FadeIn key="detail" className="w-full h-full bg-white dark:bg-dark-background">
              <ServiceOrderDetail
                data={currentEntity}
                partnerId={partnerId}
                onBack={() => closeEntity()}
                onMutation={() => handleMutation()}
                onEdit={(id) => openEntity("edit", id)}
              />
            </FadeIn>
          )
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
                  Gerencie as ordens de serviço, clientes e status de execução.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
                  {isExporting ? "Exportando..." : "Exportar"}
                </Button>
                <Button
                  onClick={() => openEntity("create")}
                  className="w-full"
                  leftIcon={<PlusIcon size={18} />}
                >
                  Nova OS
                </Button>
              </div>
            </div>

            {/* Tabs de Status */}
            <div className="mb-6 px-4 md:px-8">
              <Tabs
                value={activeTab}
                onValueChange={(val) => { setActiveTab(val); setPage(1) }}
              >
                <TabsList className="px-0">
                  <TabsTrigger value="all" icon={WrenchIcon}>
                    Todas
                  </TabsTrigger>
                  <TabsTrigger value="aberta" icon={PlusIcon}>
                    Abertas
                  </TabsTrigger>
                  <TabsTrigger value="em_andamento" icon={ClockIcon}>
                    Em Andamento
                  </TabsTrigger>
                  <TabsTrigger value="concluida" icon={CheckCircleIcon}>
                    Concluídas
                  </TabsTrigger>
                  <TabsTrigger value="cancelada" icon={BlockedIcon}>
                    Canceladas
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4 flex-none px-4 md:px-8">
              {/* MOBILE CONTROLS ROW */}
              <div className="md:hidden flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0">
                  <Input
                    name="search"
                    placeholder="Buscar..."
                    value={search}
                    onChange={handleSearchChange}
                    className="h-[42px] w-full"
                    variant="full-rounded"
                    prefix={
                      <SearchIcon
                        size={18}
                        className="text-brand-inactive-text shrink-0"
                      />
                    }
                    label=""
                  />
                </div>
                <div className="flex-none flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(true)}
                    className="w-[42px] h-[42px] p-0"
                  >
                    <FilterIcon className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => openEntity("create")}
                    className="w-[42px] h-[42px] p-0 flex items-center justify-center animate-pulse-once"
                    leftIcon={<PlusIcon size={18} />}
                  />
                </div>
              </div>

              {/* DESKTOP CONTROLS */}
              <div className="hidden md:flex items-center w-full gap-4">
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-80">
                    <Input
                      name="search"
                      placeholder="Buscar por nº, título ou cliente..."
                      value={search}
                      onChange={handleSearchChange}
                      className="h-[42px]"
                      variant="full-rounded"
                      prefix={
                        <SearchIcon
                          size={18}
                          className="text-brand-inactive-text shrink-0"
                        />
                      }
                      label=""
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(true)}
                    leftIcon={<FilterIcon size={18} />}
                  >
                    Filtros
                  </Button>
                  {hasActiveFilters && (
                    <div className="h-8 w-px bg-brand-border dark:bg-dark-border mx-1"></div>
                  )}
                </div>

                {/* Scrollable Badges Area (Desktop) */}
                <div className="flex-1 min-w-0 relative h-[42px] flex items-center">
                  <div className="overflow-x-auto hide-scrollbar flex items-center gap-2 w-full">
                    <BadgeList />
                  </div>
                </div>

                {/* View Toggles */}
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${effectiveViewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                  >
                    <ListIcon className="w-[18px] h-[18px]" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${effectiveViewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                  >
                    <GridIcon className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>
            </div>

            {/* MOBILE CHIPS CAROUSEL */}
            <div className="md:hidden w-full overflow-x-auto hide-scrollbar mb-4 flex-none px-4">
              <div className="flex items-center gap-2">
                <BadgeList />
              </div>
            </div>

            {selection.size > 0 && (
              <div className="px-4 md:px-8 mb-4">
                <SelectionBanner
                  selectedCount={selection.size}
                  totalCount={sortedOrders.length}
                  onSelectAll={() => setSelection(new Set(sortedOrders.map((o: any) => o.id)))}
                  onClearSelection={() => setSelection(new Set())}
                  itemName="ordens de serviço"
                  singularItemName="ordem de serviço"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
              <AnimatePresence mode="wait">
                {paginated.length === 0 ? (
                  <FadeIn key="empty-state" className="w-full h-full">
                    <IconPlaceholder
                      placeholderType="image"
                      imageSrc="https://img.dudit.com.br/static/mascots/OrdemServico.png"
                      title="Nenhuma ordem de serviço"
                      subtitle={debouncedSearch ? "Nenhum resultado para esta busca." : "Crie sua primeira ordem de serviço."}
                      itemButton={debouncedSearch ? undefined : { text: "Nova OS", action: () => openEntity("create") }}
                    />
                  </FadeIn>
                ) : (
                  <AnimatePresence mode="wait">
                    <FadeIn key={effectiveViewMode} className="w-full flex flex-col h-full justify-between gap-4">
                      <div className="flex-1">
                        {effectiveViewMode === "grid" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                            {paginated.map((o: any) => (
                              <ServiceOrderGridCard
                                key={o.id}
                                order={o}
                                selected={selection.has(o.id)}
                                onSelect={() => {
                                  const next = new Set(selection)
                                  if (next.has(o.id)) next.delete(o.id)
                                  else next.add(o.id)
                                  setSelection(next)
                                }}
                                onDetails={() => openEntity("view", o.id)}
                                onEdit={() => openEntity("edit", o.id)}
                                onDelete={() => setConfirmDelete(o.id)}
                                statusColor={statusColor(o.status)}
                                statusLabel={statusLabel(o.status)}
                                teamMembers={teamMembers}
                              >
                                {(STATUS_TRANSITIONS[o.status] || []).map((st) => {
                                  const meta = SERVICE_ORDER_STATUS_META[st as ServiceOrderStatus]
                                  return (
                                    <DropdownItem key={st} onClick={() => handleStatusChange(o.id, st)}>
                                      Marcar como: {meta?.label}
                                    </DropdownItem>
                                  )
                                })}
                                <DropdownItem onClick={async () => {
                                  const { ensurePublicTokenAction } = await import("@/app/actions/erp/service-orders")
                                  const token = await ensurePublicTokenAction(partnerId, o.id)
                                  if (token) setShowShareModal({ id: o.id, token })
                                }}>
                                  Compartilhar
                                </DropdownItem>
                              </ServiceOrderGridCard>
                            ))}
                          </div>
                        ) : (
                          <div className="w-full overflow-hidden rounded-xl relative">
                            <div className="overflow-x-auto no-scrollbar">
                              <table className="w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                                <thead>
                                  <tr className="bg-brand-gray dark:bg-dark-border/50">
                                    <th className="py-3 pl-6 pr-3 w-12 bg-brand-gray dark:bg-dark-border/50 rounded-l-lg">
                                      <Checkbox
                                        checked={selection.size === paginated.length && paginated.length > 0}
                                        onCheckedChange={(checked) => {
                                          if (checked) setSelection(new Set([...selection, ...paginated.map(x => x.id)]))
                                          else {
                                            const next = new Set(selection)
                                            paginated.forEach(x => next.delete(x.id))
                                            setSelection(next)
                                          }
                                        }}
                                        className="bg-white dark:bg-dark-background"
                                      />
                                    </th>
                                    {COLUMNS.map((col) => {
                                      const isSorted = sortConfig?.key === col.id
                                      return (
                                        <th
                                          key={col.id}
                                          className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : ""}`}
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
                                  {paginated.map((o: any) => (
                                    <ServiceOrderListRow
                                      key={o.id}
                                      order={o}
                                      columns={COLUMNS}
                                      selected={selection.has(o.id)}
                                      onSelect={(id) => {
                                        const next = new Set(selection)
                                        if (next.has(id)) next.delete(id)
                                        else next.add(id)
                                        setSelection(next)
                                      }}
                                      onDetails={() => openEntity("view", o.id)}
                                      onEdit={() => openEntity("edit", o.id)}
                                      onDelete={() => setConfirmDelete(o.id)}
                                      statusColor={statusColor(o.status)}
                                      statusLabel={statusLabel(o.status)}
                                      teamMembers={teamMembers}
                                    >
                                      {(STATUS_TRANSITIONS[o.status] || []).map((st) => {
                                        const meta = SERVICE_ORDER_STATUS_META[st as ServiceOrderStatus]
                                        return (
                                          <DropdownItem key={st} onClick={() => handleStatusChange(o.id, st)}>
                                            Marcar como: {meta?.label}
                                          </DropdownItem>
                                        )
                                      })}
                                      <DropdownItem onClick={async () => {
                                        const { ensurePublicTokenAction } = await import("@/app/actions/erp/service-orders")
                                        const token = await ensurePublicTokenAction(partnerId, o.id)
                                        if (token) setShowShareModal({ id: o.id, token })
                                      }}>
                                        Compartilhar
                                      </DropdownItem>
                                    </ServiceOrderListRow>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>

                      {sortedOrders.length > 0 && (
                        <div className="space-y-3">
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
                          {hasNextPage && page === totalPages && isFetchingNextPage ? (
                            <div className="flex flex-col gap-2 py-2 px-4">
                              <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse" />
                              <div className="h-10 w-full max-w-lg mx-auto rounded-lg bg-gray-100 dark:bg-dark-border/30 animate-pulse opacity-70" />
                            </div>
                          ) : null}
                        </div>
                      )}

                      <div ref={observerRef} className="h-4" />
                    </FadeIn>
                  </AnimatePresence>
                )}
              </AnimatePresence>
            </div>
          </FadeIn>
        )}
      </AnimatePresence>

      <AlertModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Deletar OS"
        description="Tem certeza que deseja deletar esta ordem de serviço?"
        onConfirm={() => confirmDelete ? handleDelete(confirmDelete) : undefined}
        confirmText="Deletar"
        variant="danger"
      />

      <FilterSheet
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        sections={filterSections}
        filters={filters}
        setFilters={setFilters}
        onClear={() => setFilters({
          status: [],
          total: { min: "", max: "" },
          expected_completion_date: { presets: [], from: "", to: "" },
        })}
      />

      <ExportSelectionModal
        isOpen={selectionModal.isOpen}
        selectedCount={selectionModal.selectedCount}
        totalCount={selectionModal.totalCount}
        onExportSelected={handleExportSelected}
        onExportAll={handleExportAll}
        onClose={closeSelectionModal}
      />

      {showShareModal && (
        <ShareModal
          isOpen={!!showShareModal}
          onClose={() => setShowShareModal(null)}
          url={`${typeof window !== 'undefined' ? window.location.origin : ''}/os/${showShareModal.token}`}
          title={`OS #${(paginated.find(o => o.id === showShareModal.id)?.order_number) || ''}`}
          shareMessage={`Olá! Segue o link para visualizar a Ordem de Serviço *#${(paginated.find(o => o.id === showShareModal.id)?.order_number) || ''}*:`}
          label="Link da OS"
        />
      )}

      <SavingStatusModal isOpen={isDeleting} text="Excluindo ordem de serviço..." />
      <SavingStatusModal isOpen={isUpdatingStatus} text="Atualizando status..." />
    </>
  )
}
