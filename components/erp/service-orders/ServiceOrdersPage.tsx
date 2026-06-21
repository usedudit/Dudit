"use client"

import React, { useState, useMemo, useCallback, useRef } from "react"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { Button, IconPlaceholder, ThreeDotsLoader, Input, SelectionBanner } from "@/components/reusable"
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
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const itemsPerPage = 50

  const entityPage = useEntityPage<any, any, any>({
    entityType: "service_orders",
    partnerId,
    queryKey: ["service-orders", partnerId],
    initialItems: rawOrders,
    initialNextCursor,
    initialHasMore,
    fetchPageFn: async ({ cursor }) => {
      const res = await getERPServiceOrdersPageAction(partnerId, { cursor, limit: 100, status: activeTab === "all" ? undefined : activeTab })
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
      if (!term) return true
      return (
        String(o.order_number || "").toLowerCase().includes(term) ||
        String(o.title || "").toLowerCase().includes(term) ||
        String(o.customer_snapshot?.name || "").toLowerCase().includes(term)
      )
    })
  }, [effectiveOrders, debouncedSearch])

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage)
  const paginated = filteredOrders.slice((page - 1) * itemsPerPage, page * itemsPerPage)

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
        {entityState.isOpen && entityState.action === "create" ? (
          <ServiceOrderForm
            key="create"
            partnerId={partnerId}
            onBack={() => closeEntity()}
            onSaved={() => {
              closeEntity()
              afterMutation()
            }}
          />
        ) : entityState.isOpen && entityState.action === "view" && currentEntity ? (
          isLoadingDetail ? (
            <ThreeDotsLoader />
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
          <FadeIn key="list">
            <div className="flex items-center justify-between mb-4 gap-4">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setActiveTab(f.value); setPage(1) }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                      activeTab === f.value
                        ? "bg-brand-dark text-white dark:bg-dark-heading dark:text-dark-surface"
                        : "bg-brand-gray text-brand-inactive-text hover:text-brand-dark dark:bg-dark-border dark:text-dark-body"
                    }`}
                  >
                    {f.label}
                    {f.value !== "all" && (
                      <span className="ml-1.5 opacity-60">
                        ({effectiveOrders?.filter((o: any) => o.status === f.value).length || 0})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button onClick={() => openEntity("create")} className="whitespace-nowrap">
                  <PlusIcon className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">Nova OS</span>
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-inactive-text" />
                <Input
                  placeholder="Buscar por nº, título ou cliente..."
                  value={search}
                  onChange={handleSearchChange}
                  className="pl-9 text-sm"
                />
              </div>
              <Button variant="outline" onClick={() => setShowFilters(true)}>
                <FilterIcon className="w-4 h-4" />
              </Button>
            </div>

            {selection.size > 0 && (
              <SelectionBanner
                selectedCount={selection.size}
                totalCount={filteredOrders.length}
                onSelectAll={() => setSelection(new Set(filteredOrders.map((o: any) => o.id)))}
                onClearSelection={() => setSelection(new Set())}
              />
            )}

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
                {isTabletOrMobile ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-brand-border dark:border-dark-border">
                            {COLUMNS.map((col) => (
                              <th
                                key={col.id}
                                className={`text-${col.align || "left"} px-4 py-3 text-[11px] font-bold text-brand-inactive-text uppercase tracking-wider`}
                                style={{ width: col.width, minWidth: col.width }}
                              >
                                {col.label}
                              </th>
                            ))}
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
