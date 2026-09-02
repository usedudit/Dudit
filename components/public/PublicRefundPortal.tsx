"use client"

import React, { useState, useMemo } from "react"
import {
    Badge,
    Button,
    InfoCard,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
} from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
    FileText,
    ExternalLink,
    Copy,
    Check,
} from "lucide-react"

interface PublicRefundPortalProps {
    refund: any
}

const getStatusBadgeVariant = (status: string) => {
    switch (status) {
        case "approved":
            return "green" as const
        case "rejected":
            return "red" as const
        case "under_review":
            return "blue" as const
        case "cancelled":
            return "gray" as const
        default:
            return "orange" as const
    }
}

const getStatusLabel = (status: string) => {
    switch (status) {
        case "approved":
            return "Aprovado / Estornado"
        case "rejected":
            return "Solicitação Recusada"
        case "under_review":
            return "Em Análise pela Equipe"
        case "cancelled":
            return "Cancelado"
        default:
            return "Pendente de Análise"
    }
}

const getReasonLabel = (cat: string) => {
    switch (cat) {
        case "repentance_7_days":
            return "Direito de Arrependimento (CDC Art. 49)"
        case "double_charge":
            return "Cobrança duplicada ou indevida"
        case "technical_issue":
            return "Dificuldade técnica ou indisponibilidade"
        case "commercial_agreement":
            return "Acordo comercial / Alteração de plano"
        case "unsatisfied":
            return "Insatisfação com recursos"
        default:
            return "Outro motivo"
    }
}

