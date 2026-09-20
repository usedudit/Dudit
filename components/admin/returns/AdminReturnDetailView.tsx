"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    PackageIcon,
    FileIcon,
    ClockIcon,
    AlertCircleIcon,
    UserIcon,
    ThreeDotsIcon,
} from "@/lib/icons"
import {
    Button,
    Badge,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
    IconPlaceholder,
    ActionsDropdown,
    DropdownItem,
    SidebarCard,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard"

const formatReturnReasonLabel = (rawReason?: string | null): string => {
    if (!rawReason) return "Não informado"
    const r = String(rawReason).trim().toLowerCase()

    const labels: Record<string, string> = {
        defective: "Defeituoso / Danificado",
        wrong_item: "Item Errado",
        wrong_size: "Tamanho Errado / Incompatível",
        regret: "Desistência / Arrependimento",
        not_as_described: "Diferente do Anúncio",
        delayed: "Atraso na Entrega",
        other: "Outro Motivo",
        outro: "Outro Motivo",
        defeito: "Defeituoso / Danificado",
        item_errado: "Item Errado",
        "item errado": "Item Errado",
        "recebi item errado": "Item Errado",
        arrependimento: "Desistência / Arrependimento",
        tamanho: "Tamanho Errado / Incompatível",
    }

    if (labels[r]) return labels[r]

    return r
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatReturnConditionLabel = (rawCondition?: string | null): string => {
    if (!rawCondition) return "Padrão"
    const c = String(rawCondition).trim().toLowerCase()
    if (c === "sealed" || c === "lacrado") return "Lacrado"
    if (c === "damaged" || c === "danificado") return "Danificado"
    if (c === "opened" || c === "aberto") return "Aberto"
    if (c === "unopened") return "Não aberto"
    return c.charAt(0).toUpperCase() + c.slice(1)
}

const formatReturnResolutionLabel = (raw?: string | null): string => {
    if (!raw) return "Reembolso"
    const r = String(raw).trim().toLowerCase()
    const labels: Record<string, string> = {
        refund: "Reembolso",
        exchange: "Troca",
        store_credit: "Crédito em Loja",
        storecredit: "Crédito em Loja",
        replacement: "Substituição",
        cancellation: "Cancelamento",
        reembolso: "Reembolso",
        troca: "Troca",
    }
    return labels[r] || r.charAt(0).toUpperCase() + r.slice(1)
}

const getReturnStatusMeta = (status?: string | null) => {
    const s = String(status || "").toUpperCase()
    switch (s) {
        case "PENDING_REVIEW":
        case "PENDING":
            return { label: "Pendente", variant: "orange" as const }
        case "UNDER_ANALYSIS":
        case "IN_ANALYSIS":
            return { label: "Em análise", variant: "blue" as const }
        case "WAITING_CUSTOMER":
            return { label: "Aguardando cliente", variant: "purple" as const }
        case "WAITING_ITEM_RETURN":
            return { label: "Aguardando devolução", variant: "purple" as const }
        case "APPROVED":
        case "COMPLETED":
            return { label: "Aprovada", variant: "green" as const }
        case "REJECTED":
            return { label: "Recusada", variant: "red" as const }
        case "PROCESSING":
            return { label: "Processando", variant: "blue" as const }
        case "RESOLVED":
            return { label: "Concluída", variant: "green" as const }
        case "EXPIRED":
            return { label: "Expirada", variant: "red" as const }
        case "ESCALATED":
            return { label: "Escalada", variant: "red" as const }
        default:
            return { label: s || "Pendente", variant: "orange" as const }
    }
}

const formatRequestTypeLabel = (raw?: string | null): string => {
    const r = String(raw || "").trim().toLowerCase()
    if (r === "exchange" || r === "troca") return "Troca"
    if (r === "refund" || r === "return" || r === "devolução" || r === "devolucao") return "Devolução"
    return r ? r.charAt(0).toUpperCase() + r.slice(1) : "Devolução"
}

const formatEligibilityLabel = (raw?: string | null) => {
    if (!raw) return "Válido"
    const r = String(raw).trim().toLowerCase()
    const labels: Record<string, string> = {
        eligible: "Válido",
        valid: "Válido",
        valid_eligible: "Válido",
        not_eligible: "Não elegível",
        ineligible: "Não elegível",
        expired: "Expirado",
        under_review: "Em análise",
        pending: "Em análise",
    }
    return labels[r] || r.charAt(0).toUpperCase() + r.slice(1)
}

const formatSenderRoleLabel = (raw?: string | null) => {
    const r = String(raw || "").trim().toLowerCase()
    const labels: Record<string, string> = {
        admin: "Administrador",
        seller: "Loja",
        merchant: "Loja",
        store: "Loja",
        partner: "Loja",
        customer: "Cliente",
        buyer: "Cliente",
        user: "Usuário",
        support: "Suporte",
        system: "Sistema",
    }
    return labels[r] || (r ? r.charAt(0).toUpperCase() + r.slice(1) : "Usuário")
}

const formatRiskSourceLabel = (raw?: string | null) => {
    const r = String(raw || "").trim().toLowerCase()
    const labels: Record<string, string> = {
        chargeback: "Chargeback",
        fraud: "Fraude",
        manual: "Manual",
        moderation: "Moderação",
        return: "Devolução",
        order: "Pedido",
    }
    return labels[r] || (r ? r.replace(/_/g, " ") : "Geral")
}

interface AdminReturnDetailViewProps {
    detail: any
    onBack: () => void
}

export function AdminReturnDetailView({ detail, onBack }: AdminReturnDetailViewProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Header override for mobile back button
    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }

    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const request = detail?.request || detail
    const riskEvents = detail?.riskEvents || []
    const moderationActions = detail?.moderationActions || []
    const relatedReports = detail?.relatedReports || []

    const returnId = request?.id?.slice(0, 8) || "N/A"
    const statusMeta = getReturnStatusMeta(request?.status)

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `Solicitação #${returnId}`,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [returnId, onBack, setHeaderOverride])

    const items = Array.isArray(request?.return_items) ? request.return_items : []
    const evidence = Array.isArray(request?.return_evidence) ? request.return_evidence : []
    const messages = Array.isArray(request?.return_messages) ? request.return_messages : []
    const events = Array.isArray(request?.auditLogs) ? request.auditLogs : []
    const store = request?.stores || {}

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link da solicitação copiado!")
    }, [])

    if (!request) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={PackageIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Solicitação não encontrada"
                    subtitle="A solicitação pode ter sido removida ou o link está incorreto."
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
                                                <span className="hidden md:inline truncate">Solicitação #{returnId}</span>
                                                <Badge variant={statusMeta.variant}>
                                                    {statusMeta.label}
                                                </Badge>
                                                <Badge variant="blue">
                                                    {formatRequestTypeLabel(request?.request_type)}
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Criado em {formatDateTime(request?.created_at)} • Pedido: #{request?.order_number_snapshot || request?.orders?.order_number || "-"}
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
                                            <TabsTrigger value="general">Geral & Itens</TabsTrigger>
                                            <TabsTrigger value="parties">Comprador & Loja</TabsTrigger>
                                            <TabsTrigger value="evidence">Evidências & Mensagens ({evidence.length + messages.length})</TabsTrigger>
                                            <TabsTrigger value="timeline">Timeline ({events.length})</TabsTrigger>
                                            <TabsTrigger value="risk">Risco & Auditoria ({riskEvents.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title={`Itens da Solicitação (${items.length})`} hasSeparator>
                                                        {items.length === 0 ? (
                                                            <IconPlaceholder
                                                                icon={PackageIcon}
                                                                containerSize="w-14 h-14 mb-2"
                                                                iconSize="w-6 h-6"
                                                                title="Nenhum item especificado"
                                                                subtitle="Esta solicitação não possui itens vinculados."
                                                            />
                                                        ) : (
                                                            <div className="space-y-4">
                                                                {items.map((item: any) => (
                                                                    <div key={item.id} className="flex items-start gap-4">
                                                                        <div className="w-12 h-12 overflow-hidden shrink-0 rounded-xl border border-brand-border dark:border-dark-border flex items-center justify-center">
                                                                            <IconPlaceholder
                                                                                icon={PackageIcon}
                                                                                containerSize="w-12 h-12"
                                                                                iconSize="w-6 h-6"
                                                                            />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex justify-between items-start gap-2">
                                                                                <div className="min-w-0 flex flex-col">
                                                                                    <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                                        {item.product_name_snapshot || "Produto"}
                                                                                    </h4>
                                                                                    <span className="text-xs text-brand-inactive-text mt-0.5">
                                                                                        Qtd: <strong>{item.quantity || 1}</strong> • Condição: {formatReturnConditionLabel(item.condition)}
                                                                                    </span>
                                                                                    {item.reason && (
                                                                                        <span className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                                                                                            Motivo: {formatReturnReasonLabel(item.reason)}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading shrink-0">
                                                                                    {formatCurrency(Number(item.net_item_value_snapshot || 0))}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </FormSection>

                                                    <FormSection title="Motivo informado pelo cliente" hasSeparator>
                                                        <div className="text-sm text-brand-dark dark:text-dark-heading bg-brand-gray/50 dark:bg-dark-border/30 p-4 rounded-xl">
                                                            {request?.customer_reason || request?.customer_details || "Nenhum detalhe adicional fornecido."}
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <SidebarCard hasTopStrip hasSeparator title="Resolução & Valores">
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Resolução Desejada</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-right">
                                                                    {formatReturnResolutionLabel(request?.desired_resolution || request?.approved_resolution || request?.resolution_type)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Reembolso solicitado</span>
                                                                <span className="font-bold text-brand-green">
                                                                    {formatCurrency(Number(request?.refund_amount || 0))}
                                                                </span>
                                                            </div>
                                                            {Number(request?.store_credit_amount || 0) > 0 && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Crédito em Loja</span>
                                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                        {formatCurrency(Number(request.store_credit_amount))}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between text-brand-inactive-text pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span>Elegibilidade</span>
                                                                <Badge variant="gray">{formatEligibilityLabel(request?.eligibility_status)}</Badge>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>

                                                    {request?.order_id && (
                                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                                                Pedido Vinculado
                                                            </h3>
                                                            <p className="text-xs text-brand-inactive-text">
                                                                Número: #{request?.order_number_snapshot || request?.orders?.order_number || "-"}
                                                            </p>
                                                            <Link
                                                                href={`/ddt-admin/orders?view=${request.order_id}`}
                                                                className="inline-block text-xs font-bold text-brand-green hover:underline mt-2"
                                                            >
                                                                Ver pedido completo →
                                                            </Link>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="parties" className="mt-0">
                                        <FadeIn key="parties">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <AdminBuyerCard
                                                        buyer={{
                                                            full_name: request?.customer_name_snapshot,
                                                        }}
                                                        buyerId={request?.customer_id}
                                                        customerName={request?.customer_name_snapshot}
                                                    />
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <AdminStoreCard
                                                        store={store}
                                                        fallbackStoreId={request?.store_id || request?.partner_id}
                                                    />
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="evidence" className="mt-0">
                                        <FadeIn key="evidence">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title={`Arquivos e Evidências Fotográficas (${evidence.length})`} hasSeparator>
                                                        {evidence.length === 0 ? (
                                                            <IconPlaceholder
                                                                icon={FileIcon}
                                                                containerSize="w-14 h-14 mb-2"
                                                                iconSize="w-6 h-6"
                                                                title="Nenhuma evidência anexada"
                                                                subtitle="O cliente não enviou arquivos para esta solicitação."
                                                            />
                                                        ) : (
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                                                {evidence.map((ev: any) => (
                                                                    <a
                                                                        key={ev.id}
                                                                        href={getR2ImageUrl(ev.file_url)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="group rounded-xl border border-brand-border dark:border-dark-border overflow-hidden bg-brand-gray dark:bg-dark-border/20 flex flex-col hover:border-brand-dark/30 transition-colors"
                                                                    >
                                                                        <div className="aspect-square flex items-center justify-center overflow-hidden">
                                                                            {ev.file_type?.startsWith("image") ? (
                                                                                <img src={getR2ImageUrl(ev.file_url)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                            ) : (
                                                                                <FileIcon className="w-8 h-8 text-brand-inactive-text" />
                                                                            )}
                                                                        </div>
                                                                        <div className="p-2 text-xs truncate font-medium text-brand-dark dark:text-dark-heading">
                                                                            {ev.file_name || "Evidência"}
                                                                        </div>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </FormSection>
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <FormSection title={`Mensagens Trocadas (${messages.length})`}>
                                                        {messages.length === 0 ? (
                                                            <IconPlaceholder
                                                                icon={UserIcon}
                                                                containerSize="w-14 h-14 mb-2"
                                                                iconSize="w-6 h-6"
                                                                title="Nenhuma mensagem registrada"
                                                                subtitle="Não há conversa registrada para esta solicitação."
                                                            />
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {messages.map((m: any) => (
                                                                    <div key={m.id} className="p-3.5 bg-brand-gray dark:bg-dark-border/30 rounded-xl space-y-1">
                                                                        <div className="flex justify-between text-xs text-brand-inactive-text">
                                                                            <span className="font-bold">{formatSenderRoleLabel(m.sender_role)}</span>
                                                                            <span>{formatDateTime(m.created_at)}</span>
                                                                        </div>
                                                                        <p className="text-sm text-brand-dark dark:text-dark-heading">{m.message}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </FormSection>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="timeline" className="mt-0">
                                        <FadeIn key="timeline">
                                            <FormSection title="Histórico de Eventos" hasSeparator>
                                                {events.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ClockIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum evento registrado"
                                                        subtitle="Esta solicitação ainda não possui eventos no histórico."
                                                    />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {events.map((ev: any) => (
                                                            <div key={ev.id} className="flex items-start gap-3 border-l-2 border-brand-border dark:border-dark-border pl-4 py-1">
                                                                <div className="flex-1">
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                        {ev.message || ev.event_type}
                                                                    </p>
                                                                    <p className="text-xs text-brand-inactive-text">{formatDateTime(ev.created_at)}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </FormSection>
                                        </FadeIn>
                                    </TabsContent>

                                    <TabsContent value="risk" className="mt-0">
                                        <FadeIn key="risk">
                                            <FormSection title="Eventos de Risco & Moderação" hasSeparator>
                                                {riskEvents.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={AlertCircleIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum evento de risco associado"
                                                        subtitle="Não há eventos de risco registrados para esta solicitação."
                                                    />
                                                ) : (
                                                    <div className="space-y-2">
                                                        {riskEvents.map((e: any) => (
                                                            <div key={e.id} className="p-3 bg-red-50 dark:bg-red-950/20 rounded-xl text-sm flex justify-between items-center">
                                                                <span>+{e.points} pontos ({formatRiskSourceLabel(e.source_type)})</span>
                                                                <span className="text-xs text-brand-inactive-text">{formatDate(e.created_at)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
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
                    <ActionsDropdown trigger={
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

export default AdminReturnDetailView