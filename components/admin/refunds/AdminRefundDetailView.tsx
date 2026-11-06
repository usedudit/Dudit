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
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard"
import { AdminRefundReviewModal } from "@/components/admin/AdminRefundReviewModal"
import { resolvePaymentMethodDetails } from "@/lib/billing/payment-method-helper"

function formatFileSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return ""
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

interface RefundAttachmentItem {
    url: string
    name: string
    size?: number
    key?: string
}

function normalizeAttachments(raw: any, fallbackPrefix: string): RefundAttachmentItem[] {
    if (!raw) return []
    let items = raw
    if (typeof raw === "string") {
        try {
            items = JSON.parse(raw)
        } catch {
            return []
        }
    }
    if (!Array.isArray(items)) return []
    return items.map((item, idx) => {
        if (typeof item === "string") {
            const rawFileName = item.split("/").pop()?.split("?")[0] || `${fallbackPrefix} ${idx + 1}`
            const name = decodeURIComponent(rawFileName)
            return { url: item, name }
        }
        if (item && typeof item === "object") {
            const rawFileName = item.url ? item.url.split("/").pop()?.split("?")[0] : `${fallbackPrefix} ${idx + 1}`
            const name = item.name || decodeURIComponent(rawFileName || `${fallbackPrefix} ${idx + 1}`)
            return {
                url: item.url || "",
                name,
                size: typeof item.size === "number" ? item.size : undefined,
                key: item.key,
            }
        }
        return { url: String(item), name: `${fallbackPrefix} ${idx + 1}` }
    }).filter(item => Boolean(item.url))
}

const getReasonLabel = (cat: string) => {
    switch (cat) {
        case "repentance_7_days":
            return "Direito de Arrependimento (CDC Art. 49)"
        case "double_charge":
            return "Cobranca duplicada ou indevida"
        case "technical_issue":
            return "Dificuldade tecnica ou indisponibilidade"
        case "commercial_agreement":
            return "Acordo comercial / Alteracao de plano"
        case "unsatisfied":
            return "Insatisfacao com recursos"
        default:
            return "Outro motivo"
    }
}

const getStatusMeta = (status?: string | null) => {
    const s = String(status || "").toLowerCase()
    switch (s) {
        case "approved":
            return { label: "Estornado", variant: "green" as const }
        case "rejected":
            return { label: "Recusado", variant: "red" as const }
        case "under_review":
            return { label: "Em Analise", variant: "blue" as const }
        case "cancelled":
            return { label: "Cancelado", variant: "gray" as const }
        default:
            return { label: "Pendente", variant: "orange" as const }
    }
}

interface AdminRefundDetailViewProps {
    detail: any
    onBack: () => void
}

