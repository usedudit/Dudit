"use client"

import React, { useState, useId, useEffect } from "react"
import {
    DefaultModal,
    Button,
    Badge,
    FormTextarea,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    FormSection,
    IconPlaceholder,
    InfoCard,
} from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { requestSubscriptionRefundAction } from "@/app/actions/billing/refunds"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import {
    CheckCircle2,
    AlertTriangle,
    ShieldCheck,
    ArrowRight,
    FileText,
} from "lucide-react"
import { TrashIcon, UploadIcon } from "@/lib/icons"
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
    const [activeTab, setActiveTab] = useState("Dados Gerais")
    const [reasonCategory, setReasonCategory] = useState("repentance_7_days")
    const [reasonDescription, setReasonDescription] = useState("")
    
    // Staged files locally in memory (NOT uploaded until user submits)
    const [stagedImages, setStagedImages] = useState<File[]>([])
    const [stagedDocs, setStagedDocs] = useState<File[]>([])

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [createdToken, setCreatedToken] = useState<string | null>(null)
    const docInputId = useId()

    useEffect(() => {
        if (!isOpen) {
            setActiveTab("Dados Gerais")
            setReasonCategory("repentance_7_days")
            setReasonDescription("")
            setStagedImages([])
            setStagedDocs([])
            setErrorMessage(null)
            setCreatedToken(null)
        }
    }, [isOpen])

    if (!purchase) return null

    // Calcular se está dentro do prazo dos 7 dias
    const createdAtTime = new Date(purchase.created_at).getTime()
    const daysElapsed = (Date.now() - createdAtTime) / (1000 * 60 * 60 * 24)
    const isWithin7Days = daysElapsed <= 7.05

    // Image handlers for ProductImagesSection
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        setErrorMessage(null)

        const incoming = Array.from(files)
        const validImages = incoming.filter((f) =>
            ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(f.type)
        )

        if (validImages.length + stagedImages.length > 5) {
            setErrorMessage("Máximo de 5 imagens permitido.")
            setStagedImages((prev) => [...prev, ...validImages].slice(0, 5))
            return
        }

        setStagedImages((prev) => [...prev, ...validImages])
    }

    const handleRemoveImage = (index: number) => {
        setStagedImages((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSetPrimaryImage = (index: number) => {
        if (index === 0) return
        setStagedImages((prev) => {
            const copy = [...prev]
            const [selected] = copy.splice(index, 1)
            copy.unshift(selected)
            return copy
        })
    }

    // PDF documents handler
    const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        setErrorMessage(null)

        const incoming = Array.from(files)
        const validDocs = incoming.filter((f) => f.type === "application/pdf")

        if (validDocs.length !== incoming.length) {
            setErrorMessage("Apenas arquivos PDF são permitidos.")
        }

        if (validDocs.length + stagedDocs.length > 3) {
            setErrorMessage("Máximo de 3 documentos PDF permitido.")
            setStagedDocs((prev) => [...prev, ...validDocs].slice(0, 3))
            return
        }

        setStagedDocs((prev) => [...prev, ...validDocs])
        e.target.value = ""
    }

    const handleRemoveDoc = (index: number) => {
        setStagedDocs((prev) => prev.filter((_, i) => i !== index))
    }

    // Upload a single file to R2 via signed URL
    const uploadFileToR2 = async (file: File): Promise<string> => {
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
            throw new Error(err.error || `Falha ao gerar upload para ${file.name}`)
        }

        const signedData = await signedRes.json()

        const uploadRes = await fetch(signedData.signedUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
        })

        if (!uploadRes.ok) {
            throw new Error(`Falha no upload do arquivo ${file.name}`)
        }

        return signedData.publicUrl
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMessage(null)

        if (!reasonDescription || reasonDescription.trim().length < 10) {
            setErrorMessage("Por favor, descreva o motivo do reembolso com pelo menos 10 caracteres.")
            setActiveTab("Dados Gerais")
            return
        }

        setIsSubmitting(true)
        try {
            // 1. Upload staged images to R2
            const uploadedImageUrls: string[] = []
            for (const imgFile of stagedImages) {
                const url = await uploadFileToR2(imgFile)
                uploadedImageUrls.push(url)
            }

            // 2. Upload staged documents to R2
            const uploadedDocUrls: string[] = []
            for (const docFile of stagedDocs) {
                const url = await uploadFileToR2(docFile)
                uploadedDocUrls.push(url)
            }

            // 3. Register refund request with the uploaded URLs
            const res = await requestSubscriptionRefundAction({
                partnerId,
                purchaseId: purchase.id,
                reasonCategory: reasonCategory as any,
                reasonDescription: reasonDescription.trim(),
                images: uploadedImageUrls,
                documents: uploadedDocUrls,
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
        setStagedImages([])
        setStagedDocs([])
        setErrorMessage(null)
        onClose()
    }

    const totalAttachmentsCount = stagedImages.length + stagedDocs.length

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={handleCloseModal}
            title="Solicitar Reembolso de Assinatura"
            maxWidth="3xl"
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
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body max-w-md mx-auto">
                            Nossa equipe irá analisar sua solicitação. Você pode acompanhar o status e o parecer da equipe através do portal de reembolso.
                        </p>
                    </div>

                    <div className="p-4 bg-brand-gray dark:bg-dark-border/40 rounded-2xl border border-brand-border dark:border-dark-border flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-left">
                            <p className="text-xs text-brand-inactive-text font-medium">Link de Acompanhamento</p>
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Portal de Reembolso</p>
                        </div>
                        <Link href={`/reembolso/${createdToken}`} target="_blank">
                            <Button variant="default" className="bg-brand-green text-white hover:bg-brand-green/90 font-bold flex items-center gap-2">
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
                <form onSubmit={handleSubmit} className="flex flex-col space-y-4 pt-1 pb-1">
                    {/* Alerta de Garantia Legal do CDC */}
                    {isWithin7Days ? (
                        <div className="p-4 bg-brand-green/10 border border-brand-green/20 rounded-2xl flex items-start gap-3 text-left">
                            <ShieldCheck className="w-6 h-6 text-brand-green flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-brand-green">
                                    Garantia Legal do CDC (Art. 49) Ativa
                                </p>
                                <p className="text-xs text-brand-dark dark:text-dark-body mt-0.5">
                                    Sua compra foi realizada há {Math.floor(daysElapsed)} dia(s). Você possui direito ao reembolso integral de 100% do valor pago.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-brand-orange/10 border border-brand-orange/20 rounded-2xl flex items-start gap-3 text-left">
                            <AlertTriangle className="w-6 h-6 text-brand-orange flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-brand-orange">
                                    Período Superior a 7 Dias
                                </p>
                                <p className="text-xs text-brand-dark dark:text-dark-body mt-0.5">
                                    Sua compra foi realizada há {Math.floor(daysElapsed)} dias. Conforme os Termos de Uso, a solicitação será analisada individualmente pela administração.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Tabs de Navegação */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="w-full justify-start border-b border-brand-border dark:border-dark-border gap-6 bg-transparent p-0">
                            <TabsTrigger value="Dados Gerais">Dados Gerais</TabsTrigger>
                            <TabsTrigger value="Anexos" className="flex items-center gap-2">
                                <span>Anexos</span>
                                {totalAttachmentsCount > 0 && (
                                    <Badge variant="green" className="px-1.5 py-0.2 text-[10px] leading-tight">
                                        {totalAttachmentsCount}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        {/* ─── TAB 1: DADOS GERAIS ─── */}
                        <TabsContent value="Dados Gerais" className="pt-4 space-y-5 focus-visible:outline-none">
                            {/* Resumo da Fatura */}
                            <FormSection title="Resumo da fatura">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-brand-gray dark:bg-dark-border/30 rounded-2xl border border-brand-border dark:border-dark-border text-xs">
                                    <div>
                                        <span className="text-brand-inactive-text block">Fatura / Plano</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading truncate block mt-0.5">
                                            {purchase.description || "Assinatura"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-brand-inactive-text block">Valor Pago</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading block mt-0.5">
                                            {formatCurrency(purchase.total_amount || purchase.amount)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-brand-inactive-text block">Data do Pagamento</span>
                                        <span className="font-bold text-brand-dark dark:text-dark-heading block mt-0.5">
                                            {formatDate(purchase.created_at)}
                                        </span>
                                    </div>
                                </div>
                            </FormSection>

                            {/* Motivo */}
                            <div className="space-y-2 text-left">
                                <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    Motivo Principal do Pedido <span className="text-brand-red">*</span>
                                </label>
                                <select
                                    value={reasonCategory}
                                    onChange={(e) => setReasonCategory(e.target.value)}
                                    className="w-full h-11 px-3.5 text-sm bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green"
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
                                    rows={4}
                                />
                            </div>
                        </TabsContent>

                        {/* ─── TAB 2: ANEXOS ─── */}
                        <TabsContent value="Anexos" className="pt-4 space-y-6 focus-visible:outline-none">
                            {/* Seção de Imagens usando ProductImagesSection */}
                            <FormSection title="Imagens de Evidência" description="Adicione até 5 imagens demonstrando a ocorrência (JPG, PNG, WEBP, AVIF).">
                                <ProductImagesSection
                                    images={stagedImages}
                                    onImageUpload={handleImageUpload}
                                    onRemoveImage={handleRemoveImage}
                                    onSetPrimaryImage={handleSetPrimaryImage}
                                    isEditing={true}
                                />
                            </FormSection>

                            {/* Seção de Documentos PDF */}
                            <FormSection title="Documentos em PDF" description="Anexe até 3 documentos ou comprovantes adicionais em formato PDF." hasSeparator>
                                <div className="space-y-3">
                                    {stagedDocs.length < 3 && (
                                        <label
                                            htmlFor={docInputId}
                                            className="w-full border-2 border-dashed border-brand-border dark:border-dark-border rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:border-brand-green dark:hover:border-brand-green transition-colors"
                                        >
                                            <IconPlaceholder
                                                icon={UploadIcon}
                                                iconSize="w-7 h-7"
                                                title="Adicionar documento PDF"
                                                subtitle="Clique para anexar arquivo PDF"
                                            />
                                            <input
                                                id={docInputId}
                                                type="file"
                                                multiple
                                                accept="application/pdf"
                                                className="hidden"
                                                onChange={handleDocUpload}
                                            />
                                        </label>
                                    )}

                                    {stagedDocs.length > 0 && (
                                        <div className="space-y-2">
                                            {stagedDocs.map((doc, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between p-3 bg-brand-gray dark:bg-dark-border/30 rounded-xl border border-brand-border dark:border-dark-border text-xs"
                                                >
                                                    <div className="flex items-center gap-2.5 truncate">
                                                        <FileText className="w-5 h-5 text-brand-orange shrink-0" />
                                                        <span className="truncate font-medium text-brand-dark dark:text-dark-heading">
                                                            {doc.name}
                                                        </span>
                                                        <span className="text-[11px] text-brand-inactive-text">
                                                            ({(doc.size / 1024).toFixed(1)} KB)
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveDoc(idx)}
                                                        className="p-1.5 text-brand-inactive-text hover:text-brand-red rounded-lg transition-colors"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </FormSection>
                        </TabsContent>
                    </Tabs>

                    {errorMessage && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-xl text-xs text-red-600 dark:text-red-400 text-left">
                            {errorMessage}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                        <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            variant="default"
                            className="bg-brand-green text-white hover:bg-brand-green/90 font-bold"
                            disabled={isSubmitting}
                            isLoading={isSubmitting}
                        >
                            Enviar Solicitação
                        </Button>
                    </div>
                </form>
            )}
        </DefaultModal>
    )
}

