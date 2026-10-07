"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityState } from "@/hooks/use-entity-state"

// Reusable Components
import {
  IconPlaceholder,
  Input,
  Pagination,
  Tabs,
  TabsContent,
} from "@/components/reusable"
import { SummaryCards } from "@/components/erp/dashboard/LeftColumn"
import { ReportTableCard } from "@/components/erp/reports/widgets"

// Specific components
import SubscriptionPageControls from "./SubscriptionPageControls"
import SubscriptionGridCard from "./SubscriptionGridCard"
import SubscriptionListRow from "./SubscriptionListRow"
import SubscriptionDetailPage from "./SubscriptionDetailPage"

// Utils
import { FadeIn } from "@/components/animations/FadeIn"
import {
  cancelRecurringSubscriptionAction,
  listRecurringSubscriptionsAction,
  pauseRecurringSubscriptionAction,
  resumeRecurringSubscriptionAction,
  updateSubscriptionStockShortageResolvedAction,
  getSubscriptionBillingPanelAction,
  getSubscriptionForecastAction,
  getSubscriptionCreditsAction,
  syncSubscriptionWithMpErpAction,
  getRecurringSubscriptionStatsAction,
} from "@/app/actions/erp/recurring-subscriptions"
import type { RecurringSubscription, RecurringSubscriptionStatusFilter } from "@/lib/types/recurring"
import { formatCurrency } from "@/lib/utils"
import { useErpExport } from "@/hooks/use-erp-export"
import { useStore } from "@/lib/store-context"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import {
  ExportFileIcon,
  CalendarIcon,
  MoneyIcon,
  Users,
  ListIcon,
  CreditCardIcon,
  CheckCircleIcon,
  CancelCircleIcon,
  AlertTriangleIcon,
  RepeatIcon,
  SearchIcon,
  ChevronLeftIcon,
} from "@/lib/icons"
import { Button, Badge, ListItem } from "@/components/reusable"

