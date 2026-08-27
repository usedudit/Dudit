"use client"

import React, { useState } from "react"
import {
    DefaultModal,
    Button,
    Badge,
    FormTextarea,
    Input,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
} from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { adminProcessRefundAction, adminRejectRefundAction } from "@/app/actions/billing/refunds"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import {
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Lock,
    KeyRound,
    FileText,
    ExternalLink,
    Store,
    Eye,
} from "lucide-react"

interface AdminRefundReviewModalProps {
    isOpen: boolean
    onClose: () => void
    refund: any
    onSuccess?: () => void
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

export function AdminRefundReviewModal({ isOpen, onClose, refund, onSuccess }: AdminRefundReviewModalProps) {
    const [activeTab, setActiveTab] = useState("Dados Gerais")
    const [actionType, setActionType] = useState<"approve" | "reject">("approve")
    const [refundAmount, setRefundAmount] = useState<string>(String(refund?.amount || 0))
    const [refundConfirmation, setRefundConfirmation] = useState("")
    const [refundPassword, setRefundPassword] = useState("")
    const [adminResponse, setAdminResponse] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [previewImage, setPreviewImage] = useState<string | null>(null)

    if (!refund) return null

    const images: string[] = Array.isArray(refund.images) ? refund.images : []
    const documents: string[] = Array.isArray(refund.documents) ? refund.documents : []
    const totalAttachments = images.length + documents.length
    const partner = refund.partner || {}
    const stores = partner.stores || []
    const hqStore = stores.find((s: any) => s.is_headquarters) || stores[0] || {}
    const purchase = refund.purchase || {}
    const plan = purchase.plan || {}

    const handleApprove = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)
        setSuccessMessage(null)

        if (refundConfirmation !== "ESTORNAR") {
            setErrorMessage("Digite exatamente ESTORNAR para confirmar.")
            return
        }

        if (!refundPassword) {
            setErrorMessage("A senha de administrador é obrigatória para processar a devolução financeira.")
            return
        }

