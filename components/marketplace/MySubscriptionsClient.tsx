"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button, Badge, Spinner } from "@/components/reusable"
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
  getMySubscriptionCreditsAction,
} from "@/app/actions/marketplace/recurring-subscriptions"
import { formatFullDate, formatCurrency } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
  ClockIcon,
  BlockedIcon,
  PlayIcon,
  CalendarIcon,
  MapPinIcon,
  InfoIcon,
  CheckCircleIcon,
  CancelCircleIcon
} from "@/lib/icons"

export function MySubscriptionsClient({ subscriptions }: { subscriptions: any[] }) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"subscriptions" | "credits">("subscriptions")
  const [items, setItems] = useState(subscriptions)

  // Subscriptions management state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

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
              statusLabel: updated.status === "active" ? "Ativa" : updated.status === "paused" ? "Pausada" : "Cancelada",
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
    toast({ title: "Detalhes de entrega atualizados com sucesso!" })
    if (res.data) refreshItem(res.data)
    setEditingId(null)
  }

  const openHistory = async (subscriptionId: string) => {
    if (selectedId === subscriptionId) {
      setSelectedId(null)
      return
    }
    setSelectedId(subscriptionId)
    setLoadingHistory(true)
    const res = await getMyRecurringSubscriptionExecutionsAction(subscriptionId)
    setLoadingHistory(false)
    if (res.success) setExecutions(res.data || [])
    else toast({ title: "Erro", description: res.error, variant: "destructive" })
  }

  const statusVariant = (status: string) => {
    if (status === "active") return "green" as const
    if (status === "paused") return "orange" as const
    if (status === "cancelled") return "red" as const
    if (status === "awaiting_restock") return "red" as const
    return "gray" as const
  }

  const getStatusLabel = (status: string) => {
    if (status === "active") return "Ativa"
    if (status === "paused") return "Pausada"
    if (status === "cancelled") return "Cancelada"
    if (status === "awaiting_restock") return "Aguardando Reposição"
    return status
  }

  return (
    <div className="space-y-6">
      {/* Premium Tab Navigation */}
      <div className="flex border-b border-brand-border dark:border-dark-border mb-6">
        <button
          onClick={() => setActiveTab("subscriptions")}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all relative ${
            activeTab === "subscriptions"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark"
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
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all relative ${
            activeTab === "credits"
              ? "border-brand-primary text-brand-primary"
              : "border-transparent text-brand-inactive-text dark:text-dark-body hover:text-brand-dark"
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
                    {sub.partner?.store_image_url && (
                      <img
                        src={getR2ImageUrl(sub.partner.store_image_url)}
                        alt={sub.partner?.name || sub.partner?.store_name}
                        className="w-16 h-16 rounded-[16px] object-cover border border-brand-border dark:border-dark-border"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg text-brand-dark dark:text-dark-heading">
                          {sub.plan?.name || "Plano"}
                        </h3>
                        <Badge variant={statusVariant(sub.status)}>
                          {getStatusLabel(sub.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-0.5">
                        {sub.partner?.name || sub.partner?.store_name}
                      </p>
                      
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
                      </div>
                    </div>
                  </div>

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
                      </>
                    )}

                    {actionLoading[sub.id] && <Spinner size={16} className="text-brand-primary self-center" />}
                  </div>

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
                          <div className="flex items-center gap-2 py-4">
                            <Spinner size={16} className="text-brand-primary" />
                            <span className="text-xs text-brand-inactive-text">Carregando histórico...</span>
                          </div>
                        ) : executions.length === 0 ? (
                          <p className="text-xs text-brand-inactive-text">Nenhuma execução registrada.</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                            {executions.map((exec) => (
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
                                  >
                                    {exec.status}
                                  </Badge>
                                  {exec.error_message && (
                                    <span className="text-brand-red font-medium">{exec.error_message}</span>
                                  )}
                                </div>
                              </div>
                            ))}
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
                <span className="text-brand-inactive-text">Carregando seus créditos...</span>
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
    </div>
  )
}
