"use client"

import React, { useState, useId } from "react"
import { DefaultModal, Button, Badge, FormTextarea, InfoCard } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { requestSubscriptionRefundAction } from "@/app/actions/billing/refunds"
import { UploadCloud, Image as ImageIcon, FileText, X, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react"
import Link from "next/link"

interface BillingRefundModalProps {
    isOpen: boolean
    onClose: () => void
    purchase: any
    partnerId: string
    onSuccess?: (token: string) => void
}

const REASON_OPTIONS = [
    { value: "repentance_7_days", label: "Direito de Arrependimento (Dentro dos 7 dias do CDC)" },
    { value: "double_charge", label: "Cobrança duplicada ou indevida" },
    { value: "technical_issue", label: "Dificuldade técnica ou instabilidade" },
    { value: "commercial_agreement", label: "Acordo comercial / Alteração de plano" },
    { value: "unsatisfied", label: "Insatisfação com os recursos" },
    { value: "other", label: "Outro motivo" },
]

export function BillingRefundModal({ isOpen, onClose, purchase, partnerId, onSuccess }: BillingRefundModalProps) {
    const [reasonCategory, setReasonCategory] = useState("repentance_7_days")
    const [reasonDescription, setReasonDescription] = useState("")
    const [images, setImages] = useState<string[]>([])
    const [documents, setDocuments] = useState<{ name: string; url: string }[]>([])
    const [isUploading, setIsUploading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [createdToken, setCreatedToken] = useState<string | null>(null)
    const imageInputId = useId()
    const docInputId = useId()

    if (!purchase) return null

    // Calcular se está dentro do prazo dos 7 dias
    const createdAtTime = new Date(purchase.created_at).getTime()
    const daysElapsed = (Date.now() - createdAtTime) / (1000 * 60 * 60 * 24)
    const isWithin7Days = daysElapsed <= 7.05

    const handleUploadFiles = async (files: FileList | null, type: "image" | "doc") => {
        if (!files || files.length === 0) return
        setErrorMessage(null)
        setIsUploading(true)

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i]

                if (type === "image") {
                    if (images.length >= 5) {
                        setErrorMessage("Limite máximo de 5 imagens atingido.")
                        break
                    }
                    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                        setErrorMessage("Apenas imagens JPG, PNG e WEBP são permitidas.")
                        continue
                    }
                } else {
                    if (documents.length >= 3) {
                        setErrorMessage("Limite máximo de 3 documentos PDF atingido.")
                        break
                    }
                    if (file.type !== "application/pdf") {
                        setErrorMessage("Apenas arquivos PDF são permitidos.")
                        continue
                    }
                }

                // 1. Obter Signed URL
                const signedRes = await fetch("/api/r2/billing-refund-evidence", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: file.name,
                        contentType: file.type,
                        fileSize: file.size,
                    }),
                })

                if (!signedRes.ok) {
                    const err = await signedRes.json().catch(() => ({}))
                    throw new Error(err.error || "Falha ao gerar upload.")
                }

                const signedData = await signedRes.json()

                // 2. Upload direto ao R2 via PUT
                const uploadRes = await fetch(signedData.signedUrl, {
                    method: "PUT",
                    headers: { "Content-Type": file.type },
                    body: file,
                })

                if (!uploadRes.ok) {
                    throw new Error("Falha no upload para o servidor de arquivos.")
                }

                if (type === "image") {
                    setImages((prev) => [...prev, signedData.publicUrl])
                } else {
                    setDocuments((prev) => [...prev, { name: file.name, url: signedData.publicUrl }])
                }
            }
        } catch (err: any) {
            console.error("[BillingRefundModal] Upload error:", err)
            setErrorMessage(err.message || "Erro no upload dos anexos.")
        } finally {
            setIsUploading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)

        if (!reasonDescription || reasonDescription.trim().length < 10) {
            setErrorMessage("Por favor, descreva o motivo do reembolso com pelo menos 10 caracteres.")
            return
        }

        setIsSubmitting(true)
        try {
            const res = await requestSubscriptionRefundAction({
                partnerId,
                purchaseId: purchase.id,
                reasonCategory: reasonCategory as any,
                reasonDescription: reasonDescription.trim(),
                images,
                documents: documents.map((d) => d.url),
            })

            if (res.error) {
                setErrorMessage(res.error)
                if (res.token) setCreatedToken(res.token)
                return
            }

            if (res.token) {
                setCreatedToken(res.token)
                if (onSuccess) onSuccess(res.token)
            }
        } catch (err: any) {
            console.error("[BillingRefundModal] Submit error:", err)
            setErrorMessage(err.message || "Erro ao solicitar reembolso.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCloseModal = () => {
        setCreatedToken(null)
        setReasonDescription("")
        setImages([])
        setDocuments([])
        setErrorMessage(null)
        onClose()
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={handleCloseModal}
            title="Solicitar Reembolso de Assinatura"
            maxWidth="2xl"
        >
            {createdToken ? (
                <div className="space-y-6 pt-2 pb-4 text-center">
                    <div className="w-16 h-16 bg-brand-green/10 text-brand-green rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 size={36} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                            Solicitação Registrada com Sucesso!
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-dark-body max-w-md mx-auto">
                            Nossa equipe irá analisar sua solicitação. Você pode acompanhar o status e o parecer da equipe através do portal público exclusivo.
                        </p>
                    </div>

                    <div className="p-4 bg-brand-gray dark:bg-dark-border/40 rounded-xl border border-brand-border dark:border-dark-border flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-left">
                            <p className="text-xs text-brand-inactive-text font-medium">Link de Acompanhamento</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Portal de Reembolso</p>
                        </div>
                        <Link href={`/reembolso/${createdToken}`} target="_blank">
                            <Button variant="filled" className="flex items-center gap-2">
                                <span>Acessar Portal</span>
                                <ArrowRight size={16} />
                            </Button>
                        </Link>
                    </div>

                    <div className="pt-2">
                        <Button variant="outline" onClick={handleCloseModal} className="w-full sm:w-auto">
                            Fechar
                        </Button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6 pt-2 pb-2">
                    {/* Alerta de Garantia Legal do CDC */}
                    {isWithin7Days ? (
                        <div className="p-4 bg-brand-green/10 border border-brand-green/20 rounded-xl flex items-start gap-3 text-left">
                            <ShieldCheck className="w-6 h-6 text-brand-green flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-brand-green">
                                    Garantia Legal do CDC (Art. 49) Ativa
                                </p>
                                <p className="text-xs text-gray-600 dark:text-dark-body mt-0.5">
                                    Sua compra foi realizada há {Math.floor(daysElapsed)} dia(s). Você possui direito ao reembolso integral de 100% do valor pago.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-brand-orange/10 border border-brand-orange/20 rounded-xl flex items-start gap-3 text-left">
                            <AlertTriangle className="w-6 h-6 text-brand-orange flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-brand-orange">
                                    Período Superior a 7 Dias
                                </p>
                                <p className="text-xs text-gray-600 dark:text-dark-body mt-0.5">
                                    Sua compra foi realizada há {Math.floor(daysElapsed)} dias. Conforme os Termos de Uso, a solicitação será analisada individualmente pela administração.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Resumo da Fatura */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-brand-gray dark:bg-dark-border/30 rounded-xl border border-brand-border dark:border-dark-border text-xs">
                        <div>
                            <span className="text-brand-inactive-text block">Fatura / Plano</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading truncate block">
                                {purchase.description || "Assinatura"}
                            </span>
                        </div>
                        <div>
                            <span className="text-brand-inactive-text block">Valor Pago</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading block">
                                {formatCurrency(purchase.total_amount || purchase.amount)}
                            </span>
                        </div>
                        <div>
                            <span className="text-brand-inactive-text block">Data do Pagamento</span>
                            <span className="font-bold text-brand-dark dark:text-dark-heading block">
                                {formatDate(purchase.created_at)}
                            </span>
                        </div>
                    </div>

                    {/* Motivo */}
                    <div className="space-y-2 text-left">
                        <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                            Motivo Principal do Pedido <span className="text-brand-red">*</span>
                        </label>
                        <select
                            value={reasonCategory}
                            onChange={(e) => setReasonCategory(e.target.value)}
                            className="w-full h-10 px-3 text-sm bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-lg text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green"
                        >
                            {REASON_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Descrição Detalhada */}
                    <div className="space-y-2 text-left">
                        <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                            Justificativa Detalhada <span className="text-brand-red">*</span>
                        </label>
                        <FormTextarea
                            value={reasonDescription}
                            onChange={(e) => setReasonDescription(e.target.value)}
                            placeholder="Explique detalhadamente o motivo da sua solicitação de reembolso..."
                            rows={3}
                        />
                    </div>

                    {/* Upload de Evidências (Imagens e Documentos) */}
                    <div className="space-y-3 text-left">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                Anexos e Evidências (Opcional)
                            </label>
                            <span className="text-[11px] text-gray-400">
                                Máx: 5 fotos e 3 PDFs
                            </span>
                        </div>

                        {/* Botões de Upload */}
                        <div className="flex flex-wrap gap-2">
                            <label
                                htmlFor={imageInputId}
                                className={`flex items-center gap-2 px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg text-xs font-medium cursor-pointer transition-colors bg-white dark:bg-dark-surface hover:bg-brand-gray dark:hover:bg-dark-border/40 ${images.length >= 5 ? "opacity-50 pointer-events-none" : ""}`}
                            >
                                <ImageIcon size={16} className="text-brand-green" />
                                <span>Adicionar Imagens ({images.length}/5)</span>
                                <input
                                    id={imageInputId}
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => handleUploadFiles(e.target.files, "image")}
                                    disabled={isUploading || images.length >= 5}
                                />
                            </label>

                            <label
                                htmlFor={docInputId}
                                className={`flex items-center gap-2 px-3 py-2 border border-brand-border dark:border-dark-border rounded-lg text-xs font-medium cursor-pointer transition-colors bg-white dark:bg-dark-surface hover:bg-brand-gray dark:hover:bg-dark-border/40 ${documents.length >= 3 ? "opacity-50 pointer-events-none" : ""}`}
                            >
                                <FileText size={16} className="text-brand-orange" />
                                <span>Adicionar PDF ({documents.length}/3)</span>
                                <input
                                    id={docInputId}
                                    type="file"
                                    multiple
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={(e) => handleUploadFiles(e.target.files, "doc")}
                                    disabled={isUploading || documents.length >= 3}
                                />
                            </label>
                        </div>

                        {/* Preview de Imagens */}
                        {images.length > 0 && (
                            <div className="grid grid-cols-5 gap-2 pt-2">
                                {images.map((imgUrl, idx) => (
                                    <div key={idx} className="relative group aspect-square rounded-lg border border-brand-border overflow-hidden bg-brand-gray">
                                        <img src={imgUrl} alt={`Evidência ${idx + 1}`} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Preview de PDFs */}
                        {documents.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                                {documents.map((doc, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-brand-gray dark:bg-dark-border/30 rounded-lg text-xs border border-brand-border dark:border-dark-border">
                                        <div className="flex items-center gap-2 truncate">
                                            <FileText size={14} className="text-brand-orange flex-shrink-0" />
                                            <span className="truncate">{doc.name}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {errorMessage && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg text-xs text-red-600 dark:text-red-400 text-left">
                            {errorMessage}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="filled" disabled={isSubmitting || isUploading}>
                            {isSubmitting ? "Enviando Solicitação..." : "Enviar Solicitação"}
                        </Button>
                    </div>
                </form>
            )}
        </DefaultModal>
    )
}
