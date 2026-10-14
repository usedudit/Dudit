"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { XIcon, SearchIcon, CheckCircleIcon, ClockIcon, TruckIcon } from "@/lib/icons"
import {
    Button,
    IconPlaceholder,
    Badge,
    InfoCard,
    Tabs,
    TabsList,
    TabsTrigger,
    ThreeDotsLoader,
    Input,
    FormDropdown,
} from "@/components/reusable"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { getOrdersInsightsAction } from "@/app/actions/erp/orders"
import {
    DEFAULT_ORDER_STAGNANT_PERIOD_DAYS,
    ORDER_STAGNANT_PERIOD_OPTIONS,
    type OrderAlert,
    type OrderAlertGroup,
    type ReturnAlert,
    type ReturnAlertGroup,
    type StagnantOrderGroup,
} from "@/lib/erp/order-insights"
import { formatCurrency } from "@/lib/utils"
import { useNotification } from "@/hooks/use-notification"

interface OrdersSuggestionsSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    storeId?: string
    onOpenOrder: (orderId: string) => void
}

type TabKey = "pagamentos" | "entregas" | "parados" | "devolucoes"

const KIND_LABELS: Record<string, string> = {
    payment_failed: "Pagamento recusado",
    payment_expired: "Prazo expirado",
    payment_expiring: "Expirando",
    pending_old: "Aguardando pagamento",
    delivery_failed: "Falha na entrega",
    paid_not_sent: "Não enviado",
    sent_not_delivered: "Sem entrega",
    stagnant: "Parado",
}

const SEVERITY_VARIANT: Record<string, "red" | "orange" | "blue"> = {
    critical: "red",
    warning: "orange",
    info: "blue",
}

const PERIOD_OPTIONS = ORDER_STAGNANT_PERIOD_OPTIONS.map((days) => ({
    value: String(days),
    label: `${days} dias`,
}))

const formatDateBr = (iso: string | null | undefined) => {
    if (!iso) return "-"
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number)
    if (!y || !m || !d) return "-"
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}

