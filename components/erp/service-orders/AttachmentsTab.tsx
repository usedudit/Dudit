"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button, FormSection, IconPlaceholder, AlertModal, ListItem } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import ImageCropperModal from "@/components/ImageCropperModal"
import { dataUrlToFile } from "@/lib/utils/image-resize"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan, getPlanImageAttachmentLimit } from "@/lib/subscription/plan-tier"
import { isGifFile } from "@/lib/security/file-validator"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import { getServiceOrderAttachmentUrlAction } from "@/app/actions/erp/service-orders"
import { formatFileSize } from "@/components/erp/orders/OrderAttachmentsTab"

const CDN_URL = r2PublicConfig.cdnUrl || "https://img.dudit.com.br"

const buildImageUrl = (key: string) => key.startsWith("http") ? key : `${CDN_URL}/${key}`

interface AttachmentsTabProps {
    partnerId: string
    serviceOrderId?: string
    attachments?: any[]
    isEditing?: boolean
    onChange?: (newAttachments: any[], deletedIds?: string[]) => void
    onMutation?: () => void
}

export default function AttachmentsTab({
    partnerId,
    serviceOrderId,
    attachments = [],
    isEditing = false,
    onChange,
    onMutation,
}: AttachmentsTabProps) {
    const { toast } = useToast()
    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const docInputRef = useRef<HTMLInputElement>(null)

    const [localAttachments, setLocalAttachments] = useState<any[]>(attachments)
    const [showCropper, setShowCropper] = useState(false)
    const [imageForCrop, setImageForCrop] = useState<File | null>(null)
    const [pendingCategory, setPendingCategory] = useState<"normal" | "antes" | "depois">("normal")
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

    useEffect(() => {
        setLocalAttachments(attachments)
    }, [attachments])

    const advancedEnabled = hasMinimumPlan(planSlug, "crescer")
    const imagePlanLimit = getPlanImageAttachmentLimit(planSlug)

    const handleImageUpload = (category: "normal" | "antes" | "depois", e: React.ChangeEvent<HTMLInputElement>) => {
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

    const handleCropComplete = (croppedDataUrl: string) => {
        setShowCropper(false)
        setImageForCrop(null)
        try {
            const file = dataUrlToFile(croppedDataUrl, "attachment")

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
        } catch (err) {
            toast({ description: "Erro ao recortar imagem." })
        }
    }

    const handleRemoveImage = (targetId: string) => {
        const target = localAttachments.find(att => att.id === targetId)
        if (!target) return

        const updated = localAttachments.filter(att => att.id !== target.id)
        setLocalAttachments(updated)
        const deletedIds = target.file ? [] : [target.id]
        onChange?.(updated, deletedIds)
    }

    const handleDocUploadClick = (category: "normal" | "antes" | "depois") => {
        if (!advancedEnabled) {
            openPlanUpgrade("crescer")
            return
        }
        setPendingCategory(category)
        docInputRef.current?.click()
    }

    const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

        if (isGifFile(file)) {
            toast({ description: "Arquivos GIF não são permitidos no sistema." })
            return
        }

        if (file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(file.name)) {
            toast({ description: "Arquivos de imagem não são permitidos no upload de documentos. Utilize a seção de Imagens." })
            return
        }

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

    const handleDeleteDoc = (docId: string) => {
        const target = localAttachments.find(att => att.id === docId)
        if (!target) return
        const updated = localAttachments.filter(att => att.id !== docId)
        setLocalAttachments(updated)
        const deletedIds = target.file ? [] : [target.id]
        onChange?.(updated, deletedIds)
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

    const handleDownloadDoc = async (fileKey: string, fileName: string) => {
        try {
            if (!serviceOrderId) return
            const res = await getServiceOrderAttachmentUrlAction(partnerId, serviceOrderId, fileKey)
            if (res.success) {
                window.open(res.downloadUrl, "_blank")
            } else {
                toast({ description: res.error || "Erro ao obter arquivo." })
            }
        } catch (err) {
            toast({ description: "Erro ao abrir documento." })
        }
    }

    type AttachmentCategory = "normal" | "antes" | "depois"

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
                    <div
                        key={doc.id}
                        onClick={() => {
                            if (!doc.file && doc.file_key) {
                                handleDownloadDoc(doc.file_key, doc.file_name || "Documento")
                            }
                        }}
                        className={`flex items-center gap-3 p-3 bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl group relative ${!doc.file && doc.file_key ? "cursor-pointer hover:bg-brand-gray/80 dark:hover:bg-dark-border/40 transition-colors" : ""
                            }`}
                    >
                        <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0">
                            <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                {doc.file_name || doc.file?.name || "Documento"}
                            </p>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                {doc.file ? "Pendente de salvamento" : (doc.file_size ? formatFileSize(doc.file_size) : "Salvo")}
                            </p>
                        </div>
                        {isEditing && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    requestDeleteDoc(doc.id)
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
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
                        subtitle="Adicione documentos em PDF, Word, Excel, etc."
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
    const isExistingOrder = !!serviceOrderId

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
                {isExistingOrder ? (
                    <>
                        {/* Anexos (documentos) */}
                        {(isEditing || getDocsFor(["normal"]).length > 0) && (
                            <FormSection
                                title="Anexos"
                                description="Documentos em PDF, Word, Excel, etc."
                            >
                                {renderDocsContent("normal")}
                            </FormSection>
                        )}

                        {/* Imagens Antes da OS */}
                        {(isEditing || getImagesFor(["normal", "antes"]).length > 0) && (
                            <FormSection
                                title="Imagens Antes da OS"
                                description="Fotos do item antes da execução do serviço."
                                hasSeparator
                            >
                                {renderImagesContent(["normal", "antes"], "antes")}
                            </FormSection>
                        )}

                        {/* Imagens Após a OS */}
                        {(isEditing || getImagesFor(["depois"]).length > 0) && (
                            <FormSection
                                title="Imagens Após a OS"
                                description="Fotos do item após a execução do serviço."
                                hasSeparator
                            >
                                {renderImagesContent(["depois"], "depois")}
                            </FormSection>
                        )}
                    </>
                ) : (
                    <>
                        {/* Criação: Anexos (documentos) */}
                        <FormSection
                            title="Anexos"
                            description="Documentos em PDF, Word, Excel, etc."
                        >
                            {renderDocsContent("normal")}
                        </FormSection>

                        {/* Criação: Imagens (salvas como imagens "Antes da OS") */}
                        <FormSection
                            title="Imagens"
                            description="Fotos do item antes do serviço. Elas serão exibidas em “Imagens Antes da OS”."
                            hasSeparator
                        >
                            {renderImagesContent(["antes"], "antes")}
                        </FormSection>
                    </>
                )}

                {!isEditing && !hasContent && (
                    <div className="flex flex-col items-center justify-center text-center py-8">
                        <IconPlaceholder
                            icon={FileIcon}
                            title="Nenhum anexo"
                            subtitle="Não foram encontrados anexos para esta OS."
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