const COLUMNS: Array<{ id: string; label: string; align?: "left" | "center" | "right"; width?: string }> = [
  { id: "customer", label: "Cliente", align: "left" as const, width: "250px" },
  { id: "plan", label: "Plano / Frequência", align: "left" as const, width: "250px" },
  { id: "status", label: "Situação", align: "center" as const, width: "150px" },
  { id: "nextExecution", label: "Próxima Execução", align: "left" as const, width: "200px" },
  { id: "shipping", label: "Frete", align: "left" as const, width: "150px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "250px" },
]

const PulseBlock = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse rounded-[24px] border border-brand-border bg-brand-gray/40 dark:border-dark-border dark:bg-dark-border/20 ${className}`} />
)

type SectionKey = "home" | "list" | "billing" | "forecast" | "credits"

const SECTION_META: Record<SectionKey, { title: string; subtitle: string }> = {
  home: {
    title: "Assinaturas Recorrentes",
    subtitle: "Gestão integrada de assinaturas, cobranças, estoque futuro e créditos de serviços.",
  },
  list: {
    title: "Assinaturas",
    subtitle: "Clientes, próximas execuções e situação de cada assinatura.",
  },
  billing: {
    title: "Faturamento / Cobranças",
    subtitle: "Pedidos gerados por assinaturas e situação dos pagamentos.",
  },
  forecast: {
    title: "Calendário & Demanda",
    subtitle: "Execuções e entregas previstas para os próximos 30 dias.",
  },
  credits: {
    title: "Saldos de Créditos",
    subtitle: "Saldo de serviços disponíveis em cada cliente.",
  },
}

const SECTIONS: { key: Exclude<SectionKey, "home">; title: string; description: string; icon: typeof ListIcon }[] = [
  {
    key: "list",
    title: "Assinaturas",
    description: "Clientes, próximas execuções e ações de pausar, retomar ou cancelar.",
    icon: ListIcon,
  },
  {
    key: "billing",
    title: "Faturamento / Cobranças",
    description: "Pedidos gerados pelas assinaturas e status de pagamento.",
    icon: MoneyIcon,
  },
  {
    key: "forecast",
    title: "Calendário & Demanda",
    description: "Execuções e entregas previstas nos próximos 30 dias.",
    icon: CalendarIcon,
  },
  {
    key: "credits",
    title: "Saldos de Créditos",
    description: "Saldo de serviços disponível em cada cliente.",
    icon: CreditCardIcon,
  },
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
  const { planSlug } = usePermissions()
  const { exportData, isExporting, columnSelectionModal, closeColumnSelectionModal, handleColumnConfirm } = useErpExport(planSlug)
  const isMobile = useMediaQuery("(max-width: 767px)")
  const isTablet = useMediaQuery("(max-width: 1024px)")
  const { canEdit } = usePermissions()
  const canManage = canEdit("recurring_subscriptions")
  const { selectedStore } = useStore()

  const [currentTab, setCurrentTab] = useState<"home" | "list" | "billing" | "forecast" | "credits">("home")

  const [subscriptions, setSubscriptions] = useState<RecurringSubscription[]>(initialSubscriptions)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [statusFilter, setStatusFilter] = useState<RecurringSubscriptionStatusFilter>("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const effectiveViewMode = isTablet ? "grid" : viewMode
  const [page, setPage] = useState(1)

  // Billing Panel States
  const [billingData, setBillingData] = useState<any[]>([])
  const [loadingBilling, setLoadingBilling] = useState(true)

  // Forecast States
  const [forecastData, setForecastData] = useState<any[]>([])
  const [loadingForecast, setLoadingForecast] = useState(true)

  // Credits States
  const [creditsData, setCreditsData] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [creditsSearch, setCreditsSearch] = useState("")

  const [tabCounts, setTabCounts] = useState<{
    all: number
    active: number
    paused: number
    pending: number
    delinquent: number
    awaiting_restock: number
    cancelled: number
  } | null>(null)

  const observerTarget = useRef<HTMLDivElement>(null)
  const itemsPerPage = 8

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const loadStats = useCallback(async () => {
    const res = await getRecurringSubscriptionStatsAction(partnerId, { storeId: selectedStore?.id || null })
    if (res.success && res.data) {
      setTabCounts({
        all: res.data.total,
        active: res.data.active,
        paused: res.data.paused,
        pending: res.data.pending,
        delinquent: res.data.delinquent,
        awaiting_restock: res.data.awaiting_restock,
        cancelled: res.data.cancelled,
      })
    }
  }, [partnerId, selectedStore?.id])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  // Fetch / reload subscriptions when filters change
  const reload = useCallback(async (statusVal: typeof statusFilter, searchVal: string) => {
    setLoading(true)
    const res = await listRecurringSubscriptionsAction(partnerId, {
      status: statusVal,
      search: searchVal,
      storeId: selectedStore?.id || undefined,
    })
    setLoading(false)
    void loadStats()
    if (res.success && res.data) {
      setSubscriptions(res.data.items as RecurringSubscription[])
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
      setPage(1)
    }
  }, [partnerId, loadStats, selectedStore?.id])

  useEffect(() => {
    if (currentTab === "list") {
      reload(statusFilter, debouncedSearch)
    }
  }, [statusFilter, debouncedSearch, reload, currentTab])

  // Load other tab details
  const loadTabDetails = useCallback(async () => {
    if (currentTab === "home" || currentTab === "list") {
      return
    }
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
      status: statusFilter,
      search: debouncedSearch,
      storeId: selectedStore?.id || undefined,
    })
    setLoadingMore(false)
    if (res.success && res.data) {
      setSubscriptions((prev) => [...prev, ...(res.data!.items as RecurringSubscription[])])
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
    }
  }, [partnerId, nextCursor, statusFilter, debouncedSearch, loadingMore, selectedStore?.id])

  // Full-screen detail (?view=<id>, ?view=<id>&type=history)
  const { state: entityState, open: openEntity, close: closeEntity } = useEntityState()
  const isDetailOpen = entityState.isOpen && entityState.action === "view" && !!entityState.entityId
  const detailSubscriptionId = isDetailOpen ? entityState.entityId : null
  const detailInitialTab = entityState.entityType === "history" ? "history" : "general"

  const openDetail = useCallback(
    (subscriptionId: string, tab: "general" | "history" = "general") => {
      openEntity("view", subscriptionId, tab === "history" ? "history" : undefined)
    },
    [openEntity],
  )

  useInfiniteScrollObserver(observerTarget, {
    enabled: currentTab === "list" && !isDetailOpen,
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
        storeId: selectedStore?.id || null,
        status: statusFilter,
        search: debouncedSearch,
      },
    })
  }, [exportData, partnerId, selectedStore?.id, statusFilter, debouncedSearch])

  const kpis = useMemo(() => {
    if (!tabCounts) return []
    return [
      { title: "Assinaturas Ativas", value: String(tabCounts.active), trend: "", icon: CheckCircleIcon },
      { title: "Pausadas", value: String(tabCounts.paused), trend: "", icon: CancelCircleIcon },
      { title: "Com Pendência", value: String(tabCounts.delinquent), trend: "", icon: AlertTriangleIcon },
      { title: "Total", value: String(tabCounts.all), trend: "", icon: RepeatIcon },
    ]
  }, [tabCounts])

  const billingColumns = useMemo(
    () => [
      {
        key: "order_number",
        header: "Pedido",
        render: (value: any, row: any) => <span className="font-bold">#{value || row.id.slice(0, 8)}</span>,
      },
      { key: "customer_name", header: "Cliente" },
      { key: "created_at", header: "Data", render: (value: any) => new Date(value).toLocaleDateString("pt-BR") },
      {
        key: "total_amount",
        header: "Valor",
        align: "right" as const,
        render: (value: any) => <span className="font-semibold">{formatCurrency(value)}</span>,
      },
      {
        key: "situation",
        header: "Status Pagamento",
        align: "center" as const,
        render: (value: any) => (
          <Badge variant={value === "paid" ? "green" : value === "cancelled" ? "red" : "orange"}>
            {value === "paid" ? "Pago" : value === "cancelled" ? "Cancelado" : "Pendente"}
          </Badge>
        ),
      },
    ],
    [],
  )

  const creditColumns = useMemo(
    () => [
      { key: "customerName", header: "Cliente" },
      { key: "serviceName", header: "Serviço do Plano" },
      { key: "quantity", header: "Concedido", align: "center" as const },
      {
        key: "consumed",
        header: "Consumido",
        align: "center" as const,
        render: (value: any) => <span className="text-brand-inactive-text">{value}</span>,
      },
      {
        key: "remaining",
        header: "Saldo Restante",
        align: "center" as const,
        render: (value: any) => (
          <span
            className={`inline-block px-2.5 py-1 rounded-full font-bold text-xs ${value > 0 ? "bg-brand-green/10 text-brand-green" : "bg-brand-gray/40 text-brand-inactive-text"}`}
          >
            {value}
          </span>
        ),
      },
      {
        key: "expiresAt",
        header: "Validade",
        render: (value: any) =>
          value ? (
            <span className="font-semibold text-brand-orange">{new Date(value).toLocaleDateString("pt-BR")}</span>
          ) : (
            <span className="text-brand-inactive-text font-medium">Não expira</span>
          ),
      },
    ],
    [],
  )

  return (
    <FadeIn className="w-full">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 9999px; border: 2px solid #fff; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border: 2px solid #1f2937; }
        .dark .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .sub-table tbody tr:last-child > td { border-bottom: none; }
      `}</style>

      <AnimatePresence mode="wait">
        {detailSubscriptionId ? (
          <SubscriptionDetailPage
            key={`detail-${detailSubscriptionId}`}
            partnerId={partnerId}
            subscriptionId={detailSubscriptionId}
            onBack={closeEntity}
            canManage={canManage}
            initialTab={detailInitialTab}
            onChanged={() => reload(statusFilter, debouncedSearch)}
          />
        ) : (
          <FadeIn key="list" className="block w-full">
      <div className="w-full space-y-6 pt-4 px-4 md:px-8 pb-8">
        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {currentTab !== "home" && (
              <Button
                variant="outline"
                onClick={() => setCurrentTab("home")}
                leftIcon={<ChevronLeftIcon size={18} />}
                className="mt-1 shrink-0"
              >
                Voltar
              </Button>
            )}
            <div>
              <h1 className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading flex items-center gap-2">
                {SECTION_META[currentTab].title}
              </h1>
              <p className="mt-1 text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                {SECTION_META[currentTab].subtitle}
              </p>
            </div>
          </div>
          {currentTab === "list" && (
            <Button variant="outline" onClick={handleExport} disabled={isExporting} leftIcon={<ExportFileIcon size={18} />}>
              {isExporting ? "Exportando..." : "Exportar"}
            </Button>
          )}
        </header>

        {/* KPI row */}
        {(currentTab === "home" || currentTab === "list") && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
            <div className="lg:col-span-12">
              {kpis.length > 0 ? (
                <SummaryCards metrics={kpis} variant="horizontal" />
              ) : (
                <PulseBlock className="h-[120px] w-full" />
              )}
            </div>
          </div>
        )}

        {/* Landing: secoes no estilo configuracoes */}
        {currentTab === "home" && (
          <FadeIn key="home-sections" className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {SECTIONS.map((section) => (
                <ListItem
                  key={section.key}
                  icon={section.icon}
                  title={section.title}
                  description={section.description}
                  onClick={() => setCurrentTab(section.key)}
                  showChevron
                  className="px-4 py-3 gap-4"
                />
              ))}
            </div>
          </FadeIn>
        )}

        {/* Sections */}
        <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as SectionKey)} className="w-full">

          {/* Tab 1: Subscriptions list */}
          <TabsContent value="list">
            <SubscriptionPageControls
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              search={search}
              onSearchChange={setSearch}
              viewMode={effectiveViewMode}
              onViewModeChange={setViewModeState}
              tabCounts={tabCounts || undefined}
            />

            <AnimatePresence mode="wait">
              {loading ? (
                <FadeIn key="loading" className="w-full">
                  <PulseBlock className="h-[480px] w-full" />
                </FadeIn>
              ) : subscriptions.length === 0 ? (
                <FadeIn key="empty" className="w-full flex items-center justify-center min-h-[400px]">
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
                          onOpen={openDetail}
                          onRunAction={runAction}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-full bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border relative">
                      <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                      <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-surface to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                      <div className="overflow-x-auto custom-scrollbar" ref={tableContainerRef} onScroll={checkScroll}>
                        <table className="sub-table w-full text-left border-separate border-spacing-0 min-w-[1000px]">
                          <thead>
                            <tr className="bg-brand-gray dark:bg-dark-border/50">
                              {COLUMNS.map((col, index) => (
                                <th
                                  key={col.id}
                                  className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"} ${index === 0 ? "rounded-l-lg pl-6" : ""} ${col.id === "actions" ? "rounded-r-lg pr-6" : ""}`}
                                  style={{ width: col.width }}
                                >
                                  <div className={`flex items-center ${col.align === "center" ? "justify-center" : col.align === "right" ? "justify-end" : "justify-start"}`}>
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
                                onOpen={openDetail}
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
          </TabsContent>

          {/* Tab 2: Billing / Faturamento Panel */}
          <TabsContent value="billing">
            {loadingBilling ? (
              <PulseBlock className="h-[360px] w-full" />
            ) : (
              <ReportTableCard
                title="Painel de Cobranças e Notas"
                icon={MoneyIcon}
                columns={billingColumns}
                data={billingData}
                pageSize={8}
                emptyMessage="Nenhum faturamento gerado por assinaturas ainda."
              />
            )}
          </TabsContent>

          {/* Tab 3: Forecast / Calendário & Demanda */}
          <TabsContent value="forecast">
            {loadingForecast ? (
              <PulseBlock className="h-[360px] w-full" />
            ) : (
              <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                      <CalendarIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">
                        Calendário de Entregas & Execuções Futuras
                      </h3>
                      <p className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">
                        Execuções e entregas agendadas nos próximos 30 dias de assinaturas ativas.
                      </p>
                    </div>
                  </div>
                </div>

                {forecastData.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                      Nenhuma entrega ou cobrança prevista nos próximos 30 dias.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y divide-brand-border/50 dark:divide-dark-border/50">
                    {forecastData.map((f, idx) => (
                      <div key={idx} className="py-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading font-bold shrink-0">
                            {new Date(f.scheduledFor).getDate()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{f.customerName}</p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{f.planName}</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                          Previsão: {new Date(f.scheduledFor).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Tab 4: Saldos de Créditos de Clientes */}
          <TabsContent value="credits">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div className="w-full md:w-80">
                <Input
                  name="creditsSearch"
                  placeholder="Buscar por cliente..."
                  value={creditsSearch}
                  onChange={(e) => setCreditsSearch(e.target.value)}
                  className="h-[42px] w-full"
                  variant="full-rounded"
                  prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                />
              </div>
            </div>

            {loadingCredits ? (
              <PulseBlock className="h-[360px] w-full" />
            ) : (
              <ReportTableCard
                title="Saldo de Créditos dos Clientes"
                icon={Users}
                columns={creditColumns}
                data={creditsData}
                pageSize={8}
                emptyMessage="Nenhum saldo de crédito de serviço encontrado."
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
          </FadeIn>
        )}
      </AnimatePresence>

      <ExportColumnSelectionModal
          isOpen={columnSelectionModal.isOpen}
          canExportAllColumns={columnSelectionModal.canExportAllColumns}
          onConfirm={handleColumnConfirm}
          onClose={closeColumnSelectionModal}
      />
    </FadeIn>
  )
}
