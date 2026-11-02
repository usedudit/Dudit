"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"

import { FadeIn } from "@/components/animations/FadeIn"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import {
  ActionsDropdown,
  AlertModal,
  Badge,
  Button,
  DatePicker,
  DefaultModal,
  DropdownItem,
  FormSection,
  FormTextarea,
  IconPlaceholder,
  InfoCard,
  Input,
  ListItem,
  Pagination,
  SidebarCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ThreeDotsLoader,
} from "@/components/reusable"
import {
  cancelRecurringSubscriptionAction,
  getRecurringSubscriptionDetailAction,
  getRecurringSubscriptionExecutionsAction,
  pauseRecurringSubscriptionAction,
  resumeRecurringSubscriptionAction,
  syncSubscriptionWithMpErpAction,
  updateSubscriptionStockShortageResolvedAction,
  scheduleSubscriptionServiceAction,
  createSubscriptionDeliveryOrderAction,
} from "@/app/actions/erp/recurring-subscriptions"
import { getAvailableTimeSlotsAction } from "@/app/actions/erp/appointments"
import {
  getRecurringFrequencyLabel,
  getRecurringShippingSourceLabel,
  getRecurringStatusLabel,
  getRecurringStatusVariant,
} from "@/lib/types/recurring"
import type { RecurringSubscriptionDetail } from "@/lib/types/recurring"
import { formatCurrency, formatFullDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { useMediaQuery } from "../hooks"
import { useSidebar } from "@/lib/sidebar-context"
import { useToast } from "@/hooks/use-toast"
import { ExecutionGridCard } from "./ExecutionGridCard"
import { ExecutionListRow } from "./ExecutionListRow"
import {
  BlockedIcon,
  ChevronLeftIcon,
  GiftIcon,
  PlayIcon,
  RepeatIcon,
  SearchIcon,
  ThreeDotsIcon,
} from "@/lib/icons"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

type DetailTab = "general" | "items" | "credits" | "notes" | "history"
type SubscriptionAction = "pause" | "resume" | "cancel" | "resolve_stock" | "sync"

type ConfirmDialog = {
  title: string
  message: string
  confirmText: string
  cancelText?: string
  variant?: "danger" | "success" | "warning" | "info"
  isDestructive?: boolean
  onConfirm: () => void | Promise<void>
}

interface SubscriptionDetailPageProps {
  partnerId: string
  subscriptionId: string
  onBack: () => void
  canManage: boolean
  onChanged?: () => void
  initialTab?: DetailTab
  /** Detalhe já resolvido pelo cache da página de lista (evita um segundo fetch) */
  initialDetail?: RecurringSubscriptionDetail | null
  /** Enquanto a página pai ainda busca o detalhe */
  isLoadingInitial?: boolean
}

const SidebarRow = ({
  label,
  value,
  valueClassName = "",
}: {
  label: string
  value: React.ReactNode
  valueClassName?: string
}) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{label}</span>
    <span className={`text-sm font-semibold text-right text-brand-dark dark:text-dark-heading ${valueClassName}`}>
      {value}
    </span>
  </div>
)

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{label}</span>
    <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading break-words min-w-0">{value}</span>
  </div>
)

const EXECUTION_COLUMNS: Array<{ id: string; label: string; align?: "left" | "center" | "right"; width?: string }> = [
  { id: "scheduled_for", label: "Agendada", align: "left", width: "170px" },
  { id: "orders", label: "Pedido", align: "left", width: "140px" },
  { id: "completed_at", label: "Concluída em", align: "left", width: "200px" },
  { id: "actions", label: "Ações", align: "center", width: "110px" },
  { id: "status", label: "Situação", align: "center", width: "180px" },
]

const HISTORY_ITEMS_PER_PAGE = 8

