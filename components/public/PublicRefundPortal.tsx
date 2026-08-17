"use client"

import React, { useState } from "react"
import { Badge, Button, InfoCard, DefaultModal } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
    RotateCcw,
    CheckCircle2,
    XCircle,
    Clock,
    ShieldCheck,
    FileText,
    Download,
    ExternalLink,
    Copy,
    Check,
    Store,
    Calendar,
    CreditCard,
    AlertTriangle,
    Eye,
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
    const [copiedLink, setCopiedLink] = useState(false)
    const [previewImage, setPreviewImage] = useState<string | null>(null)

    const handleCopyLink = () => {
        if (typeof window !== "undefined") {
            navigator.clipboard.writeText(window.location.href)
            setCopiedLink(true)
            setTimeout(() => setCopiedLink(false), 2000)
        }
    }

    const images: string[] = Array.isArray(refund.images) ? refund.images : []
    const documents: string[] = Array.isArray(refund.documents) ? refund.documents : []
    const purchase = refund.purchase || {}
    const plan = purchase.plan || {}
    const payment = refund.payment || {}

    return (
        <div className="min-h-screen bg-brand-gray/50 dark:bg-dark-background py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header Superior */}
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-brand-green/10 flex items-center justify-center text-brand-green flex-shrink-0">
                            {refund.partnerLogo ? (
                                <img
                                    src={refund.partnerLogo}
                                    alt={refund.partnerName}
                                    className="w-full h-full object-cover rounded-2xl"
                                />
                            ) : (
                                <RotateCcw size={28} />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                                    Solicitação de Reembolso
                                </h1>
                                <Badge variant={getStatusBadgeVariant(refund.status)}>
                                    {getStatusLabel(refund.status)}
                                </Badge>
                            </div>
                            <p className="text-xs text-brand-inactive-text mt-0.5">
                                Empresa: <strong className="text-gray-700 dark:text-dark-body">{refund.partnerName}</strong>
                                {refund.partnerDocument && ` • CNPJ/CPF: ${refund.partnerDocument}`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={copiedLink ? <Check className="w-4 h-4 text-brand-green" /> : <Copy className="w-4 h-4" />}
                            onClick={handleCopyLink}
                        >
                            {copiedLink ? "Link Copiado!" : "Copiar Link"}
                        </Button>
                    </div>
                </div>

                {/* Grid Principal: Conteúdo (Esquerda) + Preview da Fatura (Direita) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Coluna Esquerda: Detalhes, Motivo, Evidências, Timeline e Parecer */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Alerta de Status */}
                        {refund.status === "approved" && (
                            <div className="p-5 bg-brand-green/10 border border-brand-green/30 rounded-2xl flex items-start gap-4">
                                <CheckCircle2 className="w-7 h-7 text-brand-green flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="text-base font-bold text-brand-green">
                                        Reembolso Aprovado e Estorno Realizado!
                                    </h3>
                                    <p className="text-sm text-gray-700 dark:text-dark-body mt-1">
                                        O estorno no valor de <strong>{formatCurrency(refund.refunded_amount || refund.amount)}</strong> foi efetuado com sucesso no gateway de pagamento.
                                    </p>
                                    {refund.grace_period_ends_at && (
                                        <div className="mt-3 p-2.5 bg-white/70 dark:bg-dark-surface/70 rounded-xl border border-brand-green/20 text-xs text-gray-600 dark:text-dark-body">
                                            ⏳ <strong>Carência ativa de 24h:</strong> O acesso ao plano pago permanecerá disponível até {formatDate(refund.grace_period_ends_at)} para exportação de dados antes da migração para o Plano Gratuito.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {refund.status === "rejected" && (
                            <div className="p-5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-2xl flex items-start gap-4">
                                <XCircle className="w-7 h-7 text-brand-red flex-shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="text-base font-bold text-brand-red">
                                        Solicitação Recusada
                                    </h3>
                                    <p className="text-sm text-gray-700 dark:text-dark-body mt-1">
                                        Esta solicitação não atendeu aos critérios para concessão de estorno. Seu plano contratado permanece ativo normalmente.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Card com Detalhes da Solicitação */}
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-5">
                            <div className="flex items-center justify-between border-b border-brand-border dark:border-dark-border pb-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    Informações do Pedido
                                </h2>
                                {refund.is_within_7_days ? (
                                    <div className="flex items-center gap-1.5 text-xs text-brand-green font-bold bg-brand-green/10 px-2.5 py-1 rounded-full">
                                        <ShieldCheck size={14} />
                                        <span>Garantia 7 Dias CDC</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-xs text-brand-orange font-medium bg-brand-orange/10 px-2.5 py-1 rounded-full">
                                        <Clock size={14} />
                                        <span>Análise Administrativa</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-brand-inactive-text block font-medium">Motivo Declarado</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm block mt-0.5">
                                        {getReasonLabel(refund.reason_category)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-brand-inactive-text block font-medium">Data da Solicitação</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading text-sm block mt-0.5">
                                        {formatDate(refund.requested_at || refund.created_at)}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5 pt-2">
                                <span className="text-xs text-brand-inactive-text font-medium block">
                                    Justificativa do Lojista:
                                </span>
                                <div className="p-4 bg-brand-gray/60 dark:bg-dark-border/20 rounded-xl text-xs sm:text-sm text-gray-800 dark:text-dark-body whitespace-pre-wrap leading-relaxed border border-brand-border/60 dark:border-dark-border/40">
                                    {refund.reason_description}
                                </div>
                            </div>

                            {/* Resposta / Parecer da Administração */}
                            {refund.admin_response && (
                                <div className="space-y-1.5 pt-2 border-t border-brand-border dark:border-dark-border">
                                    <span className="text-xs font-bold text-brand-dark dark:text-dark-heading block">
                                        Parecer da Equipe Dudit:
                                    </span>
                                    <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl text-xs sm:text-sm text-blue-900 dark:text-blue-200 whitespace-pre-wrap leading-relaxed border border-blue-100 dark:border-blue-800/30">
                                        {refund.admin_response}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Galeria de Evidências (Imagens e Documentos) */}
                        {(images.length > 0 || documents.length > 0) && (
                            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-4">
                                <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                    Evidências e Documentos Anexados
                                </h2>

                                {/* Imagens */}
                                {images.length > 0 && (
                                    <div className="space-y-2">
                                        <span className="text-xs text-brand-inactive-text font-medium">Imagens ({images.length})</span>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                            {images.map((imgUrl, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => setPreviewImage(imgUrl)}
                                                    className="group relative aspect-square rounded-xl overflow-hidden border border-brand-border bg-brand-gray cursor-pointer hover:shadow-md transition-all"
                                                >
                                                    <img src={imgUrl} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                        <Eye size={20} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Documentos PDF */}
                                {documents.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        <span className="text-xs text-brand-inactive-text font-medium">Documentos PDF ({documents.length})</span>
                                        <div className="space-y-2">
                                            {documents.map((docUrl, idx) => (
                                                <a
                                                    key={idx}
                                                    href={docUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-between p-3 rounded-xl bg-brand-gray dark:bg-dark-border/40 border border-brand-border dark:border-dark-border hover:bg-brand-gray/80 transition-colors text-xs font-medium text-brand-dark dark:text-dark-heading"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="w-5 h-5 text-brand-orange flex-shrink-0" />
                                                        <span className="truncate">Documento Anexo {idx + 1} (PDF)</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-brand-green">
                                                        <span>Abrir</span>
                                                        <ExternalLink size={14} />
                                                    </div>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Coluna Direita: Live Preview da Fatura / Card Financeiro */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-6 shadow-sm space-y-6 sticky top-6">
                            <h2 className="text-base font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border dark:border-dark-border pb-3 flex items-center gap-2">
                                <CreditCard size={18} className="text-brand-green" />
                                <span>Resumo Financeiro</span>
                            </h2>

                            <div className="space-y-4 text-xs">
                                <div>
                                    <span className="text-brand-inactive-text block">Plano Contratado</span>
                                    <span className="text-sm font-bold text-brand-dark dark:text-dark-heading block mt-0.5">
                                        {plan.name ? `Plano ${plan.name}` : purchase.description || "Assinatura"}
                                    </span>
                                </div>

                                <div className="p-4 bg-brand-gray dark:bg-dark-border/40 rounded-xl space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-brand-inactive-text">Valor da Fatura:</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(purchase.total_amount || refund.amount)}
                                        </span>
                                    </div>
                                    {refund.status === "approved" && (
                                        <div className="flex justify-between items-center text-brand-green border-t border-brand-border dark:border-dark-border pt-2 font-bold">
                                            <span>Valor Estornado:</span>
                                            <span>{formatCurrency(refund.refunded_amount || refund.amount)}</span>
                                        </div>
                                    )}
                                </div>

                                {purchase.billing_period_start && (
                                    <div>
                                        <span className="text-brand-inactive-text block">Ciclo de Faturamento</span>
                                        <span className="font-medium text-gray-700 dark:text-dark-body block mt-0.5">
                                            {formatDate(purchase.billing_period_start)} até {formatDate(purchase.billing_period_end)}
                                        </span>
                                    </div>
                                )}

                                <div>
                                    <span className="text-brand-inactive-text block">Forma de Pagamento Original</span>
                                    <span className="font-medium text-gray-700 dark:text-dark-body block mt-0.5">
                                        Mercado Pago {payment.paid_at ? `(Pago em ${formatDate(payment.paid_at)})` : ""}
                                    </span>
                                </div>

                                {refund.mp_refund_id && (
                                    <div className="p-3 bg-brand-green/5 border border-brand-green/20 rounded-xl text-[11px] text-gray-600 dark:text-dark-body">
                                        <span className="font-bold text-brand-green block">ID do Estorno no Mercado Pago:</span>
                                        <code className="text-[10px] break-all font-mono">{refund.mp_refund_id}</code>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-brand-border dark:border-dark-border text-center">
                                <p className="text-[11px] text-brand-inactive-text">
                                    Protocolo: <code className="font-mono text-gray-600 dark:text-dark-body">{refund.token?.slice(0, 16)}...</code>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal Lightbox para Preview de Imagem */}
            {previewImage && (
                <DefaultModal
                    isOpen={!!previewImage}
                    onClose={() => setPreviewImage(null)}
                    title="Visualização da Evidência"
                    maxWidth="3xl"
                >
                    <div className="p-2 flex items-center justify-center">
                        <img
                            src={previewImage}
                            alt="Evidência Ampliada"
                            className="max-h-[75vh] w-auto object-contain rounded-xl"
                        />
                    </div>
                </DefaultModal>
            )}
        </div>
    )
}
