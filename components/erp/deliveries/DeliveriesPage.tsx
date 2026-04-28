"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, IconPlaceholder } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import Pagination from "@/components/reusable/Pagination"
import FilterSheet, { FilterSectionConfig } from "@/components/reusable/FilterSheet"
import { ExportFileIcon, PlusIcon, ArrowUpDownIcon } from "@/lib/icons"
import { useInfiniteList } from "@/hooks/use-infinite-list"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { getERPDeliveriesPageAction, type ERPDeliveryListCursor, updateERPDeliveryStatusAction } from "@/app/actions/erp/deliveries"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import DeliveryPageControls from "./DeliveryPageControls"
import DeliveryListItem from "./DeliveryListRow"
import DeliveryGridCard from "./DeliveryGridCard"
import CreateDeliveryPage from "./CreateDeliveryPage"
import DeliveryDetailPage from "./DeliveryDetailPage"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

type SortKey = "order_id" | "delivery_fee" | "status" | "delivery_person" | "estimated_time" | "dates" | "delivered_at"
type SortDirection = "asc" | "desc"

const ITEMS_PER_PAGE = 8

const COLUMNS: Array<{ id: SortKey | "actions"; label: string; align: "left" | "center" | "right"; width: string }> = [
  { id: "order_id", label: "Pedido", align: "left", width: "240px" },
  { id: "delivery_fee", label: "Valor Envio", align: "left", width: "140px" },
  { id: "status", label: "Status", align: "left", width: "130px" },
  { id: "delivery_person", label: "Entregador", align: "left", width: "220px" },
  { id: "estimated_time", label: "Tempo Estimado", align: "left", width: "140px" },
  { id: "dates", label: "Data saída / Prevista", align: "left", width: "220px" },
  { id: "delivered_at", label: "Data Entrega", align: "left", width: "170px" },
  { id: "actions", label: "Ações", align: "center", width: "70px" },
]

