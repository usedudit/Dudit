"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Button,
  Badge,
  Spinner,
  IconPlaceholder,
  SkeletonLoader,
  Tabs,
  TabsList,
  TabsTrigger,
  Dropdown,
  DropdownItem,
} from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { useToast } from "@/hooks/use-toast"
import {
  cancelMyRecurringSubscriptionAction,
  getMyRecurringSubscriptionExecutionsAction,
  pauseMyRecurringSubscriptionAction,
  resumeMyRecurringSubscriptionAction,
  skipMySubscriptionCycleAction,
  postponeMySubscriptionCycleAction,
  anticipateMySubscriptionCycleAction,
  updateMySubscriptionDetailsAction,
  confirmMySubscriptionAddressChangeAction,
  respondToMySubscriptionPriceChangeAction,
  getMySubscriptionCreditsAction,
} from "@/app/actions/marketplace/recurring-subscriptions"
import { getLatestPurchaseForSubscriptionAction } from "@/app/actions/billing/purchases"
import { formatFullDate, formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPlanUrl, getStoreUrl, getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import Link from "next/link"

import {
  ClockIcon,
  BlockedIcon,
  PlayIcon,
  CalendarIcon,
  MapPinIcon,
  TruckIcon,
  InfoIcon,
  CheckCircleIcon,
  CancelCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  XIcon,
  HistoryIcon,
  EditIcon,
  RepeatIcon,
  MoneyIcon,
  ChevronDownIcon,
} from "@/lib/icons"
import { BillingRefundModal } from "@/components/billing/BillingRefundModal"

const SUBSCRIPTIONS_PER_PAGE = 10
const PLACEHOLDER_STORE_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

const getStatusConfig = (status: string) => {
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

const getStatusLabel = (status: string) => getStatusConfig(status).label

const getExecutionBadge = (status: string) => {
  if (status === "completed") return { variant: "green" as const, label: "Concluída" }
  if (status === "failed") return { variant: "red" as const, label: "Falha" }
  if (status === "skipped" || status === "cancelled") return { variant: "orange" as const, label: "Pulado" }
  if (status === "pending" || status === "scheduled") return { variant: "gray" as const, label: "Agendada" }
  return { variant: "gray" as const, label: status || "Agendada" }
}

export function MySubscriptionsClient({ subscriptions }: { subscriptions: any[] }) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"subscriptions" | "credits">("subscriptions")
  const [items, setItems] = useState(subscriptions)
  const [currentPage, setCurrentPage] = useState(1)

  // Subscriptions management state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const HISTORY_PAGE_SIZE = 10

  // Edit details state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAddress, setEditAddress] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)

  // Actions state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // Credits state
  const [credits, setCredits] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(false)
  const creditsFetchedRef = useRef(false)

  // Refund state
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundSub, setRefundSub] = useState<any>(null)
  const [refundPurchase, setRefundPurchase] = useState<any>(null)
  const [loadingRefund, setLoadingRefund] = useState(false)

  useEffect(() => {
    if (activeTab === "credits" && !creditsFetchedRef.current) {
      void fetchCredits()
    }
  }, [activeTab])

  const fetchCredits = async () => {
    creditsFetchedRef.current = true
    setLoadingCredits(true)
    const res = await getMySubscriptionCreditsAction()
    setLoadingCredits(false)
    if (res.success) {
      setCredits(res.data || [])
    } else {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
    }
  }

  const refreshItem = (updated: any) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === updated.id
          ? {
              ...item,
              ...updated,
              statusLabel: getStatusLabel(updated.status),
            }
          : item
      )
    )
  }

  const runAction = async (action: "pause" | "resume" | "cancel", subscriptionId: string) => {
    if (action === "cancel" && !confirm("Tem certeza que deseja cancelar esta assinatura?")) return
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: true }))
    const fn =
      action === "pause"
        ? pauseMyRecurringSubscriptionAction
        : action === "resume"
          ? resumeMyRecurringSubscriptionAction
          : cancelMyRecurringSubscriptionAction

    const res = await fn(subscriptionId)
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: false }))
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: `Assinatura ${action === "pause" ? "pausada" : action === "resume" ? "reativada" : "cancelada"} com sucesso!` })
    if (res.data) refreshItem(res.data)
  }

  const handleSkip = async (subscriptionId: string) => {
    if (!confirm("Tem certeza que deseja pular o próximo faturamento/ciclo desta assinatura?")) return
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: true }))
    const res = await skipMySubscriptionCycleAction(subscriptionId)
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: false }))
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Próximo ciclo pulado com sucesso!" })
    if (res.data) refreshItem(res.data)
  }

  const handlePostpone = async (subscriptionId: string, days: number) => {
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: true }))
    const res = await postponeMySubscriptionCycleAction(subscriptionId, days)
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: false }))
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: `Ciclo adiado por ${days} dias com sucesso!` })
    if (res.data) refreshItem(res.data)
  }

  const handleAnticipate = async (subscriptionId: string) => {
    if (!confirm("Tem certeza que deseja antecipar a cobrança e execução do ciclo para agora?")) return
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: true }))
    const res = await anticipateMySubscriptionCycleAction(subscriptionId)
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: false }))
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Cobrança antecipada com sucesso! O ciclo será processado em instantes." })
    if (res.data) refreshItem(res.data)
  }

  const handleSaveDetails = async (subscriptionId: string) => {
    setSavingDetails(true)
    const res = await updateMySubscriptionDetailsAction(subscriptionId, {
      deliveryAddress: editAddress,
      notes: editNotes,
    })
    setSavingDetails(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    if (res.requiresConfirmation) {
      toast({
        title: "Confirme a mudança de endereço",
        description: "O novo endereço tem frete mais caro. Aprove ou recuse abaixo para continuar.",
      })
    } else {
      toast({ title: "Detalhes de entrega atualizados com sucesso!" })
    }
    if (res.data) refreshItem(res.data)
    setEditingId(null)
  }

  const handleConfirmAddressChange = async (
    subscriptionId: string,
    decision: "accept" | "discard",
  ) => {
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: true }))
    const res = await confirmMySubscriptionAddressChangeAction(subscriptionId, decision)
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: false }))
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({
      title:
        decision === "accept"
          ? "Mudança de endereço confirmada!"
          : "Mudança de endereço descartada.",
    })
    if (res.data) refreshItem(res.data)
  }

  const openHistory = async (subscriptionId: string) => {
    if (selectedId === subscriptionId) {
      setSelectedId(null)
      return
    }
    setSelectedId(subscriptionId)
    setHistoryPage(1)
    setLoadingHistory(true)
    const res = await getMyRecurringSubscriptionExecutionsAction(subscriptionId)
    setLoadingHistory(false)
    if (res.success) setExecutions(res.data || [])
    else toast({ title: "Erro", description: res.error, variant: "destructive" })
  }

  const handleRefund = async (subscription: any) => {
    setLoadingRefund(true)
    setRefundSub(subscription)
    const res = await getLatestPurchaseForSubscriptionAction(subscription.id)
    setLoadingRefund(false)
    if (res.success && res.data) {
      setRefundPurchase(res.data)
      setRefundOpen(true)
    } else {
      toast({ title: "Erro", description: res.error || "Nenhuma fatura encontrada para reembolso.", variant: "destructive" })
    }
  }

  const handlePriceChangeResponse = async (subscriptionId: string, decision: "accept" | "reject") => {
    if (
      decision === "reject" &&
      !confirm(
        "Recusar a mudança? Você continuará com as condições atuais até o fim do ciclo vigente e a assinatura será encerrada automaticamente ao final dele, sem nova cobrança.",
      )
    ) {
      return
    }
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: true }))
    const res = await respondToMySubscriptionPriceChangeAction(subscriptionId, decision)
    setActionLoading((prev) => ({ ...prev, [subscriptionId]: false }))
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
    if (res.data) refreshItem(res.data)
  }

  const historyTotalPages = Math.ceil(executions.length / HISTORY_PAGE_SIZE)
  const paginatedExecutions = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE
    return executions.slice(start, start + HISTORY_PAGE_SIZE)
  }, [executions, historyPage])

  // Client-side pagination
  const totalPages = Math.max(1, Math.ceil(items.length / SUBSCRIPTIONS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedSubscriptions = useMemo(() => {
    const start = (safePage - 1) * SUBSCRIPTIONS_PER_PAGE
    return items.slice(start, start + SUBSCRIPTIONS_PER_PAGE)
  }, [items, safePage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value as "subscriptions" | "credits")
    setCurrentPage(1)
  }

  return (
    <div>
      {/* Header (desktop) */}
      <div className="hidden lg:block items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
            Minhas Assinaturas
            {items.length > 0 && (
              <span className="text-brand-inactive-text dark:text-dark-body font-bold text-base lg:text-lg ml-2">
                ({items.length})
              </span>
            )}
          </h1>
          <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">
            Acompanhe seus planos recorrentes, entregas e créditos
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="subscriptions">
              Assinaturas <span className="ml-1.5 text-xs font-normal">({items.length})</span>
            </TabsTrigger>
            <TabsTrigger value="credits">
              Meus Créditos{" "}
              {creditsFetchedRef.current && <span className="ml-1.5 text-xs font-normal">({credits.length})</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1">
        <AnimatePresence mode="wait">
          {activeTab === "subscriptions" ? (
            <motion.div
              key="subscriptions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 w-full"
            >
              {paginatedSubscriptions.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start w-full">
                  {paginatedSubscriptions.map((sub) => {
                    const statusConfig = getStatusConfig(sub.status)
                    const StatusIcon = statusConfig.icon
                    const storeName = sub.partner?.name || sub.partner?.store_name || "Loja Parceira"
                    const storeImage = sub.partner?.logo_url
                      ? getR2ImageUrl(sub.partner.logo_url)
                      : PLACEHOLDER_STORE_IMAGE
                    const isClosed = sub.status === "cancelled" || sub.status === "expired"
                    const proposedAmount = Number(sub.plan?.price || 0) + Number(sub.shippingAmount || 0)
                    const isPriceFrozen = !!sub.priceChangeRequestedAt && !sub.priceChangeDecision
                    const cycleAmount = isPriceFrozen ? Number(sub.contractedAmount || proposedAmount) : proposedAmount

                    return (
                      <div
                        key={sub.id}
                        className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden transition-all duration-200 hover:shadow-md hover:border-brand-green dark:hover:border-brand-green w-full"
                      >
                        {/* Card Header */}
                        <div className="px-6 py-4 flex flex-row items-start justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <img
                              src={storeImage}
                              alt={storeName}
                              className="w-10 h-10 rounded-full object-cover border border-brand-border dark:border-dark-border bg-white shrink-0"
                            />
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {storeName}
                              </h3>
                              <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {sub.plan ? (
                                  <Link
                                    href={getPlanUrl(sub.plan, sub.partner)}
                                    prefetch={false}
                                    className="font-medium hover:text-brand-green transition-colors truncate"
                                  >
                                    {sub.plan.name}
                                  </Link>
                                ) : (
                                  <span className="font-medium">Plano</span>
                                )}
                                {sub.mpPreapprovalId && (
                                  <Badge variant="blue" className="scale-90 whitespace-nowrap">
                                    Faturamento automático
                                  </Badge>
                                )}
                                <span className="hidden lg:inline">•</span>
                                <span className="hidden lg:inline">{formatFullDate(sub.createdAt)}</span>
                              </div>
                              <span className="block lg:hidden text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                {formatFullDate(sub.createdAt)}
                              </span>
                            </div>
                          </div>

                          {/* Right side: Status as plain colored text */}
                          <div className={`flex items-center gap-1.5 text-xs font-bold shrink-0 ${statusConfig.color}`}>
                            <StatusIcon size={14} />
                            <span>{statusConfig.label}</span>
                          </div>
                        </div>

                        {/* Card Content */}
                        <div className="px-6 pb-6 pt-0">
                          <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                          {/* Subscription details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-brand-inactive-text dark:text-dark-body font-medium mb-4">
                            <div className="flex items-center gap-1.5">
                              <CalendarIcon size={14} />
                              <span>
                                Próxima data:{" "}
                                <strong className="text-brand-dark dark:text-dark-heading">
                                  {formatFullDate(sub.nextExecutionAt).slice(0, 10)}
                                </strong>
                              </span>
                            </div>
                            {sub.frequencyLabel && (
                              <div className="flex items-center gap-1.5">
                                <ClockIcon size={14} />
                                <span>Recorrência: {sub.frequencyLabel}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 sm:col-span-2">
                              <MapPinIcon size={14} />
                              <span className="truncate">
                                Entrega:{" "}
                                <strong className="text-brand-dark dark:text-dark-heading">
                                  {sub.deliveryType === "delivery"
                                    ? sub.deliveryAddress || "Não informado"
                                    : "Retirada no Local"}
                                </strong>
                              </span>
                            </div>
                            {sub.deliveryType === "delivery" && (
                              <div className="flex items-center gap-1.5">
                                <TruckIcon size={14} />
                                <span>
                                  Frete:{" "}
                                  <strong className="text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(Number(sub.shippingAmount || 0))}
                                  </strong>
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Items included in this subscription */}
                          {sub.items?.length > 0 && (
                            <div className="space-y-4">
                              {sub.items.map((item: any) => {
                                const details = item.itemType === "product" ? item.product : item.service
                                const name = details?.name || (item.itemType === "product" ? "Produto" : "Serviço")
                                const images = details?.images
                                const imgUrl = (Array.isArray(images) && images[0]) || null

                                const itemUrl = details
                                  ? item.itemType === "product"
                                    ? getProductUrl({ ...details }, sub.partner)
                                    : getServiceUrl({ ...details }, sub.partner)
                                  : ""

                                const cardContent = (
                                  <>
                                    <div className="w-12 h-12 bg-white dark:bg-dark-card border border-brand-border dark:border-dark-border rounded-[8px] flex items-center justify-center shrink-0">
                                      {imgUrl ? (
                                        <img
                                          src={getR2ImageUrl(imgUrl)}
                                          alt={name}
                                          loading="lazy"
                                          decoding="async"
                                          className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal rounded-[4px]"
                                        />
                                      ) : item.itemType === "product" ? (
                                        <TruckIcon size={18} className="text-brand-inactive-text dark:text-dark-body" />
                                      ) : (
                                        <CalendarIcon size={18} className="text-brand-inactive-text dark:text-dark-body" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                      <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                                        {name}
                                      </h4>
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-brand-inactive-text dark:text-dark-body">
                                          Qtd. {item.quantity}
                                        </span>
                                        <span className="text-brand-border dark:text-dark-border">|</span>
                                        <span className="font-medium text-brand-dark dark:text-dark-heading">
                                          {item.unitPrice != null ? formatCurrency(item.unitPrice) : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  </>
                                )

                                if (!itemUrl) {
                                  return (
                                    <div key={item.id} className="flex gap-4 p-2 -mx-2 rounded-lg transition-colors">
                                      {cardContent}
                                    </div>
                                  )
                                }

                                return (
                                  <Link
                                    key={item.id}
                                    href={itemUrl}
                                    prefetch={false}
                                    className="flex gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 p-2 -mx-2 rounded-lg transition-colors group"
                                  >
                                    {cardContent}
                                  </Link>
                                )
                              })}
                            </div>
                          )}

                          {/* Pending address change: freight raised, needs consent */}
                          {sub.pendingAddress && (
                            <div className="border border-brand-orange/50 bg-orange-50 dark:bg-dark-surface rounded-xl p-4 mt-4 space-y-3">
                              <div className="flex items-start gap-2">
                                <InfoIcon size={16} className="text-brand-orange mt-0.5 shrink-0" />
                                <div className="text-sm">
                                  <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                    Confirme a mudança de endereço
                                  </p>
                                  <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 leading-relaxed">
                                    O novo endereço <strong>{sub.pendingAddress}</strong> tem frete de{" "}
                                    <strong>{formatCurrency(Number(sub.pendingShippingAmount || 0))}</strong>, enquanto o
                                    atual é {formatCurrency(Number(sub.shippingAmount || 0))}. Nada muda na sua cobrança
                                    até você aceitar.
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleConfirmAddressChange(sub.id, "discard")}
                                  disabled={!!actionLoading[sub.id]}
                                >
                                  Manter endereço atual
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmAddressChange(sub.id, "accept")}
                                  disabled={!!actionLoading[sub.id]}
                                >
                                  {actionLoading[sub.id] ? "Salvando..." : "Aceitar e atualizar frete"}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Pending plan change: price/itens changed, needs customer consent */}
                          {sub.priceChangeRequestedAt && !sub.priceChangeDecision && (
                            <div className="border border-brand-blue/50 bg-blue-50 dark:bg-dark-surface rounded-xl p-4 mt-4 space-y-3">
                              <div className="flex items-start gap-2">
                                <InfoIcon size={16} className="text-brand-blue mt-0.5 shrink-0" />
                                <div className="text-sm">
                                  <p className="font-semibold text-brand-dark dark:text-dark-heading">
                                    {sub.status === "awaiting_customer_decision"
                                      ? "Plano atualizado - resposta pendente"
                                      : "O plano foi atualizado"}
                                  </p>
                                  <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1 leading-relaxed">
                                    {sub.status === "awaiting_customer_decision" ? (
                                      <>
                                        O prazo para responder acabou e sua cobrança foi congelada em{" "}
                                        <strong>{formatCurrency(Number(sub.contractedAmount || 0))}</strong> até você
                                        decidir. O novo valor é{" "}
                                        <strong>{formatCurrency(proposedAmount)}</strong>.
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
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePriceChangeResponse(sub.id, "reject")}
                                  disabled={!!actionLoading[sub.id]}
                                >
                                  Recusar e encerrar no fim do ciclo
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handlePriceChangeResponse(sub.id, "accept")}
                                  disabled={!!actionLoading[sub.id]}
                                >
                                  {actionLoading[sub.id] ? "Aplicando..." : "Aceitar nova condição"}
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Collapsible Edit Details Panel */}
                          <AnimatePresence>
                            {editingId === sub.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden border-t border-brand-border dark:border-dark-border pt-4 mt-4 space-y-4"
                              >
                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                  Editar Detalhes de Entrega
                                </h4>

                                <div className="space-y-3">
                                  {sub.deliveryType === "delivery" && (
                                    <div>
                                      <label className="block text-xs font-semibold text-brand-inactive-text dark:text-dark-body mb-1">
                                        Endereço de entrega
                                      </label>
                                      <input
                                        type="text"
                                        value={editAddress}
                                        onChange={(e) => setEditAddress(e.target.value)}
                                        className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm py-2 px-3 text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
                                        placeholder="Rua, número, complemento, bairro"
                                      />
                                    </div>
                                  )}

                                  <div>
                                    <label className="block text-xs font-semibold text-brand-inactive-text dark:text-dark-body mb-1">
                                      Observações para entrega / execução
                                    </label>
                                    <textarea
                                      value={editNotes}
                                      onChange={(e) => setEditNotes(e.target.value)}
                                      rows={2}
                                      className="w-full bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm py-2 px-3 text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green focus:border-brand-green"
                                      placeholder="Instruções especiais ou observações..."
                                    />
                                  </div>

                                  <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                                      Cancelar
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleSaveDetails(sub.id)}
                                      disabled={savingDetails}
                                    >
                                      {savingDetails ? "Salvando..." : "Salvar Alterações"}
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Collapsible History Panel */}
                          <AnimatePresence>
                            {selectedId === sub.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden border-t border-brand-border dark:border-dark-border pt-4 mt-4 space-y-3"
                              >
                                <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                  Histórico de Execuções Recorrentes
                                </h4>

                                {loadingHistory ? (
                                  <div className="space-y-2">
                                    {[1, 2, 3].map((i) => (
                                      <SkeletonLoader key={i} height={48} className="rounded-xl" />
                                    ))}
                                  </div>
                                ) : executions.length === 0 ? (
                                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    Nenhuma execução registrada.
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                      {paginatedExecutions.map((exec) => {
                                        const execBadge = getExecutionBadge(exec.status)
                                        return (
                                          <div
                                            key={exec.id}
                                            className="text-xs flex items-center justify-between gap-3 border border-brand-border dark:border-dark-border rounded-xl p-3 bg-brand-gray/30 dark:bg-dark-surface"
                                          >
                                            <div className="flex items-center gap-4 min-w-0">
                                              <span className="font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                                {formatFullDate(exec.scheduled_for)}
                                              </span>
                                              {exec.orders?.order_number && (
                                                <span className="text-brand-green font-medium">
                                                  Pedido #{exec.orders.order_number}
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                              {exec.error_message && (
                                                <span className="text-brand-red font-medium">{exec.error_message}</span>
                                              )}
                                              <Badge variant={execBadge.variant}>{execBadge.label}</Badge>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                    {historyTotalPages > 1 && (
                                      <Pagination
                                        currentPage={historyPage}
                                        totalPages={historyTotalPages}
                                        onPageChange={setHistoryPage}
                                        inline
                                      />
                                    )}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Actions Footer */}
                        <div className="flex flex-row justify-between items-center gap-4 px-6 py-4 border-t border-brand-border dark:border-dark-border w-full flex-wrap">
                          {/* Left Side: Next charge */}
                          <div className="flex flex-col">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                              Próxima cobrança
                            </span>
                            <span className="text-base font-bold text-brand-dark dark:text-dark-heading">
                              {formatCurrency(cycleAmount)}
                            </span>
                          </div>

                          {/* Right Side: Actions */}
                          <div className="flex flex-row items-center flex-wrap justify-end gap-3">
                            <Button
                              variant="outline"
                              className="w-auto"
                              onClick={() => openHistory(sub.id)}
                              leftIcon={<HistoryIcon size={16} />}
                            >
                              {selectedId === sub.id ? "Ocultar histórico" : "Histórico"}
                            </Button>

                            {!isClosed && (
                              <Button
                                variant="outline"
                                className="w-auto"
                                leftIcon={<EditIcon size={16} />}
                                onClick={() => {
                                  setEditingId(editingId === sub.id ? null : sub.id)
                                  setEditAddress(sub.deliveryAddress || "")
                                  setEditNotes(sub.notes || "")
                                }}
                              >
                                Editar entrega
                              </Button>
                            )}

                            {!isClosed && sub.status === "active" && (
                              <Button
                                variant="outline"
                                className="w-auto"
                                leftIcon={<BlockedIcon size={16} />}
                                onClick={() => runAction("pause", sub.id)}
                              >
                                Pausar
                              </Button>
                            )}
                            {!isClosed && sub.status === "paused" && (
                              <Button
                                variant="outline"
                                className="w-auto"
                                leftIcon={<PlayIcon size={16} />}
                                onClick={() => runAction("resume", sub.id)}
                              >
                                Reativar
                              </Button>
                            )}

                            {!isClosed && (
                              <Dropdown
                                align="right"
                                className="w-fit"
                                width="w-64"
                                showChevron={false}
                                trigger={
                                  <Button
                                    variant="outline"
                                    className="w-auto"
                                    rightIcon={<ChevronDownIcon size={14} />}
                                  >
                                    Mais ações
                                  </Button>
                                }
                              >
                                <DropdownItem onClick={() => handleSkip(sub.id)}>
                                  <RepeatIcon size={16} />
                                  Pular ciclo
                                </DropdownItem>
                                <DropdownItem onClick={() => handlePostpone(sub.id, 7)}>
                                  <ClockIcon size={16} />
                                  Adiar 7 dias
                                </DropdownItem>
                                <DropdownItem onClick={() => handlePostpone(sub.id, 15)}>
                                  <ClockIcon size={16} />
                                  Adiar 15 dias
                                </DropdownItem>
                                <DropdownItem onClick={() => handlePostpone(sub.id, 30)}>
                                  <ClockIcon size={16} />
                                  Adiar 30 dias
                                </DropdownItem>
                                <DropdownItem onClick={() => handleAnticipate(sub.id)}>
                                  <CalendarIcon size={16} />
                                  Antecipar ciclo
                                </DropdownItem>
                                <DropdownItem onClick={() => handleRefund(sub)} disabled={loadingRefund}>
                                  <MoneyIcon size={16} />
                                  {loadingRefund ? "Carregando..." : "Solicitar reembolso"}
                                </DropdownItem>
                                <DropdownItem
                                  className="text-brand-red"
                                  onClick={() => runAction("cancel", sub.id)}
                                >
                                  <CancelCircleIcon size={16} />
                                  Cancelar assinatura
                                </DropdownItem>
                              </Dropdown>
                            )}

                            {actionLoading[sub.id] && <Spinner size={16} className="text-brand-green" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center flex flex-col items-center justify-center mb-6 py-12 w-full">
                  <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                    imageAlt="Você ainda não possui assinaturas"
                    title="Você ainda não possui assinaturas"
                    subtitle="Assine um plano recorrente e receba seus itens favoritos a cada ciclo, sem esforço."
                    itemButton={{
                      text: "Explorar planos",
                      action: "/explorar",
                    }}
                  />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="credits"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col flex-1 w-full"
            >
              {loadingCredits ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden"
                    >
                      <div className="px-6 py-4 flex items-start justify-between gap-4">
                        <div>
                          <SkeletonLoader width={160} height={18} className="mb-2" />
                          <SkeletonLoader width={110} height={14} />
                        </div>
                        <SkeletonLoader width={90} height={24} className="rounded-full" />
                      </div>
                      <div className="px-6 pb-6">
                        <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />
                        <SkeletonLoader height={8} className="rounded-full mb-3" />
                        <SkeletonLoader width={180} height={14} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : credits.length === 0 ? (
                <div className="text-center flex flex-col items-center justify-center py-12 w-full">
                  <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/ValesCompra.png"
                    imageAlt="Nenhum crédito ativo"
                    title="Você não possui créditos"
                    subtitle="Alguns planos liberam créditos de serviços a cada ciclo. Assine um plano para começar a acumular."
                    itemButton={{
                      text: "Explorar planos",
                      action: "/explorar",
                    }}
                  />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {credits.map((cred) => {
                    const percent = Math.min(100, Math.max(0, (cred.remainingCredits / cred.totalCredits) * 100))
                    return (
                      <div
                        key={cred.id}
                        className="bg-white dark:bg-dark-surface rounded-[12px] border border-brand-border dark:border-dark-border overflow-hidden transition-all duration-200 hover:shadow-md hover:border-brand-green dark:hover:border-brand-green w-full"
                      >
                        <div className="px-6 py-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                              {cred.itemName}
                            </h4>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">
                              {cred.planName} • {cred.storeName}
                            </p>
                          </div>
                          <Badge variant={cred.remainingCredits > 0 ? "green" : "gray"} className="shrink-0">
                            {cred.remainingCredits} Restantes
                          </Badge>
                        </div>

                        <div className="px-6 pb-6">
                          <div className="h-px bg-brand-border dark:bg-dark-border w-full mb-6" />

                          <div className="flex justify-between text-xs font-semibold mb-2">
                            <span className="text-brand-inactive-text dark:text-dark-body">Consumidos</span>
                            <span className="text-brand-dark dark:text-dark-heading">
                              {cred.consumedCredits} / {cred.totalCredits}
                            </span>
                          </div>
                          <div className="h-2 bg-brand-gray dark:bg-dark-surface rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-green rounded-full transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>

                          <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between gap-2 text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                            <span>Adquirido em: {cred.createdAt ? cred.createdAt.slice(0, 10) : ""}</span>
                            <span>Expira em: {cred.expiresAt ? cred.expiresAt.slice(0, 10) : "Não expira"}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {activeTab === "subscriptions" && totalPages > 1 && (
        <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={handlePageChange} />
      )}

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
    </div>
  )
}