export function OrdersSuggestionsSheet({
    isOpen,
    onClose,
    partnerId,
    storeId,
    onOpenOrder,
}: OrdersSuggestionsSheetProps) {
    const isMobile = useMediaQuery("(max-width: 1023px)")
    const { error: notifyError } = useNotification()

    const [activeTab, setActiveTab] = useState<TabKey>("pagamentos")
    const [stagnantPeriod, setStagnantPeriod] = useState<number>(DEFAULT_ORDER_STAGNANT_PERIOD_DAYS)
    const [search, setSearch] = useState("")

    const [payments, setPayments] = useState<OrderAlertGroup | null>(null)
    const [deliveries, setDeliveries] = useState<OrderAlertGroup | null>(null)
    const [stagnant, setStagnant] = useState<StagnantOrderGroup | null>(null)
    const [returns, setReturns] = useState<ReturnAlertGroup | null>(null)
    const [loading, setLoading] = useState(false)

    const zIndex = useModalLayer(isOpen)

    const fetchInsights = useCallback(() => {
        setLoading(true)
        getOrdersInsightsAction(partnerId, stagnantPeriod, storeId).then((res) => {
            if ("error" in res && res.error) {
                notifyError(res.error)
            } else if ("payments" in res) {
                setPayments(res.payments)
                setDeliveries(res.deliveries)
                setStagnant(res.stagnant)
                setReturns(res.returns)
            }
            setLoading(false)
        })
    }, [partnerId, stagnantPeriod, storeId, notifyError])

    useEffect(() => {
        if (!isOpen) {
            setPayments(null)
            setDeliveries(null)
            setStagnant(null)
            setReturns(null)
            setSearch("")
            setActiveTab("pagamentos")
            return
        }
        fetchInsights()
    }, [isOpen, fetchInsights])

    const openOrder = (orderId: string | null) => {
        if (!orderId) return
        onClose()
        onOpenOrder(orderId)
    }

    const matches = useCallback(
        (orderNumber: string, customerName: string) => {
            const term = search.toLowerCase().trim()
            if (!term) return true
            return (
                orderNumber.toLowerCase().includes(term) || customerName.toLowerCase().includes(term)
            )
        },
        [search]
    )

    const filteredPayments = useMemo(
        () => (payments?.alerts || []).filter((a) => matches(a.order_number, a.customer_name)),
        [payments, matches]
    )
    const filteredDeliveries = useMemo(
        () => (deliveries?.alerts || []).filter((a) => matches(a.order_number, a.customer_name)),
        [deliveries, matches]
    )
    const filteredStagnant = useMemo(
        () => (stagnant?.alerts || []).filter((a) => matches(a.order_number, a.customer_name)),
        [stagnant, matches]
    )
    const filteredReturns = useMemo(
        () =>
            (returns?.alerts || []).filter((a) =>
                matches(a.order_number, a.customer_name) ||
                a.status_label.toLowerCase().includes(search.toLowerCase().trim())
            ),
        [returns, matches]
    )

    const handleTabChange = (value: string) => {
        setActiveTab(value as TabKey)
        setSearch("")
    }

    // ── CARD GENÉRICO DE ALERTA DE PEDIDO ──────────────────────────────────
    const renderOrderCard = (alert: OrderAlert, extra?: React.ReactNode) => (
        <div
            key={`${alert.kind}-${alert.id}`}
            onClick={() => openOrder(alert.id)}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-green transition-all cursor-pointer"
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                        #{alert.order_number} · {alert.customer_name}
                    </p>
                    <p className="text-xs text-brand-inactive-text mt-1">{alert.message}</p>
                </div>
                <Badge variant={SEVERITY_VARIANT[alert.severity] || "blue"}>
                    {KIND_LABELS[alert.kind] || alert.kind}
                </Badge>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-brand-border/60 dark:border-dark-border/60">
                <div>
                    <span className="text-brand-inactive-text">Valor: </span>
                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                        {formatCurrency(alert.total_amount)}
                    </span>
                </div>
                <div className="text-right text-brand-inactive-text">
                    {extra}
                    {extra ? " · " : ""}
                    {formatDateBr(alert.created_at)}
                </div>
            </div>
        </div>
    )

    const renderSearch = (placeholder: string) => (
        <div className="mb-3 flex items-center justify-end">
            <div className="w-64">
                <Input
                    name="search-suggestions"
                    placeholder={placeholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    variant="full-rounded"
                    prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                    label=""
                />
            </div>
        </div>
    )

    const renderList = (
        items: Array<React.ReactNode>,
        count: number,
        label: string
    ) => (
        <>
            <p className="text-xs font-semibold text-brand-inactive-text px-1 mb-2">
                {count} {label}
            </p>
            <div className="space-y-3">{items}</div>
        </>
    )

    const renderSummary = (
        group: { count: number; total_value: number; critical_count: number } | null,
        title: string,
        message: string
    ) =>
        group && group.count > 0 ? (
            <InfoCard
                title={title}
                color={group.critical_count > 0 ? "red" : "orange"}
                message={message}
            />
        ) : null

    // ── ABA PAGAMENTOS ─────────────────────────────────────────────────────
    const paymentsContent = loading && !payments ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            {renderSearch("Buscar pedido ou cliente...")}
            {renderSummary(
                payments,
                "Pagamentos",
                `${payments?.count} pedido(s) com pendência - ${formatCurrency(payments?.total_value || 0)} no total. ${payments?.critical_count} exigem atenção imediata.`
            )}
            {filteredPayments.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="Pagamentos em dia!"
                        subtitle="Nenhum pedido com pagamento pendente, recusado ou expirando."
                    />
                </div>
            ) : (
                renderList(
                    filteredPayments.map((a) =>
                        renderOrderCard(
                            a,
                            a.hours_to_expire ? `expira em ${a.hours_to_expire}h` : `há ${a.days}d`
                        )
                    ),
                    filteredPayments.length,
                    "pedido(s) com pendência de pagamento"
                )
            )}
        </div>
    )

    // ── ABA ENTREGAS ───────────────────────────────────────────────────────
    const deliveriesContent = loading && !deliveries ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            {renderSearch("Buscar pedido ou cliente...")}
            {renderSummary(
                deliveries,
                "Entregas",
                `${deliveries?.count} pedido(s) com problema de entrega - ${formatCurrency(deliveries?.total_value || 0)} em risco. ${deliveries?.critical_count} com falha de entrega.`
            )}
            {filteredDeliveries.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={TruckIcon}
                        title="Entregas sem pendências!"
                        subtitle="Nenhuma falha de entrega nem pedido pago parado sem envio."
                    />
                </div>
            ) : (
                renderList(
                    filteredDeliveries.map((a) => renderOrderCard(a, `há ${a.days}d sem mexer`)),
                    filteredDeliveries.length,
                    "pedido(s) com pendência de entrega"
                )
            )}
        </div>
    )

    // ── ABA PARADOS ────────────────────────────────────────────────────────
    const stagnantContent = loading && !stagnant ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            <div className="mb-3 flex items-center justify-between">
                <FormDropdown
                    options={PERIOD_OPTIONS}
                    value={String(stagnant?.periodDays || stagnantPeriod)}
                    setValue={(v) => setStagnantPeriod(Number(v))}
                    placeholder="Período"
                    width="w-40"
                />
                <div className="w-56">
                    <Input
                        name="search-stagnant-orders"
                        placeholder="Buscar pedido ou cliente..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        variant="full-rounded"
                        prefix={<SearchIcon size={18} className="text-brand-inactive-text shrink-0" />}
                        label=""
                    />
                </div>
            </div>
            {stagnant && stagnant.count > 0 && (
                <InfoCard
                    title="Pedidos parados"
                    color={stagnant.critical_count > 0 ? "red" : "orange"}
                    message={`${stagnant.count} pedido(s) sem movimentação há pelo menos ${stagnant.periodDays} dias - ${formatCurrency(stagnant.total_value)} parados.`}
                />
            )}
            {filteredStagnant.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={ClockIcon}
                        title="Nenhum pedido parado!"
                        subtitle={`Todos os pedidos em aberto tiveram movimentação nos últimos ${stagnant?.periodDays || stagnantPeriod} dias.`}
                    />
                </div>
            ) : (
                renderList(
                    filteredStagnant.map((a) => renderOrderCard(a, `parado há ${a.days}d`)),
                    filteredStagnant.length,
                    `pedido(s) parado(s) há mais de ${stagnant?.periodDays || stagnantPeriod} dias`
                )
            )}
        </div>
    )

    // ── ABA DEVOLUÇÕES ─────────────────────────────────────────────────────
    const returnsContent = loading && !returns ? (
        <div className="flex items-center justify-center py-16">
            <ThreeDotsLoader />
        </div>
    ) : (
        <div className="space-y-3">
            {renderSearch("Buscar pedido, cliente ou status...")}
            {renderSummary(
                returns,
                "Devoluções",
                `${returns?.count} solicitação(ões) aguardando ação - ${formatCurrency(returns?.total_value || 0)} em devoluções. ${returns?.critical_count} com SLA vencido ou escalada.`
            )}
            {filteredReturns.length === 0 ? (
                <div className="py-12">
                    <IconPlaceholder
                        icon={CheckCircleIcon}
                        title="Devoluções em dia!"
                        subtitle="Nenhuma solicitação de devolução aguardando análise."
                    />
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-brand-inactive-text px-1">
                        {filteredReturns.length} solicitação(ões) aguardando ação
                    </p>
                    {filteredReturns.map((r: ReturnAlert) => (
                        <div
                            key={r.id}
                            onClick={() => openOrder(r.order_id)}
                            className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 transition-all ${r.order_id ? "hover:border-brand-green cursor-pointer" : ""}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                        #{r.order_number} · {r.customer_name}
                                    </p>
                                    <p className="text-xs text-brand-inactive-text mt-1">{r.message}</p>
                                </div>
                                <Badge variant={SEVERITY_VARIANT[r.severity] || "blue"}>
                                    {r.status_label}
                                </Badge>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs pt-2.5 border-t border-brand-border/60 dark:border-dark-border/60">
                                <div>
                                    <span className="text-brand-inactive-text">Valor: </span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(r.total_amount)}
                                    </span>
                                </div>
                                <div className="text-right text-brand-inactive-text">
                                    solicitado em {formatDateBr(r.created_at)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )

    // ── CONTEÚDO PRINCIPAL ─────────────────────────────────────────────────
    const mainContent = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Sugestões & Oportunidades</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pb-32 relative">
                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="bg-transparent p-0 gap-3 w-full justify-start border-b border-brand-border dark:border-dark-border mb-6 overflow-x-auto hide-scrollbar">
                        <TabsTrigger value="pagamentos" className="px-0 pb-3 text-[13px] whitespace-nowrap">
                            Pagamentos ({payments?.count || 0})
                        </TabsTrigger>
                        <TabsTrigger value="entregas" className="px-0 pb-3 text-[13px] whitespace-nowrap">
                            Entregas ({deliveries?.count || 0})
                        </TabsTrigger>
                        <TabsTrigger value="parados" className="px-0 pb-3 text-[13px] whitespace-nowrap">
                            Parados ({stagnant?.count || 0})
                        </TabsTrigger>
                        <TabsTrigger value="devolucoes" className="px-0 pb-3 text-[13px] whitespace-nowrap">
                            Devoluções ({returns?.count || 0})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {loading && payments && <div className="flex justify-center py-3"><ThreeDotsLoader /></div>}

                {activeTab === "pagamentos"
                    ? paymentsContent
                    : activeTab === "entregas"
                        ? deliveriesContent
                        : activeTab === "parados"
                            ? stagnantContent
                            : returnsContent}
            </div>

            <footer className="shrink-0 border-t border-brand-border bg-white p-4 dark:border-dark-border dark:bg-dark-surface">
                <Button variant="outline" className="w-full h-11" onClick={onClose}>
                    Fechar
                </Button>
            </footer>
        </div>
    )

    if (isMobile) {
        return <BottomSheet isOpen={isOpen} onClose={onClose}>{mainContent}</BottomSheet>
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[450px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-100"}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {mainContent}
                </div>
            </div>
        </Portal>
    )
}
