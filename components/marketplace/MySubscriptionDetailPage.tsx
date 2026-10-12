"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Button,
  Badge,
  Spinner,
  FormSection,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dropdown,
  DropdownItem,
  SkeletonLoader,
  AlertModal,
  IconPlaceholder,
  DefaultModal,
  RadioButton,
  InfoCard,
  DatePicker,
  FormTextarea,
  ListItem,
} from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { useToast } from "@/hooks/use-toast"
import {
  cancelMyRecurringSubscriptionAction,
  getMyRecurringSubscriptionExecutionsAction,
  pauseMyRecurringSubscriptionAction,
  resumeMyRecurringSubscriptionAction,
  skipMySubscriptionCycleAction,
  updateMySubscriptionDetailsAction,
  confirmMySubscriptionAddressChangeAction,
  respondToMySubscriptionPriceChangeAction,
  getMySubscriptionCreditsAction,
  bookServiceWithCreditAction,
} from "@/app/actions/marketplace/recurring-subscriptions"
import { getPublicAvailableTimeSlots } from "@/app/actions/marketplace/services"
import { getAddressesAction } from "@/app/actions/shared/addresses"
import { getLatestPurchaseForSubscriptionAction } from "@/app/actions/billing/purchases"
import { formatCurrency, formatDate, formatFullDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getProductUrl, getServiceUrl, getStoreUrl } from "@/lib/utils/url-generator"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ClockIcon,
  BlockedIcon,
  PlayIcon,
  InfoIcon,
  CheckCircleIcon,
  CancelCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  XIcon,
  EditIcon,
  RepeatIcon,
  MoneyIcon,
  GiftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MapPinIcon,
} from "@/lib/icons"
import { BillingRefundModal } from "@/components/billing/BillingRefundModal"

const HISTORY_PAGE_SIZE = 10
const PLACEHOLDER_STORE_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

export const getStatusConfig = (status: string) => {
  switch (status) {
    case "active":
      return { label: "Ativa", color: "text-brand-green", icon: CheckCircleIcon }
    case "paused":
      return { label: "Pausada", color: "text-brand-orange", icon: BlockedIcon }
    case "pending":
      return { label: "Aguardando Confirmação", color: "text-brand-orange", icon: ClockIcon }
    case "past_due":
      return { label: "Pagamento Pendente", color: "text-brand-orange", icon: AlertTriangleIcon }
    case "payment_failed":
      return { label: "Falha no Pagamento", color: "text-red-700", icon: XIcon }
    case "cancelled":
      return { label: "Cancelada", color: "text-red-700", icon: CancelCircleIcon }
    case "expired":
      return { label: "Encerrada", color: "text-gray-700 dark:text-dark-body", icon: BlockedIcon }
    case "awaiting_restock":
      return { label: "Aguardando Reposição", color: "text-red-700", icon: BlockedIcon }
    case "awaiting_customer_decision":
      return { label: "Aguardando Cliente", color: "text-brand-orange", icon: InfoIcon }
    default:
      return { label: status || "Desconhecido", color: "text-gray-700 dark:text-dark-body", icon: AlertCircleIcon }
  }
}

export const getStatusLabel = (status: string) => getStatusConfig(status).label

export const getExecutionBadge = (status: string) => {
  if (status === "completed") return { variant: "green" as const, label: "Concluída" }
  if (status === "failed") return { variant: "red" as const, label: "Falha" }
  if (status === "skipped" || status === "cancelled") return { variant: "orange" as const, label: "Pulado" }
  if (status === "pending" || status === "scheduled") return { variant: "gray" as const, label: "Agendada" }
  if (status === "awaiting_payment") return { variant: "orange" as const, label: "Aguardando pagamento" }
  if (status === "processing") return { variant: "blue" as const, label: "Processando" }
  return { variant: "gray" as const, label: status || "Agendada" }
}

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-center text-sm gap-4 py-2.5 border-b border-brand-border/40 dark:border-dark-border/40 last:border-0">
    <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
    <div className="text-right font-semibold text-brand-dark dark:text-dark-heading">{value}</div>
  </div>
)

type ConfirmDialog = {
  title: string
  message: string
  confirmText: string
  cancelText?: string
  variant?: "danger" | "success" | "warning" | "info"
  isDestructive?: boolean
  onConfirm: () => void | Promise<void>
}

interface MySubscriptionDetailPageProps {
  subscription: any
  onBack: () => void
  onUpdate: (updated: any) => void
  userId?: string | null
  initialTab?: "details" | "credits" | "notes" | "history"
}

