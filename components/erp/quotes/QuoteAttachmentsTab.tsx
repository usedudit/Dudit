"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button, FormSection, IconPlaceholder, AlertModal, ListItem } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import ImageCropperModal from "@/components/ImageCropperModal"
import { dataUrlToFile } from "@/lib/utils/image-resize"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan, getPlanImageAttachmentLimit } from "@/lib/subscription/plan-tier"
import { isGifFile } from "@/lib/security/file-validator"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import {
    getQuoteAttachmentUrlAction,
    getQuotePresignedUploadUrlAction,
    saveQuoteAttachmentAction,
    deleteQuoteAttachmentAction
} from "@/app/actions/erp/quotes"
import { formatFileSize } from "@/components/erp/orders/OrderAttachmentsTab"

interface QuoteAttachmentsTabProps {
    partnerId: string
    quoteId?: string
    attachments?: any[]
    isEditing?: boolean
    onChange?: (newAttachments: any[], deletedIds?: string[]) => void
    onMutation?: () => void
}

type AttachmentCategory = "normal" | "antes" | "depois"

export default function QuoteAttachmentsTab({
    partnerId,
    quoteId,
    attachments = [],
    isEditing = false,
    onChange,
    onMutation,
}: QuoteAttachmentsTabProps) {
    const { toast } = useToast()
    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const docInputRef = useRef<HTMLInputElement>(null)

    const [localAttachments, setLocalAttachments] = useState<any[]>(attachments)
    const [showCropper, setShowCropper] = useState(false)
    const [imageForCrop, setImageForCrop] = useState<File | null>(null)
    const [pendingCategory, setPendingCategory] = useState<AttachmentCategory>("normal")
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

    useEffect(() => {
        setLocalAttachments(attachments)
    }, [attachments])

    const advancedEnabled = hasMinimumPlan(planSlug, "crescer")
    const imagePlanLimit = getPlanImageAttachmentLimit(planSlug)

    const handleImageUpload = (category: AttachmentCategory, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

        if (!advancedEnabled) {
            openPlanUpgrade("crescer")
            return
        }

        if (isGifFile(file)) {
            toast({ description: "Arquivos GIF não são permitidos no sistema." })
            return
        }

        const totalImagesCount = localAttachments.filter(att =>
            att.file_type?.startsWith("image/") || att.file?.type?.startsWith("image/")
        ).length

        if (totalImagesCount >= imagePlanLimit) {
            toast({ description: `Você atingiu o limite de ${imagePlanLimit} imagem(ns) para o seu plano.` })
            return
        }

        setPendingCategory(category)
        setImageForCrop(file)
        setShowCropper(true)
    }

    const handleCropComplete = async (croppedDataUrl: string) => {
        setShowCropper(false)
        setImageForCrop(null)
        try {
            const file = dataUrlToFile(croppedDataUrl, "quote-attachment")

            if (quoteId) {
                // Direct upload with parallelized presigned URL and client hash
                const [presignedRes, fileHash] = await Promise.all([
                    getQuotePresignedUploadUrlAction(partnerId, "quotes/attachments", file.name, file.type, file.size),
                    (async () => {
                        try {
                            const buffer = await file.arrayBuffer()
                            const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer)
                            const hashArray = Array.from(new Uint8Array(hashBuffer))
                            return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
                        } catch {
                            return ""
                        }
                    })()
                ])
                if (!presignedRes.success) {
                    toast({ description: presignedRes.error || "Erro ao preparar upload da imagem." })
                    return
                }

                await fetch(presignedRes.uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": file.type },
                    body: file,
                })

                const saveRes = await saveQuoteAttachmentAction(
                    partnerId,
                    quoteId,
                    presignedRes.key,
                    file.name,
                    file.type,
                    file.size,
                    pendingCategory,
                    fileHash
                )

                if (saveRes.success) {
                    const updated = [...localAttachments, saveRes.data]
                    setLocalAttachments(updated)
                    onChange?.(updated, [])
                    onMutation?.()
                    toast({ description: "Imagem salva com sucesso." })
                } else {
                    toast({ description: saveRes.error || "Erro ao salvar anexo de imagem." })
                }
            } else {
                // Staged for new quote
                const newAtt = {
                    id: `new-${Date.now()}-${Math.random()}`,
                    file,
                    file_name: file.name,
                    file_type: file.type,
                    category: pendingCategory,
                }
                const updated = [...localAttachments, newAtt]
                setLocalAttachments(updated)
                onChange?.(updated, [])
            }
        } catch (err) {
            toast({ description: "Erro ao processar imagem." })
        }
    }

    const handleRemoveImage = async (targetId: string) => {
        const target = localAttachments.find(att => att.id === targetId)
        if (!target) return

        if (!target.file && quoteId) {
            try {
                const res = await deleteQuoteAttachmentAction(partnerId, target.id, quoteId)
                if (res.success) {
                    toast({ description: "Imagem removida com sucesso." })
                    const updated = localAttachments.filter(att => att.id !== target.id)
                    setLocalAttachments(updated)
                    onChange?.(updated, [target.id])
                    onMutation?.()
                } else {
                    toast({ description: res.error || "Erro ao remover imagem." })
                }
            } catch (err) {
                toast({ description: "Erro ao excluir imagem." })
            }
        } else {
            const updated = localAttachments.filter(att => att.id !== target.id)
            setLocalAttachments(updated)
            onChange?.(updated, target.file ? [] : [target.id])
        }
    }

    const handleDocUploadClick = (category: AttachmentCategory) => {
        if (!advancedEnabled) {
            openPlanUpgrade("crescer")
            return
        }
        setPendingCategory(category)
        docInputRef.current?.click()
    }

    const handleDocChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

        if (isGifFile(file)) {
            toast({ description: "Arquivos GIF não são permitidos no sistema." })
            return
        }

        if (file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(file.name)) {
            toast({ description: "Arquivos de imagem não são permitidos na seção de documentos. Utilize as seções de imagem abaixo." })
            return
        }

        if (quoteId) {
            try {
                const [presignedRes, fileHash] = await Promise.all([
                    getQuotePresignedUploadUrlAction(partnerId, "quotes/attachments", file.name, file.type, file.size),
                    (async () => {
                        try {
                            const buffer = await file.arrayBuffer()
                            const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer)
                            const hashArray = Array.from(new Uint8Array(hashBuffer))
                            return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
                        } catch {
                            return ""
                        }
                    })()
                ])
                if (!presignedRes.success) {
                    toast({ description: presignedRes.error || "Erro ao preparar upload do documento." })
                    return
                }

                await fetch(presignedRes.uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": file.type },
                    body: file,
                })

                const saveRes = await saveQuoteAttachmentAction(
                    partnerId,
                    quoteId,
                    presignedRes.key,
                    file.name,
                    file.type,
                    file.size,
                    pendingCategory,
                    fileHash
                )

                if (saveRes.success) {
                    const updated = [...localAttachments, saveRes.data]
                    setLocalAttachments(updated)
                    onChange?.(updated, [])
                    onMutation?.()
                    toast({ description: "Documento salvo com sucesso." })
                } else {
                    toast({ description: saveRes.error || "Erro ao registrar documento." })
                }
            } catch (err) {
                toast({ description: "Erro ao enviar documento." })
            }
        } else {
            const newAtt = {
                id: `new-${Date.now()}-${Math.random()}`,
                file,
                file_name: file.name,
                file_type: file.type,
                category: pendingCategory,
            }
            const updated = [...localAttachments, newAtt]
            setLocalAttachments(updated)
            onChange?.(updated, [])
        }
    }

    const handleDeleteDoc = async (docId: string) => {
        const target = localAttachments.find(att => att.id === docId)
        if (!target) return

        if (!target.file && quoteId) {
            try {
                const res = await deleteQuoteAttachmentAction(partnerId, target.id, quoteId)
                if (res.success) {
                    toast({ description: "Anexo removido com sucesso." })
                    const updated = localAttachments.filter(att => att.id !== docId)
                    setLocalAttachments(updated)
                    onChange?.(updated, [docId])
                    onMutation?.()
                } else {
                    toast({ description: res.error || "Erro ao remover anexo." })
                }
            } catch (err) {
                toast({ description: "Erro ao excluir anexo." })
            }
        } else {
            const updated = localAttachments.filter(att => att.id !== docId)
            setLocalAttachments(updated)
            onChange?.(updated, target.file ? [] : [docId])
        }
    }

    const requestDeleteDoc = (docId: string) => {
        setDeletingDocId(docId)
        setDeleteModalOpen(true)
    }

    const confirmDeleteDoc = () => {
        if (!deletingDocId) return
        handleDeleteDoc(deletingDocId)
        setDeleteModalOpen(false)
        setDeletingDocId(null)
    }

    const handleDownloadDoc = async (fileKey: string) => {
        try {
            if (!quoteId) return
            const res = await getQuoteAttachmentUrlAction(partnerId, quoteId, fileKey)
            if (res.success) {
                window.open(res.downloadUrl, "_blank")
            } else {
                toast({ description: res.error || "Erro ao obter arquivo." })
            }
        } catch (err) {
            toast({ description: "Erro ao abrir documento." })
        }
    }

    const isImageAttachment = (att: any) =>
        att.file_type?.startsWith("image/") || att.file?.type?.startsWith("image/")

    const getAttachmentsFor = (categories: AttachmentCategory[]) =>
        (localAttachments || []).filter(att =>
            categories.includes((att.category || "normal") as AttachmentCategory)
        )

    const getImagesFor = (categories: AttachmentCategory[]) =>
        getAttachmentsFor(categories).filter(isImageAttachment)

    const getDocsFor = (categories: AttachmentCategory[]) =>
        getAttachmentsFor(categories).filter(att => !isImageAttachment(att))

    const renderDocsGrid = (docs: any[]) => {
        if (docs.length === 0) return null
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                {docs.map((doc) => (
                    <ListItem
                        key={doc.id}
                        icon={FileIcon}
                        title={doc.file_name || doc.file?.name || "Documento"}
                        description={doc.file ? `${doc.file.size ? formatFileSize(doc.file.size) + " • " : ""}Pendente de envio` : (doc.file_size ? formatFileSize(doc.file_size) : undefined)}
                        onClick={() => {
                            if (!doc.file && doc.file_key) {
                                handleDownloadDoc(doc.file_key)
                            }
                        }}
                        className="p-3.5"
                        right={
                            isEditing ? (
                                <Button
                                    type="button"
                                    variant="ghostred"
                                    size="icon"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        requestDeleteDoc(doc.id)
                                    }}
                                    title="Excluir anexo"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </Button>
                            ) : undefined
                        }
                    />
                ))}
            </div>
        )
    }

    const renderDocsContent = (category: AttachmentCategory) => {
        const docs = getDocsFor([category])

        if (docs.length === 0) {
            return isEditing ? (
                <div className="flex flex-col items-center justify-center text-center py-6">
                    <IconPlaceholder
                        icon={FileIcon}
                        title="Nenhum documento adicionado"
                        subtitle="Adicione documentos em PDF, Word, Excel, CSV, Zip, etc."
                        itemButton={{
                            text: "Adicionar Documento",
                            action: () => handleDocUploadClick(category),
                            variant: "outline",
                        }}
                    />
                </div>
            ) : null
        }

        return (
            <>
                {renderDocsGrid(docs)}
                {isEditing && (
                    <div className="flex justify-end pt-2">
                        <Button
                            type="button"
                            variant="link"
                            onClick={() => handleDocUploadClick(category)}
                            className="text-xs gap-1.5"
                        >
                            <UploadIcon className="w-4 h-4" />
                            Adicionar Documento
                        </Button>
                    </div>
                )}
            </>
        )
    }

    const renderImagesContent = (categories: AttachmentCategory[], uploadCategory: AttachmentCategory) => {
        const images = getImagesFor(categories)
        const imagesForSection = images.map(img => img.file || img.file_key)

        return (
            <ProductImagesSection
                images={imagesForSection}
                onImageUpload={(e) => handleImageUpload(uploadCategory, e)}
                onRemoveImage={(idx) => {
                    const target = images[idx]
                    if (target) handleRemoveImage(target.id)
                }}
                onSetPrimaryImage={() => { }}
                isEditing={isEditing}
            />
        )
    }

    const hasContent = localAttachments.length > 0

    if (!advancedEnabled) {
        return (
            <div className="flex flex-col items-center justify-center text-center min-h-[400px] px-4">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/PlanoVender.png"
                    imageAlt="Recurso bloqueado"
                    title="Anexos"
                    subtitle="Adição de anexos disponível nos planos Crescer e Escalar."
                    itemButton={{
                        text: "Fazer upgrade",
                        action: () => openPlanUpgrade("crescer")
                    }}
                />
            </div>
        )
    }

    return (
        <>
            <div className="space-y-6">
                {/* Anexos (documentos) */}
                {(isEditing || getDocsFor(["normal"]).length > 0) && (
                    <FormSection
                        title="Anexos"
                        description="Documentos em PDF, Word, Excel, CSV, etc."
                    >
                        {renderDocsContent("normal")}
                    </FormSection>
                )}

                {/* Imagens Antes da Proposta */}
                {(isEditing || getImagesFor(["normal", "antes"]).length > 0) && (
                    <FormSection
                        title="Imagens Antes da Proposta"
                        description="Fotos do item ou ambiente antes do serviço."
                        hasSeparator
                    >
                        {renderImagesContent(["normal", "antes"], "antes")}
                    </FormSection>
                )}

                {/* Imagens Após a Proposta */}
                {(isEditing || getImagesFor(["depois"]).length > 0) && (
                    <FormSection
                        title="Imagens Após a Proposta"
                        description="Fotos do item ou serviço concluído."
                        hasSeparator
                    >
                        {renderImagesContent(["depois"], "depois")}
                    </FormSection>
                )}

                {!isEditing && !hasContent && (
                    <div className="flex flex-col items-center justify-center text-center py-8">
                        <IconPlaceholder
                            icon={FileIcon}
                            title="Nenhum anexo encontrado"
                            subtitle="Não foram encontrados anexos para esta proposta."
                        />
                    </div>
                )}
            </div>

            <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ppt,.pptx,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/zip,application/x-rar-compressed"
                className="hidden"
                onChange={handleDocChange}
            />

            {showCropper && imageForCrop && (
                <ImageCropperModal
                    isOpen={showCropper}
                    imageFile={imageForCrop}
                    onClose={() => { setShowCropper(false); setImageForCrop(null) }}
                    onCropComplete={handleCropComplete}
                />
            )}

            {deleteModalOpen && (
                <AlertModal
                    isOpen={deleteModalOpen}
                    onClose={() => setDeleteModalOpen(false)}
                    title="Excluir Anexo"
                    description="Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita."
                    confirmText="Confirmar Exclusão"
                    variant="danger"
                    onConfirm={confirmDeleteDoc}
                />
            )}
        </>
    )
}

