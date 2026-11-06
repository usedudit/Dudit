"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    FileIcon,
    ClockIcon,
    AlertCircleIcon,
    ShieldIcon,
    ThreeDotsIcon,
    CheckCircleIcon,
    CreditCardIcon,
    CalendarIcon,
    ArrowRightIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    IconPlaceholder,
    FormSection,
    ActionsDropdown,
    DropdownItem,
    ListItem,
    SidebarCard,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { resolvePaymentMethodDetails } from "@/lib/billing/payment-method-helper"

const getStatusMeta = (status?: string | null) => {
    const s = String(status || "").toLowerCase()
    switch (s) {
        case "active":
            return { label: "Ativa", variant: "green" as const }
        case "past_due":
            return { label: "Em atraso", variant: "red" as const }
        case "cancelled":
            return { label: "Cancelada", variant: "gray" as const }
        case "trialing":
            return { label: "Trial", variant: "blue" as const }
        case "incomplete":
            return { label: "Incompleta", variant: "orange" as const }
        case "incomplete_expired":
            return { label: "Trial expirado", variant: "red" as const }
        default:
            return { label: status || "Desconhecido", variant: "gray" as const }
    }
}

const getPurchaseStatusMeta = (status?: string | null) => {
    const s = String(status || "").toLowerCase()
    switch (s) {
        case "completed":
            return { label: "Pago", variant: "green" as const }
        case "pending":
            return { label: "Pendente", variant: "orange" as const }
        case "failed":
            return { label: "Falhou", variant: "red" as const }
        case "refunded":
            return { label: "Reembolsado", variant: "purple" as const }
        case "partially_refunded":
            return { label: "Reembolso parcial", variant: "purple" as const }
        case "cancelled":
            return { label: "Cancelado", variant: "gray" as const }
        default:
            return { label: status || "Desconhecido", variant: "gray" as const }
    }
}

interface AdminSubscriptionDetailViewProps {
    detail: any
    onBack: () => void
}

