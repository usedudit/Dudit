"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button, FormSection, Accordion, IconPlaceholder, DefaultModal, AlertModal } from "@/components/reusable"
import { UploadIcon, TrashIcon, FileIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { r2PublicConfig } from "@/lib/r2/r2-public"
import ImageCropperModal from "@/components/ImageCropperModal"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade, planStarIconForTarget } from "@/components/erp/subscription/PlanUpgradeModal"
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

    const handleImageUpload = (category: "normal" | "antes" | "depois", e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        setPendingCategory(category)
        setImageForCrop(file)
        setShowCropper(true)
    }

    const handleCropComplete = async (croppedDataUrl: string) => {
        setShowCropper(false)
        setImageForCrop(null)
        try {
            const blob = await (await fetch(croppedDataUrl)).blob()
            const file = new File([blob], `attachment-${Date.now()}.png`, { type: "image/png" })

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

    const handleRemoveImage = (category: "normal" | "antes" | "depois", index: number) => {
        const categoryAttachments = localAttachments.filter(att => (att.category || "normal") === category)
        const categoryImages = categoryAttachments.filter(att =>
            att.file_type?.startsWith("image/") || att.file?.type?.startsWith("image/")
        )
        const target = categoryImages[index]
        if (!target) return

        const updated = localAttachments.filter(att => att.id !== target.id)
        setLocalAttachments(updated)
        const deletedIds = target.file ? [] : [target.id]
        onChange?.(updated, deletedIds)
    }

    const handleDocUploadClick = (category: "normal" | "antes" | "depois") => {
        setPendingCategory(category)
        docInputRef.current?.click()
    }

    const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return

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
            const res = await getServiceOrderAttachmentUrlAction(partnerId, fileKey)
            if (res.success) {
                window.open(res.downloadUrl, "_blank")
            } else {
                toast({ description: res.error || "Erro ao obter arquivo." })
            }
        } catch (err) {
            toast({ description: "Erro ao abrir documento." })
        }
    }

    const grouped = (() => {
        const g: Record<string, any[]> = { normal: [], antes: [], depois: [] }
        for (const att of localAttachments || []) {
            const cat = att.category || "normal"
            if (!g[cat]) g[cat] = []
            g[cat].push(att)
        }
        return g
    })()

    const getImagesAndDocs = (items: any[]) => {
        const images = items.filter(att => att.file_type?.startsWith("image/") || att.file?.type?.startsWith("image/"))
        const docs = items.filter(att => !(att.file_type?.startsWith("image/") || att.file?.type?.startsWith("image/")))
        return { images, docs }
    }

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

    const renderCategoryContent = (category: "normal" | "antes" | "depois") => {
        const { images, docs } = getImagesAndDocs(grouped[category])
        const imagesForSection = images.map(img => img.file || img.file_key)

        return (
            <div className="space-y-6">
                {/* Documentos */}
                {(isEditing || docs.length > 0) && (
                    <div>
                        {docs.length === 0 ? (
                            isEditing && (
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
                            )
                        ) : (
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
                                            Adicionar Documento (PDF, etc.)
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Imagens */}
                {(isEditing || images.length > 0) && (
                    <div>
                        <ProductImagesSection
                            images={imagesForSection}
                            onImageUpload={(e) => handleImageUpload(category, e)}
                            onRemoveImage={(idx) => handleRemoveImage(category, idx)}
                            onSetPrimaryImage={() => { }}
                            isEditing={isEditing}
                        />
                    </div>
                )}
            </div>
        )
    }

    const hasContent = localAttachments.length > 0

    return (
        <>
            <div className="space-y-6">
                {/* Normal Section */}
                {(isEditing || grouped.normal.length > 0) && (
                    <FormSection title="Anexos">
                        {renderCategoryContent("normal")}
                    </FormSection>
                )}

                {/* Antes Section */}
                {isEditing ? (
                    advancedEnabled ? (
                        <FormSection title="Antes">
                            {renderCategoryContent("antes")}
                        </FormSection>
                    ) : (
                        <div className="border-t border-brand-border dark:border-dark-border pt-4">
                            <Accordion
                                title={
                                    <span className="text-md font-medium text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        Antes
                                        <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                    </span>
                                }
                                defaultOpen={false}
                                triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left"
                                onToggle={(isOpen) => {
                                    if (isOpen) {
                                        openPlanUpgrade("crescer")
                                        return false
                                    }
                                }}
                            >
                                <div className="text-sm text-brand-inactive-text py-4 text-center">
                                    Organizar anexos como "Antes" e "Depois" está disponível nos planos Crescer e Escalar.
                                </div>
                            </Accordion>
                        </div>
                    )
                ) : (
                    grouped.antes.length > 0 && (
                        advancedEnabled ? (
                            <FormSection title="Antes">
                                {renderCategoryContent("antes")}
                            </FormSection>
                        ) : (
                            <div className="border-t border-brand-border dark:border-dark-border pt-4">
                                <Accordion
                                    title={
                                        <span className="text-md font-medium text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                            Antes
                                            <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                        </span>
                                    }
                                    defaultOpen={false}
                                    triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left"
                                    onToggle={(isOpen) => {
                                        if (isOpen) {
                                            openPlanUpgrade("crescer")
                                            return false
                                        }
                                    }}
                                >
                                    <div className="text-sm text-brand-inactive-text py-4 text-center">
                                        Organizar anexos como "Antes" e "Depois" está disponível nos planos Crescer e Escalar.
                                    </div>
                                </Accordion>
                            </div>
                        )
                    )
                )}

                {/* Depois Section */}
                {isEditing ? (
                    advancedEnabled ? (
                        <FormSection title="Depois">
                            {renderCategoryContent("depois")}
                        </FormSection>
                    ) : (
                        <div className="border-t border-brand-border dark:border-dark-border pt-4">
                            <Accordion
                                title={
                                    <span className="text-md font-medium text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                        Depois
                                        <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                    </span>
                                }
                                defaultOpen={false}
                                triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left"
                                onToggle={(isOpen) => {
                                    if (isOpen) {
                                        openPlanUpgrade("crescer")
                                        return false
                                    }
                                }}
                            >
                                <div className="text-sm text-brand-inactive-text py-4 text-center">
                                    Organizar anexos como "Antes" e "Depois" está disponível nos planos Crescer e Escalar.
                                </div>
                            </Accordion>
                        </div>
                    )
                ) : (
                    grouped.depois.length > 0 && (
                        advancedEnabled ? (
                            <FormSection title="Depois">
                                {renderCategoryContent("depois")}
                            </FormSection>
                        ) : (
                            <div className="border-t border-brand-border dark:border-dark-border pt-4">
                                <Accordion
                                    title={
                                        <span className="text-md font-medium text-brand-dark dark:text-dark-heading flex items-center gap-2">
                                            Depois
                                            <img src={planStarIconForTarget("crescer")!} alt="" className="w-4 h-4 object-contain" />
                                        </span>
                                    }
                                    defaultOpen={false}
                                    triggerClass="text-lg font-bold text-brand-dark dark:text-dark-heading text-left"
                                    onToggle={(isOpen) => {
                                        if (isOpen) {
                                            openPlanUpgrade("crescer")
                                            return false
                                        }
                                    }}
                                >
                                    <div className="text-sm text-brand-inactive-text py-4 text-center">
                                        Organizar anexos como "Antes" e "Depois" está disponível nos planos Crescer e Escalar.
                                    </div>
                                </Accordion>
                            </div>
                        )
                    )
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
                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                    message="Tem certeza que deseja excluir este anexo? Esta ação não pode ser desfeita."
                    confirmText="Excluir"
                    variant="danger"
                    onConfirm={confirmDeleteDoc}
                />
            )}
        </>
    )
}
