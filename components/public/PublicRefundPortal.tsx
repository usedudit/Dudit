"use client"

import React, { useState, useMemo } from "react"
import { motion } from "framer-motion"
import {
    Badge,
    Button,
    InfoCard,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
    ListItem,
} from "@/components/reusable"
import { formatCurrency, formatDate, formatFullDate } from "@/lib/utils"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
    ChevronLeftIcon,
    ShareIcon,
    FileIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertCircleIcon,
    XIcon,
    StoreIcon,
} from "@/lib/icons"
import { resolvePaymentMethodDetails } from "@/lib/billing/payment-method-helper"
import { HistoryTimeline } from "@/components/erp/shared/HistoryTimeline"

interface PublicRefundPortalProps {
    refund: any
}

function formatFileSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return ""
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

interface RefundAttachment {
    url: string
    name: string
    size?: number
    key?: string
}

function normalizeAttachments(raw: any, fallbackPrefix: string): RefundAttachment[] {
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

const getStatusConfig = (status: string) => {
    switch (status) {
        case "approved":
            return {
                label: "Aprovado / Estornado",
                statusText: "Estornado",
                color: "text-brand-green",
                badgeVariant: "green" as const,
                icon: CheckCircleIcon,
            }
        case "rejected":
            return {
                label: "Solicitação Recusada",
                statusText: "Recusado",
                color: "text-brand-red",
                badgeVariant: "red" as const,
                icon: XIcon,
            }
        case "under_review":
            return {
                label: "Em Análise pela Equipe",
                statusText: "Em Análise",
                color: "text-blue-500",
                badgeVariant: "blue" as const,
                icon: ClockIcon,
            }
        case "cancelled":
            return {
                label: "Cancelado",
                statusText: "Cancelado",
                color: "text-gray-500",
                badgeVariant: "gray" as const,
                icon: AlertCircleIcon,
            }
        default:
            return {
                label: "Pendente de Análise",
                statusText: "Pendente",
                color: "text-brand-orange",
                badgeVariant: "orange" as const,
                icon: ClockIcon,
            }
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

const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between items-center text-sm gap-4 py-2.5 border-b border-brand-border/40 dark:border-dark-border/40 last:border-0">
        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
        <div className="text-right font-semibold text-brand-dark dark:text-dark-heading">{value}</div>
    </div>
)

export function PublicRefundPortal({ refund }: PublicRefundPortalProps) {
    const [activeTab, setActiveTab] = useState("details")
    const [copiedLink, setCopiedLink] = useState(false)

    const handleCopyLink = () => {
        if (typeof window !== "undefined") {
            navigator.clipboard.writeText(window.location.href)
            setCopiedLink(true)
            setTimeout(() => setCopiedLink(false), 2000)
        }
    }

    const parsedImages = useMemo(() => normalizeAttachments(refund.images, "Imagem"), [refund.images])
    const parsedDocs = useMemo(() => normalizeAttachments(refund.documents, "Documento"), [refund.documents])
    const imageUrls = useMemo(() => parsedImages.map(img => img.url), [parsedImages])
    const totalAttachments = parsedImages.length + parsedDocs.length

    const purchase = refund.purchase || {}
    const plan = purchase.plan || {}
    const payment = refund.payment || {}

    const partnerLogo = useMemo(() => {
        return getR2ImageUrl(refund.partnerLogo || null)
    }, [refund.partnerLogo])

    const paymentMethod = useMemo(() => {
        return resolvePaymentMethodDetails(payment, purchase)
    }, [payment, purchase])

    const statusConfig = getStatusConfig(refund.status)
    const refundNumber = refund.id ? String(refund.id).slice(0, 8) : "N/A"
    const dateStrFull = formatFullDate(refund.requested_at || refund.created_at)

    const historyEntries = useMemo(() => {
        const list: Array<{
            id: string
            actor_name: string
            change_lines: string[]
            created_at: string
            entry_type?: string
        }> = []

        if (refund.requested_at || refund.created_at) {
            list.push({
                id: "requested",
                actor_name: refund.partnerName || "Lojista",
                change_lines: [
                    `Solicitação de reembolso registrada sob protocolo #${refundNumber}.`,
                    `Motivo declarado: ${getReasonLabel(refund.reason_category)}.`,
                ],
                created_at: refund.requested_at || refund.created_at,
                entry_type: "requested",
            })
        }

        if (refund.status === "under_review") {
            list.push({
                id: "under_review",
                actor_name: "Equipe Dudit",
                change_lines: [
                    "A solicitação entrou em análise pela equipe administrativa.",
                ],
                created_at: refund.updated_at || refund.requested_at || refund.created_at,
                entry_type: "under_review",
            })
        }

        if (refund.status === "approved") {
            list.push({
                id: "approved",
                actor_name: "Equipe Dudit",
                change_lines: [
                    `Reembolso aprovado no valor de ${formatCurrency(refund.refunded_amount || refund.amount)}.`,
                    refund.mp_refund_id ? `Estorno processado no gateway (ID do estorno: ${refund.mp_refund_id}).` : "Estorno financeiro efetuado com sucesso.",
                    refund.grace_period_ends_at ? `Carência de 24h ativa até ${formatDate(refund.grace_period_ends_at)}.` : "",
                ].filter(Boolean),
                created_at: refund.processed_at || refund.updated_at || new Date().toISOString(),
                entry_type: "approved",
            })
        }

        if (refund.status === "rejected") {
            list.push({
                id: "rejected",
                actor_name: "Equipe Dudit",
                change_lines: [
                    `Solicitação de reembolso recusada.`,
                    refund.admin_response ? `Parecer oficial: "${refund.admin_response}".` : "Não atendeu aos critérios para estorno.",
                ],
                created_at: refund.processed_at || refund.updated_at || new Date().toISOString(),
                entry_type: "rejected",
            })
        }

        return list
    }, [refund])

    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-surface transition-colors duration-300 w-full">
            {/* Header Sticky Dudit */}
            <header className="w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-4 mx-auto">
                    <a href="/" className="cursor-pointer shrink-0 pt-1">
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

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-3xl lg:max-w-[1400px] mx-auto px-4 md:px-6 pt-8 pb-32"
            >
                {/* Desktop Top Header (Idêntico a MyOrderDetailPage) */}
                <div className="mb-8 hidden lg:flex flex-row items-center gap-4 w-full justify-start">
                    <a href="/" className="cursor-pointer shrink-0">
                        <Button variant="filled" className="w-10 h-10 p-0 flex items-center justify-center shrink-0">
                            <ChevronLeftIcon className="w-5 h-5" />
                        </Button>
                    </a>
                    <div className="text-left flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-3 flex-wrap">
                            <span>Solicitação #{refundNumber}</span>
                        </h1>
                        <p className="text-md text-brand-inactive-text dark:text-dark-body mt-1">{dateStrFull}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 text-sm font-bold ${statusConfig.color} shrink-0`}>
                        <statusConfig.icon size={18} />
                        <span>{statusConfig.statusText}</span>
                    </div>
                </div>

                {/* Tabs Principais */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="mb-8">
                        <TabsTrigger value="details">Detalhes da Solicitação</TabsTrigger>
                        {totalAttachments > 0 && (
                            <TabsTrigger value="attachments" className="flex items-center gap-2">
                                <span>Anexos ({totalAttachments})</span>
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="history">Histórico do Reembolso</TabsTrigger>
                    </TabsList>

                    {/* ─── TAB 1: DETALHES ─── */}
                    <TabsContent value="details" className="mt-0 focus-visible:ring-0">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                            {/* Left Column (8 cols) */}
                            <div className="lg:col-span-8 space-y-8">

                                {/* Mobile Order Summary Card */}
                                <div className="block lg:hidden">
                                    <FormSection title={
                                        <div className="flex items-center gap-2">
                                            <span>Solicitação #{refundNumber}</span>
                                            <Badge variant={statusConfig.badgeVariant}>{statusConfig.statusText}</Badge>
                                        </div>
                                    }>
                                        <DetailRow
                                            label="Status da Solicitação"
                                            value={
                                                <span className={statusConfig.color}>
                                                    {statusConfig.label}
                                                </span>
                                            }
                                        />
                                        <DetailRow
                                            label="Data da Solicitação"
                                            value={dateStrFull}
                                        />
                                        <DetailRow
                                            label="Protocolo"
                                            value={<span className="font-mono text-xs">{refundNumber}</span>}
                                        />
                                    </FormSection>
                                </div>

                                {/* Section 1: Plano Contratado (Item de Assinatura) */}
                                <FormSection title="Plano Contratado">
                                    <div className="flex flex-row items-center gap-4 py-3">
                                        <div className="w-14 h-14 bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border rounded-xl flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                                            {partnerLogo ? (
                                                <img src={partnerLogo} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-brand-green flex items-center justify-center text-white font-bold text-sm">
                                                    {(refund.partnerName || "Dudit").substring(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-brand-dark dark:text-dark-heading text-sm sm:text-md truncate">
                                                {plan.name ? `Plano ${plan.name}` : purchase.description || "Assinatura Dudit"}
                                            </h3>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {purchase.billing_period_start && purchase.billing_period_end ? (
                                                    <span>Ciclo: {formatDate(purchase.billing_period_start)} até {formatDate(purchase.billing_period_end)}</span>
                                                ) : (
                                                    <span>Assinatura Recorrente</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                <span>Fatura #{purchase.id?.slice(0, 8) || "N/A"}</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-sm sm:text-base font-bold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(purchase.total_amount || refund.amount)}
                                            </span>
                                        </div>
                                    </div>
                                </FormSection>

                                {/* Section 2: Justificativa & Enquadramento */}
                                <FormSection title="Justificativa da Solicitação">
                                    <div className="space-y-4">
                                        <DetailRow
                                            label="Motivo Declarado"
                                            value={getReasonLabel(refund.reason_category)}
                                        />
                                        <DetailRow
                                            label="Enquadramento Legal"
                                            value={
                                                refund.is_within_7_days ? (
                                                    <Badge variant="green">Garantia 7 Dias CDC (Art. 49)</Badge>
                                                ) : (
                                                    <Badge variant="orange">Análise Administrativa</Badge>
                                                )
                                            }
                                        />

                                        <div className="space-y-2 pt-2 text-left">
                                            <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                                Justificativa do Lojista
                                            </span>
                                            <div className="text-xs sm:text-sm text-brand-dark dark:text-dark-body whitespace-pre-wrap leading-relaxed">
                                                {refund.reason_description || "Nenhuma justificativa detalhada foi fornecida."}
                                            </div>
                                        </div>

                                        {refund.admin_response && (
                                            <div className="space-y-2 pt-2 text-left">
                                                <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                                                    Parecer Oficial da Equipe Dudit
                                                </span>
                                                <div className="text-xs sm:text-sm text-brand-dark dark:text-dark-body whitespace-pre-wrap leading-relaxed">
                                                    {refund.admin_response}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </FormSection>

                                {/* Section 3: Pagamento (Forma Real com Ícone) */}
                                <FormSection title="Pagamento">
                                    <div>
                                        <ListItem
                                            icon={
                                                <img
                                                    src={paymentMethod.iconUrl}
                                                    alt={paymentMethod.name}
                                                    className="w-5 h-5 object-contain shrink-0"
                                                />
                                            }
                                            title={
                                                <span className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading">
                                                    {paymentMethod.name}
                                                </span>
                                            }
                                            description={
                                                <span className="text-xs lg:text-sm text-brand-inactive-text dark:text-dark-body font-normal">
                                                    {refund.status === "approved"
                                                        ? "Estornado no Mercado Pago"
                                                        : payment.paid_at
                                                            ? `Pago em ${formatDate(payment.paid_at)}`
                                                            : paymentMethod.detailsText || "Pagamento da assinatura"}
                                                </span>
                                            }
                                            className="border-none px-0 py-0 !bg-transparent shadow-none hover:border-none cursor-default"
                                            right={
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                    {formatCurrency(purchase.total_amount || refund.amount)}
                                                </span>
                                            }
                                        />
                                    </div>
                                </FormSection>

                                {/* Section 4: Estabelecimento / Lojista */}
                                <FormSection title="Estabelecimento / Lojista">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border/50 flex items-center justify-center overflow-hidden border border-brand-border dark:border-dark-border shrink-0">
                                            {partnerLogo ? (
                                                <img src={partnerLogo} alt={refund.partnerName} className="w-full h-full object-cover" />
                                            ) : (
                                                <StoreIcon size={24} className="text-brand-dark dark:text-dark-heading" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm lg:text-md font-bold text-brand-dark dark:text-dark-heading truncate">
                                                {refund.partnerName || "Empresa Parceira"}
                                            </div>
                                            <div className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {refund.partnerDocument ? `Documento: ${refund.partnerDocument}` : "Conta de Lojista Dudit"}
                                                {refund.partnerPhone ? ` • ${refund.partnerPhone}` : ""}
                                            </div>
                                        </div>
                                    </div>
                                </FormSection>

                                {/* Mobile Price Summary & Actions */}
                                <div className="block lg:hidden space-y-6">
                                    <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                        <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                            Resumo dos Valores
                                        </div>
                                        <div className="p-6 space-y-3">
                                            <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                                                <span>Valor da Fatura</span>
                                                <span className="text-brand-dark dark:text-dark-heading font-medium">{formatCurrency(purchase.total_amount || refund.amount)}</span>
                                            </div>
                                            {refund.status === "approved" && (
                                                <div className="flex justify-between text-sm text-brand-green">
                                                    <span>Valor Estornado</span>
                                                    <span className="font-medium">-{formatCurrency(refund.refunded_amount || refund.amount)}</span>
                                                </div>
                                            )}
                                            <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between items-end">
                                                <span className="text-md font-bold text-brand-dark dark:text-dark-heading">Total Reembolsado</span>
                                                <span className="font-bold text-lg text-brand-green">
                                                    {refund.status === "approved" ? formatCurrency(refund.refunded_amount || refund.amount) : "R$ 0,00"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

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

                                    <Button
                                        variant="outline"
                                        className="w-full h-12 font-bold"
                                        onClick={handleCopyLink}
                                    >
                                        {copiedLink ? "Link Copiado!" : "Copiar Link de Acompanhamento"}
                                    </Button>
                                </div>
                            </div>

                            {/* Right Column (Desktop sidebar - Idêntico a MyOrderDetailPage) */}
                            <div className="hidden lg:block lg:col-span-4 pl-12 border-l border-brand-border dark:border-dark-border space-y-6">
                                <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                    <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                        Resumo dos Valores
                                    </div>
                                    <div className="p-6 space-y-3">
                                        <div className="flex justify-between text-sm text-brand-inactive-text dark:text-dark-body">
                                            <span>Valor da Fatura</span>
                                            <span className="text-brand-dark dark:text-dark-heading font-medium">
                                                {formatCurrency(purchase.total_amount || refund.amount)}
                                            </span>
                                        </div>
                                        {refund.status === "approved" && (
                                            <div className="flex justify-between text-sm text-brand-green">
                                                <span>Valor Estornado</span>
                                                <span className="font-medium">
                                                    -{formatCurrency(refund.refunded_amount || refund.amount)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="border-t border-brand-border dark:border-dark-border my-2 pt-2 flex justify-between items-end">
                                            <span className="text-md font-bold text-brand-dark dark:text-dark-heading">Total Reembolsado</span>
                                            <span className="font-bold text-lg text-brand-green">
                                                {refund.status === "approved"
                                                    ? formatCurrency(refund.refunded_amount || refund.amount)
                                                    : "R$ 0,00"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Status InfoCards */}
                                {refund.status === "approved" && (
                                    <InfoCard
                                        title="Reembolso Aprovado"
                                        message={`O estorno de ${formatCurrency(refund.refunded_amount || refund.amount)} foi processado no Mercado Pago.${refund.grace_period_ends_at ? ` Carência de 24h ativa até ${formatDate(refund.grace_period_ends_at)}.` : ""}`}
                                        color="green"
                                    />
                                )}

                                {refund.status === "rejected" && (
                                    <InfoCard
                                        title="Solicitação Recusada"
                                        message="Esta solicitação não atendeu aos critérios para estorno. Seu plano permanece ativo."
                                        color="red"
                                    />
                                )}

                                {refund.status !== "approved" && refund.status !== "rejected" && (
                                    <InfoCard
                                        title="Em Análise pela Dudit"
                                        message="Nossa equipe está avaliando sua solicitação de acordo com os termos de contratação e CDC."
                                        color="orange"
                                    />
                                )}

                                {/* Ações */}
                                <div className="space-y-3 pt-2">
                                    <Button
                                        variant="outline"
                                        className="w-full h-12"
                                        onClick={handleCopyLink}
                                    >
                                        <ShareIcon size={16} />
                                        <span>{copiedLink ? "Link Copiado!" : "Copiar Link de Acompanhamento"}</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ─── TAB 2: ANEXOS ─── */}
                    {totalAttachments > 0 && (
                        <TabsContent value="attachments" className="mt-0 focus-visible:ring-0">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                <div className="lg:col-span-8 space-y-8">
                                    {imageUrls.length > 0 && (
                                        <FormSection title={`Imagens de Evidência (${imageUrls.length})`}>
                                            <ProductImagesSection
                                                images={imageUrls}
                                                onImageUpload={() => { }}
                                                onRemoveImage={() => { }}
                                                onSetPrimaryImage={() => { }}
                                                isEditing={false}
                                            />
                                        </FormSection>
                                    )}

                                    {parsedDocs.length > 0 && (
                                        <FormSection title={`Documentos em PDF (${parsedDocs.length})`} hasSeparator={imageUrls.length > 0}>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {parsedDocs.map((doc, idx) => (
                                                    <ListItem
                                                        key={idx}
                                                        icon={FileIcon}
                                                        title={doc.name}
                                                        description={doc.size ? formatFileSize(doc.size) : "Documento PDF"}
                                                        onClick={() => window.open(doc.url, "_blank")}
                                                        className="p-3.5"
                                                    />
                                                ))}
                                            </div>
                                        </FormSection>
                                    )}
                                </div>

                                <div className="hidden lg:block lg:col-span-4 pl-12 border-l border-brand-border dark:border-dark-border space-y-6">
                                    <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
                                        <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                                            Resumo dos Anexos
                                        </div>
                                        <div className="p-6 space-y-2 text-sm">
                                            <div className="flex justify-between text-brand-inactive-text">
                                                <span>Imagens</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{imageUrls.length}</span>
                                            </div>
                                            <div className="flex justify-between text-brand-inactive-text">
                                                <span>Documentos PDF</span>
                                                <span className="font-bold text-brand-dark dark:text-dark-heading">{parsedDocs.length}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {/* ─── TAB 3: HISTÓRICO ─── */}
                    <TabsContent value="history" className="mt-0 focus-visible:ring-0">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            <div className="lg:col-span-8 space-y-8">
                                <FormSection title="Linha do Tempo da Solicitação">
                                    <HistoryTimeline entries={historyEntries} emptyMessage="Nenhum evento registrado no histórico." />
                                </FormSection>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </motion.div>
        </div>
    )
}