export function AdminSubscriptionDetailView({ detail, onBack }: AdminSubscriptionDetailViewProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }

    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const subscription = detail
    const purchaseId = subscription?.id?.slice(0, 8) || "N/A"
    const subStatusMeta = getStatusMeta(subscription?.subscription?.status)
    const purchaseStatusMeta = getPurchaseStatusMeta(subscription?.status)

    const partner = subscription?.partner || {}
    const stores = partner.stores || []
    const hqStore = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
    const plan = subscription?.plan || {}
    const sub = subscription?.subscription || {}
    const payments = subscription?.payments || []
    const invoice = subscription?.invoice || null

    const paymentMethod = useMemo(() => {
        const firstPayment = payments[0]
        return firstPayment ? resolvePaymentMethodDetails(firstPayment, subscription) : { name: "Não informado", iconUrl: "", detailsText: "" }
    }, [payments, subscription])

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `Assinatura #${purchaseId}`,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [purchaseId, onBack, setHeaderOverride])

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link da assinatura copiado!")
    }, [])

    if (!subscription) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={FileIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Assinatura não encontrada"
                    subtitle="A assinatura pode ter sido removida ou o link está incorreto."
                    itemButton={{
                        text: "Voltar para lista",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    return (
        <>
            <FadeIn>
                <div className="flex flex-col bg-white dark:bg-dark-background min-h-screen">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
                        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-20 md:pb-0">

                            {/* Sticky Header */}
                            <div className="sticky top-0 z-30 w-full max-w-[1300px] mx-auto bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
                                <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                                    {/* Back button - desktop only */}
                                    <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                                        <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                                            <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                        </Button>
                                    </div>

                                    {/* Title row - desktop */}
                                    <div className="hidden md:flex items-start justify-between md:py-0 md:mb-0">
                                        <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                                            <h1 className={`font-bold transition-all duration-500 ease-in-out flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                                                <span className="hidden md:inline truncate">Assinatura #{purchaseId}</span>
                                                <Badge variant={subStatusMeta.variant}>
                                                    {subStatusMeta.label}
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Plano: {plan.name || "N/A"} - {formatCurrency(plan.price || subscription.total_amount || subscription.amount || 0)}/{plan.interval === "month" ? "mês" : "período"}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-3">
                                            <ActionsDropdown>
                                                <DropdownItem onClick={handleShare}>
                                                    <ShareIcon size={16} /> Compartilhar
                                                </DropdownItem>
                                            </ActionsDropdown>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Visão Geral</TabsTrigger>
                                            <TabsTrigger value="payments">Pagamentos</TabsTrigger>
                                            <TabsTrigger value="invoices">Faturas</TabsTrigger>
                                            <TabsTrigger value="parties">Loja & Parceiro</TabsTrigger>
                                            <TabsTrigger value="timeline">Timeline</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* --- TAB 1: VISÃO GERAL --- */}
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Informações da Assinatura" hasSeparator>
                                                        <div className="space-y-3 text-sm">
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Plano</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{plan.name || "N/A"}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Status</p>
                                                                    <div className="mt-1">
                                                                        <Badge variant={subStatusMeta.variant}>{subStatusMeta.label}</Badge>
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Intervalo</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">{plan.interval || "month"}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Preço</p>
                                                                    <p className="text-sm font-bold text-brand-green">{formatCurrency(plan.price || 0)}/{plan.interval === "month" ? "mês" : "ano"}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Início do período</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{sub.current_period_start ? formatDate(sub.current_period_start) : "—"}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Fim do período</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{sub.current_period_end ? formatDate(sub.current_period_end) : "—"}</p>
                                                                </div>
                                                                {sub.trial_end && (
                                                                    <div>
                                                                        <p className="text-brand-inactive-text font-medium">Fim do Trial</p>
                                                                        <p className="text-sm font-bold text-brand-blue">{formatDate(sub.trial_end)}</p>
                                                                    </div>
                                                                )}
                                                                {sub.cancel_at_period_end && (
                                                                    <div>
                                                                        <p className="text-brand-inactive-text font-medium">Cancelar no fim</p>
                                                                        <Badge variant="orange" className="mt-1">Sim</Badge>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Gateway</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading capitalize">{subscription.gateway || "mercado_pago"}</p>
                                                                </div>
                                                                {subscription.gateway_payment_id && (
                                                                    <div>
                                                                        <p className="text-brand-inactive-text font-medium">ID Gateway</p>
                                                                        <p className="text-sm font-mono text-xs text-brand-dark dark:text-dark-heading truncate max-w-[180px]">{subscription.gateway_payment_id}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </FormSection>

                                                    <FormSection title="Compra Vinculada (Última Fatura)" hasSeparator>
                                                        <div className="space-y-3 text-sm">
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Status da Compra</p>
                                                                    <div className="mt-1">
                                                                        <Badge variant={purchaseStatusMeta.variant}>{purchaseStatusMeta.label}</Badge>
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Valor</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(subscription.total_amount || subscription.amount || 0)}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Data da Compra</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatDate(subscription.created_at)}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-brand-inactive-text font-medium">Tipo</p>
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Assinatura</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Status & Próxima Cobrança */}
                                                    <SidebarCard hasTopStrip hasSeparator title="Próxima Cobrança">
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Status</span>
                                                                <Badge variant={subStatusMeta.variant}>{subStatusMeta.label}</Badge>
                                                            </div>
                                                            {sub.current_period_end && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Data</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDate(sub.current_period_end)}</span>
                                                                </div>
                                                            )}
                                                            {sub.current_period_end && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Valor</span>
                                                                    <span className="font-bold text-brand-green">{formatCurrency(plan.price || subscription.total_amount || subscription.amount || 0)}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between text-brand-inactive-text pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span>Método de Pagamento</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                                                    {paymentMethod.iconUrl && <img src={paymentMethod.iconUrl} alt={paymentMethod.name} className="w-4 h-4 object-contain shrink-0" />}
                                                                    <span>{paymentMethod.name}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>

                                                    {/* Plano */}
                                                    <SidebarCard hasTopStrip hasSeparator title="Plano">
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Nome</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{plan.name || "—"}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Slug</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading">{plan.slug || "—"}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Preço</span>
                                                                <span className="font-bold text-brand-green">{formatCurrency(plan.price || 0)}/{plan.interval === "month" ? "mês" : "ano"}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Intervalo</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">{plan.interval || "month"}</span>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>

                                                    {/* Assinatura Mercado Pago */}
                                                    {sub.mercado_pago_subscription_id && (
                                                        <SidebarCard hasTopStrip hasSeparator title="Mercado Pago">
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>ID Subscription</span>
                                                                    <span className="font-mono text-xs text-brand-dark dark:text-dark-heading truncate max-w-[140px]">{sub.mercado_pago_subscription_id}</span>
                                                                </div>
                                                            </div>
                                                        </SidebarCard>
                                                    )}

                                                    <SidebarCard hasTopStrip hasSeparator title="Protocolo">
                                                        <p className="text-xs text-brand-inactive-text">{subscription.id?.slice(0, 8)?.toUpperCase() || "—"}</p>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 2: PAGAMENTOS --- */}
                                    <TabsContent value="payments" className="mt-0">
                                        <FadeIn key="payments">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title={`Pagamentos (${payments.length})`} hasSeparator>
                                                        {payments.length === 0 ? (
                                                            <IconPlaceholder
                                                                icon={CreditCardIcon}
                                                                containerSize="w-14 h-14 mb-2"
                                                                iconSize="w-6 h-6"
                                                                title="Nenhum pagamento registrado"
                                                                subtitle="Esta assinatura não possui pagamentos vinculados."
                                                            />
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {payments.map((payment: any) => {
                                                                    const pm = resolvePaymentMethodDetails(payment, subscription)
                                                                    const paymentStatusMeta = (() => {
                                                                        const s = String(payment.status || "").toLowerCase()
                                                                        switch (s) {
                                                                            case "approved": return { label: "Aprovado", variant: "green" as const }
                                                                            case "pending": return { label: "Pendente", variant: "orange" as const }
                                                                            case "processing": return { label: "Processando", variant: "blue" as const }
                                                                            case "rejected": return { label: "Recusado", variant: "red" as const }
                                                                            case "refunded": return { label: "Reembolsado", variant: "purple" as const }
                                                                            case "cancelled": return { label: "Cancelado", variant: "gray" as const }
                                                                            case "chargeback": return { label: "Chargeback", variant: "red" as const }
                                                                            default: return { label: payment.status, variant: "gray" as const }
                                                                        }
                                                                    })()

                                                                    return (
                                                                        <div key={payment.id} className="p-4 bg-brand-gray/30 dark:bg-dark-border/20 rounded-xl border border-brand-border dark:border-dark-border">
                                                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                                        {pm.iconUrl ? (
                                                                                            <img src={pm.iconUrl} alt={pm.name} className="w-6 h-6 object-contain" />
                                                                                        ) : (
                                                                                            <CreditCardIcon className="w-5 h-5 text-brand-inactive-text" />
                                                                                        )}
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="font-medium text-brand-dark dark:text-dark-heading">{pm.name}</p>
                                                                                        <p className="text-xs text-brand-inactive-text">{pm.detailsText || payment.payment_method_type || "Não informado"}</p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-4 text-sm">
                                                                                    <Badge variant={paymentStatusMeta.variant}>{paymentStatusMeta.label}</Badge>
                                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(payment.amount || 0)}</span>
                                                                                    {payment.paid_at && <span className="text-xs text-brand-inactive-text">{formatDateTime(payment.paid_at)}</span>}
                                                                                </div>
                                                                            </div>
                                                                            {payment.gateway_payment_id && (
                                                                                <p className="mt-2 text-xs text-brand-inactive-text font-mono">ID Gateway: {payment.gateway_payment_id}</p>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </FormSection>
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <SidebarCard hasTopStrip hasSeparator title="Resumo dos Pagamentos">
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Total</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{payments.length}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Aprovados</span>
                                                                <span className="font-bold text-brand-green">{payments.filter((p: any) => p.status === "approved").length}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Pendentes</span>
                                                                <span className="font-bold text-brand-orange">{payments.filter((p: any) => p.status === "pending").length}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Falhos</span>
                                                                <span className="font-bold text-brand-red">{payments.filter((p: any) => ["failed", "rejected"].includes(p.status)).length}</span>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 3: FATURAS --- */}
                                    <TabsContent value="invoices" className="mt-0">
                                        <FadeIn key="invoices">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Faturas" hasSeparator>
                                                        {invoice ? (
                                                            <div className="space-y-3">
                                                                <div className="p-4 bg-brand-gray/30 dark:bg-dark-border/20 rounded-xl border border-brand-border dark:border-dark-border">
                                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                                        <div>
                                                                            <p className="font-medium text-brand-dark dark:text-dark-heading">Fatura #{invoice.invoice_number}</p>
                                                                            <p className="text-xs text-brand-inactive-text">Status: {invoice.status}</p>
                                                                        </div>
                                                                        <div className="flex items-center gap-4 text-sm">
                                                                            <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(invoice.invoice_data?.total_amount || subscription.total_amount || subscription.amount || 0)}</span>
                                                                            <Button variant="outline" size="sm" leftIcon={<FileIcon size={14} />}>Ver Fatura</Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <IconPlaceholder
                                                                icon={FileIcon}
                                                                containerSize="w-14 h-14 mb-2"
                                                                iconSize="w-6 h-6"
                                                                title="Nenhuma fatura gerada"
                                                                subtitle="A fatura será gerada automaticamente no próximo ciclo de cobrança."
                                                            />
                                                        )}
                                                    </FormSection>

                                                    <FormSection title="Histórico de Compras (Faturas Anteriores)" hasSeparator>
                                                        <p className="text-sm text-brand-inactive-text">As faturas anteriores desta assinatura aparecem na aba <strong>Compras</strong> filtrando por tipo "Assinatura" e parceiro.</p>
                                                    </FormSection>
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <SidebarCard hasTopStrip hasSeparator title="Fatura Atual">
                                                        {invoice ? (
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Número</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{invoice.invoice_number}</span>
                                                                </div>
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Status</span>
                                                                    <Badge variant={invoice.status === "paid" ? "green" : invoice.status === "pending" ? "orange" : "red"}>{invoice.status}</Badge>
                                                                </div>
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Valor</span>
                                                                    <span className="font-bold text-brand-green">{formatCurrency(invoice.invoice_data?.total_amount || subscription.total_amount || subscription.amount || 0)}</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-brand-inactive-text">Nenhuma fatura gerada ainda</p>
                                                        )}
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 4: LOJA & PARCEIRO --- */}
                                    <TabsContent value="parties" className="mt-0">
                                        <FadeIn key="parties">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Dados da Loja / Parceiro" hasSeparator>
                                                        <AdminStoreCard
                                                            store={hqStore}
                                                            fallbackStoreId={subscription.partner_id}
                                                        />
                                                    </FormSection>
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <SidebarCard hasTopStrip hasSeparator title="Resumo do Parceiro">
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>ID Parceiro</span>
                                                                <span className="font-mono text-xs text-brand-dark dark:text-dark-heading">{subscription.partner_id?.slice(0, 12)}...</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Lojas</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{stores.length}</span>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 5: TIMELINE --- */}
                                    <TabsContent value="timeline" className="mt-0">
                                        <FadeIn key="timeline">
                                            <FormSection title="Histórico de Eventos" hasSeparator>
                                                <div className="space-y-4">
                                                    <div className="flex items-start gap-3 border-l-2 border-brand-green dark:border-brand-green pl-4 py-1">
                                                        <div className="w-2 h-2 mt-2 rounded-full bg-brand-green flex-shrink-0" />
                                                        <div className="flex-1">
                                                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Assinatura criada</p>
                                                            <p className="text-xs text-brand-inactive-text">{formatDateTime(subscription.created_at)}</p>
                                                        </div>
                                                    </div>
                                                    {payments.map((payment: any) => payment.paid_at && (
                                                        <div key={payment.id} className="flex items-start gap-3 border-l-2 border-brand-blue dark:border-brand-blue pl-4 py-1">
                                                            <div className="w-2 h-2 mt-2 rounded-full bg-brand-blue flex-shrink-0" />
                                                            <div className="flex-1">
                                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                    Pagamento {payment.status === "approved" ? "aprovado" : payment.status === "pending" ? "pendente" : payment.status}
                                                                </p>
                                                                <p className="text-xs text-brand-inactive-text">{formatCurrency(payment.amount)} - {formatDateTime(payment.paid_at)}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {invoice && (
                                                        <div className="flex items-start gap-3 border-l-2 border-brand-purple dark:border-brand-purple pl-4 py-1">
                                                            <div className="w-2 h-2 mt-2 rounded-full bg-brand-purple flex-shrink-0" />
                                                            <div className="flex-1">
                                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Fatura gerada: {invoice.invoice_number}</p>
                                                                <p className="text-xs text-brand-inactive-text">Status: {invoice.status}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {sub.cancel_at_period_end && (
                                                        <div className="flex items-start gap-3 border-l-2 border-brand-orange dark:border-brand-orange pl-4 py-1">
                                                            <div className="w-2 h-2 mt-2 rounded-full bg-brand-orange flex-shrink-0" />
                                                            <div className="flex-1">
                                                                <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Agendado cancelamento no fim do período</p>
                                                                <p className="text-xs text-brand-inactive-text">A assinatura não será renovada após {sub.current_period_end ? formatDate(sub.current_period_end) : "fim do período"}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </FadeIn>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
                <div className="flex-1">
                    <ActionsDropdown fullWidth trigger={
                        <Button variant="outline" className="w-full h-12">
                            <ThreeDotsIcon size={18} className="text-brand-inactive-text" />
                        </Button>
                    }>
                        <DropdownItem onClick={handleShare}>
                            <ShareIcon size={16} /> Compartilhar
                        </DropdownItem>
                    </ActionsDropdown>
                </div>
            </div>
        </>
    )
}

export default AdminSubscriptionDetailView