export const SubscriptionDetailPage: React.FC<SubscriptionDetailPageProps> = ({
  partnerId,
  subscriptionId,
  onBack,
  canManage,
  onChanged,
  initialTab = "general",
  initialDetail,
  isLoadingInitial = false,
}) => {
  const { toast } = useToast()
  const { setHeaderOverride } = useSidebar()
  const router = useRouter()
  const isTablet = useMediaQuery("(max-width: 1024px)")

  const [detail, setDetail] = useState<RecurringSubscriptionDetail | null>(initialDetail ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingExecutions, setLoadingExecutions] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [historySearch, setHistorySearch] = useState("")
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab)
  const [isScrolled, setIsScrolled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)

  // Agendar serviço com créditos
  const [scheduleCredit, setScheduleCredit] = useState<any | null>(null)
  const [scheduleDate, setScheduleDate] = useState("")
  const [scheduleTime, setScheduleTime] = useState("")
  const [scheduleNotes, setScheduleNotes] = useState("")
  const [scheduleSlots, setScheduleSlots] = useState<string[]>([])
  const [loadingScheduleSlots, setLoadingScheduleSlots] = useState(false)
  const [submittingSchedule, setSubmittingSchedule] = useState(false)

  // Registrar entrega de produtos com créditos
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false)
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, number>>({})
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("pickup")
  const [deliveryNotes, setDeliveryNotes] = useState("")
  const [submittingDelivery, setSubmittingDelivery] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const executionsRequestedRef = useRef(false)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }
  }, [])

  const checkTableScroll = useCallback(() => {
    if (!tableContainerRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current
    setScrollState({
      left: scrollLeft > 0,
      right: scrollLeft < scrollWidth - clientWidth - 2,
    })
  }, [])

  const loadDetail = useCallback(async () => {
    const res = await getRecurringSubscriptionDetailAction(partnerId, subscriptionId)
    if (res.success && res.data) {
      setLoadError(null)
      setDetail(res.data)
    } else {
      setLoadError(res.error || "Erro ao carregar assinatura")
      toast({ title: "Erro", description: res.error, variant: "destructive" })
    }
  }, [partnerId, subscriptionId, toast])

  const loadExecutions = useCallback(async () => {
    setLoadingExecutions(true)
    const res = await getRecurringSubscriptionExecutionsAction(partnerId, subscriptionId)
    setLoadingExecutions(false)
    if (res.success) {
      setExecutions(res.data || [])
    }
  }, [partnerId, subscriptionId])

  // Itens do plano unidos às linhas de crédito: todo item contratado aparece
  // sempre (mesmo sem crédito liberado ainda - saldo 0).
  const mergedCredits = useMemo(() => {
    type MergedCredit = {
      id: string
      itemName: string
      itemType: "service" | "product"
      serviceId: string | null
      productId: string | null
      quantity: number
      consumed: number
      remaining: number
      expiresAt: string | null
      staffPartnerUserId: string | null
      durationMinutes: number | null
      image: string | null
    }

    const rows: MergedCredit[] = []
    const indexByKey = new Map<string, MergedCredit>()

    for (const item of detail?.items || []) {
      const isProduct = item.itemType === "product"
      const serviceId = isProduct ? null : item.service?.id || null
      const productId = isProduct ? item.product?.id || null : null
      const details = (isProduct ? item.product : item.service) as { images?: string[] | null } | null
      const row: MergedCredit = {
        id: `item-${item.id}`,
        itemName: item.product?.name || item.service?.name || "Item",
        itemType: isProduct ? "product" : "service",
        serviceId,
        productId,
        quantity: 0,
        consumed: 0,
        remaining: 0,
        expiresAt: null,
        staffPartnerUserId: null,
        durationMinutes: item.durationMinutes ?? null,
        image:
          Array.isArray(details?.images) && details.images.length
            ? getR2ImageUrl(details.images[0], "thumbnail")
            : null,
      }
      rows.push(row)
      if (serviceId) indexByKey.set(`s:${serviceId}`, row)
      if (productId) indexByKey.set(`p:${productId}`, row)
    }

    for (const credit of detail?.credits || []) {
      const key = credit.productId
        ? `p:${credit.productId}`
        : credit.serviceId
          ? `s:${credit.serviceId}`
          : null
      const target = key ? indexByKey.get(key) : undefined
      const row: MergedCredit = target ?? {
        id: credit.id,
        itemName: credit.itemName,
        itemType: credit.itemType,
        serviceId: credit.serviceId,
        productId: credit.productId,
        quantity: 0,
        consumed: 0,
        remaining: 0,
        expiresAt: null,
        staffPartnerUserId: null,
        durationMinutes: credit.durationMinutes ?? null,
        image: null,
      }
      if (!target) rows.push(row)
      row.quantity += credit.quantity
      row.consumed += credit.consumed
      row.remaining += credit.remaining
      if (credit.expiresAt && (!row.expiresAt || credit.expiresAt < row.expiresAt)) {
        row.expiresAt = credit.expiresAt
      }
      if (credit.staffPartnerUserId) row.staffPartnerUserId = credit.staffPartnerUserId
      if (credit.durationMinutes != null) row.durationMinutes = credit.durationMinutes
    }

    return rows
  }, [detail?.items, detail?.credits])

  // Reaproveita o detalhe buscado pela página de lista; só busca por conta própria
  // quando a página pai não fornece (ou não tem) dados.
  useEffect(() => {
    if (initialDetail) {
      setLoadError(null)
      setDetail(initialDetail)
      return
    }
    if (!isLoadingInitial) void loadDetail()
  }, [initialDetail, isLoadingInitial, loadDetail])

  // Histórico de execuções só é carregado quando a aba é aberta
  useEffect(() => {
    if (activeTab !== "history" || executionsRequestedRef.current) return
    executionsRequestedRef.current = true
    void loadExecutions()
  }, [activeTab, loadExecutions])

  useEffect(() => {
    checkTableScroll()
    window.addEventListener("resize", checkTableScroll)
    return () => window.removeEventListener("resize", checkTableScroll)
  }, [checkTableScroll, executions, activeTab])

  useEffect(() => {
    setHistoryPage(1)
  }, [historySearch])

  // Horários do modal de agendamento com créditos
  useEffect(() => {
    if (!scheduleCredit || !scheduleDate || !scheduleCredit.staffPartnerUserId) {
      setScheduleSlots([])
      return
    }
    let cancelled = false
    setLoadingScheduleSlots(true)
    setScheduleTime("")
    getAvailableTimeSlotsAction(
      scheduleDate,
      scheduleCredit.staffPartnerUserId,
      Number(scheduleCredit.durationMinutes || 60),
      0,
      detail?.subscription?.storeId || null,
    )
      .then((res) => {
        if (cancelled) return
        const conflicts = new Set<string>((res.conflictingSlots as string[]) || [])
        setScheduleSlots(((res.slots as string[]) || []).filter((s) => !conflicts.has(s)))
      })
      .catch(() => {
        if (!cancelled) setScheduleSlots([])
      })
      .finally(() => {
        if (!cancelled) setLoadingScheduleSlots(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleCredit, scheduleDate])

  const openScheduleModal = (credit: any) => {
    setScheduleCredit(credit)
    setScheduleDate("")
    setScheduleTime("")
    setScheduleNotes("")
    setScheduleSlots([])
  }

  const openDeliveryModal = () => {
    const productCredits = (detail?.credits || []).filter((c) => c.itemType === "product" && c.remaining > 0)
    const initial: Record<string, number> = {}
    for (const c of productCredits) initial[c.id] = 1
    setDeliveryQuantities(initial)
    setDeliveryType(detail?.subscription?.deliveryType === "delivery" ? "delivery" : "pickup")
    setDeliveryNotes("")
    setDeliveryModalOpen(true)
  }

  const handleScheduleWithCredits = async () => {
    if (!scheduleCredit || !scheduleDate || !scheduleTime || submittingSchedule) return
    setSubmittingSchedule(true)
    try {
      const res = await scheduleSubscriptionServiceAction({
        partnerId,
        subscriptionId,
        serviceId: scheduleCredit.serviceId,
        date: scheduleDate,
        time: scheduleTime,
        staffPartnerUserId: scheduleCredit.staffPartnerUserId,
        notes: scheduleNotes || undefined,
      })
      if (res.success) {
        toast({
          title: "Agendado com créditos",
          description: `Pedido #${res.orderNumber} criado sem cobrança.`,
        })
        setScheduleCredit(null)
        void loadDetail()
      } else {
        toast({ title: "Não foi possível agendar", description: res.error, variant: "destructive" })
      }
    } finally {
      setSubmittingSchedule(false)
    }
  }

  const handleRegisterDelivery = async () => {
    if (submittingDelivery) return
    const productCredits = (detail?.credits || []).filter((c) => c.itemType === "product" && c.remaining > 0)
    const items = productCredits
      .filter((c) => Number(deliveryQuantities[c.id] || 0) > 0)
      .map((c) => ({
        productId: c.productId as string,
        quantity: Number(deliveryQuantities[c.id] || 0),
      }))
    if (items.length === 0) {
      toast({ title: "Informe a quantidade", description: "Ao menos um item deve ter quantidade maior que zero.", variant: "destructive" })
      return
    }
    setSubmittingDelivery(true)
    try {
      const res = await createSubscriptionDeliveryOrderAction({
        partnerId,
        subscriptionId,
        items,
        deliveryType,
        notes: deliveryNotes || undefined,
      })
      if (res.success) {
        toast({
          title: "Entrega registrada",
          description: `Pedido #${res.orderNumber} criado sem cobrança. Confira em Pedidos.`,
        })
        setDeliveryModalOpen(false)
        void loadDetail()
        onChanged?.()
      } else {
        toast({ title: "Não foi possível registrar", description: res.error, variant: "destructive" })
      }
    } finally {
      setSubmittingDelivery(false)
    }
  }

  const pageTitle = detail?.plan?.name || "Assinatura"

  useEffect(() => {
    setHeaderOverride({ title: pageTitle, onBack, isSubPage: true })
    // Restores the list header (ERPPageHeader does not re-run when this unmounts)
    return () => setHeaderOverride({ title: "Assinaturas Recorrentes" })
  }, [pageTitle, onBack, setHeaderOverride])

  const status = detail?.subscription?.status
  const priceChangePending =
    !!detail?.subscription?.priceChangeRequestedAt && !detail?.subscription?.priceChangeDecision
  const canSync = canManage && !!detail?.subscription?.mpPreapprovalId
  const canCancel = canManage && !!status && status !== "cancelled" && status !== "expired"

  const primaryAction = useMemo(() => {
    if (!canManage || !status) return null
    // Assinatura ativa não tem botão principal: pausar/cancelar ficam no menu de ações.
    if (status === "active") return null
    if (status === "paused") {
      return { label: "Reativar assinatura", icon: <PlayIcon size={18} />, action: "resume" as SubscriptionAction }
    }
    if (status === "awaiting_restock") {
      return { label: "Resolver estoque", icon: <PlayIcon size={18} />, action: "resolve_stock" as SubscriptionAction }
    }
    if (canSync) {
      return { label: "Sincronizar", icon: <RepeatIcon size={18} />, action: "sync" as SubscriptionAction }
    }
    return null
  }, [canManage, canSync, status])

  const executeAction = useCallback(
    async (action: SubscriptionAction) => {
      if (busy) return
      setBusy(true)
      try {
        let res: any
        if (action === "pause") res = await pauseRecurringSubscriptionAction(partnerId, subscriptionId)
        else if (action === "resume") res = await resumeRecurringSubscriptionAction(partnerId, subscriptionId)
        else if (action === "cancel") res = await cancelRecurringSubscriptionAction(partnerId, subscriptionId)
        else if (action === "resolve_stock")
          res = await updateSubscriptionStockShortageResolvedAction(partnerId, subscriptionId)
        else res = await syncSubscriptionWithMpErpAction(partnerId, subscriptionId)

        if (!res.success) {
          toast({ title: "Erro", description: res.error, variant: "destructive" })
          return
        }

        toast({
          title:
            res.message ||
            (action === "sync" ? "Assinatura sincronizada com sucesso!" : "Assinatura atualizada com sucesso!"),
        })
        // Com o cache da lista, a página pai já refaz o detalhe; sem cache, busca aqui.
        if (!initialDetail) await loadDetail()
        if (executionsRequestedRef.current) await loadExecutions()
        onChanged?.()
      } finally {
        setBusy(false)
      }
    },
    [busy, initialDetail, loadDetail, loadExecutions, onChanged, partnerId, subscriptionId, toast],
  )

  // Pausar e cancelar pedem confirmação (AlertModal); as demais ações rodam direto.
  const runAction = useCallback(
    (action: SubscriptionAction) => {
      if (action === "pause" || action === "cancel") {
        setConfirmDialog(
          action === "pause"
            ? {
              title: "Pausar assinatura?",
              message:
                "As próximas execuções ficam suspensas até você reativar. Nenhuma nova cobrança será feita nesse período.",
              confirmText: "Pausar assinatura",
              cancelText: "Voltar",
              variant: "warning",
              onConfirm: () => executeAction(action),
            }
            : {
              title: "Cancelar assinatura?",
              message:
                "As próximas cobranças e execuções serão interrompidas. Esta ação não pode ser desfeita.",
              confirmText: "Cancelar assinatura",
              cancelText: "Manter assinatura",
              isDestructive: true,
              onConfirm: () => executeAction(action),
            },
        )
        return
      }
      void executeAction(action)
    },
    [executeAction],
  )

  const openOrder = useCallback(
    (orderId: string) => {
      router.push(`/erp/pedidos?view=${orderId}`)
    },
    [router],
  )

  if (!detail) {
    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full min-h-[200px] bg-white dark:bg-dark-background">
          <IconPlaceholder
            placeholderType="image"
            imageSrc="https://img.dudit.com.br/static/mascots/NaoEncontrado.png"
            imageAlt="Assinatura não encontrada"
            title="Erro ao carregar assinatura"
            subtitle={loadError}
          />
          <Button variant="outline" onClick={onBack}>
            Voltar para a lista
          </Button>
        </div>
      )
    }
    return <ERPDetailLoading />
  }

  const subscription = detail.subscription
  const plan = detail.plan
  const customer = detail.customer

  const showPauseMenu = canManage && status === "active" && primaryAction?.action !== "pause"
  const showResumeMenu = canManage && status === "paused" && primaryAction?.action !== "resume"
  const showRestockMenu =
    canManage && status === "awaiting_restock" && primaryAction?.action !== "resolve_stock"
  const showSyncMenu = canSync && primaryAction?.action !== "sync"
  const hasDropdownContent = canCancel || showPauseMenu || showResumeMenu || showRestockMenu || showSyncMenu

  const sidebarMenuItems = (
    <>
      {showPauseMenu && (
        <DropdownItem onClick={() => void runAction("pause")}>
          <BlockedIcon size={18} /> Pausar assinatura
        </DropdownItem>
      )}
      {showResumeMenu && (
        <DropdownItem onClick={() => void runAction("resume")}>
          <PlayIcon size={18} /> Reativar
        </DropdownItem>
      )}
      {showRestockMenu && (
        <DropdownItem onClick={() => void runAction("resolve_stock")}>
          <PlayIcon size={18} /> Resolver estoque
        </DropdownItem>
      )}
      {showSyncMenu && (
        <DropdownItem onClick={() => void runAction("sync")}>
          <RepeatIcon size={18} /> Sincronizar com Mercado Pago
        </DropdownItem>
      )}
    </>
  )

  const cancelledCard =
    status === "cancelled" ? (
      <InfoCard
        color="red"
        title="Assinatura cancelada"
        message={`Esta assinatura foi cancelada${subscription.cancelledAt ? ` em ${formatFullDate(subscription.cancelledAt)}` : ""} e não gera novas execuções.`}
      />
    ) : null

  // Itens contratados (fallback para os itens do plano quando a assinatura ainda nao tem vinculo)
  const usingPlanItems = !detail.items.length && !!plan?.items?.length
  const tabItems = usingPlanItems
    ? (plan?.items || []).map((item) => ({
      key: item.id,
      name: item.product?.name || item.service?.name || "Item",
      itemType: item.itemType,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? 0,
      preferredTime: item.preferredTime,
      durationMinutes: item.durationMinutes,
      images: item.product ? (item.product as any).images : (item.service as any)?.images,
    }))
    : detail.items.map((item) => ({
      key: item.id,
      name:
        item.product?.name ||
        item.service?.name ||
        (item.itemType === "product" ? "Produto" : "Serviço"),
      itemType: item.itemType,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      preferredTime: item.preferredTime,
      durationMinutes: item.durationMinutes,
      images: item.product ? item.product.images : item.service?.images,
    }))

  const filteredExecutions = useMemo(() => {
    const term = historySearch.trim().toLowerCase()
    if (!term) return executions
    return executions.filter((execution: any) => {
      const orderNumber = execution.orders?.order_number ? String(execution.orders.order_number) : ""
      return (
        orderNumber.includes(term) ||
        (execution.scheduled_for || "").toLowerCase().includes(term) ||
        (execution.status || "").toLowerCase().includes(term)
      )
    })
  }, [executions, historySearch])

  const historyTotalPages = Math.max(Math.ceil(filteredExecutions.length / HISTORY_ITEMS_PER_PAGE), 1)
  const paginatedExecutions = filteredExecutions.slice(
    (historyPage - 1) * HISTORY_ITEMS_PER_PAGE,
    historyPage * HISTORY_ITEMS_PER_PAGE,
  )

  return (
    <FadeIn className="h-full">
      <div className="flex flex-col h-full bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as DetailTab)}
          className="flex flex-col h-full w-full"
        >
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth"
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border transition-all duration-500 ease-in-out">
              <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
                <div
                  className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}
                >
                  <Button
                    variant="filled"
                    onClick={onBack}
                    className="w-10 h-10 p-0 flex items-center justify-center"
                  >
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                </div>

                <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                  <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                    <h1
                      className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}
                    >
                      <span className="truncate">{pageTitle}</span>
                      {status && (
                        <Badge variant={getRecurringStatusVariant(status)} className="whitespace-nowrap">
                          {getRecurringStatusLabel(status)}
                        </Badge>
                      )}
                      {priceChangePending && (
                        <Badge variant="blue" className="whitespace-nowrap">
                          Mudança pendente
                        </Badge>
                      )}
                    </h1>
                    <div
                      className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}
                    >
                      {customer?.name || "Cliente"} • Início {formatFullDate(subscription.startedAt)} •
                      Próxima execução {formatFullDate(subscription.nextExecutionAt)}
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                    {hasDropdownContent && (
                      <ActionsDropdown
                        cancelLabel="Cancelar assinatura"
                        onCancel={canCancel ? () => void runAction("cancel") : undefined}
                      >
                        {sidebarMenuItems}
                      </ActionsDropdown>
                    )}
                    {primaryAction && (
                      <Button
                        className="whitespace-nowrap"
                        disabled={busy}
                        leftIcon={primaryAction.icon}
                        onClick={() => void runAction(primaryAction.action)}
                      >
                        {primaryAction.label}
                      </Button>
                    )}
                  </div>
                </div>

                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                  <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                    <TabsTrigger value="general">Dados gerais</TabsTrigger>
                    <TabsTrigger value="items">Itens Contratados</TabsTrigger>
                    <TabsTrigger value="credits">Créditos de Serviço</TabsTrigger>
                    {subscription.notes && <TabsTrigger value="notes">Observações</TabsTrigger>}
                    <TabsTrigger value="history">Histórico de Execuções</TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
              <AnimatePresence mode="wait">
                {activeTab === "general" && (
                  <FadeIn key="general" className="block">
                    {/* Cancelada: card vermelho no topo no tablet/mobile */}
                    {cancelledCard && <div className="lg:hidden mb-6">{cancelledCard}</div>}

                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                      <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                        <FormSection title="Dados do Cliente" className="mb-8">
                          <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Cliente" value={customer?.name || subscription.customerId} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="E-mail" value={customer?.email || "-"} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Telefone" value={customer?.phone || "-"} />
                            </div>
                          </div>
                        </FormSection>

                        <FormSection hasSeparator title="Ciclo e Execução">
                          <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Frequência"
                                value={
                                  plan
                                    ? getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)
                                    : "-"
                                }
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Data de Início" value={formatFullDate(subscription.startedAt)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Próxima Execução" value={formatFullDate(subscription.nextExecutionAt)} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Última Execução"
                                value={
                                  subscription.lastExecutionAt
                                    ? formatFullDate(subscription.lastExecutionAt)
                                    : "Nenhuma execução"
                                }
                              />
                            </div>
                            {subscription.pausedAt && (
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow label="Pausada em" value={formatFullDate(subscription.pausedAt)} />
                              </div>
                            )}
                            {subscription.cancelledAt && (
                              <div className="col-span-12 md:col-span-6">
                                <InfoRow label="Cancelada em" value={formatFullDate(subscription.cancelledAt)} />
                              </div>
                            )}
                          </div>
                        </FormSection>

                        <FormSection hasSeparator title="Entrega e Frete">
                          <div className="grid grid-cols-12 gap-x-5 gap-y-5">
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Tipo de Entrega"
                                value={subscription.deliveryType === "delivery" ? "Entrega" : "Retirada"}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Frete"
                                value={formatCurrency(Number(subscription.shippingAmount || 0))}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Origem do Frete"
                                value={getRecurringShippingSourceLabel(subscription.shippingSource || "pickup")}
                              />
                            </div>
                            {subscription.deliveryType === "delivery" && subscription.deliveryAddress && (
                              <div className="col-span-12">
                                <InfoRow label="Endereço de Entrega" value={subscription.deliveryAddress} />
                              </div>
                            )}
                          </div>
                        </FormSection>
                      </div>

                      {/* Sidebar */}
                      <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
                        {/* Cancelada: card vermelho acima do resumo financeiro no desktop */}
                        {cancelledCard && <div className="hidden lg:block mb-6">{cancelledCard}</div>}

                        <SidebarCard hasSeparator hasTopStrip title="Resumo Financeiro">
                          <div className="flex flex-col gap-3">
                            <SidebarRow
                              label="Valor do Plano"
                              value={formatCurrency(
                                Number(plan?.price ?? subscription.contractedAmount ?? 0),
                              )}
                            />
                            <SidebarRow
                              label="Frete"
                              value={formatCurrency(Number(subscription.shippingAmount || 0))}
                            />
                            <SidebarRow
                              label="Total do próximo ciclo"
                              value={formatCurrency(
                                Number(plan?.price ?? subscription.contractedAmount ?? 0) +
                                Number(subscription.shippingAmount || 0),
                              )}
                              valueClassName="text-brand-primary"
                            />
                            <SidebarRow
                              label="Modo de Cobrança"
                              value={subscription.billingMode === "auto_mercado_pago" ? "Mercado Pago" : "Manual"}
                            />
                          </div>
                        </SidebarCard>

                        <SidebarCard hasSeparator hasTopStrip title="Ciclo e Cobrança">
                          <div className="flex flex-col gap-3">
                            <SidebarRow label="Status" value={status ? getRecurringStatusLabel(status) : "-"} />
                            <SidebarRow label="Início" value={formatFullDate(subscription.startedAt)} />
                            <SidebarRow
                              label="Próxima Execução"
                              value={formatFullDate(subscription.nextExecutionAt)}
                            />
                            <SidebarRow
                              label="Última Execução"
                              value={
                                subscription.lastExecutionAt ? formatFullDate(subscription.lastExecutionAt) : "-"
                              }
                            />
                            <SidebarRow
                              label="Mercado Pago"
                              value={subscription.mpPreapprovalId || "Não vinculada"}
                              valueClassName="text-sm break-all"
                            />
                            {priceChangePending && (
                              <InfoCard title="Mudança de preço aguardando decisão" message={subscription.priceChangeExpiresAt ? `Janela até ${formatFullDate(subscription.priceChangeExpiresAt)}` : ""} color="blue" />
                            )}
                            {subscription.pendingCancellationReason && (
                              <InfoCard title="Cancelamento pendente" message={subscription.pendingCancellationReason} color="red" />
                            )}
                          </div>
                        </SidebarCard>
                      </div>
                    </div>
                  </FadeIn>
                )}

                {activeTab === "items" && (
                  <FadeIn key="items" className="block">
                    {tabItems.length ? (
                      <FormSection title={usingPlanItems ? "Itens do Plano" : "Itens Contratados"}>
                        <div className="space-y-4">
                          {tabItems.map((item) => {
                            const imageSrc = Array.isArray(item.images) && item.images.length
                              ? getR2ImageUrl(item.images[0], "thumbnail")
                              : PLACEHOLDER_IMAGE
                            return (
                              <div key={item.key} className="flex items-start gap-4">
                                <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border">
                                  <img
                                    src={imageSrc}
                                    alt={item.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover rounded-full"
                                    onError={(e: any) => {
                                      e.target.src = PLACEHOLDER_IMAGE
                                    }}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-1 gap-3">
                                    <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                      {item.name}
                                    </h4>
                                    <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                      {formatCurrency(item.unitPrice)}
                                    </span>
                                  </div>
                                  <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                    {item.itemType === "product" ? "Produto" : "Serviço"}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-brand-inactive-text dark:text-dark-body">
                                      Quantidade {item.quantity}
                                    </span>
                                    {item.preferredTime && (
                                      <>
                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">
                                          Horário {String(item.preferredTime).slice(0, 5)}
                                        </span>
                                      </>
                                    )}
                                    {item.durationMinutes ? (
                                      <>
                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                        <span className="text-brand-inactive-text dark:text-dark-body">
                                          {item.durationMinutes} min
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </FormSection>
                    ) : (
                      <div className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                          imageAlt="Nenhum item"
                          title="Nenhum item contratado"
                          subtitle="Esta assinatura ainda não tem itens vinculados."
                        />
                      </div>
                    )}
                  </FadeIn>
                )}

                {activeTab === "credits" && (
                  <FadeIn key="credits" className="block">
                    {mergedCredits.length ? (
                      <FormSection
                        title="Créditos da Assinatura"
                        description="Itens do plano e saldo de créditos. Serviços podem ser agendados e produtos entregues usando créditos."
                      >
                        <div className="space-y-3">
                          {mergedCredits.map((credit) => (
                            <ListItem
                              key={credit.id}
                              icon={
                                credit.image ? (
                                  <img
                                    src={credit.image}
                                    alt={credit.itemName}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover rounded-full"
                                    onError={(e) => {
                                      e.currentTarget.src = PLACEHOLDER_IMAGE
                                    }}
                                  />
                                ) : (
                                  GiftIcon
                                )
                              }
                              title={
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <span className="truncate">{credit.itemName}</span>
                                  <Badge variant={credit.itemType === "service" ? "blue" : "purple"} icon={null}>
                                    {credit.itemType === "service" ? "Serviço" : "Produto"}
                                  </Badge>
                                </span>
                              }
                              description={
                                credit.quantity > 0 ? (
                                  <>
                                    {credit.expiresAt
                                      ? `Válido até ${formatFullDate(credit.expiresAt)}`
                                      : "Sem validade"}
                                    {` • ${credit.consumed} consumidos`}
                                  </>
                                ) : (
                                  "Libera no próximo ciclo"
                                )
                              }
                              className="p-4"
                              right={
                                <div className="flex items-center justify-end gap-3 shrink-0 flex-wrap">
                                  <span
                                    className={`inline-block px-2.5 py-1 rounded-full font-bold text-xs ${credit.remaining > 0 ? "bg-brand-green/10 text-brand-green" : "bg-brand-gray/40 text-brand-inactive-text"}`}
                                  >
                                    {credit.remaining}/{credit.quantity}
                                  </span>
                                  {canManage && credit.remaining > 0 && credit.itemType === "service" && (
                                    <Button size="sm" onClick={() => openScheduleModal(credit)}>
                                      Agendar
                                    </Button>
                                  )}
                                  {canManage && credit.remaining > 0 && credit.itemType === "product" && (
                                    <Button size="sm" onClick={openDeliveryModal}>
                                      Registrar entrega
                                    </Button>
                                  )}
                                  {credit.remaining <= 0 && (
                                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                                      Sem saldo - libera no próximo ciclo
                                    </span>
                                  )}
                                </div>
                              }
                            />
                          ))}
                        </div>
                      </FormSection>
                    ) : (
                      <div className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/ValesCompra.png"
                          imageAlt="Nenhum crédito"
                          title="Nenhum crédito disponível"
                          subtitle="Créditos liberados por esta assinatura aparecerão aqui."
                        />
                      </div>
                    )}
                  </FadeIn>
                )}

                {activeTab === "notes" && subscription.notes && (
                  <FadeIn key="notes" className="block">
                    <FormSection title="Observações">
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap">
                        {subscription.notes}
                      </p>
                    </FormSection>
                  </FadeIn>
                )}

                {activeTab === "history" && (
                  <FadeIn key="history" className="block">
                    <FormSection
                      title="Histórico de Execuções"
                      description="Ciclos já processados desta assinatura."
                    >
                      <div className="max-w-sm">
                        <Input
                          name="historySearch"
                          placeholder="Buscar por pedido, data ou situação..."
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          variant="full-rounded"
                          label=""
                          prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        />
                      </div>

                      {loadingExecutions ? (
                        <div className="flex items-center justify-center py-24">
                          <ThreeDotsLoader />
                        </div>
                      ) : filteredExecutions.length === 0 ? (
                        <div className="w-full flex items-center justify-center min-h-[400px]">
                          <IconPlaceholder
                            placeholderType="image"
                            imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                            imageAlt="Nenhuma execução"
                            title={
                              executions.length === 0
                                ? "Nenhuma execução registrada"
                                : "Nenhuma execução encontrada"
                            }
                            subtitle={
                              executions.length === 0
                                ? "As execuções desta assinatura aparecerão aqui conforme forem acontecendo."
                                : "Ajuste a busca para encontrar o ciclo desejado."
                            }
                            itemButton={
                              executions.length > 0
                                ? {
                                  text: "Limpar busca",
                                  action: () => setHistorySearch(""),
                                  variant: "outline",
                                }
                                : undefined
                            }
                          />
                        </div>
                      ) : (
                        <>
                          {isTablet ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                              {paginatedExecutions.map((execution) => (
                                <ExecutionGridCard
                                  key={execution.id}
                                  execution={execution}
                                  onOpenOrder={openOrder}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="w-full overflow-hidden rounded-xl relative">
                              <div className={`absolute top-0 left-0 h-full w-12 bg-gradient-to-r from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.left ? "opacity-100" : "opacity-0"}`} />
                              <div className={`absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-white dark:from-dark-background to-transparent z-10 pointer-events-none transition-opacity duration-300 ${scrollState.right ? "opacity-100" : "opacity-0"}`} />

                              <div className="overflow-x-auto pb-4 custom-scrollbar" ref={tableContainerRef} onScroll={checkTableScroll}>
                                <table className="w-full text-left border-separate border-spacing-0 min-w-[900px]">
                                  <thead>
                                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                                      {EXECUTION_COLUMNS.map((col, index) => (
                                        <th
                                          key={col.id}
                                          className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"} ${index === 0 ? "rounded-l-lg pl-6" : ""} ${index === EXECUTION_COLUMNS.length - 1 ? "rounded-r-lg pr-6" : ""}`}
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
                                    {paginatedExecutions.map((execution) => (
                                      <ExecutionListRow
                                        key={execution.id}
                                        execution={execution}
                                        columns={EXECUTION_COLUMNS}
                                        onOpenOrder={openOrder}
                                        onViewError={setExecutionError}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {historyTotalPages > 1 && (
                            <div className="mt-2">
                              <Pagination
                                currentPage={historyPage}
                                totalPages={historyTotalPages}
                                onPageChange={setHistoryPage}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </FormSection>
                  </FadeIn>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile Bottom Action Bar */}
          {canManage && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
              {hasDropdownContent && (
                <ActionsDropdown
                  fullWidth={!primaryAction}
                  cancelLabel="Cancelar assinatura"
                  onCancel={canCancel ? () => void runAction("cancel") : undefined}
                  trigger={
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={busy}
                      leftIcon={<ThreeDotsIcon size={18} />}
                    >
                      Opções
                    </Button>
                  }
                >
                  {sidebarMenuItems}
                </ActionsDropdown>
              )}
              {primaryAction && (
                <Button
                  className="flex-1 whitespace-nowrap"
                  disabled={busy}
                  leftIcon={primaryAction.icon}
                  onClick={() => void runAction(primaryAction.action)}
                >
                  {primaryAction.label}
                </Button>
              )}
            </div>
          )}
        </Tabs>

        <DefaultModal
          isOpen={!!executionError}
          onClose={() => setExecutionError(null)}
          title="Erro da execução"
          maxWidth="md"
        >
          <p className="text-sm text-brand-red whitespace-pre-wrap">{executionError}</p>
        </DefaultModal>

        <DefaultModal
          isOpen={!!scheduleCredit}
          onClose={() => setScheduleCredit(null)}
          title="Agendar serviço com créditos"
          maxWidth="md"
        >
          {scheduleCredit && (
            <div className="space-y-4">
              <InfoCard
                color="blue"
                title={scheduleCredit.itemName}
                message="Agendamento sem cobrança - debita 1 crédito da assinatura do cliente."
              />

              <DatePicker
                label="Data"
                required
                value={scheduleDate || undefined}
                onChange={(d: any) => {
                  if (!d) {
                    setScheduleDate("")
                    return
                  }
                  const pad = (n: number) => String(n).padStart(2, "0")
                  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                  const today = new Date()
                  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
                  if (iso < todayIso) {
                    toast({ title: "Data inválida", description: "Escolha uma data a partir de hoje.", variant: "destructive" })
                    return
                  }
                  const expiryIso = scheduleCredit.expiresAt ? String(scheduleCredit.expiresAt).slice(0, 10) : null
                  if (expiryIso && iso > expiryIso) {
                    toast({
                      title: "Data inválida",
                      description: `Os créditos valem até ${expiryIso.split("-").reverse().join("/")}.`,
                      variant: "destructive",
                    })
                    return
                  }
                  setScheduleDate(iso)
                }}
              />

              <div>
                <label className="text-sm font-medium text-brand-dark dark:text-dark-heading block mb-1.5">
                  Horário <span className="text-brand-red">*</span>
                </label>
                {!scheduleDate ? (
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    Escolha a data para ver os horários.
                  </p>
                ) : loadingScheduleSlots ? (
                  <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                    <ThreeDotsLoader /> Carregando horários...
                  </div>
                ) : scheduleSlots.length === 0 ? (
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                    Nenhum horário livre nesta data. Tente outro dia.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {scheduleSlots.map((slot) => (
                      <Button
                        key={slot}
                        type="button"
                        variant={scheduleTime === slot ? "default" : "outline"}
                        size="sm"
                        onClick={() => setScheduleTime(slot)}
                      >
                        {slot}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <FormTextarea
                label="Observações (opcional)"
                placeholder="Instruções para o atendimento..."
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                rows={2}
                maxLength={500}
                showCharacterCount
              />

              <Button
                className="w-full"
                onClick={() => void handleScheduleWithCredits()}
                disabled={!scheduleDate || !scheduleTime || submittingSchedule}
              >
                {submittingSchedule ? "Confirmando..." : "Confirmar agendamento"}
              </Button>
            </div>
          )}
        </DefaultModal>

        <DefaultModal
          isOpen={deliveryModalOpen}
          onClose={() => setDeliveryModalOpen(false)}
          title="Registrar entrega com créditos"
          maxWidth="md"
        >
          <div className="space-y-4">
            <InfoCard
              color="blue"
              message="Registre a entrega ou retirada dos produtos. O estoque é baixado e 1 crédito é consumido por unidade."
            />
            {(detail?.credits || [])
              .filter((c) => c.itemType === "product" && c.remaining > 0)
              .map((credit) => (
                <div key={credit.id} className="flex items-center justify-between gap-4 border border-brand-border dark:border-dark-border rounded-xl p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                      {credit.itemName}
                    </p>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                      {credit.remaining} crédito(s) disponível(is)
                      {credit.expiresAt ? ` • Válido até ${formatFullDate(credit.expiresAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDeliveryQuantities((prev) => ({
                          ...prev,
                          [credit.id]: Math.max(0, Number(prev[credit.id] || 0) - 1),
                        }))
                      }
                      disabled={Number(deliveryQuantities[credit.id] || 0) <= 0}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center text-sm font-bold text-brand-dark dark:text-dark-heading">
                      {Number(deliveryQuantities[credit.id] || 0)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDeliveryQuantities((prev) => ({
                          ...prev,
                          [credit.id]: Math.min(credit.remaining, Number(prev[credit.id] || 0) + 1),
                        }))
                      }
                      disabled={Number(deliveryQuantities[credit.id] || 0) >= credit.remaining}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}

            <div>
              <label className="text-sm font-medium text-brand-dark dark:text-dark-heading block mb-1.5">
                Tipo de entrega <span className="text-brand-red">*</span>
              </label>
              <div className="flex gap-2">
                {(["pickup", "delivery"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={deliveryType === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDeliveryType(t)}
                  >
                    {t === "pickup" ? "Retirada" : "Entrega"}
                  </Button>
                ))}
              </div>
            </div>

            <FormTextarea
              label="Observações (opcional)"
              placeholder="Instruções para a entrega..."
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              rows={2}
              maxLength={500}
              showCharacterCount
            />

            <Button
              className="w-full"
              onClick={() => void handleRegisterDelivery()}
              disabled={submittingDelivery}
            >
              {submittingDelivery ? "Registrando..." : "Registrar entrega"}
            </Button>
          </div>
        </DefaultModal>

        <AlertModal
          isOpen={!!confirmDialog}
          title={confirmDialog?.title || ""}
          message={confirmDialog?.message}
          confirmText={confirmDialog?.confirmText}
          cancelText={confirmDialog?.cancelText || "Voltar"}
          variant={confirmDialog?.variant}
          isDestructive={confirmDialog?.isDestructive}
          isLoading={busy}
          onClose={() => setConfirmDialog(null)}
          onConfirm={async () => {
            const fn = confirmDialog?.onConfirm
            try {
              await fn?.()
            } finally {
              setConfirmDialog(null)
            }
          }}
        />
      </div>
    </FadeIn>
  )
}

export default SubscriptionDetailPage
