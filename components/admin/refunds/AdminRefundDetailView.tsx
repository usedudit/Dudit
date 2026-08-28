"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
    ChevronLeftIcon,
    ShareIcon,
    StoreIcon,
    FileIcon,
    ClockIcon,
    AlertCircleIcon,
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
    ListItem,
} from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import Link from "next/link"
import { toast } from "@/hooks/use-notification"
import { useSidebar } from "@/lib/sidebar-context"
import {
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Lock,
    FileText,
    ExternalLink,
} from "lucide-react"
import { AdminRefundReviewModal } from "@/components/admin/AdminRefundReviewModal"

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

    const images: string[] = Array.isArray(refund?.images) ? refund.images : []
    const documents: string[] = Array.isArray(refund?.documents) ? refund.documents : []

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
                                        <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                                            <Button
                                                variant="outline"
                                                onClick={handleShare}
                                                leftIcon={<ShareIcon size={16} />}
                                            >
                                                Compartilhar
                                            </Button>
                                            {(refund.status === "pending" || refund.status === "under_review") && (
                                                <Button
                                                    variant="default"
                                                    onClick={() => setShowReviewModal(true)}
                                                    className="bg-brand-green text-white hover:bg-brand-green/90"
                                                >
                                                    Julgar Solicitacao
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Title row - mobile */}
                                    <div className="md:hidden flex items-center justify-between gap-3 py-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Button variant="filled" onClick={onBack} className="w-9 h-9 p-0 flex items-center justify-center shrink-0">
                                                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </Button>
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        Solicitacao #{refundId}
                                                    </h1>
                                                    <Badge variant={statusMeta.variant}>
                                                        {statusMeta.label}
                                                    </Badge>
                                                </div>
                                                <span className="text-xs text-brand-inactive-text truncate">
                                                    Valor: {formatCurrency(refund.amount)}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleShare}
                                            className="shrink-0"
                                        >
                                            Compartilhar
                                        </Button>
                                    </div>

                                    {/* Tabs */}
                                    <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="general">Dados Gerais</TabsTrigger>
                                            <TabsTrigger value="parties">Loja & Comprador</TabsTrigger>
                                            <TabsTrigger value="attachments" className="flex items-center gap-2">
                                                <span>Anexos</span>
                                                {(images.length + documents.length) > 0 && (
                                                    <Badge variant="green" className="px-1.5 py-0.2 text-[10px]">
                                                        {images.length + documents.length}
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
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Status & Valores
                                                        </h3>
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
                                                                        <ShieldCheck size={12} />
                                                                        <span>Dentro do prazo</span>
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="orange" className="flex items-center gap-1">
                                                                        <AlertTriangle size={12} />
                                                                        <span>Fora do prazo</span>
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Compra Vinculada */}
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                                            Compra Vinculada
                                                        </h3>
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
                                                            {purchase.gateway && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Gateway</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading capitalize">
                                                                        {purchase.gateway}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {payment.paid_at && (
                                                                <div className="flex justify-between text-brand-inactive-text">
                                                                    <span>Pago em</span>
                                                                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                                                                        {formatDate(payment.paid_at)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Portal Publico */}
                                                    {refund.token && (
                                                        <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                                                Portal Publico
                                                            </h3>
                                                            <p className="text-xs text-brand-inactive-text mb-3">
                                                                Link de acompanhamento publico para o lojista.
                                                            </p>
                                                            <a
                                                                href={`/reembolso/${refund.token}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:underline"
                                                            >
                                                                Abrir Portal
                                                                <ExternalLink size={13} />
                                                            </a>
                                                        </div>
                                                    )}
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
                                                        <ListItem
                                                            left={
                                                                <UserProfileImage
                                                                    fullName={partner.user_id || "Comprador"}
                                                                    className="w-12 h-12 text-lg shrink-0"
                                                                />
                                                            }
                                                            title={hqStore.name || "Loja Parceira"}
                                                            description={`Partner ID: ${refund.partner_id || "-"}`}
                                                            right={
                                                                refund.partner_id ? (
                                                                    <Link
                                                                        href={`/ddt-admin/partners?view=${refund.partner_id}`}
                                                                        className="text-xs font-bold text-brand-green hover:underline"
                                                                    >
                                                                        Ver Parceiro &rarr;
                                                                    </Link>
                                                                ) : undefined
                                                            }
                                                        />
                                                    </FormSection>
                                                </div>

                                                {/* Sidebar */}
                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">
                                                            Dados da Loja
                                                        </h3>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-12 h-12 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border flex items-center justify-center overflow-hidden shrink-0">
                                                                {hqStore.logo_url ? (
                                                                    <img src={getR2ImageUrl(hqStore.logo_url)} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <StoreIcon className="w-6 h-6 text-brand-inactive-text" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                                                    {hqStore.name || "Loja Parceira"}
                                                                </h3>
                                                                {hqStore.cnpj && (
                                                                    <span className="text-xs text-brand-inactive-text">
                                                                        CNPJ: {hqStore.cnpj}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {refund.partner_id && (
                                                            <div className="pt-3 mt-3 border-t border-brand-border dark:border-dark-border">
                                                                <Link
                                                                    href={`/ddt-admin/partners?view=${refund.partner_id}`}
                                                                    className="text-xs font-bold text-brand-green hover:underline"
                                                                >
                                                                    Ver ficha do parceiro &rarr;
                                                                </Link>
                                                            </div>
                                                        )}
                                                    </div>

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
                                                    {images.length > 0 && (
                                                        <FormSection title={`Imagens de Evidencia (${images.length})`} hasSeparator>
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                                                {images.map((img: string, idx: number) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={getR2ImageUrl(img)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="group rounded-xl border border-brand-border dark:border-dark-border overflow-hidden bg-brand-gray dark:bg-dark-border/20 flex flex-col hover:border-brand-dark/30 transition-colors"
                                                                    >
                                                                        <div className="aspect-square flex items-center justify-center overflow-hidden">
                                                                            <img src={getR2ImageUrl(img)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                        </div>
                                                                        <div className="p-2 text-xs truncate font-medium text-brand-dark dark:text-dark-heading">
                                                                            Evidencia {idx + 1}
                                                                        </div>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}

                                                    {documents.length > 0 && (
                                                        <FormSection title={`Documentos PDF (${documents.length})`} hasSeparator={images.length > 0}>
                                                            <div className="space-y-2">
                                                                {documents.map((doc: string, idx: number) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={doc}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center justify-between p-3 bg-brand-gray dark:bg-dark-border/30 rounded-xl text-xs border border-brand-border dark:border-dark-border hover:bg-gray-200 dark:hover:bg-dark-border/60 transition-colors"
                                                                    >
                                                                        <div className="flex items-center gap-2 truncate">
                                                                            <FileText size={16} className="text-brand-orange shrink-0" />
                                                                            <span className="truncate font-medium text-brand-dark dark:text-dark-heading">
                                                                                Documento Anexo {idx + 1} (PDF)
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 text-brand-green font-bold">
                                                                            <span>Abrir</span>
                                                                            <ExternalLink size={13} />
                                                                        </div>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </FormSection>
                                                    )}

                                                    {images.length === 0 && documents.length === 0 && (
                                                        <div className="p-8 text-center border border-dashed border-brand-border dark:border-dark-border rounded-2xl text-xs text-brand-inactive-text">
                                                            Nenhum anexo ou evidencia foi enviado pelo lojista nesta solicitacao.
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                                                    <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors">
                                                        <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-3">
                                                            Resumo dos Anexos
                                                        </h3>
                                                        <div className="space-y-2 text-sm">
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Imagens</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{images.length}</span>
                                                            </div>
                                                            <div className="flex justify-between text-brand-inactive-text">
                                                                <span>Documentos PDF</span>
                                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{documents.length}</span>
                                                            </div>
                                                        </div>
                                                    </div>
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
                <Button variant="outline" className="flex-1" onClick={handleShare} leftIcon={<ShareIcon size={16} />}>
                    Compartilhar
                </Button>
                {(refund.status === "pending" || refund.status === "under_review") && (
                    <Button
                        variant="default"
                        className="flex-1 bg-brand-green text-white hover:bg-brand-green/90"
                        onClick={() => setShowReviewModal(true)}
                    >
                        Julgar
                    </Button>
                )}
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