        setIsSubmitting(true)
        try {
            const res = await adminProcessRefundAction({
                refundRequestId: refund.id,
                refundConfirmation: "ESTORNAR",
                refundPassword,
                refundAmount: refundAmount ? Number(refundAmount) : undefined,
                adminResponse: adminResponse.trim() || undefined,
            })

            if (res.error) {
                setErrorMessage(res.error)
                return
            }

            setSuccessMessage("Reembolso aprovado e estorno efetuado com sucesso no Mercado Pago!")
            if (onSuccess) onSuccess()
            setTimeout(() => {
                onClose()
            }, 1800)
        } catch (err: any) {
            console.error("[AdminRefundReviewModal] Error:", err)
            setErrorMessage(err?.message || "Erro inesperado ao processar estorno.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleReject = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)
        setSuccessMessage(null)

        if (!adminResponse || adminResponse.trim().length < 5) {
            setErrorMessage("Informe uma justificativa para a recusa do reembolso.")
            return
        }

        setIsSubmitting(true)
        try {
            const res = await adminRejectRefundAction({
                refundRequestId: refund.id,
                adminResponse: adminResponse.trim(),
            })

            if (res.error) {
                setErrorMessage(res.error)
                return
            }

            setSuccessMessage("Solicitação de reembolso recusada.")
            if (onSuccess) onSuccess()
            setTimeout(() => {
                onClose()
            }, 1500)
        } catch (err: any) {
            console.error("[AdminRefundReviewModal] Error:", err)
            setErrorMessage(err?.message || "Erro ao recusar solicitação.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title="Análise de Reembolso (Step-Up Security)"
            maxWidth="3xl"
        >
            <div className="space-y-4 pt-1 pb-1">
                {/* Header com dados do parceiro e CDC */}
                <div className="p-4 bg-brand-gray dark:bg-dark-border/40 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-brand-green/10 flex items-center justify-center text-brand-green shrink-0">
                            {hqStore.logo_url ? (
                                <img src={hqStore.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                                <Store size={24} />
                            )}
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                {hqStore.name || "Loja Parceira"}
                            </h3>
                            <p className="text-xs text-brand-inactive-text">
                                Plano: <strong className="text-gray-700 dark:text-dark-body">{plan.name || "Assinatura"}</strong> • Valor: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(refund.amount)}</strong>
                            </p>
                        </div>
                    </div>

                    <div>
                        {refund.is_within_7_days ? (
                            <Badge variant="green" className="flex items-center gap-1">
                                <ShieldCheck size={12} />
                                <span>Dentro dos 7 dias (CDC Art. 49)</span>
                            </Badge>
                        ) : (
                            <Badge variant="orange" className="flex items-center gap-1">
                                <AlertTriangle size={12} />
                                <span>Fora dos 7 dias legais</span>
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full justify-start border-b border-brand-border dark:border-dark-border gap-6 bg-transparent p-0">
                        <TabsTrigger value="Dados Gerais">Dados Gerais</TabsTrigger>
                        <TabsTrigger value="Anexos" className="flex items-center gap-2">
                            <span>Anexos</span>
                            {totalAttachments > 0 && (
                                <Badge variant="green" className="px-1.5 py-0.2 text-[10px]">
                                    {totalAttachments}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* ─── TAB 1: DADOS GERAIS ─── */}
                    <TabsContent value="Dados Gerais" className="pt-4 space-y-5 focus-visible:outline-none">
                        {/* Justificativa e Motivo do Lojista */}
                        <FormSection title="Justificativa do Lojista">
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="text-brand-inactive-text font-medium">
                                        Motivo: <strong className="text-brand-dark dark:text-dark-heading">{getReasonLabel(refund.reason_category)}</strong>
                                    </span>
                                    <span className="text-brand-inactive-text">
                                        Solicitado em: {formatDate(refund.requested_at || refund.created_at)}
                                    </span>
                                </div>
                                <div className="p-3.5 bg-brand-gray/60 dark:bg-dark-border/20 rounded-xl text-xs text-gray-800 dark:text-dark-body border border-brand-border/60">
                                    {refund.reason_description}
                                </div>
                            </div>
                        </FormSection>

                        {/* Alternância de Ação: Aprovar ou Recusar */}
                        <div className="flex border-b border-brand-border dark:border-dark-border pt-1">
                            <button
                                type="button"
                                onClick={() => { setActionType("approve"); setErrorMessage(null) }}
                                className={`pb-2.5 px-4 text-xs font-bold transition-colors border-b-2 ${actionType === "approve" ? "border-brand-green text-brand-green" : "border-transparent text-gray-500 hover:text-gray-900"}`}
                            >
                                Aprovar & Estornar no Mercado Pago
                            </button>
                            <button
                                type="button"
                                onClick={() => { setActionType("reject"); setErrorMessage(null) }}
                                className={`pb-2.5 px-4 text-xs font-bold transition-colors border-b-2 ${actionType === "reject" ? "border-red-500 text-red-500" : "border-transparent text-gray-500 hover:text-gray-900"}`}
                            >
                                Recusar Solicitação
                            </button>
                        </div>

                        {/* Formulário de Aprovação com Step-Up Security */}
                        {actionType === "approve" ? (
                            <form onSubmit={handleApprove} className="space-y-4">
                                <div className="p-3.5 bg-brand-green/10 border border-brand-green/20 rounded-xl text-xs text-gray-700 dark:text-dark-body space-y-1">
                                    <p className="font-bold text-brand-green flex items-center gap-1.5">
                                        <Lock size={14} />
                                        <span>Ação Financeira Irreversível com Step-Up Auth</span>
                                    </p>
                                    <p>
                                        Ao confirmar, o Mercado Pago efetuará a devolução imediata do dinheiro, a assinatura será cancelada e o cliente terá <strong>24h de carência</strong> para salvar seus dados antes de ser rebaixado para o Plano Gratuito.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                            Valor do Estorno (R$)
                                        </label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={refundAmount}
                                            onChange={(e) => setRefundAmount(e.target.value)}
                                            placeholder="Valor a estornar"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                            Digite <span className="text-brand-green">ESTORNAR</span> para confirmar
                                        </label>
                                        <Input
                                            type="text"
                                            value={refundConfirmation}
                                            onChange={(e) => setRefundConfirmation(e.target.value)}
                                            placeholder="ESTORNAR"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                        <KeyRound size={14} className="text-brand-orange" />
                                        <span>Sua Senha de Administrador <span className="text-brand-red">*</span></span>
                                    </label>
                                    <Input
                                        type="password"
                                        value={refundPassword}
                                        onChange={(e) => setRefundPassword(e.target.value)}
                                        placeholder="Digite sua senha para autorizar"
                                        autoComplete="off"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                        Mensagem de Parecer para o Lojista (Opcional)
                                    </label>
                                    <FormTextarea
                                        value={adminResponse}
                                        onChange={(e) => setAdminResponse(e.target.value)}
                                        placeholder="Ex: Reembolso aprovado conforme garantia legal. Carência de 24h ativada..."
                                        rows={2}
                                    />
                                </div>

                                {errorMessage && (
                                    <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-xl text-xs text-red-600">
                                        {errorMessage}
                                    </div>
                                )}
                                {successMessage && (
                                    <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 rounded-xl text-xs text-green-600 font-bold">
                                        {successMessage}
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
                                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="default"
                                        className="bg-brand-green text-white hover:bg-brand-green/90 font-bold"
                                        disabled={isSubmitting || refundConfirmation !== "ESTORNAR" || !refundPassword}
                                        isLoading={isSubmitting}
                                    >
                                        Aprovar & Estornar
                                    </Button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleReject} className="space-y-4">
                                <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-xl text-xs text-red-800 dark:text-red-300">
                                    Ao recusar, o lojista será notificado e o plano continuará ativo normalmente até o fim do período.
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                        Motivo da Recusa (Obrigatório) <span className="text-brand-red">*</span>
                                    </label>
                                    <FormTextarea
                                        value={adminResponse}
                                        onChange={(e) => setAdminResponse(e.target.value)}
                                        placeholder="Explique o motivo pelo qual o reembolso não pôde ser concedido..."
                                        rows={3}
                                    />
                                </div>

                                {errorMessage && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                                        {errorMessage}
                                    </div>
                                )}
                                {successMessage && (
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-600 font-bold">
                                        {successMessage}
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-3 border-t border-brand-border dark:border-dark-border">
                                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="destructive"
                                        disabled={isSubmitting || !adminResponse || adminResponse.trim().length < 5}
                                        isLoading={isSubmitting}
                                    >
                                        Recusar Solicitação
                                    </Button>
                                </div>
                            </form>
                        )}
                    </TabsContent>

                    {/* ─── TAB 2: ANEXOS ─── */}
                    <TabsContent value="Anexos" className="pt-4 space-y-6 focus-visible:outline-none">
                        {images.length > 0 && (
                            <FormSection title="Imagens de Evidência">
                                <ProductImagesSection
                                    images={images}
                                    onImageUpload={() => {}}
                                    onRemoveImage={() => {}}
                                    onSetPrimaryImage={() => {}}
                                    isEditing={false}
                                />
                            </FormSection>
                        )}

                        {documents.length > 0 && (
                            <FormSection title="Documentos PDF" hasSeparator={images.length > 0}>
                                <div className="space-y-2">
                                    {documents.map((doc, idx) => (
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
                                Nenhum anexo ou evidência foi enviado pelo lojista nesta solicitação.
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Lightbox */}
            {previewImage && (
                <DefaultModal
                    isOpen={!!previewImage}
                    onClose={() => setPreviewImage(null)}
                    title="Evidência Ampliada"
                    maxWidth="2xl"
                >
                    <div className="p-2 flex items-center justify-center">
                        <img src={previewImage} alt="" className="max-h-[70vh] w-auto object-contain rounded-xl" />
                    </div>
                </DefaultModal>
            )}
        </DefaultModal>
    )
}

