"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { useMediaQuery } from "../hooks"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { useInfiniteScrollObserver } from "@/hooks/use-infinite-scroll-observer"
import { useEntityPage } from "@/hooks/use-entity-page"
import { useSidebar } from "@/lib/sidebar-context"

// Reusable Components
import {
  AlertModal,
  IconPlaceholder,
  Pagination,
  Tabs,
  TabsContent,
  ThreeDotsLoader,
} from "@/components/reusable"
import { ReportTableCard } from "@/components/erp/reports/widgets"

// Specific components
import SubscriptionPageControls from "./SubscriptionPageControls"
import SubscriptionGridCard from "./SubscriptionGridCard"
import SubscriptionListRow from "./SubscriptionListRow"
import SubscriptionDetailPage from "./SubscriptionDetailPage"
import ForecastPageControls from "./ForecastPageControls"
import ForecastGridCard from "./ForecastGridCard"
import ForecastListRow from "./ForecastListRow"
import BillingPageControls from "./BillingPageControls"
import BillingGridCard from "./BillingGridCard"
import BillingListRow from "./BillingListRow"

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
  getRecurringSubscriptionDetailAction,
} from "@/app/actions/erp/recurring-subscriptions"
import type { RecurringSubscription, RecurringSubscriptionStatusFilter } from "@/lib/types/recurring"
import { useErpExport } from "@/hooks/use-erp-export"
import { useStore } from "@/lib/store-context"
import ExportColumnSelectionModal from "@/components/erp/export/ExportColumnSelectionModal"
import {
  ExportFileIcon,
  CalendarIcon,
  MoneyIcon,
  ListIcon,
  CreditCardIcon,
  ChevronLeftIcon,
} from "@/lib/icons"
import { Button, ListItem } from "@/components/reusable"
import FilterSheet, { type FilterSectionConfig } from "@/components/reusable/FilterSheet"
import FilterChip from "@/components/reusable/FilterChip"
import { SectionFilterBar } from "./SectionFilterBar"
import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import {
  EMPTY_DATE_PERIOD,
  addCalendarDaysYmd,
  getBrazilTodayYmd,
  isDatePeriodFilterActive,
  resolveDatePeriodBounds,
  summarizeDatePeriodFilter,
  ymdInBounds,
} from "@/lib/utils/filter-date-period"

