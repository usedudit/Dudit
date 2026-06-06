"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"

// Reusable Components
import {
  IconPlaceholder,
  ThreeDotsLoader,
  Pagination,
} from "@/components/reusable"

// Specific components
import SubscriptionPageControls from "./SubscriptionPageControls"
import SubscriptionGridCard from "./SubscriptionGridCard"
import SubscriptionListRow from "./SubscriptionListRow"

// Utils
import { FadeIn } from "@/components/animations/FadeIn"
import {
  cancelRecurringSubscriptionAction,
  getRecurringSubscriptionExecutionsAction,
  listRecurringSubscriptionsAction,
  pauseRecurringSubscriptionAction,
  resumeRecurringSubscriptionAction,
} from "@/app/actions/erp/recurring-subscriptions"
import type { RecurringSubscription } from "@/lib/types/recurring"
import { getRecurringStatusLabel, getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

const COLUMNS = [
  { id: "customer", label: "Cliente", align: "left" as const, width: "250px" },
  { id: "plan", label: "Plano / Frequência", align: "left" as const, width: "250px" },
  { id: "status", label: "Situação", align: "center" as const, width: "150px" },
  { id: "nextExecution", label: "Próxima Execução", align: "left" as const, width: "200px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "200px" },
]

export default function RecurringSubscriptionsPage({
  partnerId,
  initialSubscriptions = [],
  initialHasMore,
  initialNextCursor,
}: {
  partnerId: string
  initialSubscriptions: RecurringSubscription[]
  initialHasMore: boolean
  initialNextCursor: string | null
}) {
  const { toast } = useToast()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")
  const { canEdit } = usePermissions()
  const canManage = canEdit("recurring_subscriptions")

  const [subscriptions, setSubscriptions] = useState<RecurringSubscription[]>(initialSubscriptions)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "cancelled" | "expired">("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const effectiveViewMode = isTablet ? "grid" : viewMode
  const [page, setPage] = useState(1)

  // Execution history state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingExecutions, setLoadingExecutions] = useState(false)

  const observerTarget = useRef<HTMLDivElement>(null)
  const itemsPerPage = 8

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  // Fetch / reload subscriptions when filters change
  const reload = useCallback(async (statusVal: typeof statusFilter, searchVal: string) => {
    setLoading(true)
    const res = await listRecurringSubscriptionsAction(partnerId, {
      status: statusVal,
      search: searchVal,
    })
    setLoading(false)
    if (res.success && res.data) {
      setSubscriptions(res.data.items as RecurringSubscription[])
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
      setPage(1)
    }
  }, [partnerId])

  useEffect(() => {
    reload(statusFilter, debouncedSearch)
  }, [statusFilter, debouncedSearch, reload])

  // Load more / infinite scroll logic
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const res = await listRecurringSubscriptionsAction(partnerId, {
      cursor: nextCursor,
      status: statusFilter,
      search: debouncedSearch,
    })
    setLoadingMore(false)
    if (res.success && res.data) {
      setSubscriptions((prev) => [...prev, ...(res.data!.items as RecurringSubscription[])])
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
    }
  }, [partnerId, nextCursor, statusFilter, debouncedSearch, loadingMore])

  useInfiniteScrollObserver(observerTarget, {
    enabled: true,
    hasNextPage: !!hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
    rootMargin: "320px",
    threshold: 0,
  })

  // Table Scroll indicators
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

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
  }, [checkScroll, viewMode, subscriptions])

  // Toggle/Open execution history
  const toggleHistory = async (subscriptionId: string) => {
    if (selectedId === subscriptionId) {
      setSelectedId(null)
      return
    }
    setSelectedId(subscriptionId)
    setLoadingExecutions(true)
    const res = await getRecurringSubscriptionExecutionsAction(partnerId, subscriptionId)
    setLoadingExecutions(false)
    if (res.success) {
      setExecutions(res.data || [])
    } else {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
    }
  }

  // Action execution: pause, resume, cancel
  const runAction = async (action: "pause" | "resume" | "cancel", subscriptionId: string) => {
    const fn =
      action === "pause"
        ? pauseRecurringSubscriptionAction
        : action === "resume"
          ? resumeRecurringSubscriptionAction
          : cancelRecurringSubscriptionAction

    const res = await fn(partnerId, subscriptionId)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Assinatura atualizada com sucesso!" })
    reload(statusFilter, debouncedSearch)
  }

  const totalPages = Math.ceil(subscriptions.length / itemsPerPage)
  const paginated = subscriptions.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  useEffect(() => {
    if (page === totalPages && hasMore && !loadingMore) {
      void loadMore()
    }
  }, [page, totalPages, hasMore, loadingMore, loadMore])

  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "paused") return "orange" as const
    if (status === "cancelled") return "red" as const
    return "gray" as const
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

        {/* Header */}
        <div className="hidden md:flex items-start justify-between mb-6 flex-none px-4 md:px-8">
          <div className="flex flex-col gap-2 pt-1">
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
              Assinaturas Recorrentes
            </h1>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Acompanhe assinaturas ativas e o histórico de execuções automáticas de cobrança.
            </p>
          </div>
        </div>

        {/* Tabs & Controls */}
        <SubscriptionPageControls
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          onSearchChange={setSearch}
          viewMode={effectiveViewMode}
          onViewModeChange={setViewModeState}
        />

        {/* Listing content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative pb-20 md:pb-2 px-4 md:px-8">
          <AnimatePresence mode="wait">
            {loading ? (
              <FadeIn key="loading" className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
              </FadeIn>
            ) : subscriptions.length === 0 ? (
              <FadeIn key="empty" className="w-full h-full flex items-center justify-center min-h-[400px]">
                <IconPlaceholder
                  placeholderType="image"
                  imageSrc="https://img.dudit.com.br/static/mascots/Estoque.png"
                  imageAlt="Nenhuma assinatura"
                  title="Nenhuma assinatura encontrada"
                  subtitle="Tente ajustar a busca ou os filtros de status."
                  itemButton={search ? {
                    text: "Limpar busca",
                    action: () => setSearch(""),
                    variant: "outline"
                  } : undefined}
                />
              </FadeIn>
            ) : (
              <FadeIn key={statusFilter + effectiveViewMode} className="w-full">
                {effectiveViewMode === "grid" ? (
                  /* Cards / Mobile Layout */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                    {paginated.map((sub: any) => (
                      <SubscriptionGridCard
                        key={sub.id}
                        sub={sub}
                        canManage={canManage}
                        selectedId={selectedId}
                        loadingExecutions={loadingExecutions}
                        executions={executions}
                        onToggleHistory={toggleHistory}
                        onRunAction={runAction}
                      />
                    ))}
                  </div>
                ) : (
                  /* Desktop List Layout */
                  <div className="w-full overflow-hidden rounded-xl border border-brand-border dark:border-dark-border relative">
                    <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                    <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                    <div className="overflow-x-auto pb-2 custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                      <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                        <thead>
                          <tr className="bg-brand-gray dark:bg-dark-border/50">
                            {COLUMNS.map((col) => (
                              <th
                                key={col.id}
                                className="py-3 px-6 text-[13px] font-semibold text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 border-b border-brand-border dark:border-dark-border"
                                style={{ width: col.width }}
                              >
                                <div className={`flex items-center ${col.align === "center" ? "justify-center" : "justify-start"}`}>
                                  {col.label}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map((sub: any) => (
                            <SubscriptionListRow
                              key={sub.id}
                              sub={sub}
                              columns={COLUMNS}
                              canManage={canManage}
                              selectedId={selectedId}
                              loadingExecutions={loadingExecutions}
                              executions={executions}
                              onToggleHistory={toggleHistory}
                              onRunAction={runAction}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </FadeIn>
            )}
          </AnimatePresence>
          {hasMore ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}
        </div>

        {subscriptions.length > 0 && paginated.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(p) => {
              setPage(p)
              if (p === totalPages && hasMore && !loadingMore) {
                void loadMore()
              }
            }}
          />
        )}
      </div>
    </FadeIn>
  )
}
