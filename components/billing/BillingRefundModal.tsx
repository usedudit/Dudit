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
    FormDropdown,
} from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { requestSubscriptionRefundAction } from "@/app/actions/billing/refunds"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import { TrashIcon, CheckCircleIcon, FileIcon } from "@/lib/icons"

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

function formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 KB"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function BillingRefundModal({ isOpen, onClose, purchase, partnerId, onSuccess }: BillingRefundModalProps) {
    const [activeTab, setActiveTab] = useState("Dados Gerais")
    const [reasonCategory, setReasonCategory] = useState("repentance_7_days")
    const [reasonDescription, setReasonDescription] = useState("")

    // Staged files locally in memory (NOT uploaded until user submits)
    const [stagedImages, setStagedImages] = useState<File[]>([])
    const [stagedDocs, setStagedDocs] = useState<File[]>([])

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadStatus, setUploadStatus] = useState<string | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [createdToken, setCreatedToken] = useState<string | null>(null)
    const docInputId = useId()
    // O footer do DefaultModal é renderizado fora do <form>, por isso o botão de envio
    // precisa referenciar o formulário pelo atributo `form`.
    const formId = useId()

    useEffect(() => {
        if (!isOpen) {
            setActiveTab("Dados Gerais")
            setReasonCategory("repentance_7_days")
            setReasonDescription("")
            setStagedImages([])
            setStagedDocs([])
            setErrorMessage(null)
            setUploadStatus(null)
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
            ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(f.type) ||
            /\.(jpg|jpeg|png|webp|avif)$/i.test(f.name)
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
        const validDocs = incoming.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))

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
    const uploadFileToR2 = async (file: File): Promise<{ url: string; name: string; size: number; key?: string }> => {
        let contentType = file.type
        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
        if (!contentType || contentType === "application/octet-stream") {
            if (ext === ".pdf") contentType = "application/pdf"
            else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg"
            else if (ext === ".png") contentType = "image/png"
            else if (ext === ".webp") contentType = "image/webp"
            else if (ext === ".avif") contentType = "image/avif"
        }

        const signedRes = await fetch("/api/r2/billing-refund-evidence", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: file.name,
                contentType,
                fileSize: file.size,
            }),
        })

        if (!signedRes.ok) {
            const err = await signedRes.json().catch(() => ({}))
            throw new Error(err.error || `Falha ao gerar upload para ${file.name}`)
        }

        const signedData = await signedRes.json()
        const uploadUrl = signedData.uploadUrl || signedData.signedUrl
        if (!uploadUrl) {
            throw new Error(`URL de upload não encontrada para ${file.name}`)
        }

        const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": signedData.contentType || contentType },
            body: file,
        })

        if (!uploadRes.ok) {
            throw new Error(`Falha no upload do arquivo ${file.name}`)
        }

        return {
            url: signedData.publicUrl,
            name: file.name,
            size: file.size,
            key: signedData.key,
        }
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
        setUploadStatus("Enviando evidências...")
        try {
            // 1. Upload staged images to R2
            const uploadedImages: { url: string; name: string; size: number; key?: string }[] = []
            for (let i = 0; i < stagedImages.length; i++) {
                const imgFile = stagedImages[i]
                setUploadStatus(`Enviando imagem (${i + 1}/${stagedImages.length})...`)
                const uploaded = await uploadFileToR2(imgFile)
                uploadedImages.push(uploaded)
            }

            // 2. Upload staged documents to R2
            const uploadedDocs: { url: string; name: string; size: number; key?: string }[] = []
            for (let i = 0; i < stagedDocs.length; i++) {
                const docFile = stagedDocs[i]
                setUploadStatus(`Enviando documento (${i + 1}/${stagedDocs.length})...`)
                const uploaded = await uploadFileToR2(docFile)
                uploadedDocs.push(uploaded)
            }

            setUploadStatus("Registrando solicitação...")

            // 3. Register refund request with the uploaded URLs and metadata
            const res = await requestSubscriptionRefundAction({
                partnerId,
                purchaseId: purchase.id,
                reasonCategory: reasonCategory as any,
                reasonDescription: reasonDescription.trim(),
                images: uploadedImages,
                documents: uploadedDocs,
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
            setUploadStatus(null)
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
            footer={
                <div className="flex items-center justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseModal}
                        disabled={isSubmitting}
                    >
                        {createdToken ? "Fechar" : "Cancelar"}
                    </Button>
                    {!createdToken && (
                        <Button
                            type="submit"
                            form={formId}
                            disabled={isSubmitting}
                            isLoading={isSubmitting}
                        >
                            {isSubmitting ? (uploadStatus || "Enviando...") : "Enviar Solicitação"}
                        </Button>
                    )}
                </div>
            }
        >
            {createdToken ? (
                <IconPlaceholder
                    icon={CheckCircleIcon}
                    title="Solicitação Registrada com Sucesso!"
                    subtitle="Nossa equipe irá analisar sua solicitação. Você pode acompanhar o status e o parecer da equipe através do portal de reembolso."
                    itemButton={{
                        text: "Acessar Portal",
                        action: () => {
                            window.open(`/reembolso/${createdToken}`, "_blank")
                            handleCloseModal()
                        },
                    }}
                />
            ) : (
                <form id={formId} onSubmit={handleSubmit} className="flex flex-col space-y-4 pt-1 pb-1">
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

                        {/* Alerta de Garantia Legal do CDC */}
                        {isWithin7Days ? (
                            <InfoCard title="Garantia Legal do CDC (Art. 49) Ativa" message={`Sua compra foi realizada há ${Math.floor(daysElapsed)} dia(s). Você possui direito ao reembolso integral de 100% do valor pago.`} color="green" className="mt-4" />
                        ) : (
                            <InfoCard title="Período Superior a 7 Dias" message={`Sua compra foi realizada há ${Math.floor(daysElapsed)} dias. Conforme os Termos de Uso, a solicitação será analisada individualmente pela administração.`} color="orange" className="mt-4" />
                        )}

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
                                <FormDropdown
                                    label="Motivo"
                                    value={reasonCategory}
                                    setValue={(val) => setReasonCategory(val)}
                                    options={[
                                        ...REASON_OPTIONS.map((opt) => ({
                                            value: opt.value,
                                            label: opt.label,
                                        })),
                                    ]}
                                />
                            </div>

                            {/* Descrição Detalhada */}
                            <div className="space-y-2 text-left">
                                <FormTextarea
                                    required
                                    label="Justificativa Detalhada"
                                    value={reasonDescription}
                                    onChange={(e) => setReasonDescription(e.target.value)}
                                    placeholder="Explique detalhadamente o motivo da sua solicitação de reembolso..."
                                    rows={4}
                                    maxLength={2000}
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
                                                icon={FileIcon}
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
                                        <div className="space-y-2.5">
                                            {stagedDocs.map((doc, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between p-3.5 bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border shadow-xs"
                                                >
                                                    <div className="flex items-center gap-3.5 min-w-0">
                                                        <div className="w-11 h-11 rounded-xl bg-white dark:bg-dark-border/60 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0 shadow-xs">
                                                            <FileIcon className="w-5 h-5 text-brand-dark dark:text-dark-heading" />
                                                        </div>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="font-bold text-[13px] sm:text-sm text-brand-dark dark:text-dark-heading truncate">
                                                                {doc.name}
                                                            </span>
                                                            <span className="text-xs text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                                {formatFileSize(doc.size)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveDoc(idx)}
                                                        className="p-2 text-brand-inactive-text hover:text-brand-red rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors ml-2 shrink-0"
                                                        title="Remover documento"
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
                        <InfoCard color="red" title="Erro" message={errorMessage} />
                    )}
                </form>
            )}
        </DefaultModal>
    )
}

