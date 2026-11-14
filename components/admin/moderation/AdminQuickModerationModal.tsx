"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Badge, Button } from "@/components/reusable"
import {
    CheckCircleIcon,
    TrashIcon,
    EyeIcon,
    AlertTriangleIcon,
    StoreIcon,
    PackageIcon,
    BriefcaseIcon,
    UserIcon,
    XIcon,
} from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { extractFlaggedImages, isImageFlagged } from "@/lib/utils/product-display-images"
import {
    approveModeration,
    rejectModeration,
    removeModerationImagesBatch,
} from "@/app/actions/admin/moderation"
import { useAdminActionModal } from "../AdminActionModal"
import { toast } from "@/hooks/use-notification"
import type { ModerationItem } from "@/lib/admin/types"
import { formatCurrency } from "@/lib/utils"

interface AdminQuickModerationModalProps {
    item: ModerationItem
    isOpen: boolean
    onClose: () => void
    onResolved: (action: "approved" | "rejected" | "updated", updatedItem?: ModerationItem) => void
}

const TYPE_LABELS: Record<string, string> = {
    product: "Produto",
    service: "Serviço",
    recurring_plan: "Plano",
    partner: "Perfil",
    community_video: "Vídeo",
    return_dispute: "Disputa",
}

export function AdminQuickModerationModal({
    item,
    isOpen,
    onClose,
    onResolved,
}: AdminQuickModerationModalProps) {
    const { modal: actionModal, runAction } = useAdminActionModal()

    // Imagens atuais do item
    const [images, setImages] = useState<string[]>(item.images || [])

    // Imagens selecionadas para remoção
    const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set())

    // Lightbox para ver em tela cheia
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    // Imagens sinalizadas pela IA
    const aiFlaggedUrls = useMemo(() => {
        return extractFlaggedImages(item.moderation_reason)
    }, [item.moderation_reason])

    // Sincroniza e pré-marca fotos com flag da IA quando o modal abre
    useEffect(() => {
        if (!isOpen) return
        const currentImages = item.images || []
        setImages(currentImages)

        const flagged = extractFlaggedImages(item.moderation_reason)
        const initialSelected = new Set<string>()

        for (const img of currentImages) {
            if (isImageFlagged(img, flagged)) {
                initialSelected.add(img)
            }
        }
        setSelectedForRemoval(initialSelected)
    }, [isOpen, item.images, item.moderation_reason])

    const typeLabel = TYPE_LABELS[item.type] || "Item"

    const toggleImageSelection = (imgUrl: string) => {
        setSelectedForRemoval((prev) => {
            const next = new Set(prev)
            if (next.has(imgUrl)) {
                next.delete(imgUrl)
            } else {
                next.add(imgUrl)
            }
            return next
        })
    }

    const selectAllImages = () => {
        setSelectedForRemoval(new Set(images))
    }

    const clearSelection = () => {
        setSelectedForRemoval(new Set())
    }

    const selectedCount = selectedForRemoval.size

    // ─── Ações via AdminActionModal (mostra resumo das alterações, motivo e notificação) ───

    const handleRemoveAndApprove = useCallback(async () => {
        if (selectedCount === 0) return
        const selectedList = Array.from(selectedForRemoval)

        await runAction({
            title: `Remover Imagens e Aprovar ${typeLabel}`,
            description: `As ${selectedCount} imagem(ns) selecionadas serão excluídas e o ${typeLabel.toLowerCase()} será aprovado no marketplace.`,
            changedFields: [
                `${selectedCount} imagem(ns) excluída(s)`,
                "Status alterado para Aprovado",
            ],
            confirmLabel: "Remover e Aprovar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await removeModerationImagesBatch(item.id, selectedList, item.type as any, {
                    autoApproveRemaining: true,
                    notifySeller: payload.notifySeller,
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                })
                if (res.success) {
                    toast.success(`${typeLabel} aprovado e imagens removidas com sucesso!`)
                    onResolved("approved")
                    onClose()
                    return { success: true }
                }
                toast.error(res.error || "Erro ao processar ação")
                return { success: false, error: res.error }
            },
        })
    }, [item.id, item.type, typeLabel, selectedCount, selectedForRemoval, runAction, onResolved, onClose])

    const handleOnlyRemoveSelected = useCallback(async () => {
        if (selectedCount === 0) return
        const selectedList = Array.from(selectedForRemoval)

        await runAction({
            title: `Remover Imagens`,
            description: `Confirme a exclusão de ${selectedCount} imagem(ns) deste ${typeLabel.toLowerCase()}.`,
            changedFields: [
                `${selectedCount} imagem(ns) selecionada(s) para exclusão`,
            ],
            confirmLabel: "Remover Imagens",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await removeModerationImagesBatch(item.id, selectedList, item.type as any, {
                    autoApproveRemaining: false,
                    notifySeller: payload.notifySeller,
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                })
                if (res.success) {
                    const nextImgs = res.remainingImages || []
                    setImages(nextImgs)
                    setSelectedForRemoval(new Set())
                    toast.success(`${selectedCount} imagem(ns) removida(s) com sucesso!`)
                    onResolved("updated", { ...item, images: nextImgs })
                    return { success: true }
                }
                toast.error(res.error || "Erro ao remover imagens")
                return { success: false, error: res.error }
            },
        })
    }, [item, typeLabel, selectedCount, selectedForRemoval, runAction, onResolved])

    const handleApproveDirectly = useCallback(async () => {
        await runAction({
            title: `Aprovar ${typeLabel}`,
            description: `Confirme a aprovação de "${item.title}" no marketplace.`,
            changedFields: [
                "Status alterado para Aprovado",
            ],
            confirmLabel: "Aprovar",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await approveModeration(item.id, item.type as any, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (res.success) {
                    toast.success(`${typeLabel} aprovado com sucesso!`)
                    onResolved("approved")
                    onClose()
                    return { success: true }
                }
                toast.error(res.error || "Erro ao aprovar item")
                return { success: false, error: res.error }
            },
        })
    }, [item.id, item.type, item.title, typeLabel, runAction, onResolved, onClose])

    const handleReject = useCallback(async () => {
        await runAction({
            title: `Rejeitar ${typeLabel}`,
            description: `Informe o motivo da rejeição de "${item.title}".`,
            requireReason: true,
            changedFields: [
                "Status alterado para Rejeitado",
            ],
            confirmLabel: "Confirmar Rejeição",
            notifyLabel: "Enviar notificação ao vendedor pelo Dudit",
            runner: async (payload) => {
                const res = await rejectModeration(item.id, payload.reason, item.type as any, {
                    reason: payload.reason,
                    riskScore: payload.riskScore,
                    notifySeller: payload.notifySeller,
                })
                if (res.success) {
                    toast.success(`${typeLabel} rejeitado com sucesso!`)
                    onResolved("rejected")
                    onClose()
                    return { success: true }
                }
                toast.error(res.error || "Erro ao rejeitar item")
                return { success: false, error: res.error }
            },
        })
    }, [item.id, item.type, item.title, typeLabel, runAction, onResolved, onClose])

    const statusBadgeVariant =
        item.moderation_status === "flagged"
            ? "red"
            : item.moderation_status === "approved"
                ? "green"
                : item.moderation_status === "rejected"
                    ? "red"
                    : item.moderation_status === "needs_images"
                        ? "blue"
                        : "orange"

    const statusLabel =
        item.moderation_status === "flagged"
            ? "Flagged"
            : item.moderation_status === "approved"
                ? "Aprovado"
                : item.moderation_status === "rejected"
                    ? "Rejeitado"
                    : item.moderation_status === "needs_images"
                        ? "Sem imagens"
                        : "Pendente"

    return (
        <>
            <DefaultModal
                isOpen={isOpen}
                onClose={onClose}
                title={`Moderar ${typeLabel}: ${item.title}`}
                maxWidth="3xl"
                footer={
                    <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
                        <Button variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>

                        <div className="flex items-center gap-2">
                            {selectedCount > 0 ? (
                                <>
                                    <Button
                                        variant="outline"
                                        onClick={handleOnlyRemoveSelected}
                                        className="border-brand-red text-brand-red hover:bg-brand-red/10"
                                    >
                                        <TrashIcon size={14} className="mr-1.5" />
                                        Apenas Remover ({selectedCount})
                                    </Button>

                                    <Button
                                        onClick={handleRemoveAndApprove}
                                        className="bg-brand-green hover:bg-brand-green/90 text-white font-bold"
                                    >
                                        <CheckCircleIcon size={16} className="mr-1.5" />
                                        Remover ({selectedCount}) e Aprovar
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        variant="destructive"
                                        onClick={handleReject}
                                        className="bg-brand-red hover:bg-brand-red/90 text-white"
                                    >
                                        <TrashIcon size={14} className="mr-1.5" />
                                        Rejeitar
                                    </Button>

                                    <Button
                                        onClick={handleApproveDirectly}
                                        className="bg-brand-green hover:bg-brand-green/90 text-white font-bold"
                                    >
                                        <CheckCircleIcon size={16} className="mr-1.5" />
                                        Aprovar {typeLabel}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                }
            >
                <div className="space-y-4 pt-1">
                    {/* Resumo do Item */}
                    <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/40 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                {item.type === "service" ? (
                                    <BriefcaseIcon size={18} className="text-brand-inactive-text" />
                                ) : item.type === "partner" ? (
                                    <UserIcon size={18} className="text-brand-inactive-text" />
                                ) : (
                                    <PackageIcon size={18} className="text-brand-inactive-text" />
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                    {item.title}
                                </span>
                                <div className="flex items-center gap-2 text-xs text-brand-inactive-text">
                                    <span className="flex items-center gap-1 truncate">
                                        <StoreIcon size={12} className="shrink-0" />
                                        {item.store_name || item.owner_store_name || "Loja desconhecida"}
                                    </span>
                                    {item.price !== undefined && item.price > 0 && (
                                        <>
                                            <span>•</span>
                                            <span className="font-semibold text-brand-dark dark:text-dark-heading">
                                                {formatCurrency(item.price)}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Badge variant="gray">{typeLabel}</Badge>
                            <Badge variant={statusBadgeVariant}>{statusLabel}</Badge>
                        </div>
                    </div>

                    {/* Aviso de Flagged pela IA se houver */}
                    {item.moderation_reason && (
                        <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300 flex items-start gap-2.5">
                            <AlertTriangleIcon size={16} className="text-brand-red shrink-0 mt-0.5" />
                            <div className="space-y-1 min-w-0 flex-1">
                                <span className="font-semibold block">Sinalização de Moderação:</span>
                                <p className="text-[11px] leading-relaxed break-words opacity-90">
                                    {item.moderation_reason}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Galeria de Fotos */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                    Imagens do Catálogo ({images.length})
                                </h3>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    Clique nas imagens que deseja <strong className="text-brand-red font-semibold">remover</strong> antes de aprovar.
                                </p>
                            </div>

                            {images.length > 0 && (
                                <div className="flex items-center gap-3 text-xs">
                                    {selectedCount > 0 ? (
                                        <>
                                            <span className="font-bold text-brand-red">
                                                {selectedCount} selecionada{selectedCount > 1 ? "s" : ""}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={clearSelection}
                                                className="text-brand-inactive-text hover:underline cursor-pointer"
                                            >
                                                Limpar
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={selectAllImages}
                                            className="text-brand-inactive-text hover:underline cursor-pointer"
                                        >
                                            Marcar todas
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {images.length === 0 ? (
                            <div className="p-8 text-center border-2 border-dashed border-brand-border dark:border-dark-border rounded-xl">
                                <p className="text-xs text-brand-inactive-text">
                                    Este item não possui imagens cadastradas.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                                {images.map((imgUrl, index) => {
                                    const fullUrl = getR2ImageUrl(imgUrl)
                                    const isSelected = selectedForRemoval.has(imgUrl)
                                    const isAiFlagged = isImageFlagged(imgUrl, aiFlaggedUrls)

                                    return (
                                        <div
                                            key={`${imgUrl}-${index}`}
                                            onClick={() => toggleImageSelection(imgUrl)}
                                            className={`relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer transition-all duration-200 select-none group ${
                                                isSelected
                                                    ? "border-brand-red ring-2 ring-brand-red/30 bg-brand-red/10"
                                                    : isAiFlagged
                                                        ? "border-amber-400 dark:border-amber-500 shadow-xs"
                                                        : "border-brand-border dark:border-dark-border hover:border-brand-dark/40"
                                            }`}
                                        >
                                            <img
                                                src={fullUrl}
                                                alt={`Foto ${index + 1}`}
                                                className={`w-full h-full object-cover transition-transform duration-200 ${
                                                    isSelected ? "opacity-60 scale-95" : "group-hover:scale-105"
                                                }`}
                                                loading="lazy"
                                            />

                                            {/* Badge Superior Esquerdo: Remoção ou Numeração */}
                                            <div className="absolute top-2 left-2 z-10">
                                                {isSelected ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-red text-white flex items-center gap-1 shadow-sm">
                                                        <TrashIcon size={11} /> Remover
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-black/60 text-white backdrop-blur-xs">
                                                        #{index + 1}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Botão de Zoom (Lightbox) */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setLightboxIndex(index)
                                                }}
                                                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                                                title="Visualizar em tamanho real"
                                            >
                                                <EyeIcon size={14} />
                                            </button>

                                            {/* Badge Inferior: Flagged por IA */}
                                            {isAiFlagged && !isSelected && (
                                                <div className="absolute bottom-2 left-2 right-2 z-10">
                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-500 text-white block text-center truncate shadow-sm">
                                                        Flagged por IA
                                                    </span>
                                                </div>
                                            )}

                                            {/* Overlay visual quando selecionada */}
                                            {isSelected && (
                                                <div className="absolute inset-0 bg-brand-red/20 flex items-center justify-center pointer-events-none">
                                                    <div className="w-10 h-10 rounded-full bg-brand-red text-white flex items-center justify-center shadow-md">
                                                        <TrashIcon size={20} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </DefaultModal>

            {/* Lightbox para ampliação em tela cheia */}
            {lightboxIndex !== null && images[lightboxIndex] && (
                <div
                    className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[220]"
                    onClick={() => setLightboxIndex(null)}
                >
                    <button
                        type="button"
                        onClick={() => setLightboxIndex(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                    >
                        <XIcon size={20} />
                    </button>
                    <img
                        src={getR2ImageUrl(images[lightboxIndex])}
                        alt="Visualização ampliada"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Modal de Ação Administrativa (motivo, risk score, notificação) */}
            {actionModal}
        </>
    )
}