export function MySubscriptionDetailPage({ subscription: sub, onBack, onUpdate, userId, initialTab }: MySubscriptionDetailPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"details" | "credits" | "notes" | "history">(initialTab || "details")
  const [actionLoading, setActionLoading] = useState(false)

  const [credits, setCredits] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [creditsLoaded, setCreditsLoaded] = useState(false)

  const [bookingCredit, setBookingCredit] = useState<any | null>(null)
  const [bookingDate, setBookingDate] = useState("")
  const [bookingTime, setBookingTime] = useState("")
  const [bookingNotes, setBookingNotes] = useState("")
  const [bookingSlots, setBookingSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submittingBooking, setSubmittingBooking] = useState(false)

  const [editNotes, setEditNotes] = useState("")
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingDetails, setSavingDetails] = useState(false)

  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [userAddresses, setUserAddresses] = useState<any[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(false)

  const [executions, setExecutions] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundSub, setRefundSub] = useState<any>(null)
  const [refundPurchase, setRefundPurchase] = useState<any>(null)
  const [loadingRefund, setLoadingRefund] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null)

  const statusConfig = getStatusConfig(sub.status)
  const StatusIcon = statusConfig.icon
  const isClosed = sub.status === "cancelled" || sub.status === "expired"

  const storeName = sub.partner?.name || sub.partner?.store_name || "Loja Parceira"
  const storeImage = sub.partner?.logo_url ? getR2ImageUrl(sub.partner.logo_url) : PLACEHOLDER_STORE_IMAGE

  const proposedAmount = Number(sub.plan?.price || 0) + Number(sub.shippingAmount || 0)
  const isPriceFrozen = !!sub.priceChangeRequestedAt && !sub.priceChangeDecision
  // Assinatura encerrada/congelada nunca acompanha preço novo do plano: vale o contratado.
  const cycleAmount = isClosed
    ? sub.contractedAmount != null
      ? Number(sub.contractedAmount)
      : proposedAmount
    : isPriceFrozen
      ? Number(sub.contractedAmount || proposedAmount)
      : proposedAmount

  const itemsSubtotal = (sub.items || []).reduce(
    (sum: number, item: any) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  )
  const historyTotalPages = Math.ceil(executions.length / HISTORY_PAGE_SIZE)
  const paginatedExecutions = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE
    return executions.slice(start, start + HISTORY_PAGE_SIZE)
  }, [executions, historyPage])

  const loadHistory = async () => {
    setHistoryLoaded(true)
    setLoadingHistory(true)
    const res = await getMyRecurringSubscriptionExecutionsAction(sub.id)
    setLoadingHistory(false)
    if (res.success) setExecutions(res.data || [])
    else toast({ title: "Erro", description: res.error, variant: "destructive" })
  }

  useEffect(() => {
    if (activeTab === "history" && !historyLoaded) void loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const loadCredits = async () => {
    setCreditsLoaded(true)
    setLoadingCredits(true)
    const res = await getMySubscriptionCreditsAction(sub.id)
    setLoadingCredits(false)
    if (res.success) setCredits(res.data || [])
    else toast({ title: "Erro", description: res.error, variant: "destructive" })
  }

  useEffect(() => {
    if (activeTab === "credits" && !creditsLoaded) void loadCredits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // Itens do plano unidos às linhas de crédito: todo item contratado aparece
  // sempre (mesmo sem crédito liberado ainda - saldo 0).
  const mergedCredits = useMemo(() => {
    type MergedCredit = {
      key: string
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

    for (const item of sub.items || []) {
      const isProduct = item.itemType === "product"
      const serviceId = isProduct ? null : item.service?.id || null
      const productId = isProduct ? item.product?.id || null : null
      const details = (isProduct ? item.product : item.service) as { images?: string[] | null } | null
      const row: MergedCredit = {
        key: `item-${item.id}`,
        itemName: item.product?.name || item.service?.name || (isProduct ? "Produto" : "Serviço"),
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
            ? getPrimaryProductDisplayImage({ images: details.images }, "thumbnail")
            : null,
      }
      rows.push(row)
      if (serviceId) indexByKey.set(`s:${serviceId}`, row)
      if (productId) indexByKey.set(`p:${productId}`, row)
    }

    for (const credit of credits) {
      const key = credit.productId
        ? `p:${credit.productId}`
        : credit.serviceId
          ? `s:${credit.serviceId}`
          : null
      const target = key ? indexByKey.get(key) : undefined
      const row: MergedCredit = target ?? {
        key: credit.id,
        itemName: credit.itemName,
        itemType: credit.itemType === "product" ? "product" : "service",
        serviceId: credit.serviceId || null,
        productId: credit.productId || null,
        quantity: 0,
        consumed: 0,
        remaining: 0,
        expiresAt: null,
        staffPartnerUserId: null,
        durationMinutes: credit.durationMinutes ?? null,
        image: null,
      }
      if (!target) rows.push(row)
      row.quantity += Number(credit.totalCredits || 0)
      row.consumed += Number(credit.consumedCredits || 0)
      row.remaining += Number(credit.remainingCredits || 0)
      if (credit.expiresAt && (!row.expiresAt || credit.expiresAt < row.expiresAt)) {
        row.expiresAt = credit.expiresAt
      }
      if (credit.staffPartnerUserId) row.staffPartnerUserId = credit.staffPartnerUserId
      if (credit.durationMinutes != null) row.durationMinutes = credit.durationMinutes
    }

    return rows
  }, [sub.items, credits])

  // Carrega horários sempre que data/profissional/duração do modal mudam
  useEffect(() => {
    if (!bookingCredit || !bookingDate || !bookingCredit.staffPartnerUserId) {
      setBookingSlots([])
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    setBookingTime("")
    getPublicAvailableTimeSlots(
      sub.partnerId,
      bookingCredit.staffPartnerUserId,
      bookingDate,
      Number(bookingCredit.durationMinutes || 60),
      0,
      sub.storeId || undefined,
    )
      .then((res) => {
        if (cancelled) return
        setBookingSlots(res.success ? res.slots || [] : [])
        if (!res.success && res.error) {
          toast({ title: "Erro", description: res.error, variant: "destructive" })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingCredit, bookingDate])

  const openBookingModal = (credit: any) => {
    setBookingCredit(credit)
    setBookingDate("")
    setBookingTime("")
    setBookingNotes("")
    setBookingSlots([])
  }

  const handleBookWithCredits = async () => {
    if (!bookingCredit || !bookingDate || !bookingTime) return
    setSubmittingBooking(true)
    try {
      const res = await bookServiceWithCreditAction({
        subscriptionId: sub.id,
        serviceId: bookingCredit.serviceId,
        date: bookingDate,
        time: bookingTime,
        staffPartnerUserId: bookingCredit.staffPartnerUserId,
        notes: bookingNotes || undefined,
      })
      if (res.success) {
        toast({
          title: "Agendado com créditos",
          description: `Pedido #${res.orderNumber} criado sem cobrança. Confira em Meus Pedidos.`,
        })
        setBookingCredit(null)
        void loadCredits()
      } else {
        toast({ title: "Não foi possível agendar", description: res.error, variant: "destructive" })
      }
    } finally {
      setSubmittingBooking(false)
    }
  }

  const runAction = async (action: "pause" | "resume" | "cancel") => {
    setActionLoading(true)
    const fn =
      action === "pause"
        ? pauseMyRecurringSubscriptionAction
        : action === "resume"
          ? resumeMyRecurringSubscriptionAction
          : cancelMyRecurringSubscriptionAction

    const res = await fn(sub.id)
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: `Assinatura ${action === "pause" ? "pausada" : action === "resume" ? "reativada" : "cancelada"} com sucesso!` })
    if (res.data) onUpdate(res.data)
  }

  const handleSkip = async () => {
    setActionLoading(true)
    const res = await skipMySubscriptionCycleAction(sub.id)
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Próximo ciclo pulado com sucesso!" })
    if (res.data) onUpdate(res.data)
  }

  const handleSaveNotes = async () => {
    setSavingDetails(true)
    const res = await updateMySubscriptionDetailsAction(sub.id, { notes: editNotes })
    setSavingDetails(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Observações atualizadas com sucesso!" })
    if (res.data) onUpdate(res.data)
    setEditingNotes(false)
  }

  const openAddressModal = async () => {
    if (!userId) {
      toast({ title: "Erro", description: "Não foi possível carregar seus endereços.", variant: "destructive" })
      return
    }
    setAddressModalOpen(true)
    setLoadingAddresses(true)
    try {
      const res = await getAddressesAction(userId, "user")
      setUserAddresses((res.addresses as any[]) || [])
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar seus endereços.", variant: "destructive" })
      setAddressModalOpen(false)
    } finally {
      setLoadingAddresses(false)
    }
  }

  const handlePickAddress = async (addr: any) => {
    const formatted = `${addr.street}, ${addr.number}${addr.complement ? `, ${addr.complement}` : ""} - ${addr.neighborhood}, ${addr.city} - ${addr.state}, ${addr.zip_code}`
    setAddressModalOpen(false)
    if (formatted === (sub.deliveryAddress || "")) return
    setActionLoading(true)
    const res = await updateMySubscriptionDetailsAction(sub.id, { deliveryAddress: formatted })
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    if (res.requiresConfirmation) {
      toast({
        title: "Confirme a mudança de endereço",
        description: "O novo endereço tem frete mais caro. Aceite ou recuse no aviso acima para continuar.",
      })
    } else {
      toast({ title: "Endereço de entrega atualizado com sucesso!" })
    }
    if (res.data) onUpdate(res.data)
  }

  const handleConfirmAddressChange = async (decision: "accept" | "discard") => {
    setActionLoading(true)
    const res = await confirmMySubscriptionAddressChangeAction(sub.id, decision)
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({
      title: decision === "accept" ? "Mudança de endereço confirmada!" : "Mudança de endereço descartada.",
    })
    if (res.data) onUpdate(res.data)
  }

  const handlePriceChangeResponse = async (decision: "accept" | "reject") => {
    setActionLoading(true)
    const res = await respondToMySubscriptionPriceChangeAction(sub.id, decision)
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({
      title:
        decision === "accept"
          ? "Nova condição aceita! Sua cobrança já usa os valores atualizados."
          : "Mudança recusada. Sua assinatura será encerrada ao final do ciclo atual.",
    })
    if (res.data) onUpdate(res.data)
  }

  const handleRefund = async () => {
    setLoadingRefund(true)
    setRefundSub(sub)
    const res = await getLatestPurchaseForSubscriptionAction(sub.id)
    setLoadingRefund(false)
    if (res.success && res.data) {
      setRefundPurchase(res.data)
      setRefundOpen(true)
    } else {
      toast({ title: "Erro", description: res.error || "Nenhuma fatura encontrada para reembolso.", variant: "destructive" })
    }
  }

  // Confirmações usando o AlertModal do projeto (nada de confirm() do navegador)
  const askPause = () =>
    setConfirmDialog({
      title: "Pausar assinatura?",
      message: "As próximas cobranças e entregas ficam suspensas até você reativar. Você pode reativar quando quiser.",
      confirmText: "Pausar assinatura",
      cancelText: "Manter ativa",
      variant: "warning",
      onConfirm: () => runAction("pause"),
    })

  const askResume = () =>
    setConfirmDialog({
      title: "Reativar assinatura?",
      message: "As próximas cobranças e entregas deste plano voltam a acontecer conforme o ciclo contratado.",
      confirmText: "Reativar assinatura",
      cancelText: "Voltar",
      variant: "success",
      onConfirm: () => runAction("resume"),
    })

  const askRefund = () =>
    setConfirmDialog({
      title: "Solicitar reembolso?",
      message: "Vamos abrir a solicitação de reembolso da última fatura paga desta assinatura para você revisar e enviar.",
      confirmText: "Continuar",
      cancelText: "Voltar",
      variant: "warning",
      onConfirm: handleRefund,
    })

  const askCancel = () =>
    setConfirmDialog({
      title: "Cancelar assinatura?",
      message:
        "As próximas cobranças e entregas deste plano serão interrompidas. Esta ação não pode ser desfeita.",
      confirmText: "Cancelar assinatura",
      cancelText: "Manter assinatura",
      isDestructive: true,
      onConfirm: () => runAction("cancel"),
    })

  const askSkip = () =>
    setConfirmDialog({
      title: "Pular o próximo ciclo?",
      message: "O próximo faturamento será pulado e a cobrança passa para o ciclo seguinte.",
      confirmText: "Pular ciclo",
      cancelText: "Voltar",
      variant: "warning",
      onConfirm: handleSkip,
    })

  const askRejectPriceChange = () =>
    setConfirmDialog({
      title: "Recusar a mudança de preço?",
      message:
        "Você continuará com as condições atuais até o fim do ciclo vigente e a assinatura será encerrada automaticamente ao final dele, sem nova cobrança.",
      confirmText: "Recusar e encerrar",
      cancelText: "Voltar",
      isDestructive: true,
      onConfirm: () => handlePriceChangeResponse("reject"),
    })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full"
    >
      {/* Header */}
      <div className="mb-8 hidden lg:flex flex-row items-center gap-4 w-full justify-start">
        <Button
          variant="filled"
          onClick={onBack}
          className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
          aria-label="Voltar"
        >
          <XIcon className="w-5 h-5" />
        </Button>
        <div className="text-left flex-1 min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3 flex-wrap">
            <span className="truncate">{sub.plan?.name || "Assinatura"}</span>
            {sub.mpPreapprovalId && (
              <Badge variant="blue" className="scale-90 whitespace-nowrap">
                Faturamento automático
              </Badge>
            )}
          </h1>
          <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1 truncate">
            Iniciada em {formatFullDate(sub.createdAt)}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${statusConfig.color} shrink-0`}>
          <StatusIcon size={16} />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      <div className="max-w-3xl lg:max-w-[1400px] mx-auto w-full pb-32">
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
          <TabsList className="mb-8">
            <TabsTrigger value="details">Detalhes da Assinatura</TabsTrigger>
            <TabsTrigger value="credits">Créditos</TabsTrigger>
            <TabsTrigger value="notes">Observações</TabsTrigger>
            <TabsTrigger value="history">Histórico de Cobranças</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-0 focus-visible:ring-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left column */}
              <div className="lg:col-span-8 space-y-8">
                {/* Pending address change */}
                {sub.pendingAddress && (
                  <div className="border border-brand-orange/50 bg-orange-50 dark:bg-dark-surface rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <InfoIcon size={16} className="text-brand-orange mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-semibold text-brand-dark dark:text-dark-heading">
                          Confirme a mudança de endereço
                        </p>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 leading-relaxed">
                          O novo endereço <strong>{sub.pendingAddress}</strong> tem frete de{" "}
                          <strong>{formatCurrency(Number(sub.pendingShippingAmount || 0))}</strong>, enquanto o atual é{" "}
                          {formatCurrency(Number(sub.shippingAmount || 0))}. Nada muda na sua cobrança até você aceitar.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConfirmAddressChange("discard")}
                        disabled={actionLoading}
                      >
                        Manter endereço atual
                      </Button>
                      <Button size="sm" onClick={() => handleConfirmAddressChange("accept")} disabled={actionLoading}>
                        {actionLoading ? "Salvando..." : "Aceitar e atualizar frete"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Pending price change */}
                {sub.priceChangeRequestedAt && !sub.priceChangeDecision && (
                  <ListItem
                    icon={<InfoIcon />}
                    title={
                      sub.status === "awaiting_customer_decision"
                        ? "Plano atualizado - resposta pendente"
                        : "O plano foi atualizado"
                    }
                    description={
                      sub.status === "awaiting_customer_decision" ? (
                        <>
                          O prazo para responder acabou e sua cobrança foi congelada em{" "}
                          <strong>{formatCurrency(Number(sub.contractedAmount || 0))}</strong> até você decidir. O novo
                          valor é <strong>{formatCurrency(proposedAmount)}</strong>.
                        </>
                      ) : (
                        <>
                          Novo valor: <strong>{formatCurrency(proposedAmount)}</strong> (hoje você paga{" "}
                          {formatCurrency(Number(sub.contractedAmount || 0))}). Responda até{" "}
                          <strong>
                            {sub.priceChangeExpiresAt
                              ? formatFullDate(sub.priceChangeExpiresAt).slice(0, 10)
                              : "o fim do prazo"}
                          </strong>{" "}
                          - até lá nada muda na sua cobrança.
                        </>
                      )
                    }
                    className="p-4"
                    right={
                      <div className="flex gap-2 justify-end flex-wrap shrink-0">
                        <Button variant="link" onClick={askRejectPriceChange} disabled={actionLoading}>
                          Recusar e encerrar no fim do ciclo
                        </Button>
                        <Button variant="link" onClick={() => handlePriceChangeResponse("accept")} disabled={actionLoading}>
                          {actionLoading ? "Aplicando..." : "Aceitar nova condição"}
                        </Button>
                      </div>
                    }
                  />
                )}

                {/* Section: itens */}
                <FormSection title="Itens do Plano">
                  {sub.items?.length > 0 ? (
                    <div className="space-y-4">
                      {sub.items.map((item: any) => {
                        const details = item.itemType === "product" ? item.product : item.service
                        const name = details?.name || (item.itemType === "product" ? "Produto" : "Serviço")
                        const itemImage = getPrimaryProductDisplayImage({
                          images: Array.isArray(details?.images) ? details.images : null,
                        })

                        const itemUrl = details
                          ? item.itemType === "product"
                            ? getProductUrl({ ...details }, sub.partner)
                            : getServiceUrl({ ...details }, sub.partner)
                          : ""

                        const content = (
                          <>
                            <div className="w-14 h-14 bg-white dark:bg-dark-card border border-brand-border dark:border-dark-border rounded-lg flex items-center justify-center shrink-0">
                              <img
                                src={itemImage}
                                alt={name}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                              />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors truncate">
                                {name}
                              </h3>
                              <div className="flex items-center gap-2 text-xs mt-0.5">
                                <span className="text-brand-inactive-text dark:text-dark-body">
                                  Qtd. {item.quantity}
                                </span>
                                <span className="text-brand-border dark:text-dark-border">|</span>
                                <span className="font-medium text-brand-dark dark:text-dark-heading">
                                  {item.unitPrice != null ? formatCurrency(item.unitPrice) : "-"}
                                </span>
                              </div>
                            </div>
                          </>
                        )

                        if (!itemUrl) {
                          return (
                            <div
                              key={item.id}
                              className="group flex flex-row items-center gap-4 py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                            >
                              {content}
                            </div>
                          )
                        }

                        return (
                          <Link
                            key={item.id}
                            href={itemUrl}
                            prefetch={false}
                            className="group flex flex-row items-center gap-4 cursor-pointer py-3 border-b border-brand-border/40 dark:border-dark-border/40 last:border-b-0"
                          >
                            {content}
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nenhum item vinculado.</p>
                  )}
                </FormSection>

                {/* Section: plano */}
                <FormSection title="Plano" hasSeparator>
                  <div>
                    <DetailRow label="Recorrência" value={sub.frequencyLabel || "-"} />
                    <DetailRow
                      label="Início da assinatura"
                      value={formatFullDate(sub.startedAt || sub.createdAt)}
                    />
                    <DetailRow
                      label="Faturamento"
                      value={sub.mpPreapprovalId ? "Automático (Mercado Pago)" : "Manual"}
                    />
                    {sub.contractedAmount != null && (
                      <DetailRow
                        label="Valor contratado"
                        value={<span className={isClosed ? "text-brand-green" : ""}>{formatCurrency(sub.contractedAmount)}</span>}
                      />
                    )}
                    {sub.status === "paused" && sub.pausedAt && (
                      <DetailRow label="Pausada em" value={formatFullDate(sub.pausedAt)} />
                    )}
                    {(sub.status === "cancelled" || sub.status === "expired") && sub.cancelledAt && (
                      <DetailRow label="Encerrada em" value={formatFullDate(sub.cancelledAt)} />
                    )}
                  </div>
                </FormSection>

                {/* Section: entrega */}
                <FormSection
                  title={sub.deliveryType === "delivery" ? "Endereço de Entrega" : "Retirada no estabelecimento"}
                  hasSeparator
                  headerRight={
                    !isClosed && sub.deliveryType === "delivery" ? (
                      <Button variant="outline" size="sm" leftIcon={<EditIcon size={16} />} onClick={openAddressModal} disabled={actionLoading}>
                        Trocar endereço
                      </Button>
                    ) : null
                  }
                >
                  <div>
                    <DetailRow
                      label="Modalidade"
                      value={sub.deliveryType === "delivery" ? "Entrega" : "Retirada no Local"}
                    />
                    {sub.deliveryType === "delivery" && (
                      <DetailRow label="Endereço" value={sub.deliveryAddress || "Não informado"} />
                    )}
                    <DetailRow
                      label="Frete"
                      value={
                        sub.deliveryType === "delivery"
                          ? formatCurrency(Number(sub.shippingAmount || 0))
                          : "Grátis"
                      }
                    />
                  </div>
                </FormSection>

                {/* Section: vendedor */}
                <FormSection title="Vendedor" hasSeparator>
                  <Link
                    href={getStoreUrl({
                      ...sub.partner,
                      id: sub.partner?.storeId || sub.partner?.id || sub.partnerId,
                      short_id: sub.partner?.short_id,
                      name: storeName,
                    })}
                    prefetch={false}
                    className="flex items-center gap-4 block cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                      <img src={storeImage} alt={storeName} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">{storeName}</div>
                      <div className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 max-w-sm">
                        Acessar perfil do vendedor
                      </div>
                    </div>
                    <ChevronRightIcon size={18} className="text-brand-inactive-text dark:text-dark-body" />
                  </Link>
                </FormSection>
              </div>

              {/* Right column: resumo + ações */}
              <div className="lg:col-span-4 lg:pl-12 lg:border-l border-brand-border dark:border-dark-border space-y-6">
                <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                  <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                    Resumo da Assinatura
                  </div>
                  <div className="p-6 space-y-3">
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                      <span>Itens ({sub.items?.length || 0})</span>
                      <span className="text-brand-dark dark:text-dark-heading font-medium">
                        {formatCurrency(itemsSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                      <span>Frete</span>
                      <span className="text-brand-dark dark:text-dark-heading font-medium">
                        {sub.deliveryType === "delivery" ? formatCurrency(Number(sub.shippingAmount || 0)) : "Grátis"}
                      </span>
                    </div>

                    <div className="border-t border-brand-border dark:border-dark-border my-2 pt-3 space-y-2">
                      <div className="flex justify-between items-end gap-3">
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                          {isClosed ? "Valor final da assinatura" : "Próxima cobrança"}
                        </span>
                        <span className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                          {formatCurrency(cycleAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-brand-inactive-text dark:text-dark-body">
                        <span>{isClosed ? "Status" : "Data da próxima cobrança"}</span>
                        <span className="font-semibold text-brand-dark dark:text-dark-heading">
                          {isClosed
                            ? statusConfig.label
                            : sub.nextExecutionAt
                              ? formatDate(sub.nextExecutionAt)
                              : "-"}
                        </span>
                      </div>
                      {sub.contractedAmount != null && Math.abs(Number(sub.contractedAmount) - cycleAmount) > 0.009 && (
                        <div className="flex justify-between text-xs text-brand-inactive-text dark:text-dark-body">
                          <span>Valor contratado</span>
                          <span className="font-semibold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(sub.contractedAmount)}
                          </span>
                        </div>
                      )}
                      {sub.contractedAmount != null &&
                        Math.abs(Number(sub.contractedAmount) - cycleAmount) <= 0.009 &&
                        !isClosed && (
                          <div className="flex justify-between text-xs text-brand-inactive-text dark:text-dark-body">
                            <span>Valor atual contratado</span>
                            <span className="font-semibold text-brand-dark dark:text-dark-heading">
                              {formatCurrency(sub.contractedAmount)}
                            </span>
                          </div>
                        )}
                    </div>

                    {isPriceFrozen && !isClosed && (
                      <div className="border-t border-brand-border dark:border-dark-border pt-3 space-y-2">
                        <div className="flex justify-between text-xs text-brand-blue font-medium">
                          <span>Novo valor do plano (pendente)</span>
                          <span>{formatCurrency(proposedAmount)}</span>
                        </div>
                        <p className="text-[11px] text-brand-inactive-text dark:text-dark-body leading-relaxed">
                          Sua cobrança permanece congelada até você aceitar a nova condição.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!isClosed && (
                  <div className="space-y-3">
                    {sub.status === "active" && (
                      <Button
                        variant="outline"
                        className="w-full h-12 font-bold"
                        leftIcon={<BlockedIcon size={16} />}
                        onClick={askPause}
                        disabled={actionLoading}
                      >
                        Pausar assinatura
                      </Button>
                    )}
                    {sub.status === "paused" && (
                      <Button
                        variant="outline"
                        className="w-full h-12 font-bold"
                        leftIcon={<PlayIcon size={16} />}
                        onClick={askResume}
                        disabled={actionLoading}
                      >
                        Reativar assinatura
                      </Button>
                    )}

                    <Dropdown
                      align="right"
                      className="w-full"
                      width="w-64"
                      showChevron={false}
                      trigger={
                        <Button
                          variant="outline"
                          className="w-full h-12 font-bold"
                          rightIcon={<ChevronDownIcon size={14} />}
                          disabled={actionLoading}
                        >
                          Mais ações
                        </Button>
                      }
                    >
                      <DropdownItem onClick={askSkip}>
                        <RepeatIcon size={16} />
                        Pular ciclo
                      </DropdownItem>
                      <DropdownItem onClick={askRefund} disabled={loadingRefund}>
                        <MoneyIcon size={16} />
                        {loadingRefund ? "Carregando..." : "Solicitar reembolso"}
                      </DropdownItem>
                      <DropdownItem className="text-brand-red" onClick={askCancel}>
                        <CancelCircleIcon size={16} />
                        Cancelar assinatura
                      </DropdownItem>
                    </Dropdown>

                    {actionLoading && (
                      <div className="flex justify-center">
                        <Spinner size={16} className="text-brand-green" />
                      </div>
                    )}
                  </div>
                )}

                {isClosed && (
                  <InfoCard message={
                    sub.status === "cancelled"
                      ? "Assinatura cancelada. Não há novas cobranças e os valores não mudam mais."
                      : "Assinatura encerrada. Não há novas cobranças e os valores não mudam mais."
                  }
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="credits" className="mt-0 focus-visible:ring-0">
            <FormSection title="Créditos da Assinatura">
              {loadingCredits ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <SkeletonLoader key={i} height={72} className="rounded-xl" />
                  ))}
                </div>
              ) : mergedCredits.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                    imageAlt="Nenhum crédito"
                    title="Nenhum crédito disponível"
                    subtitle="Os créditos são liberados a cada ciclo da assinatura."
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {mergedCredits.map((credit) => {
                    const isService = credit.itemType === "service"
                    const expiryDate = credit.expiresAt ? String(credit.expiresAt).slice(0, 10) : null
                    return (
                      <ListItem
                        key={credit.key}
                        icon={
                          credit.image ? (
                            <img
                              src={credit.image}
                              alt={credit.itemName}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover rounded-full"
                              onError={(e) => {
                                e.currentTarget.src = PLACEHOLDER_STORE_IMAGE
                              }}
                            />
                          ) : (
                            GiftIcon
                          )
                        }
                        title={
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span className="truncate">{credit.itemName}</span>
                            <Badge variant={isService ? "blue" : "purple"}>
                              {isService ? "Serviço" : "Produto"}
                            </Badge>
                          </span>
                        }
                        description={
                          credit.quantity > 0 ? (
                            <>
                              {credit.remaining} de {credit.quantity} créditos disponíveis
                              {expiryDate ? ` • Válidos até ${expiryDate.split("-").reverse().join("/")}` : " • Sem validade"}
                            </>
                          ) : (
                            "Sem saldo - libera no próximo ciclo"
                          )
                        }
                        className="px-4 py-3"
                        right={
                          <div className="flex items-center justify-end gap-3 shrink-0 flex-wrap">
                            {isService ? (
                              credit.remaining > 0 ? (
                                <Button size="sm" onClick={() => openBookingModal(credit)}>
                                  Agendar
                                </Button>
                              ) : (
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                  Sem saldo - libera no próximo ciclo
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                A loja registra a entrega
                              </span>
                            )}
                          </div>
                        }
                      />
                    )
                  })}
                </div>
              )}
            </FormSection>
          </TabsContent>

          <TabsContent value="notes" className="mt-0 focus-visible:ring-0">
            <FormSection
              title="Observações"
              headerRight={
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<EditIcon size={16} />}
                  onClick={() => {
                    if (editingNotes) {
                      setEditingNotes(false)
                      setEditNotes(sub.notes || "")
                    } else {
                      setEditNotes(sub.notes || "")
                      setEditingNotes(true)
                    }
                  }}
                  disabled={savingDetails}
                >
                  {editingNotes ? "Fechar edição" : "Editar observações"}
                </Button>
              }
            >
              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={4}
                    className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm py-2 px-3 text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
                    placeholder="Instruções especiais ou observações para entrega/execução..."
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingNotes(false)
                        setEditNotes(sub.notes || "")
                      }}
                      disabled={savingDetails}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSaveNotes} disabled={savingDetails}>
                      {savingDetails ? "Salvando..." : "Salvar observações"}
                    </Button>
                  </div>
                </div>
              ) : sub.notes ? (
                <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap">
                  {sub.notes}
                </p>
              ) : (
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                  Nenhuma observação registrada.
                </p>
              )}
            </FormSection>
          </TabsContent>

          <TabsContent value="history" className="mt-0 focus-visible:ring-0">
            <div>
              {loadingHistory ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <SkeletonLoader key={i} height={48} className="rounded-xl" />
                  ))}
                </div>
              ) : executions.length === 0 ? (
                <IconPlaceholder
                  placeholderType="image"
                  imageSrc="https://img.dudit.com.br/static/mascots/Transacoes.png"
                  imageAlt="Sem cobranças"
                  title="Você ainda não tem cobranças"
                  subtitle="As cobranças vão aparecer aqui assim que forem geradas."
                />
              ) : (
                <div className="space-y-2">
                  {paginatedExecutions.map((exec) => {
                    const execBadge = getExecutionBadge(exec.status)
                    return (
                      <div
                        key={exec.id}
                        className="text-sm flex items-center justify-between gap-3 border border-brand-border dark:border-dark-border rounded-xl p-3 bg-brand-gray/30 dark:bg-dark-surface"
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-wrap">
                          <span className="font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                            {formatFullDate(exec.scheduled_for)}
                          </span>
                          {exec.orders?.order_number && (
                            <Link
                              href={`/pedidos?tab=details&order_number=${exec.orders.order_number}`}
                              prefetch={false}
                              className="text-brand-green font-medium hover:underline"
                            >
                              Pedido #{exec.orders.order_number}
                            </Link>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {exec.error_message && (
                            <span className="text-brand-red font-medium text-xs">{exec.error_message}</span>
                          )}
                          <Badge variant={execBadge.variant}>{execBadge.label}</Badge>
                        </div>
                      </div>
                    )
                  })}

                  {historyTotalPages > 1 && (
                    <div className="pt-2">
                      <Pagination
                        currentPage={historyPage}
                        totalPages={historyTotalPages}
                        onPageChange={setHistoryPage}
                        inline
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <BillingRefundModal
        isOpen={refundOpen}
        onClose={() => {
          setRefundOpen(false)
          setRefundSub(null)
          setRefundPurchase(null)
        }}
        purchase={refundPurchase}
        partnerId={refundPurchase?.partnerId || refundPurchase?.partner_id || refundSub?.partnerId || ""}
      />

      <DefaultModal
        isOpen={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        title="Selecione o endereço de entrega"
      >
        <div className="space-y-4">
          {loadingAddresses ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <SkeletonLoader key={i} height={56} className="rounded-xl" />
              ))}
            </div>
          ) : userAddresses.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <MapPinIcon size={32} className="mx-auto text-brand-inactive-text" />
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                Nenhum endereço cadastrado
              </p>
              <Button onClick={() => router.push("/perfil?tab=enderecos")} className="w-full">
                Cadastrar endereço
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {userAddresses.map((addr: any) => {
                const fullAddress = `${addr.street}, ${addr.number}${addr.complement ? `, ${addr.complement}` : ""} - ${addr.neighborhood}, ${addr.city} - ${addr.state}, ${addr.zip_code}`
                const isSelected = fullAddress === (sub.deliveryAddress || "")
                return (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => void handlePickAddress(addr)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start gap-3 ${isSelected
                      ? "border-brand-green bg-brand-green/5 shadow-sm ring-1 ring-brand-green"
                      : "border-brand-border dark:border-dark-border hover:border-brand-dark/40 dark:hover:border-dark-heading/40 bg-white dark:bg-dark-surface"
                      }`}
                  >
                    <div className="mt-0.5">
                      <RadioButton
                        name="subscription_address_selection"
                        value={addr.id}
                        checked={isSelected}
                        onChange={() => void handlePickAddress(addr)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">
                          {addr.street}, {addr.number}
                        </span>
                        {addr.is_default && (
                          <span className="text-[10px] uppercase font-bold text-brand-green bg-brand-green/10 px-1.5 py-0.5 rounded">
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                        {addr.neighborhood}, {addr.city} - {addr.state}
                      </p>
                      {addr.zip_code && (
                        <p className="text-[11px] text-brand-inactive-text/80 dark:text-dark-body/80 mt-0.5">
                          CEP: {addr.zip_code}
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
              <Button
                variant="outline"
                onClick={() => router.push("/perfil?tab=enderecos")}
                className="w-full mt-2"
              >
                Gerenciar endereços
              </Button>
            </div>
          )}
        </div>
      </DefaultModal>

      <DefaultModal
        isOpen={!!bookingCredit}
        onClose={() => setBookingCredit(null)}
        title="Agendar com créditos"
        maxWidth="md"
      >
        {bookingCredit && (
          <div className="space-y-4">
            <InfoCard
              color="green"
              title={bookingCredit.itemName}
              message={
                Number(bookingCredit.remaining || 0) > 1
                  ? `Agendamento sem cobrança - usa 1 crédito da assinatura (${bookingCredit.remaining} disponíveis).`
                  : "Agendamento sem cobrança - usa 1 crédito da assinatura."
              }
            />

            <DatePicker
              label="Data"
              required
              value={bookingDate || undefined}
              onChange={(d: any) => {
                if (!d) {
                  setBookingDate("")
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
                const expiryIso = bookingCredit.expiresAt ? String(bookingCredit.expiresAt).slice(0, 10) : null
                if (expiryIso && iso > expiryIso) {
                  toast({
                    title: "Data inválida",
                    description: `Os créditos valem até ${expiryIso.split("-").reverse().join("/")}.`,
                    variant: "destructive",
                  })
                  return
                }
                setBookingDate(iso)
              }}
            />

            <div>
              <label className="text-sm font-medium text-brand-dark dark:text-dark-heading block mb-1.5">
                Horário <span className="text-brand-red">*</span>
              </label>
              {!bookingDate ? (
                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                  Escolha a data para ver os horários disponíveis.
                </p>
              ) : loadingSlots ? (
                <div className="flex items-center gap-2 text-xs text-brand-inactive-text dark:text-dark-body">
                  <Spinner size={14} /> Carregando horários...
                </div>
              ) : bookingSlots.length === 0 ? (
                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                  Nenhum horário disponível nesta data. Tente outro dia.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {bookingSlots.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      variant={bookingTime === slot ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBookingTime(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <FormTextarea
              label="Observações (opcional)"
              placeholder="Alguma preferência para o atendimento?"
              value={bookingNotes}
              onChange={(e) => setBookingNotes(e.target.value)}
              rows={2}
              maxLength={500}
              showCharacterCount
            />

            <Button
              className="w-full"
              onClick={() => void handleBookWithCredits()}
              disabled={!bookingDate || !bookingTime || submittingBooking}
            >
              {submittingBooking ? "Confirmando..." : "Confirmar agendamento"}
            </Button>
          </div>
        )}
      </DefaultModal>

      <AlertModal
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ""}
        message={confirmDialog?.message}
        confirmText={confirmDialog?.confirmText}
        cancelText={confirmDialog?.cancelText || "Voltar"}
        variant={confirmDialog?.variant}
        isDestructive={confirmDialog?.isDestructive}
        isLoading={actionLoading}
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
    </motion.div>
  )
}
