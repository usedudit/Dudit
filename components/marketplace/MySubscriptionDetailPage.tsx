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
} from "@/app/actions/marketplace/recurring-subscriptions"
import { getLatestPurchaseForSubscriptionAction } from "@/app/actions/billing/purchases"
import { formatCurrency, formatDate, formatFullDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getPlanUrl, getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import Link from "next/link"
import {
  ClockIcon,
  BlockedIcon,
  PlayIcon,
  CalendarIcon,
  InfoIcon,
  CheckCircleIcon,
  CancelCircleIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  XIcon,
  EditIcon,
  RepeatIcon,
  MoneyIcon,
  ChevronDownIcon,
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
}

export function MySubscriptionDetailPage({ subscription: sub, onBack, onUpdate }: MySubscriptionDetailPageProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"details" | "history">("details")
  const [actionLoading, setActionLoading] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editAddress, setEditAddress] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)

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
  const cycleType = sub.plan?.frequency_type || sub.plan?.frequencyType
  // Planos longos (mensal/anual) não permitem adiar dias: só pular ou antecipar o ciclo.
  const supportsPostpone = cycleType !== "monthly" && cycleType !== "yearly"

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

  const handlePostpone = async (days: number) => {
    setActionLoading(true)
    const res = await postponeMySubscriptionCycleAction(sub.id, days)
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: `Ciclo adiado por ${days} dias com sucesso!` })
    if (res.data) onUpdate(res.data)
  }

  const handleAnticipate = async () => {
    setActionLoading(true)
    const res = await anticipateMySubscriptionCycleAction(sub.id)
    setActionLoading(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Cobrança antecipada com sucesso! O ciclo será processado em instantes." })
    if (res.data) onUpdate(res.data)
  }

  const handleSaveDetails = async () => {
    setSavingDetails(true)
    const res = await updateMySubscriptionDetailsAction(sub.id, {
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
        description: "O novo endereço tem frete mais caro. Aceite ou recuse abaixo para continuar.",
      })
    } else {
      toast({ title: "Detalhes de entrega atualizados com sucesso!" })
    }
    if (res.data) onUpdate(res.data)
    setEditing(false)
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

  const askAnticipate = () =>
    setConfirmDialog({
      title: "Antecipar a cobrança?",
      message: "A cobrança e a execução do ciclo serão feitas agora, em vez da data prevista.",
      confirmText: "Antecipar ciclo",
      cancelText: "Voltar",
      variant: "warning",
      onConfirm: handleAnticipate,
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

  const openEdit = () => {
    setEditAddress(sub.deliveryAddress || "")
    setEditNotes(sub.notes || "")
    setEditing((prev) => !prev)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full w-full"
    >
      {/* Header */}
      <div className="mb-8 flex flex-row items-center gap-4 w-full justify-start">
        <Button
          variant="filled"
          onClick={onBack}
          className="w-10 h-10 p-0 flex items-center justify-center shrink-0"
          aria-label="Voltar"
        >
          <XIcon className="w-5 h-5" />
        </Button>
        <img
          src={storeImage}
          alt={storeName}
          className="w-11 h-11 rounded-full object-cover border border-brand-border dark:border-dark-border bg-white shrink-0"
        />
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
            {storeName} • Iniciada em {formatFullDate(sub.createdAt)}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${statusConfig.color} shrink-0`}>
          <StatusIcon size={16} />
          <span>{statusConfig.label}</span>
        </div>
      </div>

      <div className="max-w-3xl lg:max-w-[1400px] mx-auto w-full pb-16">
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
          <TabsList className="mb-8">
            <TabsTrigger value="details">Detalhes da Assinatura</TabsTrigger>
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
                  <div className="border border-brand-blue/50 bg-blue-50 dark:bg-dark-surface rounded-xl p-4 space-y-3">
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
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={askRejectPriceChange}
                        disabled={actionLoading}
                      >
                        Recusar e encerrar no fim do ciclo
                      </Button>
                      <Button size="sm" onClick={() => handlePriceChangeResponse("accept")} disabled={actionLoading}>
                        {actionLoading ? "Aplicando..." : "Aceitar nova condição"}
                      </Button>
                    </div>
                  </div>
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
                                  {item.unitPrice != null ? formatCurrency(item.unitPrice) : "—"}
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
                    <DetailRow
                      label="Nome do plano"
                      value={
                        sub.plan ? (
                          <Link
                            href={getPlanUrl(sub.plan, sub.partner)}
                            prefetch={false}
                            className="hover:text-brand-green transition-colors"
                          >
                            {sub.plan.name}
                          </Link>
                        ) : (
                          "—"
                        )
                      }
                    />
                    <DetailRow label="Recorrência" value={sub.frequencyLabel || "—"} />
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
                    !isClosed ? (
                      <Button variant="outline" size="sm" leftIcon={<EditIcon size={16} />} onClick={openEdit}>
                        {editing ? "Fechar edição" : "Editar entrega"}
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

                  {editing && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-4 pt-2"
                    >
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
                          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={handleSaveDetails} disabled={savingDetails}>
                            {savingDetails ? "Salvando..." : "Salvar Alterações"}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </FormSection>

                {/* Section: observações */}
                {sub.notes && (
                  <FormSection title="Observações" hasSeparator>
                    <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap">
                      {sub.notes}
                    </p>
                  </FormSection>
                )}
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
                              : "—"}
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
                        onClick={() => runAction("pause")}
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
                        onClick={() => runAction("resume")}
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
                      {supportsPostpone && (
                        <>
                          <DropdownItem onClick={() => handlePostpone(7)}>
                            <ClockIcon size={16} />
                            Adiar 7 dias
                          </DropdownItem>
                          <DropdownItem onClick={() => handlePostpone(15)}>
                            <ClockIcon size={16} />
                            Adiar 15 dias
                          </DropdownItem>
                          <DropdownItem onClick={() => handlePostpone(30)}>
                            <ClockIcon size={16} />
                            Adiar 30 dias
                          </DropdownItem>
                        </>
                      )}
                      <DropdownItem onClick={askAnticipate}>
                        <CalendarIcon size={16} />
                        Antecipar ciclo
                      </DropdownItem>
                      <DropdownItem onClick={handleRefund} disabled={loadingRefund}>
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
                  <div className="border border-brand-border dark:border-dark-border rounded-xl p-4 bg-brand-gray/30 dark:bg-dark-surface">
                    <div className="flex items-start gap-2">
                      <InfoIcon size={16} className="text-brand-inactive-text dark:text-dark-body mt-0.5 shrink-0" />
                      <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                        {sub.status === "cancelled"
                          ? "Assinatura cancelada. Não há novas cobranças e os valores não mudam mais."
                          : "Assinatura encerrada. Não há novas cobranças e os valores não mudam mais."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0 focus-visible:ring-0">
            <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface p-6">
              {loadingHistory ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <SkeletonLoader key={i} height={48} className="rounded-xl" />
                  ))}
                </div>
              ) : executions.length === 0 ? (
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                  Nenhuma cobrança registrada ainda.
                </p>
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