export function AdminRefundDetailView({ detail, onBack }: AdminRefundDetailViewProps) {
    const [activeTab, setActiveTab] = useState("general")
    const [isScrolled, setIsScrolled] = useState(false)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    let sidebarContext: ReturnType<typeof useSidebar> | null = null
    try {
        sidebarContext = useSidebar()
    } catch { }

    const setHeaderOverride = sidebarContext?.setHeaderOverride

    const handleScroll = useCallback(() => {
        setIsScrolled((scrollRef.current?.scrollTop || 0) > 20)
    }, [])

    const refund = detail?.refund || detail
    const events = detail?.events || []

    const refundId = refund?.id?.slice(0, 8) || "N/A"
    const statusMeta = getStatusMeta(refund?.status)

    const partner = refund?.partner || {}
    const stores = partner.stores || []
    const hqStore = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
    const purchase = refund?.purchase || {}
    const plan = purchase.plan || {}
    const subscription = refund?.subscription || {}
    const payment = refund?.payment || {}

    const parsedImages = useMemo(() => normalizeAttachments(refund?.images, "Evidência"), [refund?.images])
    const parsedDocs = useMemo(() => normalizeAttachments(refund?.documents, "Documento"), [refund?.documents])
    const paymentMethod = useMemo(() => resolvePaymentMethodDetails(payment, purchase), [payment, purchase])

    useEffect(() => {
        if (!setHeaderOverride) return
        setHeaderOverride({
            title: `Solicitacao #${refundId}`,
            onBack,
            isSubPage: true,
        })
        return () => setHeaderOverride(null)
    }, [refundId, onBack, setHeaderOverride])

    const handleShare = useCallback(() => {
        navigator.clipboard.writeText(window.location.href)
        toast.success("Link da solicitacao copiado!")
    }, [])

    if (!refund) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={FileIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Solicitacao nao encontrada"
                    subtitle="A solicitacao pode ter sido removida ou o link esta incorreto."
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
                                                <span className="hidden md:inline truncate">Solicitacao #{refundId}</span>
                                                <Badge variant={statusMeta.variant}>
                                                    {statusMeta.label}
                                                </Badge>
                                            </h1>

                                            <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                                                Criado em {formatDateTime(refund?.created_at)} - Valor: {formatCurrency(refund.amount)}
                                            </div>
                                        </div>

                                        {/* Desktop action buttons */}
                                        <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-3">
                                            <ActionsDropdown>
                                                <DropdownItem onClick={handleShare}>
                                                    <ShareIcon size={16} /> Compartilhar
                                                </DropdownItem>
                                                {(refund.status === "pending" || refund.status === "under_review") && (
                                                    <DropdownItem onClick={() => setShowReviewModal(true)}>
                                                        <CheckCircleIcon size={16} className="text-brand-green" /> Julgar Solicitacao
                                                    </DropdownItem>
                                                )}
                                            </ActionsDropdown>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados Gerais</TabsTrigger>
                                            <TabsTrigger value="parties">Loja & Comprador</TabsTrigger>
                                            <TabsTrigger value="attachments" className="flex items-center gap-2">
                                                <span>Anexos</span>
                                                {(parsedImages.length + parsedDocs.length) > 0 && (
                                                    <Badge variant="green" className="px-1.5 py-0.2 text-[10px]">
                                                        {parsedImages.length + parsedDocs.length}
                                                    </Badge>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="timeline">Timeline ({events.length})</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
                                <Tabs value={activeTab} onValueChange={setActiveTab}>
                                    {/* --- TAB 1: DADOS GERAIS --- */}
                                    <TabsContent value="general" className="mt-0">
                                        <FadeIn key="general">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Justificativa do Lojista" hasSeparator>
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-brand-inactive-text font-medium">
                                                                    Motivo: <strong className="text-brand-dark dark:text-dark-heading">{getReasonLabel(refund.reason_category)}</strong>
                                                                </span>
                                                                <span className="text-brand-inactive-text">
                                                                    Solicitado em: {formatDate(refund.requested_at || refund.created_at)}
                                                                </span>
                                                            </div>
                                                            <div className="p-4 bg-brand-gray/60 dark:bg-dark-border/20 rounded-xl text-sm text-gray-800 dark:text-dark-body border border-brand-border/60">
                                                                {refund.reason_description}
                                                            </div>
                                                        </div>
                                                    </FormSection>

                                                    {refund.admin_response && (
                                                        <FormSection title="Resposta do Administrador" hasSeparator>
                                                            <div className="p-4 bg-brand-gray/60 dark:bg-dark-border/20 rounded-xl text-sm text-gray-800 dark:text-dark-body border border-brand-border/60">
                                                                {refund.admin_response}
                                                            </div>
                                                        </FormSection>
                                                    )}
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    {/* Status & Valores */}
                                                    <SidebarCard hasTopStrip hasSeparator title="Status & Valores">
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Status</span>
                                                                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Valor Solicitado</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                    {formatCurrency(refund.amount)}
                                                                </span>
                                                            </div>
                                                            {refund.refunded_amount && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Valor Estornado</span>
                                                                    <span className="font-bold text-brand-green">
                                                                        {formatCurrency(refund.refunded_amount)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between text-brand-inactive-text pt-2 border-t border-brand-border dark:border-dark-border">
                                                                <span>Garantia CDC (7d)</span>
                                                                {refund.is_within_7_days ? (
                                                                    <Badge variant="green" className="flex items-center gap-1">
                                                                        <ShieldIcon size={12} />
                                                                        <span>Dentro do prazo</span>
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="orange" className="flex items-center gap-1">
                                                                        <AlertCircleIcon size={12} />
                                                                        <span>Fora do prazo</span>
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </SidebarCard>

                                                    {/* Compra Vinculada */}
                                                    <SidebarCard hasTopStrip hasSeparator title="Compra Vinculada">
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Plano</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                                    {plan.name || "N/A"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Tipo</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                    {purchase.purchase_type || "-"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-brand-inactive-text">
                                                                <span>Forma de Pagamento</span>
                                                                <span className="font-medium text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                                                    <img src={paymentMethod.iconUrl} alt={paymentMethod.name} className="w-4 h-4 object-contain shrink-0" />
                                                                    <span>{paymentMethod.name}</span>
                                                                </span>
                                                            </div>
                                                            {payment.paid_at && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Pago em</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                        {formatDate(payment.paid_at)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </SidebarCard>

                                                    <SidebarCard hasTopStrip hasSeparator title="Protocolo">
                                                        <p className="text-xs text-brand-inactive-text">
                                                            {refund.id?.slice(0, 8)?.toUpperCase() || "—"}
                                                        </p>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 2: LOJA & COMPRADOR --- */}
                                    <TabsContent value="parties" className="mt-0">
                                        <FadeIn key="parties">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                {/* Coluna principal */}
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    <FormSection title="Dados do Comprador" hasSeparator>
                                                        <div className="p-4 bg-brand-gray/30 dark:bg-dark-border/20 rounded-xl text-sm text-brand-inactive-text">
                                                            Este tipo de solicitação não possui dados de comprador disponíveis. Os dados exibidos são do parceiro/lojista.
                                                        </div>
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <AdminStoreCard
                                                        store={hqStore}
                                                        fallbackStoreId={refund.partner_id}
                                                    />

                                                    {/* Assinatura */}
                                                    {subscription.id && (
                                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                                                Assinatura
                                                            </h3>
                                                            <div className="space-y-2 text-sm">
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Status</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">
                                                                        {subscription.status || "-"}
                                                                    </span>
                                                                </div>
                                                                {subscription.current_period_end && (
                                                                    <div className="flex justify-between text-brand-inactive-text">
                                                                        <span>Termino do periodo</span>
                                                                        <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                            {formatDate(subscription.current_period_end)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {refund.grace_period_ends_at && (
                                                                    <div className="flex justify-between text-brand-inactive-text pt-2 border-t border-brand-border dark:border-dark-border">
                                                                        <span>Carencia ate</span>
                                                                        <span className="font-bold text-brand-orange">
                                                                            {formatDateTime(refund.grace_period_ends_at)}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 3: ANEXOS --- */}
                                    <TabsContent value="attachments" className="mt-0">
                                        <FadeIn key="attachments">
                                            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                                                <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                                                    {parsedImages.length > 0 && (
                                                        <FormSection title={`Imagens de Evidência (${parsedImages.length})`} hasSeparator>
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                                                {parsedImages.map((img, idx) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={getR2ImageUrl(img.url)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="group rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden bg-brand-gray dark:bg-dark-border/20 flex flex-col hover:border-brand-dark/30 transition-colors shadow-xs"
                                                                    >
                                                                        <div className="aspect-square flex items-center justify-center overflow-hidden bg-white dark:bg-dark-surface">
                                                                            <img src={getR2ImageUrl(img.url)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                        </div>
                                                                        <div className="p-2.5 text-xs truncate font-medium text-brand-dark dark:text-dark-heading border-t border-brand-border dark:border-dark-border">
                                                                            {img.name || `Evidência ${idx + 1}`}
                                                                        </div>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}

                                                    {parsedDocs.length > 0 && (
                                                        <FormSection title={`Anexos (${parsedDocs.length})`} description="Documentos em PDF, Word, Excel, CSV, etc." hasSeparator={parsedImages.length > 0}>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                {parsedDocs.map((doc, idx) => (
                                                                    <ListItem
                                                                        key={idx}
                                                                        icon={FileIcon}
                                                                        title={doc.name}
                                                                        description={doc.size ? formatFileSize(doc.size) : undefined}
                                                                        onClick={() => window.open(doc.url, "_blank")}
                                                                        className="p-3.5"
                                                                    />
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}

                                                    {parsedImages.length === 0 && parsedDocs.length === 0 && (
                                                        <div className="p-8 text-center border border-dashed border-brand-border dark:border-dark-border rounded-2xl text-xs text-brand-inactive-text">
                                                            Nenhum anexo ou evidência foi enviado pelo lojista nesta solicitação.
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <SidebarCard hasTopStrip hasSeparator title="Resumo dos Anexos">
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Imagens</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{parsedImages.length}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Documentos PDF</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{parsedDocs.length}</span>
                                                            </div>
                                                        </div>
                                                    </SidebarCard>
                                                </div>
                                            </div>
                                        </FadeIn>
                                    </TabsContent>

                                    {/* --- TAB 4: TIMELINE --- */}
                                    <TabsContent value="timeline" className="mt-0">
                                        <FadeIn key="timeline">
                                            <FormSection title="Historico de Eventos" hasSeparator>
                                                {events.length === 0 ? (
                                                    <IconPlaceholder
                                                        icon={ClockIcon}
                                                        containerSize="w-14 h-14 mb-2"
                                                        iconSize="w-6 h-6"
                                                        title="Nenhum evento registrado"
                                                        subtitle="Esta solicitacao ainda nao possui eventos no historico."
                                                    />
                                                ) : (
                                                    <div className="space-y-4">
                                                        {events.map((ev: any) => (
                                                            <div key={ev.id} className="flex items-start gap-3 border-l-2 border-brand-border dark:border-dark-border pl-4 py-1">
                                                                <div className="flex-1">
                                                                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                                        {ev.message || ev.event_type}
                                                                    </p>
                                                                    <p className="text-xs text-brand-inactive-text">
                                                                        {ev.actor_name && `${ev.actor_name} - `}
                                                                        {formatDateTime(ev.created_at)}
                                                                    </p>
                                                                </div>
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
                    <ActionsDropdown fullWidth trigger={
                        <Button variant="outline" className="w-full h-12">
                            <ThreeDotsIcon size={18} className="text-brand-inactive-text" />
                        </Button>
                    }>
                        <DropdownItem onClick={handleShare}>
                            <ShareIcon size={16} /> Compartilhar
                        </DropdownItem>
                        {(refund.status === "pending" || refund.status === "under_review") && (
                            <DropdownItem onClick={() => setShowReviewModal(true)}>
                                <CheckCircleIcon size={16} className="text-brand-green" /> Julgar Solicitacao
                            </DropdownItem>
                        )}
                    </ActionsDropdown>
                </div>
            </div>

            {/* Review Modal */}
            {showReviewModal && (
                <AdminRefundReviewModal
                    isOpen={showReviewModal}
                    onClose={() => setShowReviewModal(false)}
                    refund={refund}
                    onSuccess={onBack}
                />
            )}
        </>
    )
}

export default AdminRefundDetailView
