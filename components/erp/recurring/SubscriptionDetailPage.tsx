"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"

import { FadeIn } from "@/components/animations/FadeIn"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import {
  ActionsDropdown,
  Badge,
  Button,
  DropdownItem,
  FormSection,
  IconPlaceholder,
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
} from "@/app/actions/erp/recurring-subscriptions"
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
  PlayIcon,
  RepeatIcon,
  ThreeDotsIcon,
} from "@/lib/icons"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

type DetailTab = "general" | "items" | "history"
type SubscriptionAction = "pause" | "resume" | "cancel" | "resolve_stock" | "sync"

interface SubscriptionDetailPageProps {
  partnerId: string
  subscriptionId: string
  onBack: () => void
  canManage: boolean
  onChanged?: () => void
  initialTab?: DetailTab
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
    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">{label}</span>
    <span className={`text-sm font-semibold text-right text-brand-dark dark:text-dark-heading ${valueClassName}`}>
      {value}
    </span>
  </div>
)

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-start text-[14px] gap-4">
    <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
    <span className="text-right text-sm font-semibold text-brand-dark dark:text-dark-heading break-words min-w-0">
      {value}
    </span>
  </div>
)

const EXECUTION_COLUMNS: Array<{ id: string; label: string; align?: "left" | "center" | "right"; width?: string }> = [
  { id: "scheduled_for", label: "Agendada", align: "left", width: "180px" },
  { id: "status", label: "Situação", align: "center", width: "180px" },
  { id: "orders", label: "Pedido", align: "left", width: "140px" },
  { id: "completed_at", label: "Concluída em", align: "left", width: "200px" },
  { id: "error_message", label: "Erro", align: "left" },
]

const HISTORY_ITEMS_PER_PAGE = 8