const COLUMNS: Array<{ id: string; label: string; align?: "left" | "center" | "right"; width?: string }> = [
  { id: "customer", label: "Cliente", align: "left" as const, width: "250px" },
  { id: "plan", label: "Plano / Frequência", align: "left" as const, width: "250px" },
  { id: "status", label: "Situação", align: "center" as const, width: "150px" },
  { id: "nextExecution", label: "Próxima Execução", align: "left" as const, width: "200px" },
  { id: "shipping", label: "Frete", align: "left" as const, width: "150px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "250px" },
]

const FORECAST_COLUMNS: Array<{ id: string; label: string; align?: "left" | "center" | "right"; width?: string }> = [
  { id: "customer", label: "Cliente", align: "left" as const, width: "250px" },
  { id: "plan", label: "Plano / Frequência", align: "left" as const, width: "230px" },
  { id: "scheduledFor", label: "Previsão", align: "left" as const, width: "170px" },
  { id: "value", label: "Próxima Cobrança", align: "right" as const, width: "170px" },
  { id: "modality", label: "Entrega", align: "left" as const, width: "190px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "120px" },
]

const BILLING_COLUMNS: Array<{ id: string; label: string; align?: "left" | "center" | "right"; width?: string }> = [
  { id: "order", label: "Pedido", align: "left" as const, width: "200px" },
  { id: "customer", label: "Cliente", align: "left" as const, width: "260px" },
  { id: "date", label: "Data", align: "left" as const, width: "150px" },
  { id: "value", label: "Valor", align: "right" as const, width: "150px" },
  { id: "status", label: "Status Pagamento", align: "center" as const, width: "170px" },
  { id: "actions", label: "Ações", align: "center" as const, width: "120px" },
]

type ConfirmDialog = {
  title: string
  message: string
  confirmText: string
  cancelText?: string
  variant?: "danger" | "success" | "warning" | "info"
  isDestructive?: boolean
  onConfirm: () => void | Promise<void>
}

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

const SECTION_SLUGS: Record<Exclude<SectionKey, "home">, string> = {
  list: "assinaturas",
  billing: "faturamento",
  forecast: "calendario",
  credits: "creditos",
}

const SLUG_TO_SECTION: Record<string, SectionKey> = Object.entries(SECTION_SLUGS).reduce(
  (acc, [key, slug]) => ({ ...acc, [slug]: key as SectionKey }),
  {} as Record<string, SectionKey>,
)

const DELINQUENT_STATUSES = ["past_due", "payment_failed"]

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

// ── Filtros por seção ─────────────────────────────────────────────────────────
type ListFilters = { delivery: string[]; billing: string[]; horizon: string[] }
type BillingFilters = { payment: string[]; datePeriod: DatePeriodFilterValue }
type ForecastFilters = { horizon: string[] }
type CreditsFilters = { balance: string[] }

const EMPTY_LIST_FILTERS: ListFilters = { delivery: [], billing: [], horizon: [] }
const EMPTY_BILLING_FILTERS: BillingFilters = { payment: [], datePeriod: { ...EMPTY_DATE_PERIOD } }
const EMPTY_FORECAST_FILTERS: ForecastFilters = { horizon: [] }
const EMPTY_CREDITS_FILTERS: CreditsFilters = { balance: [] }

const DELIVERY_LABELS: Record<string, string> = { delivery: "Entrega", pickup: "Retirada no local" }
const BILLING_LABELS: Record<string, string> = { auto_mercado_pago: "Mercado Pago", manual: "Manual" }
const PAYMENT_LABELS: Record<string, string> = { paid: "Pago", pending: "Pendente", cancelled: "Cancelado" }
const BALANCE_LABELS: Record<string, string> = { available: "Com saldo", empty: "Saldo zerado" }
const HORIZON_LABELS: Record<string, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  "7": "Próximos 7 dias",
  "15": "Próximos 15 dias",
  "30": "Próximos 30 dias",
}

const LIST_FILTER_SECTIONS: FilterSectionConfig[] = [
  {
    id: "delivery",
    title: "Tipo de Entrega",
    type: "checkbox-list",
    options: ["delivery", "pickup"],
    optionLabels: DELIVERY_LABELS,
  },
  {
    id: "billing",
    title: "Modo de Cobrança",
    type: "checkbox-list",
    options: ["auto_mercado_pago", "manual"],
    optionLabels: BILLING_LABELS,
  },
  {
    id: "horizon",
    title: "Próxima Execução",
    type: "checkbox-list",
    options: ["overdue", "7", "15", "30"],
    optionLabels: HORIZON_LABELS,
  },
]

const BILLING_FILTER_SECTIONS: FilterSectionConfig[] = [
  {
    id: "payment",
    title: "Situação do Pagamento",
    type: "checkbox-list",
    options: ["paid", "pending", "cancelled"],
    optionLabels: PAYMENT_LABELS,
  },
  { id: "datePeriod", title: "Período", type: "date-period" },
]

const FORECAST_FILTER_SECTIONS: FilterSectionConfig[] = [
  {
    id: "horizon",
    title: "Previsão",
    type: "checkbox-list",
    options: ["today", "7", "15", "30"],
    optionLabels: HORIZON_LABELS,
  },
]

const CREDITS_FILTER_SECTIONS: FilterSectionConfig[] = [
  {
    id: "balance",
    title: "Saldo",
    type: "checkbox-list",
    options: ["available", "empty"],
    optionLabels: BALANCE_LABELS,
  },
]

const paymentBucket = (situation: string) =>
  situation === "paid" ? "paid" : situation === "cancelled" ? "cancelled" : "pending"

/** Janela de dias em relação a hoje: "overdue" = atrasadas, números = próximos N dias */
const matchesHorizon = (raw: string | null | undefined, selected: string[]): boolean => {
  if (selected.length === 0) return true
  if (!raw) return false
  const ymd = raw.slice(0, 10)
  const today = getBrazilTodayYmd()
  return selected.some((key) => {
    if (key === "overdue") return ymd < today
    const days = Number(key)
    if (Number.isNaN(days)) return false
    return ymd >= today && ymd <= addCalendarDaysYmd(today, days)
  })
}

const ListFilterChips = ({
  filters,
  onClear,
}: {
  filters: ListFilters
  onClear: (key: keyof ListFilters) => void
}) => (
  <AnimatePresence>
    {filters.delivery.length > 0 && (
      <FilterChip
        key="delivery"
        label="Entrega"
        value={filters.delivery.map((v) => DELIVERY_LABELS[v] || v).join(", ")}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("delivery")}
      />
    )}
    {filters.billing.length > 0 && (
      <FilterChip
        key="billing"
        label="Cobrança"
        value={filters.billing.map((v) => BILLING_LABELS[v] || v).join(", ")}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("billing")}
      />
    )}
    {filters.horizon.length > 0 && (
      <FilterChip
        key="horizon"
        label="Próxima execução"
        value={filters.horizon.map((v) => HORIZON_LABELS[v] || v).join(", ")}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("horizon")}
      />
    )}
  </AnimatePresence>
)

const BillingFilterChips = ({
  filters,
  onClear,
}: {
  filters: BillingFilters
  onClear: (key: "payment" | "datePeriod") => void
}) => (
  <AnimatePresence>
    {filters.payment.length > 0 && (
      <FilterChip
        key="payment"
        label="Pagamento"
        value={filters.payment.map((v) => PAYMENT_LABELS[v] || v).join(", ")}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("payment")}
      />
    )}
    {isDatePeriodFilterActive(filters.datePeriod) && (
      <FilterChip
        key="datePeriod"
        label="Período"
        value={summarizeDatePeriodFilter(filters.datePeriod) || ""}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("datePeriod")}
      />
    )}
  </AnimatePresence>
)

