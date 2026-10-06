"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"

import { FadeIn } from "@/components/animations/FadeIn"
import { ERPDetailLoading } from "@/components/erp/shared/ERPDetailLoading"
import { ReportTableCard } from "@/components/erp/reports/widgets"
import {
  ActionsDropdown,
  Badge,
  Button,
  DropdownItem,
  FormSection,
  FormTextarea,
  Input,
  SidebarCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
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
  getRecurringExecutionStatusLabel,
  getRecurringFrequencyLabel,
  getRecurringShippingSourceLabel,
  getRecurringStatusLabel,
  getRecurringStatusVariant,
} from "@/lib/types/recurring"
import type { RecurringSubscriptionDetail } from "@/lib/types/recurring"
import { formatCurrency, formatFullDate } from "@/lib/utils"
import { useSidebar } from "@/lib/sidebar-context"
import { useToast } from "@/hooks/use-toast"
import {
  BlockedIcon,
  ChevronLeftIcon,
  ClockIcon,
  PlayIcon,
  RepeatIcon,
  ThreeDotsIcon,
} from "@/lib/icons"

type DetailTab = "general" | "history"
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

  const [detail, setDetail] = useState<RecurringSubscriptionDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<any[]>([])
  const [loadingExecutions, setLoadingExecutions] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab)
  const [isScrolled, setIsScrolled] = useState(false)
  const [busy, setBusy] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }
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

  const executionColumns = useMemo(
    () => [
      {
        key: "scheduled_for",
        header: "Agendada",
        render: (value: any) => <span className="font-semibold">{formatFullDate(value)}</span>,
      },
      {
        key: "status",
        header: "Status",
        align: "center" as const,
        render: (value: any) => (
          <Badge
            variant={
              value === "completed"
                ? "green"
                : value === "failed"
                  ? "red"
                  : value === "awaiting_payment"
                    ? "orange"
                    : "gray"
            }
          >
            {getRecurringExecutionStatusLabel(value)}
          </Badge>
        ),
      },
      {
        key: "orders",
        header: "Pedido",
        render: (value: any, row: any) =>
          row.orders?.order_number ? (
            <span className="font-bold">#{row.orders.order_number}</span>
          ) : (
            <span className="text-brand-inactive-text dark:text-dark-body">—</span>
          ),
      },
      {
        key: "completed_at",
        header: "Concluída em",
        render: (value: any) =>
          value ? (
            <span className="font-medium">{formatFullDate(value)}</span>
          ) : (
            <span className="text-brand-inactive-text dark:text-dark-body">—</span>
          ),
      },
      {
        key: "error_message",
        header: "Erro",
        render: (value: any) =>
          value ? (
            <span className="text-xs font-medium text-brand-red">{value}</span>
          ) : (
            <span className="text-brand-inactive-text dark:text-dark-body">—</span>
          ),
      },
    ],
    [],
  )

  if (!detail) {
    if (loadError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-65px)] bg-white dark:bg-dark-background">
          <p className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">{loadError}</p>
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
                          <div className="grid grid-cols-12 gap-5">
                            <div className="col-span-12 md:col-span-6">
                              <Input label="Cliente" value={customer?.name || detail.subscription.customerId} readOnly />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input label="E-mail" value={customer?.email || "—"} readOnly />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input label="Telefone" value={customer?.phone || "—"} readOnly />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input
                                label="Frequência"
                                value={
                                  plan
                                    ? getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)
                                    : "—"
                                }
                                readOnly
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input label="Data de Início" value={formatFullDate(subscription.startedAt)} readOnly />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input
                                label="Próxima Execução"
                                value={formatFullDate(subscription.nextExecutionAt)}
                                readOnly
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input
                                label="Última Execução"
                                value={
                                  subscription.lastExecutionAt
                                    ? formatFullDate(subscription.lastExecutionAt)
                                    : "Nenhuma execução"
                                }
                                readOnly
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input
                                label="Tipo de Entrega"
                                value={subscription.deliveryType === "delivery" ? "Entrega" : "Retirada"}
                                readOnly
                              />
                            </div>
                            {subscription.deliveryType === "delivery" && subscription.deliveryAddress && (
                              <div className="col-span-12">
                                <Input
                                  label="Endereço de Entrega"
                                  value={subscription.deliveryAddress}
                                  readOnly
                                />
                              </div>
                            )}
                            <div className="col-span-12 md:col-span-6">
                              <Input
                                label="Frete"
                                value={formatCurrency(Number(subscription.shippingAmount || 0))}
                                readOnly
                              />
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <Input
                                label="Origem do Frete"
                                value={getRecurringShippingSourceLabel(subscription.shippingSource || "pickup")}
                                readOnly
                              />
                            </div>
                            {subscription.pausedAt && (
                              <div className="col-span-12 md:col-span-6">
                                <Input label="Pausada em" value={formatFullDate(subscription.pausedAt)} readOnly />
                              </div>
                            )}
                            {subscription.cancelledAt && (
                              <div className="col-span-12 md:col-span-6">
                                <Input label="Cancelada em" value={formatFullDate(subscription.cancelledAt)} readOnly />
                              </div>
                            )}
                          </div>
                        </FormSection>

                        <FormSection title="Itens Contratados" className="mt-8 space-y-4">
                          {!detail.items.length ? (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                              Nenhum item registrado nesta assinatura. Os itens do plano estão no resumo ao lado.
                            </p>
                          ) : (
                            <div className="flex flex-col divide-y divide-brand-border/50 dark:divide-dark-border/50">
                              {detail.items.map((item) => (
                                <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                      {item.product?.name ||
                                        item.service?.name ||
                                        (item.itemType === "product" ? "Produto" : "Serviço")}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                      {item.itemType === "product" ? "Produto" : "Serviço"} · Quantidade{" "}
                                      {item.quantity}
                                      {item.preferredTime ? ` · Horário ${String(item.preferredTime).slice(0, 5)}` : ""}
                                      {item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}
                                    </p>
                                  </div>
                                  <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                    {formatCurrency(item.unitPrice)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </FormSection>

                        {subscription.notes && (
                          <FormSection title="Observações" className="mt-8">
                            <FormTextarea label="Notas da assinatura" value={subscription.notes} disabled rows={3} />
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

                        <SidebarCard hasSeparator hasTopStrip title="Itens do Plano">
                          {!plan?.items?.length ? (
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                              Plano sem itens cadastrados.
                            </p>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {plan.items.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-brand-dark dark:text-dark-heading truncate">
                                      {item.product?.name || item.service?.name || "Item"}
                                    </p>
                                    <p className="text-[11px] text-brand-inactive-text dark:text-dark-body">
                                      {item.itemType === "product" ? "Produto" : "Serviço"} · Qtd {item.quantity}
                                    </p>
                                  </div>
                                  <span className="text-xs font-semibold whitespace-nowrap text-brand-dark dark:text-dark-heading">
                                    {item.unitPrice != null ? formatCurrency(Number(item.unitPrice)) : "—"}
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

                {activeTab === "history" && (
                  <FadeIn key="history" className="block">
                    {loadingExecutions ? (
                      <div className="flex items-center justify-center py-24">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                          Carregando histórico...
                        </span>
                      </div>
                    ) : (
                      <ReportTableCard
                        title="Histórico de Execuções"
                        icon={ClockIcon}
                        columns={executionColumns}
                        data={executions}
                        pageSize={10}
                        emptyMessage="Nenhuma execução registrada para esta assinatura."
                      />
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