export const SubscriptionDetailPage: React.FC<SubscriptionDetailPageProps> = ({
  partnerId,
  subscriptionId,
  onBack,
  canManage,
  onChanged,
  initialTab = "general",
}) => {
  const { toast } = useToast()
  const { setHeaderOverride } = useSidebar()
  const isTablet = useMediaQuery("(max-width: 1024px)")

  const [detail, setDetail] = useState<RecurringSubscriptionDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingExecutions, setLoadingExecutions] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab)
  const [isScrolled, setIsScrolled] = useState(false)
  const [busy, setBusy] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    void loadDetail()
    void loadExecutions()
  }, [loadDetail, loadExecutions])

  useEffect(() => {
    checkTableScroll()
    window.addEventListener("resize", checkTableScroll)
    return () => window.removeEventListener("resize", checkTableScroll)
  }, [checkTableScroll, executions, activeTab])

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
    if (status === "active") {
      return { label: "Pausar assinatura", icon: <BlockedIcon size={18} />, action: "pause" as SubscriptionAction }
    }
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

  const runAction = useCallback(
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
        await Promise.all([loadDetail(), loadExecutions()])
        onChanged?.()
      } finally {
        setBusy(false)
      }
    },
    [busy, loadDetail, loadExecutions, onChanged, partnerId, subscriptionId, toast],
  )

  if (!detail) {
    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-65px)] bg-white dark:bg-dark-background">
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
          <BlockedIcon size={18} /> Pausar
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

  const historyTotalPages = Math.max(Math.ceil(executions.length / HISTORY_ITEMS_PER_PAGE), 1)
  const paginatedExecutions = executions.slice(
    (historyPage - 1) * HISTORY_ITEMS_PER_PAGE,
    historyPage * HISTORY_ITEMS_PER_PAGE,
  )

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
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
                    <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                      <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                        <FormSection title="Dados da Assinatura" className="space-y-6">
                          <div className="grid grid-cols-12 gap-x-5 gap-y-4">
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Cliente" value={customer?.name || subscription.customerId} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="E-mail" value={customer?.email || "—"} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow label="Telefone" value={customer?.phone || "—"} />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Frequência"
                                value={
                                  plan
                                    ? getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)
                                    : "—"
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
                            <div className="col-span-12 md:col-span-6">
                              <InfoRow
                                label="Tipo de Entrega"
                                value={subscription.deliveryType === "delivery" ? "Entrega" : "Retirada"}
                              />
                            </div>
                            {subscription.deliveryType === "delivery" && subscription.deliveryAddress && (
                              <div className="col-span-12">
                                <InfoRow label="Endereço de Entrega" value={subscription.deliveryAddress} />
                              </div>
                            )}
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

                        {subscription.notes && (
                          <FormSection title="Observações" className="mt-8">
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body whitespace-pre-wrap">
                              {subscription.notes}
                            </p>
                          </FormSection>
                        )}
                      </div>

                      {/* Sidebar */}
                      <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
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
                            <SidebarRow label="Status" value={status ? getRecurringStatusLabel(status) : "—"} />
                            <SidebarRow label="Início" value={formatFullDate(subscription.startedAt)} />
                            <SidebarRow
                              label="Próxima Execução"
                              value={formatFullDate(subscription.nextExecutionAt)}
                            />
                            <SidebarRow
                              label="Última Execução"
                              value={
                                subscription.lastExecutionAt ? formatFullDate(subscription.lastExecutionAt) : "—"
                              }
                            />
                            <SidebarRow
                              label="Mercado Pago"
                              value={subscription.mpPreapprovalId || "Não vinculada"}
                              valueClassName="text-xs break-all"
                            />
                            {priceChangePending && (
                              <div className="rounded-xl bg-brand-blue-secondary/60 dark:bg-blue-900/20 px-3 py-2">
                                <p className="text-xs font-semibold text-brand-blue dark:text-blue-400">
                                  Mudança de preço aguardando decisão
                                </p>
                                {subscription.priceChangeExpiresAt && (
                                  <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                                    Janela até {formatFullDate(subscription.priceChangeExpiresAt)}
                                  </p>
                                )}
                              </div>
                            )}
                            {subscription.pendingCancellationReason && (
                              <div className="rounded-xl bg-brand-red-secondary/60 dark:bg-red-900/20 px-3 py-2">
                                <p className="text-xs font-semibold text-brand-red dark:text-red-400">
                                  {subscription.pendingCancellationReason}
                                </p>
                              </div>
                            )}
                          </div>
                        </SidebarCard>

                        <SidebarCard hasSeparator hasTopStrip title="Créditos de Serviço">
                          {!detail.credits.length ? (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                              Nenhum crédito de serviço lançado para esta assinatura.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {detail.credits.map((credit) => (
                                <div
                                  key={credit.id}
                                  className="flex items-start justify-between gap-3 border-b border-brand-border/50 dark:border-dark-border/50 pb-2 last:border-0 last:pb-0"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">
                                      {credit.serviceName}
                                    </p>
                                    <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                      {credit.expiresAt
                                        ? `Válido até ${formatFullDate(credit.expiresAt)}`
                                        : "Sem validade"}
                                    </p>
                                  </div>
                                  <span className="text-xs font-bold whitespace-nowrap text-brand-primary">
                                    {credit.remaining}/{credit.quantity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
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

                {activeTab === "history" && (
                  <FadeIn key="history" className="block">
                    {loadingExecutions ? (
                      <div className="flex items-center justify-center py-24">
                        <ThreeDotsLoader />
                      </div>
                    ) : executions.length === 0 ? (
                      <div className="w-full flex items-center justify-center min-h-[400px]">
                        <IconPlaceholder
                          placeholderType="image"
                          imageSrc="https://img.dudit.com.br/static/mascots/Assinaturas.png"
                          imageAlt="Nenhuma execução"
                          title="Nenhuma execução registrada"
                          subtitle="As execuções desta assinatura aparecerão aqui conforme forem acontecendo."
                        />
                      </div>
                    ) : (
                      <>
                        {isTablet ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                            {paginatedExecutions.map((execution) => (
                              <ExecutionGridCard key={execution.id} execution={execution} />
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
                                        className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body bg-brand-gray dark:bg-dark-border/50 ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : "text-left"} ${index === 0 ? "rounded-l-lg pl-6" : ""} ${col.id === "error_message" ? "rounded-r-lg pr-6" : ""}`}
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
                                    <ExecutionListRow key={execution.id} execution={execution} columns={EXECUTION_COLUMNS} />
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
                  cancelLabel="Cancelar assinatura"
                  onCancel={canCancel ? () => void runAction("cancel") : undefined}
                  trigger={
                    <Button
                      variant="outline"
                      className="flex-1"
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
      </div>
    </FadeIn>
  )
}

export default SubscriptionDetailPage
