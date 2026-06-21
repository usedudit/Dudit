"use client"

import React, { useState, useMemo, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { Button, Checkbox, IconPlaceholder, ThreeDotsLoader, Input, SelectionBanner, Tabs, TabsList, TabsTrigger } from "@/components/reusable"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import Pagination from "@/components/reusable/Pagination"
import { FadeIn } from "@/components/animations/FadeIn"
import AlertModal from "@/components/reusable/AlertModal"
import FloatingActionBar from "@/components/reusable/FloatingActionBar"
import ServiceOrderListRow from "./ServiceOrderListRow"
import ServiceOrderGridCard from "./ServiceOrderGridCard"
import ServiceOrderForm from "./ServiceOrderForm"
import ServiceOrderDetail from "./ServiceOrderDetail"
import {
  PlusIcon, WrenchIcon, SearchIcon, FilterIcon, TrashIcon,
  ListIcon, GridIcon, ArrowUpDownIcon,
} from "@/lib/icons"
import {
  getERPServiceOrdersPageAction,
  getServiceOrderDetailsAction,
} from "@/app/actions/erp/service-orders"
import { SERVICE_ORDER_STATUS_META, type ServiceOrderStatus } from "@/lib/types/service-order"

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: "Todas", value: "all" },
  ...Object.entries(SERVICE_ORDER_STATUS_META).map(([value, meta]) => ({
    label: meta.label,
    value,
  })),
]

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
}

export default function ServiceOrdersPage({
  orders: rawOrders,
  initialNextCursor,
  initialHasMore,
  partnerId,
}: ServiceOrdersPageProps) {
  const { toast } = useToast()
  const isTabletOrMobile = useMediaQuery("(max-width: 1024px)")
  const [activeTab, setActiveTab] = useState("all")
  const [viewMode, setViewMode] = useState<"list" | "grid">(isTabletOrMobile ? "grid" : "list")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null)
  const itemsPerPage = 50

  const entityPage = useEntityPage<any, any, any>({
    entityType: "service_orders",
    partnerId,
    queryKey: ["service-orders", partnerId],
    initialItems: rawOrders,
    initialNextCursor,
    initialHasMore,
    fetchPageFn: async ({ cursor }) => {
      const res = await getERPServiceOrdersPageAction(partnerId, { cursor, limit: 100 })
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
      const matchesTab = activeTab === "all" || o.status === activeTab
      return matchesSearch && matchesTab
    })
  }, [effectiveOrders, debouncedSearch, activeTab])

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

  const handleDelete = async (id: string) => {
    const { deleteServiceOrderAction } = await import("@/app/actions/erp/service-orders")
    const res = await deleteServiceOrderAction(partnerId, id)
    if (res.success) {
      toast({ description: "OS deletada" })
      afterMutation()
    } else {
      toast({ description: res.error || "Erro ao deletar" })
    }
    setConfirmDelete(null)
  }

  const observerRef = useRef<HTMLDivElement>(null)
  useInfiniteScrollObserver(observerRef, {
    fetchNextPage: () => fetchNextPage(),
    enabled: true,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
  })

  const filterSections: FilterSectionConfig[] = useMemo(() => [
    {
      id: "status",
      title: "Status",
      type: "checkbox-list",
      options: Object.entries(SERVICE_ORDER_STATUS_META).map(([value, meta]) => meta.label),
    },
  ], [])

  return (
    <>
      <AnimatePresence mode="wait">
        {entityState.isOpen && (entityState.action === "create" || entityState.action === "edit") ? (
          isLoadingDetail ? (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
              <ThreeDotsLoader />
            </div>
          ) : (
            <ServiceOrderForm
              key={entityState.action}
              partnerId={partnerId}
              onBack={() => closeEntity()}
              onSaved={() => {
                closeEntity()
                afterMutation()
              }}
              editData={entityState.action === "edit" ? currentEntity : undefined}
            />
          )
        ) : entityState.isOpen && entityState.action === "view" && currentEntity ? (
          isLoadingDetail ? (
            <div className="flex items-center justify-center h-[calc(100vh-65px)] w-full">
              <ThreeDotsLoader />
            </div>
          ) : (
            <ServiceOrderDetail
              key="detail"
              data={currentEntity}
              partnerId={partnerId}
              onBack={() => closeEntity()}
              onMutation={() => afterMutation()}
            />
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
                <TabsList className="px-0 flex-wrap md:flex-nowrap gap-6 w-full justify-start border-b-0">
                  {STATUS_FILTERS.map((f) => (
                    <TabsTrigger key={f.value} value={f.value}>
                      {f.label}
                      {f.value !== "all" && (
                        <span className="ml-1.5 opacity-60 text-xs font-bold">
                          ({effectiveOrders?.filter((o: any) => o.status === f.value).length || 0})
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
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
                </div>

                <div className="flex-1" />

                {/* View Toggles */}
                <div className="flex items-center bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-full p-1 h-[42px] shrink-0">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "list" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                  >
                    <ListIcon className="w-[18px] h-[18px]" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`w-8 h-full flex items-center justify-center rounded-full transition-colors ${viewMode === "grid" ? "bg-gray-100 dark:bg-dark-border text-brand-dark dark:text-dark-heading" : "text-gray-400 hover:text-gray-600 dark:text-dark-body"}`}
                  >
                    <GridIcon className="w-[18px] h-[18px]" />
                  </button>
                </div>
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
              {paginated.length === 0 ? (
                <IconPlaceholder
                  placeholderType="image"
                  imageSrc="https://img.dudit.com.br/static/mascots/Estoque.png"
                  title="Nenhuma ordem de serviço"
                  subtitle={debouncedSearch ? "Nenhum resultado para esta busca." : "Crie sua primeira ordem de serviço."}
                  itemButton={debouncedSearch ? undefined : { text: "Nova OS", action: () => openEntity("create") }}
                />
              ) : (
                <>
                  {viewMode === "grid" ? (
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
                          statusColor={statusColor(o.status)}
                          statusLabel={statusLabel(o.status)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-full overflow-hidden rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface">
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
                                    className={`py-3 px-3 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} cursor-pointer hover:text-gray-900 dark:hover:text-dark-heading group select-none transition-colors ${col.id === "actions" ? "rounded-r-lg" : ""}`}
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
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />

                  <div ref={observerRef} className="h-4" />
                </>
              )}
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
        filters={{}}
        setFilters={() => {}}
        onClear={() => setShowFilters(false)}
      />
    </>
  )
}