export default function DeliveriesPage({
  partnerId,
  deliveries: initialDeliveries,
  initialNextCursor,
  initialHasMore,
  planGate,
}: {
  partnerId: string
  deliveries: any[]
  initialNextCursor: ERPDeliveryListCursor | null
  initialHasMore: boolean
  planGate?: { requiredPlanSlug: "vendedor"; message: string }
}) {
  const { openPlanUpgrade } = usePlanUpgrade()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null)
  const [filters, setFilters] = useState<{ status: string[] }>({ status: [] })
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [wrapper, setWrapper] = useState<"list" | "create" | "detail">("list")
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({})
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const observerTarget = useRef<HTMLDivElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

  const queryKey = useMemo(() => ["erp", "deliveries", partnerId] as const, [partnerId])
  const { items, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteList<any, ERPDeliveryListCursor>({
    queryKey,
    initialPage: { items: initialDeliveries, nextCursor: initialNextCursor, hasMore: initialHasMore },
    fetchFn: async ({ cursor }) => {
      const res = await getERPDeliveriesPageAction(partnerId, { cursor, limit: 100 })
      if (!res.success) throw new Error(res.error || "Erro ao carregar entregas.")
      return { items: res.items, nextCursor: res.nextCursor, hasMore: res.hasMore }
    },
    dedupeKey: useCallback((d: any) => String(d?.id || ""), []),
  })

  useInfiniteScrollObserver(observerTarget, {
    enabled: true,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage: () => fetchNextPage(),
    rootMargin: "320px",
    threshold: 0,
  })

  const checkScroll = () => {
    if (!tableContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
    setScrollState((prev) => {
      const nextLeft = scrollLeft > 0
      const nextRight = scrollLeft < scrollWidth - clientWidth - 2
      if (prev.left === nextLeft && prev.right === nextRight) return prev
      return { left: nextLeft, right: nextRight }
    })
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    checkScroll()
    window.addEventListener("resize", checkScroll)
    return () => window.removeEventListener("resize", checkScroll)
  }, [viewMode, items])

  const mapped = useMemo(() => {
    const term = debouncedSearch.toLowerCase().trim()
    const nowMs = Date.now()
    let list = (items || []).map((raw: any) => {
      const links = Array.isArray(raw.delivery_orders) ? raw.delivery_orders : []
      const firstLink = [...links].sort((a: any, b: any) => Number(a.position || 9999) - Number(b.position || 9999))[0]
      const order = firstLink?.orders || {}
      const deliveryPersonName = raw.partner_users?.user_profiles?.full_name || null
      const effectiveStatus = statusOverrides[raw.id] || raw.status || "not_sent"
      const estimatedArrivalAt = raw.started_at && raw.estimated_duration_minutes
        ? new Date(new Date(raw.started_at).getTime() + Number(raw.estimated_duration_minutes) * 60000).toISOString()
        : null
      const isClosed = ["delivered", "cancelled", "delivery_failed"].includes(effectiveStatus)
      const isLate = !!estimatedArrivalAt && !isClosed && nowMs > new Date(estimatedArrivalAt).getTime()
      const remainingMs = estimatedArrivalAt ? Math.max(0, new Date(estimatedArrivalAt).getTime() - nowMs) : 0
      const remainingMinutes = Math.ceil(remainingMs / 60000)
      const remainingHoursPart = Math.floor(remainingMinutes / 60)
      const remainingMinutesPart = remainingMinutes % 60
      const remainingLabel = remainingHoursPart > 0
        ? `Vence em ${remainingHoursPart}h ${remainingMinutesPart}m`
        : `Vence em ${remainingMinutes} min`
      return {
        id: raw.id,
        orderId: firstLink?.order_id || null,
        orderCount: links.length,
        orderDisplayId: order.order_number || (firstLink?.order_id ? `#${String(firstLink.order_id).slice(0, 8).toUpperCase()}` : "-"),
        customerName: order.customer_name || "Cliente",
        status: effectiveStatus,
        deliveryPersonName,
        estimatedDurationMinutes: Number(raw.estimated_duration_minutes || 0),
        startedAt: raw.started_at,
        deliveredAt: raw.delivered_at,
        estimatedArrivalAt,
        deliveryFee: Number(order.shipping_cost || 0),
        createdAtMs: new Date(raw.created_at).getTime(),
        deliveryTimingState: isLate ? "late" : "on_time",
        deliveryTimingLabel: estimatedArrivalAt ? (isLate ? "Atrasada" : "No prazo") : "",
        deliveryTimingDetail: estimatedArrivalAt && !isLate && !isClosed ? remainingLabel : "",
      }
    })

    list = list.filter((d) => {
      const matchSearch = !term || d.orderDisplayId.toLowerCase().includes(term) || d.customerName.toLowerCase().includes(term)
      const statusLabel = getDeliveryStatusMeta(d.status).label
      const matchStatus = filters.status.length === 0 || filters.status.includes(statusLabel)
      return matchSearch && matchStatus
    })

    if (sortConfig) {
      list = [...list].sort((a: any, b: any) => {
        let aVal: any = a[sortConfig.key]
        let bVal: any = b[sortConfig.key]
        if (sortConfig.key === "dates") {
          aVal = new Date(a.startedAt || 0).getTime()
          bVal = new Date(b.startedAt || 0).getTime()
        }
        if (aVal === bVal) return 0
        const cmp = aVal < bVal ? -1 : 1
        return sortConfig.direction === "asc" ? cmp : -cmp
      })
    }
    return list
  }, [items, search, filters, sortConfig, statusOverrides])

  const handleQuickStatusChange = async (deliveryId: string, status: string) => {
    const previous = statusOverrides[deliveryId]
    setStatusOverrides((prev) => ({ ...prev, [deliveryId]: status }))
    const res = await updateERPDeliveryStatusAction({ partnerId, deliveryId, status: status as any })
    if (!res.success) {
      setStatusOverrides((prev) => {
        const next = { ...prev }
        if (previous) next[deliveryId] = previous
        else delete next[deliveryId]
        return next
      })
    }
  }

  const totalPages = Math.max(1, Math.ceil(mapped.length / ITEMS_PER_PAGE))
  const paginated = mapped.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  const filterSections: FilterSectionConfig[] = [{ id: "status", title: "Status", type: "checkbox-list", options: ["Não enviado", "Preparando", "Enviado", "Entregue", "Disponível para retirada", "Entrega não realizada", "Cancelado"] }]

  return (
    <AnimatePresence mode="wait">
      {wrapper === "create" ? (
        <FadeIn key="create" className="w-full h-full">
          <CreateDeliveryPage partnerId={partnerId} onBack={() => setWrapper("list")} onSuccess={() => setWrapper("list")} />
        </FadeIn>
      ) : wrapper === "detail" && selectedDeliveryId ? (
        <FadeIn key="detail" className="w-full h-full">
          <DeliveryDetailPage deliveryId={selectedDeliveryId} partnerId={partnerId} onBack={() => setWrapper("list")} />
        </FadeIn>
      ) : (
        <FadeIn key="list" className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
          <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
            <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
              <div className="flex flex-col gap-2 pt-1">
                <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">Entregas</h1>
                <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Gerencie as entregas vinculadas aos pedidos.</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" leftIcon={<ExportFileIcon size={18} />}>
                  Exportar
                </Button>
                <Button onClick={() => setWrapper("create")} disabled={!!planGate} leftIcon={<PlusIcon size={18} />}>
                  Nova Entrega
                </Button>
              </div>
            </div>

            <DeliveryPageControls
              search={search}
              onSearchChange={setSearch}
              onOpenFilter={() => setIsFilterOpen(true)}
              onAdd={() => setWrapper("create")}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              addDisabled={!!planGate}
            />

            <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
              <AnimatePresence mode="wait">
                {paginated.length === 0 ? (
                  <FadeIn key="empty" className="flex flex-col items-center justify-center h-[600px] text-center p-8 w-full">
                    <IconPlaceholder
                      placeholderType="image"
                      imageSrc={
                        planGate
                          ? "https://img.dudit.com.br/static/mascots/Plano.png"
                          : "https://img.dudit.com.br/static/mascots/Entregas.png"
                      }
                      imageAlt={planGate ? "Plano necessário" : "Sem entregas"}
                      title={planGate ? "Plano necessário" : "Nenhuma entrega encontrada"}
                      subtitle={
                        planGate
                          ? planGate.message
                          : "Crie uma entrega a partir de um pedido para começar."
                      }
                      itemButton={
                        planGate ? {
                          text: "Ver Plano Vender",
                          action: () => openPlanUpgrade("vendedor"),
                        } : undefined
                      }
                    />
                  </FadeIn>
                ) : viewMode === "grid" ? (
                  <FadeIn key="grid" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                    {paginated.map((delivery) => <DeliveryGridCard key={delivery.id} delivery={delivery} onQuickStatusChange={handleQuickStatusChange} onDetails={() => { setSelectedDeliveryId(delivery.id); setWrapper("detail") }} />)}
                  </FadeIn>
                ) : (
                  <FadeIn key="list-table" className="w-full overflow-hidden rounded-xl relative">
                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />
                    <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                      <table className="w-full text-left border-separate border-spacing-0 min-w-[1400px]">
                        <thead>
                          <tr className="bg-brand-gray dark:bg-dark-border/50">
                            {COLUMNS.map((col, idx) => {
                              const sortable = col.id !== "actions"
                              const sorted = sortConfig?.key === col.id
                              return (
                                <th
                                  key={col.id}
                                  style={{ width: col.width }}
                                  className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${idx === 0 ? "rounded-l-lg" : ""} ${idx === COLUMNS.length - 1 ? "rounded-r-lg" : ""} ${sortable ? "cursor-pointer group" : ""}`}
                                  onClick={() => {
                                    if (!sortable) return
                                    setSortConfig((prev) => ({ key: col.id as SortKey, direction: prev?.key === col.id && prev.direction === "asc" ? "desc" : "asc" }))
                                  }}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{col.label}</span>
                                    {sortable ? <ArrowUpDownIcon size={14} className={`transition-all duration-200 ${sorted ? "text-brand-dark dark:text-dark-heading opacity-100" : "text-brand-inactive-text opacity-40 group-hover:opacity-100"}`} /> : null}
                                  </div>
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map((delivery) => (
                            <DeliveryListItem key={delivery.id} delivery={delivery} columns={COLUMNS as any} onQuickStatusChange={handleQuickStatusChange} onDetails={() => { setSelectedDeliveryId(delivery.id); setWrapper("detail") }} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </FadeIn>
                )}
              </AnimatePresence>
              {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
            </div>

            {mapped.length > 0 ? (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => {
                  setPage(p)
                  if (p === totalPages && hasNextPage && !isFetchingNextPage) void fetchNextPage()
                }}
              />
            ) : null}

            <FilterSheet
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              sections={filterSections}
              filters={filters}
              setFilters={setFilters as any}
              onClear={() => setFilters({ status: [] })}
            />
          </div>
        </FadeIn>
      )}
    </AnimatePresence>
  )
}