export function PublicRefundPortal({ refund }: PublicRefundPortalProps) {
    const [activeTab, setActiveTab] = useState("Dados Gerais")
    const [copiedLink, setCopiedLink] = useState(false)

    const handleCopyLink = () => {
        if (typeof window !== "undefined") {
            navigator.clipboard.writeText(window.location.href)
            setCopiedLink(true)
            setTimeout(() => setCopiedLink(false), 2000)
        }
    }

    const images: string[] = Array.isArray(refund.images) ? refund.images : []
    const documents: string[] = Array.isArray(refund.documents) ? refund.documents : []
    const totalAttachments = images.length + documents.length
    const purchase = refund.purchase || {}
    const plan = purchase.plan || {}
    const payment = refund.payment || {}

    const partnerLogo = useMemo(() => {
        return getR2ImageUrl(refund.partnerLogo || null)
    }, [refund.partnerLogo])

    return (
        <>
            <header className="lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
                    <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            className="h-10 w-auto object-contain"
                        />
                    </a>
                </div>
            </header>

            <div className="flex flex-col min-h-screen bg-white dark:bg-dark-background overflow-hidden relative">
                <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full min-h-screen">
                    <div className="flex-1 w-full h-full relative flex flex-col lg:flex-row overflow-hidden">

                        {/* LEFT COLUMN: INFO, TABS & CONTENT */}
                        <div className="w-full lg:w-3/5 flex flex-col shrink-0 border-r-0 lg:border-r border-brand-border dark:border-dark-border bg-white dark:bg-dark-background relative">

                            {/* Header Superior */}
                            <div className="shrink-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
                                <div className="px-4 md:px-6 pt-4">
                                    <div className="flex items-center justify-between pb-2">
                                        <div className="flex items-center gap-3">
                                            {partnerLogo ? (
                                                <img
                                                    src={partnerLogo}
                                                    alt={refund.partnerName}
                                                    className="h-10 w-10 object-cover rounded-xl border border-brand-border dark:border-dark-border"
                                                />
                                            ) : (
                                                <div className="h-10 w-10 rounded-xl bg-brand-green flex items-center justify-center text-white font-bold text-sm shrink-0">
                                                    {(refund.partnerName || "Dudit").substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading block leading-tight">
                                                    {refund.partnerName || "Empresa Parceira"}
                                                </span>
                                                <span className="text-[11px] text-brand-inactive-text dark:text-dark-body block tracking-wider">
                                                    Solicitação de Reembolso
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Badge variant={getStatusBadgeVariant(refund.status)}>
                                                {getStatusLabel(refund.status)}
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Responsive Tabs List */}
                                    <div className="w-full mt-4">
                                        <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                                            <TabsTrigger value="Dados Gerais">Dados Gerais</TabsTrigger>
                                            <TabsTrigger value="Anexos" className="flex items-center gap-1.5">
                                                <span>Anexos</span>
                                                {totalAttachments > 0 && (
                                                    <Badge variant="green" className="px-1.5 py-0.2 text-[10px]">
                                                        {totalAttachments}
                                                    </Badge>
                                                )}
                                            </TabsTrigger>
                                            <TabsTrigger value="Resumo" className="lg:hidden">Resumo Financeiro</TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-6 pb-24 space-y-6">

                                {/* Status Info Banners */}
                                {refund.status === "approved" && (
                                    <InfoCard
                                        title="Reembolso Aprovado e Estorno Concluído"
                                        message={`O valor de ${formatCurrency(refund.refunded_amount || refund.amount)} foi estornado com sucesso no Mercado Pago.${refund.grace_period_ends_at ? ` Carência de 24h ativa até ${formatDate(refund.grace_period_ends_at)}.` : ""}`}
                                        color="green"
                                    />
                                )}

                                {refund.status === "rejected" && (
                                    <InfoCard
                                        title="Solicitação de Reembolso Recusada"
                                        message="Esta solicitação não atendeu aos critérios para estorno. Seu plano contratado permanece ativo normalmente."
                                        color="red"
                                    />
                                )}

                                {/* ─── TAB: DADOS GERAIS ─── */}
                                <div className={`${activeTab === "Dados Gerais" ? "block" : "hidden"}`}>
                                    <div className="space-y-6 text-left">
                                        <FormSection title="Informações da solicitação">
                                            <div className="space-y-3 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Protocolo</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading font-mono text-xs">{refund.token}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Data da solicitação</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatDate(refund.requested_at || refund.created_at)}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Motivo declarado</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{getReasonLabel(refund.reason_category)}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text dark:text-dark-body font-semibold">Enquadramento</span>
                                                    {refund.is_within_7_days ? (
                                                        <Badge variant="green">Garantia 7 Dias CDC (Art. 49)</Badge>
                                                    ) : (
                                                        <Badge variant="orange">Análise Administrativa</Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </FormSection>

                                        <FormSection title="Justificativa do lojista" hasSeparator>
                                            <div className="p-4 bg-brand-gray dark:bg-dark-border/20 rounded-2xl text-xs sm:text-sm text-brand-dark dark:text-dark-body whitespace-pre-wrap leading-relaxed border border-brand-border dark:border-dark-border">
                                                {refund.reason_description}
                                            </div>
                                        </FormSection>

                                        {refund.admin_response && (
                                            <FormSection title="Parecer da Equipe Dudit" hasSeparator>
                                                <div className="p-4 bg-brand-gray dark:bg-dark-border/20 rounded-2xl text-xs sm:text-sm text-brand-dark dark:text-dark-body whitespace-pre-wrap leading-relaxed border border-brand-border dark:border-dark-border">
                                                    {refund.admin_response}
                                                </div>
                                            </FormSection>
                                        )}
                                    </div>
                                </div>

                                {/* ─── TAB: ANEXOS ─── */}
                                <div className={`${activeTab === "Anexos" ? "block" : "hidden"}`}>
                                    <div className="space-y-6 text-left">
                                        {images.length > 0 && (
                                            <FormSection title="Imagens de Evidência">
                                                <ProductImagesSection
                                                    images={images}
                                                    onImageUpload={() => { }}
                                                    onRemoveImage={() => { }}
                                                    onSetPrimaryImage={() => { }}
                                                    isEditing={false}
                                                />
                                            </FormSection>
                                        )}

                                        {documents.length > 0 && (
                                            <FormSection title="Documentos em PDF" hasSeparator={images.length > 0}>
                                                <div className="space-y-2">
                                                    {documents.map((docUrl, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={docUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-between p-3.5 bg-brand-gray dark:bg-dark-border/30 rounded-2xl text-xs border border-brand-border dark:border-dark-border hover:bg-gray-200 dark:hover:bg-dark-border/60 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-2.5 truncate">
                                                                <FileText className="w-5 h-5 text-brand-orange shrink-0" />
                                                                <span className="truncate font-medium text-brand-dark dark:text-dark-heading">
                                                                    Documento Anexo {idx + 1} (PDF)
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-brand-green font-bold">
                                                                <span>Abrir</span>
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </FormSection>
                                        )}

                                        {images.length === 0 && documents.length === 0 && (
                                            <div className="p-8 text-center border border-dashed border-brand-border dark:border-dark-border rounded-2xl text-xs text-brand-inactive-text">
                                                Nenhum anexo foi incluído nesta solicitação.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* ─── TAB MOBILE: RESUMO ─── */}
                                <div className={`${activeTab === "Resumo" ? "block lg:hidden" : "hidden"}`}>
                                    <div className="space-y-4 text-left">
                                        <FormSection title="Resumo financeiro">
                                            <div className="space-y-3 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text font-semibold">Plano</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                        {plan.name ? `Plano ${plan.name}` : purchase.description || "Assinatura"}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-brand-inactive-text font-semibold">Valor da Fatura</span>
                                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                        {formatCurrency(purchase.total_amount || refund.amount)}
                                                    </span>
                                                </div>
                                                {refund.status === "approved" && (
                                                    <div className="flex justify-between items-center text-brand-green font-bold">
                                                        <span>Valor Estornado</span>
                                                        <span>{formatCurrency(refund.refunded_amount || refund.amount)}</span>
                                                    </div>
                                                )}
                                                {purchase.billing_period_start && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-brand-inactive-text font-semibold">Ciclo</span>
                                                        <span className="font-medium text-brand-dark dark:text-dark-body">
                                                            {formatDate(purchase.billing_period_start)} até {formatDate(purchase.billing_period_end)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </FormSection>

                                        <Button
                                            variant="outline"
                                            className="w-full h-11"
                                            leftIcon={copiedLink ? <Check className="w-4 h-4 text-brand-green" /> : <Copy className="w-4 h-4" />}
                                            onClick={handleCopyLink}
                                        >
                                            {copiedLink ? "Link Copiado!" : "Copiar Link de Acompanhamento"}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN (DESKTOP): FINANCIAL SUMMARY */}
                        <div className="hidden lg:flex lg:w-2/5 flex-col bg-brand-gray/40 dark:bg-dark-surface/40 p-6 space-y-6 overflow-y-auto">
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 space-y-6 sticky top-6">
                                <FormSection title="Resumo financeiro">
                                    <div className="space-y-4 text-xs pt-1">
                                        <div>
                                            <span className="text-brand-inactive-text block font-semibold">Plano Contratado</span>
                                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading block mt-0.5">
                                                {plan.name ? `Plano ${plan.name}` : purchase.description || "Assinatura"}
                                            </span>
                                        </div>

                                        <div className="p-4 bg-brand-gray dark:bg-dark-border/40 rounded-2xl space-y-2 border border-brand-border dark:border-dark-border">
                                            <div className="flex justify-between items-center">
                                                <span className="text-brand-inactive-text">Valor da Fatura:</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading text-sm">
                                                    {formatCurrency(purchase.total_amount || refund.amount)}
                                                </span>
                                            </div>
                                            {refund.status === "approved" && (
                                                <div className="flex justify-between items-center text-brand-green border-t border-brand-border dark:border-dark-border pt-2 font-bold text-sm">
                                                    <span>Valor Estornado:</span>
                                                    <span>{formatCurrency(refund.refunded_amount || refund.amount)}</span>
                                                </div>
                                            )}
                                        </div>

                                        {purchase.billing_period_start && (
                                            <div>
                                                <span className="text-brand-inactive-text block font-semibold">Ciclo de Faturamento</span>
                                                <span className="font-medium text-brand-dark dark:text-dark-body block mt-0.5">
                                                    {formatDate(purchase.billing_period_start)} até {formatDate(purchase.billing_period_end)}
                                                </span>
                                            </div>
                                        )}

                                        <div>
                                            <span className="text-brand-inactive-text block font-semibold">Forma de Pagamento Original</span>
                                            <span className="font-medium text-brand-dark dark:text-dark-body block mt-0.5">
                                                Mercado Pago {payment.paid_at ? `(Pago em ${formatDate(payment.paid_at)})` : ""}
                                            </span>
                                        </div>

                                        {refund.mp_refund_id && (
                                            <div className="p-3 bg-brand-green/10 border border-brand-green/20 rounded-xl text-[11px] text-gray-700 dark:text-dark-body">
                                                <span className="font-bold text-brand-green block">ID do Estorno no Mercado Pago:</span>
                                                <code className="text-[10px] break-all font-mono">{refund.mp_refund_id}</code>
                                            </div>
                                        )}
                                    </div>
                                </FormSection>

                                <div className="pt-2 border-t border-brand-border dark:border-dark-border space-y-3">
                                    <Button
                                        variant="outline"
                                        className="w-full h-11"
                                        leftIcon={copiedLink ? <Check className="w-4 h-4 text-brand-green" /> : <Copy className="w-4 h-4" />}
                                        onClick={handleCopyLink}
                                    >
                                        {copiedLink ? "Link Copiado!" : "Copiar Link de Acompanhamento"}
                                    </Button>
                                    <p className="text-[11px] text-brand-inactive-text text-center font-mono">
                                        Protocolo: {refund.token?.slice(0, 16)}...
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>
                </Tabs>
            </div>
        </>
    )
}

