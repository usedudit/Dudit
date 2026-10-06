"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Badge, Spinner, ThreeDotsLoader } from "@/components/reusable"
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
import { getPlanUrl, getStoreUrl } from "@/lib/utils/url-generator"
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
  CancelCircleIcon
} from "@/lib/icons"
import { BillingRefundModal } from "@/components/billing/BillingRefundModal"

export function MySubscriptionsClient({ subscriptions }: { subscriptions: any[] }) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"subscriptions" | "credits">("subscriptions")
  const [items, setItems] = useState(subscriptions)

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

  // Reschedule state
  const [postponeDays, setPostponeDays] = useState<Record<string, number>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  // Credits state
  const [credits, setCredits] = useState<any[]>([])
  const [loadingCredits, setLoadingCredits] = useState(false)

  // Refund state
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundSub, setRefundSub] = useState<any>(null)
  const [refundPurchase, setRefundPurchase] = useState<any>(null)
  const [loadingRefund, setLoadingRefund] = useState(false)

  useEffect(() => {
    if (activeTab === "credits") {
      void fetchCredits()
    }
  }, [activeTab])

  const fetchCredits = async () => {
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

  const handlePostpone = async (subscriptionId: string) => {
    const days = postponeDays[subscriptionId] || 7
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
      title: decision === "accept"
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

  const historyTotalPages = Math.ceil(executions.length / HISTORY_PAGE_SIZE)
  const paginatedExecutions = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE
    return executions.slice(start, start + HISTORY_PAGE_SIZE)
  }, [executions, historyPage])

  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "paused" || status === "pending" || status === "past_due") return "orange" as const
    if (status === "cancelled" || status === "payment_failed") return "red" as const
    if (status === "awaiting_restock") return "red" as const
    if (status === "awaiting_customer_decision") return "orange" as const
    return "gray" as const
  }

  const getStatusLabel = (status: string) => {
    if (status === "active") return "Ativa"
    if (status === "paused") return "Pausada"
    if (status === "pending") return "Aguardando Confirmação"
    if (status === "past_due") return "Pagamento Pendente"
    if (status === "payment_failed") return "Falha no Pagamento"
    if (status === "cancelled") return "Cancelada"
    if (status === "awaiting_restock") return "Aguardando Reposição"
    if (status === "awaiting_customer_decision") return "Aguardando Cliente"
    return status
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

  return (
    <div className="space-y-6">
      {/* Premium Tab Navigation */}
      <div className="flex border-b border-brand-border dark:border-dark-border mb-6">
        <button
          onClick={() => setActiveTab("subscriptions")}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all relative ${activeTab === "subscriptions"
            ? "border-brand-primary text-brand-primary"
            : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
            }`}
        >
          Minhas Assinaturas
          {activeTab === "subscriptions" && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("credits")}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all relative ${activeTab === "credits"
            ? "border-brand-primary text-brand-primary"
            : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
            }`}
        >
          Meus Créditos
          {activeTab === "credits" && (
            <motion.div
              layoutId="activeTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary"
            />
          )}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "subscriptions" ? (
          <motion.div
            key="subscriptions-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid gap-6"
          >
            {items.length === 0 ? (
              <div className="border border-brand-border dark:border-dark-border rounded-[24px] p-12 text-center text-brand-inactive-text bg-white dark:bg-dark-card shadow-sm">
                Você ainda não possui assinaturas.
              </div>
            ) : (
              items.map((sub) => (
                <div
                  key={sub.id}
                  className="border border-brand-border dark:border-dark-border rounded-[24px] p-6 space-y-5 bg-white dark:bg-dark-card shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  {/* MP Tag Indicator */}
                  {sub.mpPreapprovalId && (
                    <div className="absolute top-0 right-0 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl border-l border-b border-brand-border dark:border-dark-border">
                      Faturamento Automático
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    {sub.partner?.logo_url && (
                      <img
                        src={getR2ImageUrl(sub.partner.logo_url)}
                        alt={sub.partner?.name || sub.partner?.store_name}
                        className="w-16 h-16 rounded-[16px] object-cover border border-brand-border dark:border-dark-border"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {sub.plan ? (
                          <Link
                            href={getPlanUrl(sub.plan, sub.partner)}
                            prefetch={false}
                            className="font-bold text-lg text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors truncate"
                          >
                            {sub.plan.name}
                          </Link>
                        ) : (
                          <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading truncate">
                            Plano
                          </h3>
                        )}
                        <Badge variant={statusVariant(sub.status)} />
                      </div>
                      {sub.partner ? (
                        <Link
                          href={getStoreUrl(sub.partner)}
                          prefetch={false}
                          className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 hover:text-brand-green transition-colors block truncate"
                        >
                          {sub.partner?.name || sub.partner?.store_name}
                        </Link>
                      ) : (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">
                          {sub.partner?.name || sub.partner?.store_name}
                        </p>
                      )}


                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-brand-inactive-text dark:text-dark-body font-medium">
                        <div className="flex items-center gap-1.5">
                          <CalendarIcon size={14} className="text-brand-primary" />
                          <span>
                            Próxima data: <strong>{formatFullDate(sub.nextExecutionAt).slice(0, 10)}</strong>
                          </span>
                        </div>
                        {sub.frequencyLabel && (
                          <div className="flex items-center gap-1.5">
                            <ClockIcon size={14} className="text-brand-primary" />
                            <span>Recorrência: {sub.frequencyLabel}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 sm:col-span-2">
                          <MapPinIcon size={14} className="text-brand-primary" />
                          <span className="truncate">
                            Entrega: <strong>{sub.deliveryType === "delivery" ? sub.deliveryAddress || "Não informado" : "Retirada no Local"}</strong>
                          </span>
                        </div>
                        {sub.deliveryType === "delivery" && (
                          <div className="flex items-center gap-1.5">
                            <TruckIcon size={14} className="text-brand-primary" />
                            <span>
                              Frete: <strong>{formatCurrency(Number(sub.shippingAmount || 0))}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Items included in this subscription */}
                  {sub.items?.length > 0 && (
                    <div className="border-t border-brand-border dark:border-dark-border pt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-brand-inactive-text dark:text-dark-body mb-3">
                        Itens da assinatura
                      </h4>
                      <div className="space-y-2">
                        {sub.items.map((item: any) => {
                          const details = item.itemType === "product" ? item.product : item.service
                          const name = details?.name || (item.itemType === "product" ? "Produto" : "Serviço")
                          const images = details?.images
                          const imgUrl = (Array.isArray(images) && images[0]) || null

                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 p-3 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/40 dark:bg-dark-surface"
                            >
                              {imgUrl ? (
                                <div className="w-12 h-12 rounded-[10px] bg-white dark:bg-dark-card border border-brand-border overflow-hidden shrink-0">
                                  <img
                                    src={getR2ImageUrl(imgUrl)}
                                    alt={name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-12 h-12 rounded-[10px] bg-white dark:bg-dark-card border border-brand-border flex items-center justify-center shrink-0 text-brand-primary">
                                  {item.itemType === "product" ? <TruckIcon size={18} /> : <CalendarIcon size={18} />}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
                                  {name}
                                </p>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium">
                                  Quantidade: <strong>{item.quantity}x</strong> •{" "}
                                  {item.itemType === "product" ? "Produto" : "Serviço"}
                                </p>
                              </div>
                              {item.unitPrice != null && (
                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                  {formatCurrency(item.unitPrice)}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Main actions line */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-brand-border dark:border-dark-border">
                    <Button variant="outline" size="sm" onClick={() => openHistory(sub.id)}>
                      {selectedId === sub.id ? "Ocultar histórico" : "Histórico de Ciclos"}
                    </Button>

                    {sub.status !== "cancelled" && sub.status !== "expired" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(editingId === sub.id ? null : sub.id)
                            setEditAddress(sub.deliveryAddress || "")
                            setEditNotes(sub.notes || "")
                          }}
                        >
                          Editar Entrega
                        </Button>
                        <Button variant="outline" size="sm" className="text-brand-orange" onClick={() => handleSkip(sub.id)}>
                          Pular Ciclo
                        </Button>

                        <div className="flex items-center gap-1">
                          <select
                            value={postponeDays[sub.id] || 7}
                            onChange={(e) => setPostponeDays({ ...postponeDays, [sub.id]: Number(e.target.value) })}
                            className="bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg text-xs py-1.5 px-2 font-medium"
                          >
                            <option value={7}>7 dias</option>
                            <option value={15}>15 dias</option>
                            <option value={30}>30 dias</option>
                          </select>
                          <Button variant="outline" size="sm" onClick={() => handlePostpone(sub.id)}>
                            Adiar
                          </Button>
                        </div>

                        <Button variant="outline" size="sm" className="text-brand-green" onClick={() => handleAnticipate(sub.id)}>
                          Antecipar Ciclo
                        </Button>

                        {sub.status === "active" && (
                          <Button variant="outline" size="sm" onClick={() => runAction("pause", sub.id)}>
                            Pausar
                          </Button>
                        )}
                        {sub.status === "paused" && (
                          <Button variant="outline" size="sm" onClick={() => runAction("resume", sub.id)}>
                            Reativar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-brand-red text-brand-red hover:bg-red-50"
                          onClick={() => runAction("cancel", sub.id)}
                        >
                          Cancelar Assinatura
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-brand-purple"
                          onClick={async () => {
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
                          }}
                          disabled={loadingRefund}
                        >
                          {loadingRefund ? "Carregando..." : "Solicitar Reembolso"}
                        </Button>
                      </>
                    )}

                    {actionLoading[sub.id] && <Spinner size={16} className="text-brand-primary self-center" />}
                  </div>

                  {/* Pending address change: freight raised, needs consent */}
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
                            <strong>{formatCurrency(Number(sub.pendingShippingAmount || 0))}</strong>,
                            enquanto o atual é {formatCurrency(Number(sub.shippingAmount || 0))}.
                            Nada muda na sua cobrança até você aceitar.
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
                                <strong>{formatCurrency(Number(sub.contractedAmount || 0))}</strong> até você
                                decidir. O novo valor é{" "}
                                <strong>
                                  {formatCurrency(Number(sub.plan?.price || 0) + Number(sub.shippingAmount || 0))}
                                </strong>
                                .
                              </>
                            ) : (
                              <>
                                Novo valor:{" "}
                                <strong>
                                  {formatCurrency(Number(sub.plan?.price || 0) + Number(sub.shippingAmount || 0))}
                                </strong>{" "}
                                (hoje você paga {formatCurrency(Number(sub.contractedAmount || 0))}). Responda até{" "}
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
                        className="overflow-hidden border-t border-brand-border dark:border-dark-border pt-4 mt-2 space-y-4"
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
                                className="w-full bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-primary"
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
                              className="w-full bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                              placeholder="Instruções especiais ou observações..."
                            />
                          </div>

                          <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                              Cancelar
                            </Button>
                            <Button size="sm" onClick={() => handleSaveDetails(sub.id)} disabled={savingDetails}>
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
                        className="overflow-hidden border-t border-brand-border dark:border-dark-border pt-4 mt-2 space-y-3"
                      >
                        <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                          Histórico de Execuções Recorrentes
                        </h4>

                        {loadingHistory ? (
                          <div className="flex items-center">
                            <ThreeDotsLoader />
                          </div>
                        ) : executions.length === 0 ? (
                          <p className="text-xs text-brand-inactive-text dark:text-dark-body">Nenhuma execução registrada.</p>
                        ) : (
                          <div className="space-y-2">
                            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                              {paginatedExecutions.map((exec) => (
                                <div
                                  key={exec.id}
                                  className="text-xs flex items-center justify-between border border-brand-border dark:border-dark-border rounded-xl p-3 bg-brand-gray/30 dark:bg-dark-surface"
                                >
                                  <div className="flex items-center gap-4">
                                    <span className="font-semibold">{formatFullDate(exec.scheduled_for)}</span>
                                    {exec.orders?.order_number && (
                                      <span className="text-brand-primary font-medium">
                                        Pedido #{exec.orders.order_number}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Badge
                                      variant={
                                        exec.status === "completed"
                                          ? "green"
                                          : exec.status === "failed"
                                            ? "red"
                                            : "gray"
                                      }
                                    />
                                    {exec.error_message && (
                                      <span className="text-brand-red font-medium">{exec.error_message}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
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
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="credits-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-4"
          >
            {loadingCredits ? (
              <div className="flex items-center gap-2 justify-center py-12">
                <Spinner size={24} className="text-brand-primary" />
                <span className="text-brand-inactive-text dark:text-dark-body">Carregando seus créditos...</span>
              </div>
            ) : credits.length === 0 ? (
              <div className="border border-brand-border dark:border-dark-border rounded-[24px] p-12 text-center text-brand-inactive-text bg-white dark:bg-dark-card shadow-sm">
                Você não possui nenhum saldo de créditos ativo no momento.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {credits.map((cred) => {
                  const percent = Math.min(100, Math.max(0, (cred.remainingCredits / cred.totalCredits) * 100))
                  return (
                    <div
                      key={cred.id}
                      className="border border-brand-border dark:border-dark-border rounded-[24px] p-5 bg-white dark:bg-dark-card shadow-sm flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-bold text-brand-dark dark:text-dark-heading text-base truncate">
                            {cred.itemName}
                          </h4>
                          <Badge variant={cred.remainingCredits > 0 ? "green" : "gray"}>
                            {cred.remainingCredits} Restantes
                          </Badge>
                        </div>
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                          {cred.planName} • {cred.storeName}
                        </p>
                      </div>

                      <div className="mt-6 space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-brand-inactive-text dark:text-dark-body">Consumidos</span>
                          <span className="text-brand-dark dark:text-dark-heading">
                            {cred.consumedCredits} / {cred.totalCredits}
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-2 bg-brand-gray dark:bg-dark-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-primary rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                        <span>Adquirido em: {cred.createdAt ? cred.createdAt.slice(0, 10) : ""}</span>
                        <span>Expira em: {cred.expiresAt ? cred.expiresAt.slice(0, 10) : "Não expira"}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