const ForecastFilterChips = ({
  filters,
  onClear,
}: {
  filters: ForecastFilters
  onClear: (key: keyof ForecastFilters) => void
}) => (
  <AnimatePresence>
    {filters.horizon.length > 0 && (
      <FilterChip
        key="horizon"
        label="Previsão"
        value={filters.horizon.map((v) => HORIZON_LABELS[v] || v).join(", ")}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("horizon")}
      />
    )}
  </AnimatePresence>
)

const CreditsFilterChips = ({
  filters,
  onClear,
}: {
  filters: CreditsFilters
  onClear: (key: keyof CreditsFilters) => void
}) => (
  <AnimatePresence>
    {filters.balance.length > 0 && (
      <FilterChip
        key="balance"
        label="Saldo"
        value={filters.balance.map((v) => BALANCE_LABELS[v] || v).join(", ")}
        icon={<CalendarIcon size={12} />}
        onRemove={() => onClear("balance")}
      />
    )}
  </AnimatePresence>
)

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
  const { setHeaderOverride } = useSidebar()
  const router = useRouter()

  const [currentTab, setCurrentTab] = useState<SectionKey>("home")
  const [statusFilter, setStatusFilter] = useState<RecurringSubscriptionStatusFilter>("all")
  const [viewMode, setViewModeState] = useState<"list" | "grid">(isMobile ? "grid" : "list")
  const effectiveViewMode = isTablet ? "grid" : viewMode
  const [page, setPage] = useState(1)

  // Filtros por seção (botão "Filtros" + chips, padrão do ERP)
  const [filterTarget, setFilterTarget] = useState<SectionKey | null>(null)
  const [listFilters, setListFilters] = useState<ListFilters>(EMPTY_LIST_FILTERS)
  const [billingFilters, setBillingFilters] = useState<BillingFilters>(EMPTY_BILLING_FILTERS)
  const [forecastFilters, setForecastFilters] = useState<ForecastFilters>(EMPTY_FORECAST_FILTERS)
  const [creditsFilters, setCreditsFilters] = useState<CreditsFilters>(EMPTY_CREDITS_FILTERS)

  const hasListFilters =
    listFilters.delivery.length > 0 || listFilters.billing.length > 0 || listFilters.horizon.length > 0
  const hasBillingFilters =
    billingFilters.payment.length > 0 || isDatePeriodFilterActive(billingFilters.datePeriod)
  const hasForecastFilters = forecastFilters.horizon.length > 0
  const hasCreditsFilters = creditsFilters.balance.length > 0

  const queryKey = useMemo(
    () => ["erp", "recurring_subscriptions", partnerId, selectedStore?.id] as const,
    [partnerId, selectedStore?.id],
  )

  const entityPage = useEntityPage<any, any, string>({
    entityType: "recurring_subscriptions",
    partnerId,
    queryKey,
    initialItems: initialSubscriptions,
    initialNextCursor,
    initialHasMore,
    fetchPageFn: async ({ cursor }) => {
      const res = await listRecurringSubscriptionsAction(partnerId, { cursor, storeId: selectedStore?.id || undefined })
      if (!res.success || !res.data) throw new Error(res.error || "Erro ao carregar assinaturas.")
      return { items: res.data.items as any[], nextCursor: res.data.nextCursor, hasMore: res.data.hasMore }
    },
    dedupeKey: useCallback((s: any) => String(s?.id || ""), []),
    getDetailFn: async (subscriptionId: string) => {
      const res = await getRecurringSubscriptionDetailAction(partnerId, subscriptionId)
      if (!res.success || !res.data) return null
      // Forma achatada (atualiza a lista) + blocos anidados usados pelo detalhe
      return {
        ...res.data.subscription,
        subscription: res.data.subscription,
        plan: res.data.plan,
        customer: res.data.customer,
        items: res.data.items,
        credits: res.data.credits,
      } as any
    },
    // Cache parcial vindo da lista: mesmas chaves do detalhe completo
    listToDetail: (item: any) => {
      const rawPlan = item.plan
      const plan = rawPlan
        ? {
          ...rawPlan,
          frequencyType: rawPlan.frequencyType ?? rawPlan.frequency_type,
          frequencyInterval: rawPlan.frequencyInterval ?? rawPlan.frequency_interval,
        }
        : null
      return {
        ...item,
        subscription: item,
        plan,
        customer: item.customer,
        items: [],
        credits: [],
      }
    },
  })

  const {
    items: rawSubscriptions,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isListLoading,
    entityState,
    openEntity,
    closeEntity,
    currentEntity,
    isLoadingDetail,
    search,
    setSearch,
    debouncedSearch,
    afterMutation,
  } = entityPage

  // Full-screen detail (?view=<id>, ?view=<id>&type=history)
  const isDetailOpen = entityState.isOpen && entityState.action === "view" && !!entityState.entityId
  const detailSubscriptionId = isDetailOpen ? entityState.entityId : null
  const detailInitialTab = entityState.entityType === "history" ? "history" : "general"

  const openDetail = useCallback(
    (subscriptionId: string, tab: "general" | "history" = "general") => {
      openEntity("view", subscriptionId, tab === "history" ? "history" : undefined)
    },
    [openEntity],
  )

  // Navegação entre seções com ?tab=<slug> no URL
  const navigateToSection = useCallback((tab: SectionKey) => {
    setCurrentTab(tab)
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    const slug = tab === "home" ? null : SECTION_SLUGS[tab as Exclude<SectionKey, "home">]
    if (slug) url.searchParams.set("tab", slug)
    else url.searchParams.delete("tab")
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }, [])

  // Lê ?tab= na montagem e sincroniza com voltar/avançar do navegador
  useEffect(() => {
    const sectionFromUrl = () => {
      const value = new URLSearchParams(window.location.search).get("tab")
      return value && SLUG_TO_SECTION[value] ? SLUG_TO_SECTION[value] : "home"
    }
    setCurrentTab(sectionFromUrl())
    const handlePopState = () => setCurrentTab(sectionFromUrl())
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  // Cabeçalho sticky padrão: título da seção + botão voltar padrão
  useEffect(() => {
    if (detailSubscriptionId) return
    if (currentTab !== "home") {
      setHeaderOverride({
        title: SECTION_META[currentTab].title,
        onBack: () => navigateToSection("home"),
        isSubPage: true,
      })
    } else {
      setHeaderOverride({ title: SECTION_META.home.title })
    }
  }, [currentTab, detailSubscriptionId, navigateToSection, setHeaderOverride])

  // Reset detail view when sidebar resets
  useEffect(() => {
    const handleReset = () => closeEntity()
    window.addEventListener("erp-sidebar-reset", handleReset)
    return () => window.removeEventListener("erp-sidebar-reset", handleReset)
  }, [closeEntity])

  // Billing Panel States
  const [billingData, setBillingData] = useState<any[]>([])
  const [loadingBilling, setLoadingBilling] = useState(false)
  const [billingSearch, setBillingSearch] = useState("")
  const [billingPage, setBillingPage] = useState(1)

  // Confirmação de ações destrutivas (pausar/cancelar)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  // Forecast States
  const [forecastData, setForecastData] = useState<any[]>([])
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [forecastSearch, setForecastSearch] = useState("")
  const [forecastPage, setForecastPage] = useState(1)

  // Credits States
  const [creditsData, setCreditsData] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [creditsSearch, setCreditsSearch] = useState("")
  const [debouncedCreditsSearch, setDebouncedCreditsSearch] = useState("")

  const billingLoadedRef = useRef(false)
  const forecastLoadedRef = useRef(false)
  const creditsTermRef = useRef<string | null>(null)

  const observerTarget = useRef<HTMLDivElement>(null)
  const itemsPerPage = 8

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCreditsSearch(creditsSearch), 300)
    return () => clearTimeout(timer)
  }, [creditsSearch])

  // Carrega os dados das seções uma única vez (sem refetch ao voltar para a seção)
  const loadTabDetails = useCallback(async () => {
    if (currentTab === "billing") {
      if (billingLoadedRef.current) return
      setLoadingBilling(true)
      const res = await getSubscriptionBillingPanelAction(partnerId)
      setLoadingBilling(false)
      if (res.success && res.data) {
        setBillingData(res.data)
        billingLoadedRef.current = true
      }
    } else if (currentTab === "forecast") {
      if (forecastLoadedRef.current) return
      setLoadingForecast(true)
      const res = await getSubscriptionForecastAction(partnerId)
      setLoadingForecast(false)
      if (res.success && res.data) {
        setForecastData(res.data)
        forecastLoadedRef.current = true
      }
    } else if (currentTab === "credits") {
      if (creditsTermRef.current === debouncedCreditsSearch) return
      setLoadingCredits(true)
      const res = await getSubscriptionCreditsAction(partnerId, debouncedCreditsSearch)
      setLoadingCredits(false)
      if (res.success && res.data) {
        setCreditsData(res.data)
        creditsTermRef.current = debouncedCreditsSearch
      }
    }
  }, [currentTab, partnerId, debouncedCreditsSearch])

  useEffect(() => {
    void loadTabDetails()
  }, [loadTabDetails])

  useInfiniteScrollObserver(observerTarget, {
    enabled: currentTab === "list" && !isDetailOpen,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage: () => fetchNextPage(),
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
  }, [checkScroll, viewMode, rawSubscriptions, currentTab])

  // Filtro local (status + busca + filtros da seção) sobre o cache - igual às outras páginas do ERP
  const filteredSubscriptions = useMemo(() => {
    const term = debouncedSearch.toLowerCase()
    return (rawSubscriptions || []).filter((sub: any) => {
      if (statusFilter !== "all") {
        if (statusFilter === "delinquent") {
          if (!DELINQUENT_STATUSES.includes(sub.status)) return false
        } else if (sub.status !== statusFilter) {
          return false
        }
      }
      if (listFilters.delivery.length > 0) {
        const deliveryType = sub.deliveryType || sub.delivery_type || "pickup"
        if (!listFilters.delivery.includes(deliveryType)) return false
      }
      if (listFilters.billing.length > 0) {
        const mode = sub.billingMode || sub.billing_mode || "manual"
        if (!listFilters.billing.includes(mode)) return false
      }
      if (
        listFilters.horizon.length > 0 &&
        !matchesHorizon(sub.nextExecutionAt || sub.next_execution_at || null, listFilters.horizon)
      ) {
        return false
      }
      if (!term) return true
      return (
        (sub.customer?.name || "").toLowerCase().includes(term) ||
        (sub.customer?.email || "").toLowerCase().includes(term) ||
        (sub.plan?.name || "").toLowerCase().includes(term) ||
        (sub.notes || "").toLowerCase().includes(term)
      )
    })
  }, [rawSubscriptions, statusFilter, debouncedSearch, listFilters])

  const tabCounts = useMemo(() => {
    const counts = {
      all: 0,
      active: 0,
      paused: 0,
      pending: 0,
      delinquent: 0,
      awaiting_restock: 0,
      cancelled: 0,
    }
    for (const sub of rawSubscriptions || []) {
      counts.all++
      if (sub.status === "active") counts.active++
      else if (sub.status === "paused") counts.paused++
      else if (sub.status === "pending") counts.pending++
      else if (sub.status === "awaiting_restock") counts.awaiting_restock++
      else if (sub.status === "cancelled") counts.cancelled++
      if (DELINQUENT_STATUSES.includes(sub.status)) counts.delinquent++
    }
    return counts
  }, [rawSubscriptions])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, debouncedSearch, listFilters])

  // Action execution: pause, resume, cancel, resolve_stock, sync
  const runAction = async (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", subscriptionId: string) => {
    if (action === "sync") {
      const res = await syncSubscriptionWithMpErpAction(partnerId, subscriptionId)
      if (!res.success) {
        toast({ title: "Erro", description: res.error, variant: "destructive" })
        return
      }
      toast({ title: `Assinatura sincronizada com sucesso!` })
      afterMutation(subscriptionId)
      return
    }

    if (action === "resolve_stock") {
      const res = await updateSubscriptionStockShortageResolvedAction(partnerId, subscriptionId)
      if (!res.success) {
        toast({ title: "Erro", description: res.error, variant: "destructive" })
        return
      }
      toast({ title: res.message || "Sucesso" })
      afterMutation(subscriptionId)
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
    afterMutation(subscriptionId)
  }

  // Ações disparadas pela seção Calendário & Demanda: além da mutação,
  // recarregam a previsão (uma assinatura pausada/cancelada sai da lista).
  const runForecastAction = async (
    action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync",
    subscriptionId: string,
  ) => {
    await runAction(action, subscriptionId)
    forecastLoadedRef.current = false
    void loadTabDetails()
  }

  const confirmFirst = (
    action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync",
    then: () => Promise<void>,
  ) => {
    setConfirmDialog(
      action === "pause"
        ? {
          title: "Pausar assinatura?",
          message:
            "As próximas execuções ficam suspensas até você reativar. Nenhuma nova cobrança será feita nesse período.",
          confirmText: "Pausar assinatura",
          cancelText: "Voltar",
          variant: "warning",
          onConfirm: then,
        }
        : {
          title: "Cancelar assinatura?",
          message:
            "As próximas cobranças e execuções serão interrompidas. Esta ação não pode ser desfeita.",
          confirmText: "Cancelar assinatura",
          cancelText: "Manter assinatura",
          isDestructive: true,
          onConfirm: then,
        },
    )
  }

  const handleAction = (
    action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync",
    subscriptionId: string,
  ) => {
    if (action === "pause" || action === "cancel") {
      confirmFirst(action, () => runAction(action, subscriptionId))
      return
    }
    void runAction(action, subscriptionId)
  }

  const handleForecastAction = (
    action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync",
    subscriptionId: string,
  ) => {
    if (action === "pause" || action === "cancel") {
      confirmFirst(action, () => runForecastAction(action, subscriptionId))
      return
    }
    void runForecastAction(action, subscriptionId)
  }

  const openOrder = (orderId: string) => router.push(`/erp/pedidos?view=${orderId}`)
  const openSubscriptionFromBilling = (subscriptionId: string) => openDetail(subscriptionId)

  const totalPages = Math.ceil(filteredSubscriptions.length / itemsPerPage)
  const paginated = filteredSubscriptions.slice((page - 1) * itemsPerPage, page * itemsPerPage)

  const prevFilteredLengthRef = useRef(0)
  useEffect(() => {
    const lengthChanged = filteredSubscriptions.length !== prevFilteredLengthRef.current
    prevFilteredLengthRef.current = filteredSubscriptions.length
    if (lengthChanged) return
    if (page === totalPages && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [page, totalPages, hasNextPage, isFetchingNextPage, fetchNextPage, filteredSubscriptions.length])

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

  const filteredBillingData = useMemo(() => {
    const active = isDatePeriodFilterActive(billingFilters.datePeriod)
    const { startYmd, endYmd } = resolveDatePeriodBounds(billingFilters.datePeriod)
    const term = billingSearch.trim().toLowerCase()
    return billingData.filter((row: any) => {
      if (
        billingFilters.payment.length > 0 &&
        !billingFilters.payment.includes(paymentBucket(row.situation || ""))
      ) {
        return false
      }
      if (active && !ymdInBounds(row.created_at, startYmd, endYmd)) return false
      if (term) {
        const haystack = `${row.order_number || ""} ${row.customer_name || ""}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [billingData, billingFilters, billingSearch])

  const billingTotalPages = Math.max(1, Math.ceil(filteredBillingData.length / itemsPerPage))
  const safeBillingPage = Math.min(billingPage, billingTotalPages)
  const billingPaginated = filteredBillingData.slice(
    (safeBillingPage - 1) * itemsPerPage,
    safeBillingPage * itemsPerPage,
  )

  useEffect(() => {
    setBillingPage(1)
  }, [billingSearch, billingFilters, currentTab])

  const filteredForecastData = useMemo(() => {
    const term = forecastSearch.trim().toLowerCase()
    return forecastData.filter((row: any) => {
      if (!matchesHorizon(row.scheduledFor, forecastFilters.horizon)) return false
      if (!term) return true
      return (
        (row.customerName || "").toLowerCase().includes(term) ||
        (row.customerEmail || "").toLowerCase().includes(term) ||
        (row.planName || "").toLowerCase().includes(term)
      )
    })
  }, [forecastData, forecastFilters, forecastSearch])

  const forecastTotalPages = Math.max(1, Math.ceil(filteredForecastData.length / itemsPerPage))
  const safeForecastPage = Math.min(forecastPage, forecastTotalPages)
  const forecastPaginated = filteredForecastData.slice(
    (safeForecastPage - 1) * itemsPerPage,
    safeForecastPage * itemsPerPage,
  )

  useEffect(() => {
    setForecastPage(1)
  }, [forecastSearch, forecastFilters, currentTab])

  const filteredCreditsData = useMemo(
    () =>
      creditsData.filter((row: any) => {
        if (creditsFilters.balance.length === 0) return true
        const available = Number(row.remaining || 0) > 0
        return creditsFilters.balance.includes(available ? "available" : "empty")
      }),
    [creditsData, creditsFilters],
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
            initialDetail={currentEntity ?? null}
            isLoadingInitial={isLoadingDetail}
            onChanged={() => {
              if (detailSubscriptionId) afterMutation(detailSubscriptionId)
            }}
          />
        ) : (
          <FadeIn key="list" className="block w-full">
            <div className="w-full space-y-6 pt-4 px-4 md:px-8 pb-8">
              {/* Header */}
              <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  {currentTab !== "home" && (
                    <div className="hidden md:flex shrink-0 mt-1">
                      <Button
                        variant="filled"
                        onClick={() => navigateToSection("home")}
                        className="w-10 h-10 p-0 flex items-center justify-center"
                        aria-label="Voltar"
                      >
                        <ChevronLeftIcon size={18} />
                      </Button>
                    </div>
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
                        onClick={() => navigateToSection(section.key)}
                        showChevron
                        className="px-4 py-3 gap-4"
                      />
                    ))}
                  </div>
                </FadeIn>
              )}

              {/* Sections */}
              <Tabs value={currentTab} onValueChange={(value) => navigateToSection(value as SectionKey)} className="w-full">

                {/* Tab 1: Subscriptions list */}
                <TabsContent value="list">
                  <SubscriptionPageControls
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    search={search}
                    onSearchChange={setSearch}
                    viewMode={effectiveViewMode}
                    onViewModeChange={setViewModeState}
                    onOpenFilter={() => setFilterTarget("list")}
                    hasActiveFilters={hasListFilters}
                    chips={
                      <ListFilterChips
                        filters={listFilters}
                        onClear={(key) => setListFilters((prev) => ({ ...prev, [key]: [] }))}
                      />
                    }
                    tabCounts={tabCounts}
                  />

                  <AnimatePresence mode="wait">
                    {isListLoading ? (
                      <FadeIn key="loading" className="w-full flex items-center justify-center py-20">
                        <ThreeDotsLoader />
                      </FadeIn>
                    ) : rawSubscriptions.length === 0 ? (
                      <FadeIn key="empty" className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                          imageAlt="Nenhuma assinatura"
                          title="Nenhuma assinatura"
                          subtitle="Assinaturas criadas a partir dos seus planos recorrentes aparecerão aqui."
                        />
                      </FadeIn>
                    ) : filteredSubscriptions.length === 0 ? (
                      <FadeIn key="empty-results" className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                          imageAlt="Nenhuma assinatura encontrada"
                          title="Nenhuma assinatura encontrada"
                          subtitle="Tente ajustar a busca ou os filtros de status."
                          itemButton={search || hasListFilters ? {
                            text: "Limpar busca e filtros",
                            action: () => {
                              setSearch("")
                              setListFilters({ ...EMPTY_LIST_FILTERS })
                            },
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
                                onRunAction={handleAction}
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
                                      onRunAction={handleAction}
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
                  {hasNextPage ? <div ref={observerTarget} className="h-12 w-full shrink-0" aria-hidden /> : null}

                  {filteredSubscriptions.length > 0 && paginated.length > 0 && (
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
                  )}
                </TabsContent>

                {/* Tab 2: Billing / Faturamento Panel */}
                <TabsContent value="billing">
                  <BillingPageControls
                    search={billingSearch}
                    onSearchChange={setBillingSearch}
                    viewMode={effectiveViewMode}
                    onViewModeChange={setViewModeState}
                    onOpenFilter={() => setFilterTarget("billing")}
                    hasActiveFilters={hasBillingFilters}
                    chips={
                      <BillingFilterChips
                        filters={billingFilters}
                        onClear={(key) =>
                          setBillingFilters((prev) => ({
                            ...prev,
                            [key]: key === "datePeriod" ? { ...EMPTY_DATE_PERIOD } : [],
                          }))
                        }
                      />
                    }
                  />

                  <AnimatePresence mode="wait">
                    {loadingBilling ? (
                      <FadeIn key="loading" className="w-full flex items-center justify-center py-20">
                        <ThreeDotsLoader />
                      </FadeIn>
                    ) : billingData.length === 0 ? (
                      <FadeIn key="empty" className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/SemPedidos.png"
                          imageAlt="Nenhum faturamento"
                          title="Nenhum faturamento gerado por assinaturas ainda."
                          subtitle="Os pedidos criados por assinaturas aparecerão aqui."
                        />
                      </FadeIn>
                    ) : filteredBillingData.length === 0 ? (
                      <FadeIn key="empty-results" className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                          imageAlt="Nenhum faturamento encontrado"
                          title="Nenhum faturamento encontrado"
                          subtitle="Tente ajustar a busca ou os filtros."
                          itemButton={{
                            text: "Limpar busca e filtros",
                            action: () => {
                              setBillingSearch("")
                              setBillingFilters({ ...EMPTY_BILLING_FILTERS })
                            },
                            variant: "outline",
                          }}
                        />
                      </FadeIn>
                    ) : (
                      <FadeIn key={effectiveViewMode} className="w-full">
                        {effectiveViewMode === "grid" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                            {billingPaginated.map((row: any) => (
                              <BillingGridCard
                                key={row.id}
                                row={row}
                                onOpen={openOrder}
                                onOpenSubscription={openSubscriptionFromBilling}
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
                                    {BILLING_COLUMNS.map((col, index) => (
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
                                  {billingPaginated.map((row: any) => (
                                    <BillingListRow
                                      key={row.id}
                                      row={row}
                                      columns={BILLING_COLUMNS}
                                      onOpen={openOrder}
                                      onOpenSubscription={openSubscriptionFromBilling}
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

                  {filteredBillingData.length > 0 && (
                    <Pagination
                      currentPage={safeBillingPage}
                      totalPages={billingTotalPages}
                      onPageChange={(p) => {
                        setBillingPage(p)
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      }}
                    />
                  )}
                </TabsContent>

                {/* Tab 3: Forecast / Calendário & Demanda */}
                <TabsContent value="forecast">
                  <ForecastPageControls
                    search={forecastSearch}
                    onSearchChange={setForecastSearch}
                    viewMode={effectiveViewMode}
                    onViewModeChange={setViewModeState}
                    onOpenFilter={() => setFilterTarget("forecast")}
                    hasActiveFilters={hasForecastFilters}
                    chips={
                      <ForecastFilterChips
                        filters={forecastFilters}
                        onClear={(key) => setForecastFilters((prev) => ({ ...prev, [key]: [] }))}
                      />
                    }
                  />

                  <AnimatePresence mode="wait">
                    {loadingForecast ? (
                      <FadeIn key="loading" className="w-full flex items-center justify-center py-20">
                        <ThreeDotsLoader />
                      </FadeIn>
                    ) : forecastData.length === 0 ? (
                      <FadeIn key="empty" className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                          imageAlt="Nenhuma previsão"
                          title="Nenhuma execução prevista"
                          subtitle="As próximas execuções e entregas das suas assinaturas ativas aparecerão aqui."
                        />
                      </FadeIn>
                    ) : filteredForecastData.length === 0 ? (
                      <FadeIn key="empty-results" className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                          imageAlt="Nenhuma previsão encontrada"
                          title="Nenhuma previsão encontrada"
                          subtitle="Tente ajustar a busca ou o período da previsão."
                          itemButton={{
                            text: "Limpar busca e filtros",
                            action: () => {
                              setForecastSearch("")
                              setForecastFilters({ ...EMPTY_FORECAST_FILTERS })
                            },
                            variant: "outline",
                          }}
                        />
                      </FadeIn>
                    ) : (
                      <FadeIn key={effectiveViewMode} className="w-full">
                        {effectiveViewMode === "grid" ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-4">
                            {forecastPaginated.map((f: any) => (
                              <ForecastGridCard
                                key={f.id}
                                row={f}
                                canManage={canManage}
                                onOpen={openDetail}
                                onRunAction={handleForecastAction}
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
                                    {FORECAST_COLUMNS.map((col, index) => (
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
                                  {forecastPaginated.map((f: any) => (
                                    <ForecastListRow
                                      key={f.id}
                                      row={f}
                                      columns={FORECAST_COLUMNS}
                                      canManage={canManage}
                                      onOpen={openDetail}
                                      onRunAction={handleForecastAction}
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

                  {filteredForecastData.length > 0 && (
                    <Pagination
                      currentPage={safeForecastPage}
                      totalPages={forecastTotalPages}
                      onPageChange={(p) => {
                        setForecastPage(p)
                        window.scrollTo({ top: 0, behavior: "smooth" })
                      }}
                    />
                  )}
                </TabsContent>

                {/* Tab 4: Saldos de Créditos de Clientes */}
                <TabsContent value="credits">
                  <SectionFilterBar
                    onOpenFilter={() => setFilterTarget("credits")}
                    hasActiveFilters={hasCreditsFilters}
                    chips={
                      <CreditsFilterChips
                        filters={creditsFilters}
                        onClear={(key) => setCreditsFilters((prev) => ({ ...prev, [key]: [] }))}
                      />
                    }
                    search={{
                      value: creditsSearch,
                      onChange: setCreditsSearch,
                      placeholder: "Buscar por cliente...",
                    }}
                  />

                  {loadingCredits ? (
                    <div className="flex items-center justify-center py-20">
                      <ThreeDotsLoader />
                    </div>
                  ) : (
                    <ReportTableCard
                      columns={creditColumns}
                      data={filteredCreditsData}
                      pageSize={8}
                      emptyMessage={
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc={
                            hasCreditsFilters || debouncedCreditsSearch
                              ? "https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
                              : "https://img.dudit.com.br/static/mascots/ValesCompra.png"
                          }
                          imageAlt="Nenhum crédito"
                          title={
                            hasCreditsFilters || debouncedCreditsSearch
                              ? "Nenhum crédito encontrado"
                              : "Nenhum saldo de crédito de serviço encontrado."
                          }
                          subtitle={
                            hasCreditsFilters || debouncedCreditsSearch
                              ? "Ajuste a busca ou os filtros para encontrar saldos."
                              : "Créditos liberados para seus clientes aparecerão aqui."
                          }
                          itemButton={
                            hasCreditsFilters || debouncedCreditsSearch
                              ? {
                                text: "Limpar filtros",
                                action: () => {
                                  setCreditsSearch("")
                                  setCreditsFilters({ ...EMPTY_CREDITS_FILTERS })
                                },
                                variant: "outline",
                              }
                              : undefined
                          }
                        />
                      }
                    />
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </FadeIn>
        )}
      </AnimatePresence>

      <FilterSheet
        isOpen={filterTarget !== null}
        onClose={() => setFilterTarget(null)}
        sections={
          filterTarget === "billing"
            ? BILLING_FILTER_SECTIONS
            : filterTarget === "forecast"
              ? FORECAST_FILTER_SECTIONS
              : filterTarget === "credits"
                ? CREDITS_FILTER_SECTIONS
                : LIST_FILTER_SECTIONS
        }
        filters={
          filterTarget === "billing"
            ? billingFilters
            : filterTarget === "forecast"
              ? forecastFilters
              : filterTarget === "credits"
                ? creditsFilters
                : listFilters
        }
        setFilters={
          filterTarget === "billing"
            ? setBillingFilters
            : filterTarget === "forecast"
              ? setForecastFilters
              : filterTarget === "credits"
                ? setCreditsFilters
                : setListFilters
        }
        onClear={() => {
          if (filterTarget === "billing") setBillingFilters({ ...EMPTY_BILLING_FILTERS })
          else if (filterTarget === "forecast") setForecastFilters({ ...EMPTY_FORECAST_FILTERS })
          else if (filterTarget === "credits") setCreditsFilters({ ...EMPTY_CREDITS_FILTERS })
          else setListFilters({ ...EMPTY_LIST_FILTERS })
        }}
      />

      <ExportColumnSelectionModal
        isOpen={columnSelectionModal.isOpen}
        canExportAllColumns={columnSelectionModal.canExportAllColumns}
        onConfirm={handleColumnConfirm}
        onClose={closeColumnSelectionModal}
      />

      <AlertModal
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message}
        confirmText={confirmDialog?.confirmText}
        cancelText={confirmDialog?.cancelText || "Voltar"}
        variant={confirmDialog?.variant}
        isDestructive={confirmDialog?.isDestructive}
        isLoading={confirmBusy}
        onClose={() => setConfirmDialog(null)}
        onConfirm={async () => {
          const fn = confirmDialog?.onConfirm
          setConfirmBusy(true)
          try {
            await fn?.()
          } finally {
            setConfirmBusy(false)
            setConfirmDialog(null)
          }
        }}
      />
    </FadeIn>
  )
}
