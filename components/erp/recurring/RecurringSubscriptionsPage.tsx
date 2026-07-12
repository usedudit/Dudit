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
  updateSubscriptionStockShortageResolvedAction,
  getSubscriptionBillingPanelAction,
  getSubscriptionForecastAction,
  getSubscriptionCreditsAction,
  syncSubscriptionWithMpErpAction,
} from "@/app/actions/erp/recurring-subscriptions"
import type { RecurringSubscription } from "@/lib/types/recurring"
import { getRecurringStatusLabel, getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate, formatCurrency } from "@/lib/utils"
import { useErpExport } from "@/hooks/use-erp-export"
import { ExportFileIcon, CalendarIcon, MoneyIcon, Users, ListIcon } from "@/lib/icons"
import { Button, Badge } from "@/components/reusable"

const COLUMNS = [
  { id: "customer", label: "Cliente", align: "left" as const, width: "250px" },
  { id: "plan", label: "Plano / Frequência", align: "left" as const, width: "250px" },
  { id: "status", label: "Situação", align: "center" as const, width: "150px" },
  { id: "nextExecution", label: "Próxima Execução", align: "left" as const, width: "200px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "250px" },
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
  const { exportData, isExporting } = useErpExport()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")
  const { canEdit } = usePermissions()
  const canManage = canEdit("recurring_subscriptions")

  const [currentTab, setCurrentTab] = useState<"list" | "billing" | "forecast" | "credits">("list")

  const [subscriptions, setSubscriptions] = useState<RecurringSubscription[]>(initialSubscriptions)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused" | "cancelled" | "expired" | "awaiting_restock">("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const effectiveViewMode = isTablet ? "grid" : viewMode
  const [page, setPage] = useState(1)

  // Execution history state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingExecutions, setLoadingExecutions] = useState(false)

  // Billing Panel States
  const [billingData, setBillingData] = useState<any[]>([])
  const [loadingBilling, setLoadingBilling] = useState(false)

  // Forecast States
  const [forecastData, setForecastData] = useState<any[]>([])
  const [loadingForecast, setLoadingForecast] = useState(false)

  // Credits States
  const [creditsData, setCreditsData] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [creditsSearch, setCreditsSearch] = useState("")

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
      status: statusVal as any,
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
    if (currentTab === "list") {
      reload(statusFilter, debouncedSearch)
    }
  }, [statusFilter, debouncedSearch, reload, currentTab])

  // Load other tab details
  const loadTabDetails = useCallback(async () => {
    if (currentTab === "billing") {
      setLoadingBilling(true)
      const res = await getSubscriptionBillingPanelAction(partnerId)
      setLoadingBilling(false)
      if (res.success && res.data) {
        setBillingData(res.data)
      }
    } else if (currentTab === "forecast") {
      setLoadingForecast(true)
      const res = await getSubscriptionForecastAction(partnerId)
      setLoadingForecast(false)
      if (res.success && res.data) {
        setForecastData(res.data)
      }
    } else if (currentTab === "credits") {
      setLoadingCredits(true)
      const res = await getSubscriptionCreditsAction(partnerId, creditsSearch)
      setLoadingCredits(false)
      if (res.success && res.data) {
        setCreditsData(res.data)
      }
    }
  }, [currentTab, partnerId, creditsSearch])

  useEffect(() => {
    loadTabDetails()
  }, [currentTab, loadTabDetails])

  // Load more / infinite scroll logic
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const res = await listRecurringSubscriptionsAction(partnerId, {
      cursor: nextCursor,
      status: statusFilter as any,
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
    enabled: currentTab === "list",
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
  }, [checkScroll, viewMode, subscriptions, currentTab])

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

  // Action execution: pause, resume, cancel, resolve_stock, sync
  const runAction = async (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", subscriptionId: string) => {
    if (action === "sync") {
      setLoading(true)
      const res = await syncSubscriptionWithMpErpAction(partnerId, subscriptionId)
      setLoading(false)
      if (!res.success) {
        toast({ title: "Erro", description: res.error, variant: "destructive" })
        return
      }
      toast({ title: `Assinatura sincronizada com sucesso!` })
      reload(statusFilter, debouncedSearch)
      return
    }

    if (action === "resolve_stock") {
      setLoading(true)
      const res = await updateSubscriptionStockShortageResolvedAction(partnerId, subscriptionId)
      setLoading(false)
      if (!res.success) {
        toast({ title: "Erro", description: res.error, variant: "destructive" })
        return
      }
      toast({ title: res.message || "Sucesso" })
      reload(statusFilter, debouncedSearch)
      return
    }

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

  const handleExport = useCallback(() => {
    void exportData({
      partnerId,
      module: "subscriptions",
      format: "xlsx",
      filters: {
        status: statusFilter,
        search: debouncedSearch,
      },
    })
  }, [exportData, partnerId, statusFilter, debouncedSearch])

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
            <h1 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none flex items-center gap-3">
              <CalendarIcon size={32} /> Assinaturas Recorrentes
            </h1>
            <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
              Gestão integrada de assinaturas, cobranças, estoque futuro e créditos de serviços.
            </p>
          </div>
          {currentTab === "list" && (
            <Button variant="outline" onClick={handleExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
              {isExporting ? "Exportando..." : "Exportar"}
            </Button>
          )}
        </div>

        {/* Inner Page Tabs */}
        <div className="flex border-b border-brand-border dark:border-dark-border mb-6 px-4 md:px-8 shrink-0 overflow-x-auto scrollbar-none gap-2">
          <button
            className={`pb-3 px-4 font-semibold text-sm transition-all relative ${currentTab === "list" ? "text-brand-primary" : "text-brand-inactive-text hover:text-brand-dark"}`}
            onClick={() => setCurrentTab("list")}
          >
            Assinaturas
            {currentTab === "list" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />}
          </button>
          <button
            className={`pb-3 px-4 font-semibold text-sm transition-all relative ${currentTab === "billing" ? "text-brand-primary" : "text-brand-inactive-text hover:text-brand-dark"}`}
            onClick={() => setCurrentTab("billing")}
          >
            Faturamento / Cobranças
            {currentTab === "billing" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />}
          </button>
          <button
            className={`pb-3 px-4 font-semibold text-sm transition-all relative ${currentTab === "forecast" ? "text-brand-primary" : "text-brand-inactive-text hover:text-brand-dark"}`}
            onClick={() => setCurrentTab("forecast")}
          >
            Calendário & Demanda
            {currentTab === "forecast" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />}
          </button>
          <button
            className={`pb-3 px-4 font-semibold text-sm transition-all relative ${currentTab === "credits" ? "text-brand-primary" : "text-brand-inactive-text hover:text-brand-dark"}`}
            onClick={() => setCurrentTab("credits")}
          >
            Saldos de Créditos
            {currentTab === "credits" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />}
          </button>
        </div>

        {/* Tab 1: Subscriptions list (original view) */}
        {currentTab === "list" && (
          <>
            <SubscriptionPageControls
              statusFilter={statusFilter as any}
              setStatusFilter={setStatusFilter as any}
              search={search}
              onSearchChange={setSearch}
              viewMode={effectiveViewMode}
              onViewModeChange={setViewModeState}
            />

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
                      imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
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
          </>
        )}

        {/* Tab 2: Billing / Faturamento Panel */}
        {currentTab === "billing" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-8">
            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 flex items-center gap-2">
              <MoneyIcon size={20} /> Painel de Cobranças e Notas
            </h2>
            {loadingBilling ? (
              <div className="flex items-center justify-center min-h-[300px]">
                <ThreeDotsLoader />
              </div>
            ) : billingData.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-brand-border dark:border-dark-border rounded-xl p-8">
                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum faturamento gerado por assinaturas ainda.</span>
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text font-semibold border-b border-brand-border dark:border-dark-border">
                      <th className="py-3 px-6">Pedido</th>
                      <th className="py-3 px-6">Cliente</th>
                      <th className="py-3 px-6">Data</th>
                      <th className="py-3 px-6 text-right">Valor</th>
                      <th className="py-3 px-6 text-center">Status Pagamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                    {billingData.map((order) => (
                      <tr key={order.id} className="hover:bg-brand-gray/10 dark:hover:bg-dark-border/10 transition-colors">
                        <td className="py-3 px-6 font-bold">#{order.order_number || order.id.slice(0, 8)}</td>
                        <td className="py-3 px-6 font-medium">{order.customer_name}</td>
                        <td className="py-3 px-6">{new Date(order.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="py-3 px-6 text-right font-semibold">{formatCurrency(order.total_amount)}</td>
                        <td className="py-3 px-6 text-center">
                          <Badge variant={order.situation === "paid" ? "green" : order.situation === "cancelled" ? "red" : "orange"}>
                            {order.situation === "paid" ? "Pago" : order.situation === "cancelled" ? "Cancelado" : "Pendente"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Forecast / Calendário & Demanda */}
        {currentTab === "forecast" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-8">
            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4 flex items-center gap-2">
              <CalendarIcon size={20} /> Calendário de Entregas & Execuções Futuras
            </h2>
            <p className="text-sm text-brand-inactive-text mb-6">Execuções e entregas agendadas nos próximos 30 dias de assinaturas ativas.</p>
            {loadingForecast ? (
              <div className="flex items-center justify-center min-h-[300px]">
                <ThreeDotsLoader />
              </div>
            ) : forecastData.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-brand-border dark:border-dark-border rounded-xl p-8">
                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhuma entrega ou cobrança prevista nos próximos 30 dias.</span>
              </div>
            ) : (
              <div className="grid gap-4">
                {forecastData.map((f, idx) => (
                  <div key={idx} className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold">
                        {new Date(f.scheduledFor).getDate()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{f.customerName}</p>
                        <p className="text-xs text-brand-inactive-text">{f.planName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-brand-primary">
                        Previsão: {new Date(f.scheduledFor).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Saldos de Créditos de Clientes */}
        {currentTab === "credits" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 pb-8 flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <Users size={20} /> Saldo de Créditos dos Clientes
              </h2>
              <div className="w-full md:w-72">
                <input
                  type="text"
                  placeholder="Buscar por cliente..."
                  value={creditsSearch}
                  onChange={(e) => setCreditsSearch(e.target.value)}
                  className="w-full px-4 py-2 border border-brand-border dark:border-dark-border rounded-lg text-sm bg-brand-gray/20 text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>

            {loadingCredits ? (
              <div className="flex items-center justify-center min-h-[300px]">
                <ThreeDotsLoader />
              </div>
            ) : creditsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-brand-border dark:border-dark-border rounded-xl p-8">
                <span className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum saldo de crédito de serviço encontrado.</span>
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border overflow-hidden flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-brand-gray dark:bg-dark-border/50 text-brand-inactive-text font-semibold border-b border-brand-border dark:border-dark-border">
                      <th className="py-3 px-6">Cliente</th>
                      <th className="py-3 px-6">Serviço do Plano</th>
                      <th className="py-3 px-6 text-center">Concedido</th>
                      <th className="py-3 px-6 text-center">Consumido</th>
                      <th className="py-3 px-6 text-center">Saldo Restante</th>
                      <th className="py-3 px-6">Validade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                    {creditsData.map((cred) => (
                      <tr key={cred.id} className="hover:bg-brand-gray/10 dark:hover:bg-dark-border/10 transition-colors">
                        <td className="py-3 px-6 font-bold">{cred.customerName}</td>
                        <td className="py-3 px-6 font-medium">{cred.serviceName}</td>
                        <td className="py-3 px-6 text-center">{cred.quantity}</td>
                        <td className="py-3 px-6 text-center text-brand-inactive-text">{cred.consumed}</td>
                        <td className="py-3 px-6 text-center">
                          <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${cred.remaining > 0 ? "bg-brand-green/10 text-brand-green" : "bg-brand-gray/40 text-brand-inactive-text"}`}>
                            {cred.remaining}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          {cred.expiresAt ? (
                            <span className="font-semibold text-brand-orange">{new Date(cred.expiresAt).toLocaleDateString("pt-BR")}</span>
                          ) : (
                            <span className="text-brand-inactive-text font-medium">Não expira</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </FadeIn>
  )
}
