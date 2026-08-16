"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button, Spinner, DefaultModal, IconPlaceholder, AlertModal, FormSection } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon, XIcon, CheckCircleIcon, AlertCircleIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan, getPlanImageAttachmentLimit } from "@/lib/subscription/plan-tier"
import { isGifFile } from "@/lib/security/file-validator"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import { formatFileSize } from "@/components/erp/orders/OrderAttachmentsTab"
import ProductImagesSection from "@/components/erp/product/ProductImagesSection"
import ImageCropperModal from "@/components/ImageCropperModal"
import { uploadSingleFile } from "@/lib/utils/attachment-uploader"

// Import order actions
import {
    getOrderAttachmentsAction,
    getOrderAttachmentUrlAction,
    saveOrderAttachmentAction,
    deleteOrderAttachmentAction,
    getOrderPresignedUploadUrlAction
} from "@/app/actions/erp/orders"

// Import service order actions
import {
    getServiceOrderAttachmentsAction,
    getServiceOrderAttachmentUrlAction,
    saveAttachmentAction,
    deleteAttachmentAction,
    getPresignedUploadUrlAction
} from "@/app/actions/erp/service-orders"

// Import stock movement actions
import {
    getStockMovementAttachmentsAction,
    getStockMovementAttachmentUrlAction,
    saveStockMovementAttachmentAction,
    deleteStockMovementAttachmentAction,
    getStockMovementPresignedUploadUrlAction
} from "@/app/actions/erp/stock-movements"

// Import transaction actions
import {
    getTransactionAttachmentsAction,
    getTransactionAttachmentUrlAction,
    saveTransactionAttachmentAction,
    deleteTransactionAttachmentAction,
    getTransactionPresignedUploadUrlAction
} from "@/app/actions/erp/transactions"

// Import return actions
import {
    getReturnEvidenceAction,
    getReturnEvidenceUrlAction,
    saveReturnEvidenceAction,
    deleteReturnEvidenceAction,
    getReturnEvidencePresignedUploadUrlAction
} from "@/app/actions/erp/returns"

import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

export type AttachmentEntityType = "order" | "service_order" | "stock_movement" | "transaction" | "return"

interface GenericAttachmentsTabProps {
    entityId?: string
    partnerId: string
    entityType: AttachmentEntityType
    title?: string
    subtitle?: string
    isEditing?: boolean
    readOnly?: boolean
    isNew?: boolean
    stagedFiles?: File[]
    onStagedFilesChange?: (files: File[]) => void
    stagedImages?: (string | File)[]
    onStagedImagesChange?: (images: (string | File)[]) => void
    onMutation?: () => void
}

interface PendingFile {
    id: string
    file: File
    name: string
    size: number
    progress: number
    status: "pending" | "uploading" | "completed" | "failed"
    error?: string
}

const ACTIONS_MAP: Record<AttachmentEntityType, {
    fetch: (id: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    presigned: (partnerId: string, entityId: string, name: string, type: string, size: number) => Promise<any>
    save: (partnerId: string, entityId: string, key: string, name: string, type: string, size: number, hash: string) => Promise<any>
    delete: (partnerId: string, id: string, entityId: string) => Promise<any>
    url: (entityId: string, key: string, partnerId?: string) => Promise<{ success: boolean; downloadUrl?: string; error?: string }>
}> = {
    order: {
        fetch: getOrderAttachmentsAction,
        presigned: (pid, eid, name, type, size) => getOrderPresignedUploadUrlAction(pid, name, type, size),
        save: (pid, eid, key, name, type, size, hash) => saveOrderAttachmentAction(pid, eid, key, name, type, size, hash),
        delete: deleteOrderAttachmentAction,
        url: getOrderAttachmentUrlAction
    },
    service_order: {
        fetch: getServiceOrderAttachmentsAction,
        presigned: (pid, eid, name, type, size) => getPresignedUploadUrlAction(pid, "service-orders", name, type, size),
        save: (pid, eid, key, name, type, size, hash) => saveAttachmentAction(pid, eid, key, name, type, size, "normal", hash),
        delete: deleteAttachmentAction,
        url: getServiceOrderAttachmentUrlAction
    },
    stock_movement: {
        fetch: getStockMovementAttachmentsAction,
        presigned: (pid, eid, name, type, size) => getStockMovementPresignedUploadUrlAction(pid, name, type, size),
        save: (pid, eid, key, name, type, size, hash) => saveStockMovementAttachmentAction(pid, eid, key, name, type, size, hash),
        delete: deleteStockMovementAttachmentAction,
        url: getStockMovementAttachmentUrlAction
    },
    transaction: {
        fetch: getTransactionAttachmentsAction,
        presigned: (pid, eid, name, type, size) => getTransactionPresignedUploadUrlAction(pid, name, type, size),
        save: (pid, eid, key, name, type, size, hash) => saveTransactionAttachmentAction(pid, eid, key, name, type, size, hash),
        delete: deleteTransactionAttachmentAction,
        url: getTransactionAttachmentUrlAction
    },
    return: {
        fetch: getReturnEvidenceAction,
        presigned: (pid, eid, name, type, size) => getReturnEvidencePresignedUploadUrlAction(pid, name, type, size),
        save: (pid, eid, key, name, type, size, hash) => saveReturnEvidenceAction(pid, eid, key, name, type, size, hash),
        delete: deleteReturnEvidenceAction,
        url: getReturnEvidenceUrlAction
    }
}

const isImageFile = (att: any) => {
    const type = String(att.file_type || att.file?.type || "").toLowerCase()
    const name = String(att.file_name || att.name || "").toLowerCase()
    return (
        type.startsWith("image/") ||
        /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(name)
    )
}

export function GenericAttachmentsTab({
    entityId,
    partnerId,
    entityType,
    title = "Anexos",
    subtitle = "Gerencie contratos, faturas, ordens ou comprovantes deste registro.",
    isEditing = true,
    readOnly = false,
    isNew: isNewProp,
    stagedFiles: externalStagedFiles,
    onStagedFilesChange,
    stagedImages: externalStagedImages,
    onStagedImagesChange,
    onMutation
}: GenericAttachmentsTabProps) {
    const isNewMode = isNewProp ?? (!entityId || entityId.startsWith("draft-"))
    const canEdit = isEditing && !readOnly
    const { toast } = useToast()
    const { planSlug } = usePermissions()
    const { openPlanUpgrade } = usePlanUpgrade()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dropZoneRef = useRef<HTMLDivElement>(null)

    const [attachments, setAttachments] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
    const [isSaving, setIsSaving] = useState(false)

    // Image Cropper States
    const [showCropper, setShowCropper] = useState(false)
    const [imageForCrop, setImageForCrop] = useState<File | null>(null)
    const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([])

    // Local staged states when not controlled by parent
    const [internalStagedFiles, setInternalStagedFiles] = useState<File[]>([])
    const [internalStagedImages, setInternalStagedImages] = useState<(string | File)[]>([])

    const currentStagedFiles = externalStagedFiles !== undefined ? externalStagedFiles : internalStagedFiles
    const updateStagedFiles = (newFiles: File[]) => {
        if (onStagedFilesChange) {
            onStagedFilesChange(newFiles)
        } else {
            setInternalStagedFiles(newFiles)
        }
    }

    const currentStagedImages = externalStagedImages !== undefined ? externalStagedImages : internalStagedImages
    const updateStagedImages = (newImages: (string | File)[]) => {
        if (onStagedImagesChange) {
            onStagedImagesChange(newImages)
        } else {
            setInternalStagedImages(newImages)
        }
    }

    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const actions = ACTIONS_MAP[entityType]
    const advancedEnabled = hasMinimumPlan(planSlug, "crescer")
    const planLimit = planSlug === "crescer" ? 5 : planSlug === "escalar" ? 15 : 0
    const imagePlanLimit = getPlanImageAttachmentLimit(planSlug)

    const loadAttachments = async () => {
        if (!entityId || isNewMode) {
            setAttachments([])
            return
        }
        setLoading(true)
        try {
            const res = await actions.fetch(entityId)
            if (res.success && res.data) {
                setAttachments(res.data)
            } else {
                toast({ description: `Erro ao carregar anexos de ${entityType}.` })
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadAttachments()
    }, [entityId, entityType, isNewMode])

    const handleDownloadDoc = async (fileKey: string) => {
        if (!entityId || isNewMode) return
        try {
            const res = await actions.url(entityId, fileKey, partnerId)
            if (res.success && res.downloadUrl) {
                window.open(res.downloadUrl, "_blank")
            } else {
                toast({ description: res.error || "Erro ao obter arquivo." })
            }
        } catch (err) {
            toast({ description: "Erro ao abrir documento." })
        }
    }

    const requestDeleteDoc = (id: string) => {
        if (!canEdit) return
        setDeletingId(id)
        setDeleteModalOpen(true)
    }

    const confirmDeleteDoc = async () => {
        if (!deletingId || !canEdit) return

        // Check if deleting a staged file
        if (deletingId.startsWith("staged-doc-")) {
            const indexStr = deletingId.replace("staged-doc-", "")
            const index = parseInt(indexStr, 10)
            if (!isNaN(index)) {
                const nextDocs = currentStagedFiles.filter((_, i) => i !== index)
                updateStagedFiles(nextDocs)
                toast({ description: "Anexo pendente removido." })
            }
            setDeleteModalOpen(false)
            setDeletingId(null)
            return
        }

        if (!entityId) return

        try {
            const res = await actions.delete(partnerId, deletingId, entityId)
            if (res.success) {
                toast({ description: "Anexo removido com sucesso." })
                loadAttachments()
                onMutation?.()
            } else {
                toast({ description: res.error || "Erro ao remover anexo." })
            }
        } catch (err) {
            toast({ description: "Erro ao excluir anexo." })
        } finally {
            setDeleteModalOpen(false)
            setDeletingId(null)
        }
    }

    const handleUploadClick = () => {
        if (!canEdit) return
        if (!advancedEnabled) {
            openPlanUpgrade("crescer")
            return
        }
        setPendingFiles([])
        setIsModalOpen(true)
    }

    const addFilesToPending = (files: FileList | File[]) => {
        const totalCurrent = (attachments.filter(att => !isImageFile(att))).length + currentStagedFiles.length
        const totalPending = pendingFiles.length
        const newFilesList: PendingFile[] = []

        const allowedDocExts = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".odt", ".ppt", ".pptx", ".zip", ".rar"]

        for (let i = 0; i < files.length; i++) {
            const file = files[i]

            if (isGifFile(file)) {
                toast({ description: "Arquivos GIF não são permitidos no sistema." })
                continue
            }

            const isImg = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|avif|bmp|svg)$/i.test(file.name)
            if (isImg) {
                toast({ description: `Arquivos de imagem não são permitidos na seção de Anexos. Para enviar imagens, utilize a seção de Imagens abaixo.` })
                continue
            }

            const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
            if (!allowedDocExts.includes(ext)) {
                toast({ description: `Tipo de arquivo não permitido: ${file.name}. Envie apenas documentos (PDF, Word, Excel, CSV, Zip, etc.).` })
                continue
            }

            const maxSize = 10 * 1024 * 1024
            if (file.size > maxSize) {
                toast({ description: `Arquivo muito grande (${formatFileSize(file.size)}). Máximo: 10MB.` })
                continue
            }

            if (totalCurrent + totalPending + newFilesList.length >= planLimit) {
                toast({ description: `Você atingiu o limite de ${planLimit} anexos para o seu plano.` })
                break
            }

            newFilesList.push({
                id: `pending-${Date.now()}-${Math.random()}`,
                file,
                name: file.name,
                size: file.size,
                progress: 0,
                status: "pending"
            })
        }

        if (newFilesList.length > 0) {
            setPendingFiles((prev) => [...prev, ...newFilesList])
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addFilesToPending(e.target.files)
        }
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer.files) {
            addFilesToPending(e.dataTransfer.files)
        }
    }

    const handleRemovePending = (id: string) => {
        setPendingFiles((prev) => prev.filter((f) => f.id !== id))
    }

    const handleSaveUploads = async () => {
        if (pendingFiles.length === 0) return

        // In new/creation mode, stage files locally without uploading immediately to DB/R2
        if (isNewMode) {
            const newFiles = pendingFiles.map(pf => pf.file)
            updateStagedFiles([...currentStagedFiles, ...newFiles])
            toast({ description: `${newFiles.length} documento(s) adicionado(s). Eles serão salvos ao guardar o registro.` })
            setIsModalOpen(false)
            setPendingFiles([])
            return
        }

        if (!entityId) return
        setIsSaving(true)

        const uploadPromises = pendingFiles.map(async (pending) => {
            if (pending.status === "completed") return

            setPendingFiles((prev) =>
                prev.map((f) => (f.id === pending.id ? { ...f, status: "uploading", progress: 5 } : f))
            )

            try {
                const res = await uploadSingleFile({
                    partnerId,
                    entityId,
                    entityType,
                    file: pending.file,
                })

                if (!res.success) throw new Error(res.error || "Erro no upload")

                setPendingFiles((prev) =>
                    prev.map((f) => (f.id === pending.id ? { ...f, status: "completed", progress: 100 } : f))
                )
            } catch (err: any) {
                console.error(err)
                setPendingFiles((prev) =>
                    prev.map((f) => (f.id === pending.id ? { ...f, status: "failed", error: err.message || "Erro no upload" } : f))
                )
            }
        })

        await Promise.all(uploadPromises)
        setIsSaving(false)

        const currentPending = pendingFiles
        const hasFailures = currentPending.some((f) => f.status === "failed")
        if (!hasFailures) {
            toast({ description: "Todos os anexos foram enviados com sucesso." })
            setIsModalOpen(false)
            setPendingFiles([])
            loadAttachments()
            onMutation?.()
        } else {
            toast({ description: "Alguns arquivos falharam no upload. Verifique os erros e tente novamente." })
        }
    }

    // Image section handling via ProductImagesSection
    const dbImageAttachments = (attachments || []).filter(isImageFile)
    const dbDocAttachments = (attachments || []).filter((att) => !isImageFile(att))

    const allImages: (string | File)[] = [
        ...dbImageAttachments.map(att => att.file_key),
        ...currentStagedImages
    ]

    const handleImageSectionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return
        const files = e.target.files
        if (!files || files.length === 0) return

        const fileArr = Array.from(files)
        const hasGif = fileArr.some(f => isGifFile(f))
        if (hasGif) {
            toast({ description: "Arquivos GIF não são permitidos no sistema." })
        }

        let newFiles = fileArr.filter(f => f.type.startsWith("image/") && !isGifFile(f))
        if (newFiles.length === 0) {
            if (!hasGif) toast({ description: "Selecione apenas arquivos de imagem." })
            return
        }

        const currentImageCount = allImages.length
        if (currentImageCount + newFiles.length > imagePlanLimit) {
            toast({ description: `Você atingiu o limite de ${imagePlanLimit} imagem(ns) para o seu plano.` })
            const allowedCount = imagePlanLimit - currentImageCount
            if (allowedCount <= 0) return
            newFiles = newFiles.slice(0, allowedCount)
        }

        setImageForCrop(newFiles[0])
        setPendingImageFiles(newFiles.slice(1))
        setShowCropper(true)
    }

    const processCroppedImage = async (croppedFile: File) => {
        if (isNewMode) {
            updateStagedImages([...currentStagedImages, croppedFile])
            toast({ description: "Imagem adicionada aos anexos pendentes." })
        } else if (entityId) {
            setLoading(true)
            try {
                const res = await uploadSingleFile({ partnerId, entityId, entityType, file: croppedFile })
                if (res.success) {
                    toast({ description: "Imagem enviada com sucesso." })
                    loadAttachments()
                    onMutation?.()
                } else {
                    toast({ description: res.error || "Erro ao enviar imagem." })
                }
            } catch (err) {
                toast({ description: "Erro ao enviar imagem." })
            } finally {
                setLoading(false)
            }
        }
    }

    const handleCropComplete = async (croppedDataUrl: string) => {
        try {
            const blob = await (await fetch(croppedDataUrl)).blob()
            const croppedFile = new File([blob], `attachment-${Date.now()}.png`, { type: "image/png" })
            await processCroppedImage(croppedFile)
        } catch (err) {
            toast({ description: "Erro ao recortar imagem." })
        }

        if (pendingImageFiles.length > 0) {
            const nextFile = pendingImageFiles[0]
            setPendingImageFiles(prev => prev.slice(1))
            setImageForCrop(nextFile)
        } else {
            setShowCropper(false)
            setImageForCrop(null)
        }
    }

    const handleRemoveImageFromSection = async (index: number) => {
        if (!canEdit) return

        const dbImgCount = dbImageAttachments.length
        if (index < dbImgCount) {
            // It's a DB image
            const target = dbImageAttachments[index]
            if (target && entityId) {
                try {
                    const res = await actions.delete(partnerId, target.id, entityId)
                    if (res.success) {
                        toast({ description: "Imagem removida com sucesso." })
                        loadAttachments()
                        onMutation?.()
                    } else {
                        toast({ description: res.error || "Erro ao remover imagem." })
                    }
                } catch (err) {
                    toast({ description: "Erro ao remover imagem." })
                }
            }
        } else {
            // It's a staged image
            const stagedIndex = index - dbImgCount
            const nextStaged = currentStagedImages.filter((_, idx) => idx !== stagedIndex)
            updateStagedImages(nextStaged)
            toast({ description: "Imagem pendente removida." })
        }
    }

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
        <div className="space-y-8">
            {loading ? (
                <div className="flex justify-center py-8">
                    <Spinner className="w-8 h-8 text-brand-primary animate-spin" />
                </div>
            ) : (
                <>
                    {/* Seção 1: Anexos (Documentos) */}
                    {(canEdit || dbDocAttachments.length > 0 || currentStagedFiles.length > 0) && (
                        <FormSection title="Anexos">
                            {dbDocAttachments.length === 0 && currentStagedFiles.length === 0 ? (
                                canEdit && (
                                    <div className="flex flex-col items-center justify-center text-center py-8">
                                        <IconPlaceholder
                                            icon={FileIcon}
                                            title="Nenhum documento adicionado"
                                            subtitle="Adicione documentos em PDF, Word, Excel, CSV, Zip, etc."
                                            itemButton={{
                                                text: "Adicionar Documento",
                                                action: handleUploadClick,
                                                variant: "outline",
                                            }}
                                        />
                                    </div>
                                )
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {/* Documentos salvos no banco */}
                                        {dbDocAttachments.map((att) => (
                                            <div
                                                key={att.id}
                                                className="flex items-center gap-3 p-3 bg-brand-gray dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl group relative"
                                            >
                                                <div
                                                    onClick={() => handleDownloadDoc(att.file_key)}
                                                    className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0 cursor-pointer hover:bg-brand-gray/50"
                                                >
                                                    <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                                </div>
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDownloadDoc(att.file_key)}>
                                                    <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        {att.file_name || "Anexo"}
                                                    </p>
                                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                                        {formatFileSize(att.file_size)}
                                                    </p>
                                                </div>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => requestDeleteDoc(att.id)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg absolute -top-2.5 -right-2.5 z-10"
                                                        title="Remover anexo"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}

                                        {/* Documentos staged/pendentes de envio */}
                                        {currentStagedFiles.map((stagedFile, index) => (
                                            <div
                                                key={`staged-doc-${index}`}
                                                className="flex items-center gap-3 p-3 bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/30 rounded-xl group relative"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-primary/40 shrink-0">
                                                    <FileIcon className="w-5 h-5 text-brand-primary" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                                        {stagedFile.name}
                                                    </p>
                                                    <p className="text-xs text-brand-primary flex items-center gap-1">
                                                        <span>{formatFileSize(stagedFile.size)}</span>
                                                        <span>• Pendente de envio</span>
                                                    </p>
                                                </div>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => requestDeleteDoc(`staged-doc-${index}`)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg absolute -top-2.5 -right-2.5 z-10"
                                                        title="Remover anexo pendente"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {canEdit && (
                                        <div className="flex justify-end pt-2">
                                            <Button
                                                type="button"
                                                variant="link"
                                                onClick={handleUploadClick}
                                                className="text-xs gap-1.5"
                                            >
                                                <UploadIcon className="w-4 h-4" />
                                                Adicionar Documento (PDF, Word, Excel, etc.)
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </FormSection>
                    )}

                    {/* Seção 2: Imagens usando ProductImagesSection */}
                    {(canEdit || allImages.length > 0) && (
                        <FormSection title="Imagens">
                            <ProductImagesSection
                                images={allImages}
                                onImageUpload={handleImageSectionUpload}
                                onRemoveImage={handleRemoveImageFromSection}
                                onSetPrimaryImage={() => { }}
                                isEditing={canEdit}
                                isSaving={isSaving}
                            />
                        </FormSection>
                    )}

                    {!canEdit && dbDocAttachments.length === 0 && currentStagedFiles.length === 0 && allImages.length === 0 && (
                        <div className="flex flex-col items-center justify-center text-center py-8">
                            <IconPlaceholder
                                icon={FileIcon}
                                title="Nenhum anexo ou imagem"
                                subtitle="Não foram encontrados anexos para este registro."
                            />
                        </div>
                    )}
                </>
            )}

            {/* Modal de upload de documentos */}
            {isModalOpen && (
                <DefaultModal
                    isOpen={isModalOpen}
                    onClose={() => !isSaving && setIsModalOpen(false)}
                    title="Upload de Documentos"
                    maxWidth="md"
                >
                    <div className="space-y-6">
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Selecione e envie os documentos desejados (PDF, Word, Excel, CSV, Zip, etc.). Limite: máximo de {planLimit} anexos.
                        </p>

                        <div
                            ref={dropZoneRef}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-brand-border dark:border-dark-border hover:border-brand-primary dark:hover:border-brand-primary rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-brand-gray/30 dark:bg-dark-border/10 hover:bg-brand-gray/50 transition-colors"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                multiple
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.odt,.ppt,.pptx,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/zip,application/x-rar-compressed"
                            />

                            <IconPlaceholder icon={UploadIcon} title="Upload de Documentos" subtitle="Selecione e envie os documentos desejados (PDF, Word, Excel, CSV, Zip, etc). Max 10MB cada" />
                        </div>

                        {pendingFiles.length > 0 && (
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                {pendingFiles.map((pf) => (
                                    <div
                                        key={pf.id}
                                        className="p-3 border border-brand-border dark:border-dark-border rounded-xl bg-brand-gray/10 dark:bg-dark-border/5 relative"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border shrink-0">
                                                <FileIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                                            </div>
                                            <div className="flex-1 min-w-0 pr-6">
                                                <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate">
                                                    {pf.name}
                                                </p>
                                                <p className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1.5 mt-0.5">
                                                    <span>{formatFileSize(pf.size)}</span>
                                                    {pf.status === "uploading" && (
                                                        <span className="text-brand-primary animate-pulse flex items-center gap-1">
                                                            • Enviando ({pf.progress}%)
                                                        </span>
                                                    )}
                                                    {pf.status === "completed" && (
                                                        <span className="text-brand-green flex items-center gap-0.5">
                                                            • <CheckCircleIcon className="w-3.5 h-3.5 inline" /> Concluído
                                                        </span>
                                                    )}
                                                    {pf.status === "failed" && (
                                                        <span className="text-brand-red flex items-center gap-0.5">
                                                            • <AlertCircleIcon className="w-3.5 h-3.5 inline" /> {pf.error || "Falhou"}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            {!isSaving && pf.status !== "completed" && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePending(pf.id)}
                                                    className="text-brand-inactive-text hover:text-brand-red p-1 rounded-full transition-colors absolute top-3 right-3"
                                                >
                                                    <XIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        {pf.status === "uploading" && (
                                            <div className="w-full bg-brand-border dark:bg-dark-border rounded-full h-1 mt-2.5 overflow-hidden">
                                                <div
                                                    className="bg-brand-primary h-1 rounded-full transition-all duration-300"
                                                    style={{ width: `${pf.progress}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-brand-border dark:border-dark-border">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isSaving}
                                onClick={() => setIsModalOpen(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                disabled={isSaving || pendingFiles.length === 0}
                                onClick={handleSaveUploads}
                                className="flex items-center gap-2"
                            >
                                {isSaving ? (
                                    <>
                                        <Spinner className="w-4 h-4 text-white animate-spin" />
                                        <span>Salvando...</span>
                                    </>
                                ) : (
                                    <span>Salvar Anexos</span>
                                )}
                            </Button>
                        </div>
                    </div>
                </DefaultModal>
            )}

            {deleteModalOpen && (
                <AlertModal
                    isOpen={deleteModalOpen}
                    onClose={() => setDeleteModalOpen(false)}
                    onConfirm={confirmDeleteDoc}
                    title="Excluir Anexo"
                    description="Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita."
                    confirmText="Confirmar Exclusão"
                    cancelText="Cancelar"
                    variant="danger"
                />
            )}

            {showCropper && imageForCrop && (
                <ImageCropperModal
                    isOpen={showCropper}
                    onClose={() => {
                        setShowCropper(false)
                        setImageForCrop(null)
                        setPendingImageFiles([])
                    }}
                    imageFile={imageForCrop}
                    onCropComplete={handleCropComplete}
                />
            )}
        </div>
    )
}

