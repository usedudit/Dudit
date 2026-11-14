"use client"

import React, { useState, useEffect, useMemo, useTransition } from "react"
import {
    XIcon,
    CheckCircleIcon,
    TrashIcon,
    EyeIcon,
    AlertTriangleIcon,
    StoreIcon,
    LinkIcon,
    EditIcon,
} from "@/lib/icons"
import { Badge, Button, Tooltip, Spinner } from "@/components/reusable"
import { useModalLayer } from "@/lib/modal-stack"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { extractFlaggedImages, isImageFlagged } from "@/lib/utils/product-display-images"
import {
    approveModeration,
    rejectModeration,
    removeModerationImagesBatch,
} from "@/app/actions/admin/moderation"
import { toast } from "@/hooks/use-notification"
import type { ModerationItem } from "@/lib/admin/types"
import { formatCurrency, formatDate } from "@/lib/utils"

interface AdminQuickModerationModalProps {
    item: ModerationItem
    isOpen: boolean
    onClose: () => void
    onResolved: (action: "approved" | "rejected" | "updated", updatedItem?: ModerationItem) => void
}

export function AdminQuickModerationModal({
    item,
    isOpen,
    onClose,
    onResolved,
}: AdminQuickModerationModalProps) {
    const modalZIndex = useModalLayer(isOpen)
    const [isPending, startTransition] = useTransition()

    // Imagens atuais do item
    const [images, setImages] = useState<string[]>(item.images || [])

    // Conjunto de URLs marcadas para remoção
    const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set())

    // Estado do fluxo de rejeição
    const [isRejecting, setIsRejecting] = useState(false)
    const [rejectReason, setRejectReason] = useState("")

    // Lightbox para inspecionar imagem ampliada
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

    // Lista de imagens que o Sightengine sinalizou no motivo
    const flaggedByAi = useMemo(() => {
        return extractFlaggedImages(item.moderation_reason)
    }, [item.moderation_reason])

    // Pre-seleciona automaticamente as imagens sinalizadas pelo Sightengine para facilitar a vida do admin
    useEffect(() => {
        setImages(item.images || [])
        const flaggedSet = new Set<string>()
        if (flaggedByAi.length > 0 && Array.isArray(item.images)) {
            for (const img of item.images) {
                if (isImageFlagged(img, flaggedByAi)) {
                    flaggedSet.add(img)
                }
            }
        }
        setSelectedToRemove(flaggedSet)
        setIsRejecting(false)
        setRejectReason("")
        setLightboxIndex(null)
    }, [item, flaggedByAi])

    // Fecha ao pressionar ESC
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (lightboxIndex !== null) {
                    setLightboxIndex(null)
                } else if (isRejecting) {
                    setIsRejecting(false)
                } else {
                    onClose()
                }
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [isOpen, lightboxIndex, isRejecting, onClose])

    if (!isOpen) return null

    const typeLabel = item.type === "product" ? "Produto" : item.type === "service" ? "Serviço" : "Item"
    const remainingCount = images.length - selectedToRemove.size
    const selectedCount = selectedToRemove.size

    const toggleImageSelection = (imgUrl: string) => {
        setSelectedToRemove((prev) => {
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
        setSelectedToRemove(new Set(images))
    }

    const clearSelection = () => {
        setSelectedToRemove(new Set())
    }

    // ─── Ação: Remover Selecionadas E Aprovar Produto ──────────────────────────
    const handleRemoveAndApprove = () => {
        if (selectedCount === 0) return
        if (remainingCount === 0) {
            toast.error("Não é possível aprovar um item sem nenhuma imagem restante.")
            return
        }

        startTransition(async () => {
            const res = await removeModerationImagesBatch(
                item.id,
                Array.from(selectedToRemove),
                item.type as any,
                { autoApproveRemaining: true }
            )

            if (res.success) {
                toast.success(`${selectedCount} imagem(ns) removida(s) e ${typeLabel.toLowerCase()} aprovado com sucesso!`)
                onResolved("approved")
                onClose()
            } else {
                toast.error(res.error || "Erro ao processar moderação")
            }
        })
    }

    // ─── Ação: Apenas Remover Selecionadas (sem aprovar ainda) ─────────────────
    const handleOnlyRemoveSelected = () => {
        if (selectedCount === 0) return

        startTransition(async () => {
            const res = await removeModerationImagesBatch(
                item.id,
                Array.from(selectedToRemove),
                item.type as any,
                { autoApproveRemaining: false }
            )

            if (res.success) {
                const nextImages = res.remainingImages || images.filter(img => !selectedToRemove.has(img))
                setImages(nextImages)
                setSelectedToRemove(new Set())
                toast.success(`${selectedCount} imagem(ns) removida(s) do ${typeLabel.toLowerCase()}!`)
                if (res.noImagesLeft) {
                    toast.info("O item ficou sem imagens e agora está com status 'Sem imagens'.")
                }
                onResolved("updated", {
                    ...item,
                    images: nextImages,
                    moderation_status: res.newStatus || item.moderation_status,
                })
            } else {
                toast.error(res.error || "Erro ao remover imagens")
            }
        })
    }

    // ─── Ação: Aprovar Diretamente (com todas as imagens mantidas) ─────────────
    const handleApproveDirectly = () => {
        startTransition(async () => {
            const res = await approveModeration(item.id, item.type as any)
            if (res.success) {
                toast.success(`${typeLabel} aprovado com sucesso no marketplace!`)
                onResolved("approved")
                onClose()
            } else {
                toast.error(res.error || `Erro ao aprovar ${typeLabel.toLowerCase()}`)
            }
        })
    }

    // ─── Ação: Confirmar Rejeição do Item Inteiro ──────────────────────────────
    const handleConfirmReject = () => {
        const reason = rejectReason.trim()
        if (!reason) {
            toast.error("Informe o motivo da rejeição para o lojista.")
            return
        }

        startTransition(async () => {
            const res = await rejectModeration(item.id, reason, item.type as any)
            if (res.success) {
                toast.success(`${typeLabel} rejeitado. O lojista foi notificado.`)
                onResolved("rejected")
                onClose()
            } else {
                toast.error(res.error || `Erro ao rejeitar ${typeLabel.toLowerCase()}`)
            }
        })
    }

    const quickReasons = [
        "Imagem inadequada com violação dos termos",
        "Conteúdo para maiores / nudez ou violência",
        "Propaganda enganosa / imagem não condizente",
        "Direitos autorais ou uso indevido de marca",
        "Qualidade muito baixa / ilegível",
    ]

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
            style={{ zIndex: modalZIndex }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !isPending) onClose()
            }}
        >
            <div
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ─── Header ──────────────────────────────────────────────────────── */}
                <div className="p-5 border-b border-brand-border dark:border-dark-border flex items-start justify-between gap-4 bg-brand-gray/30 dark:bg-dark-border/20 shrink-0">
                    <div className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-brand-dark/10 dark:bg-white/10 text-brand-dark dark:text-dark-heading uppercase tracking-wider">
                                {typeLabel}
                            </span>
                            {item.moderation_status === "flagged" ? (
                                <Badge variant="red" className="flex items-center gap-1 font-semibold">
                                    <AlertTriangleIcon size={12} /> Sinalizado (Flagged)
                                </Badge>
                            ) : item.moderation_status === "pending_moderation" ? (
                                <Badge variant="orange" className="font-semibold">Pendente</Badge>
                            ) : item.moderation_status === "needs_images" ? (
                                <Badge variant="blue" className="font-semibold">Sem imagens</Badge>
                            ) : (
                                <Badge variant="gray">{item.moderation_status}</Badge>
                            )}

                            {item.price > 0 && (
                                <span className="text-sm font-bold text-brand-dark dark:text-dark-heading ml-1">
                                    {formatCurrency(item.price)}
                                </span>
                            )}
                        </div>

                        <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading truncate" title={item.title}>
                            {item.title}
                        </h2>

                        <div className="flex items-center gap-3 text-xs text-brand-inactive-text dark:text-dark-body flex-wrap">
                            <span className="flex items-center gap-1 font-medium">
                                <StoreIcon size={13} /> {item.store_name || item.owner_store_name || "Loja"}
                            </span>
                            <span>•</span>
                            <span>Enviado em {formatDate(item.created_at)}</span>
                            <span>•</span>
                            <span className="font-mono opacity-80">ID: {item.id}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <a
                            href={item.type === "product" ? `/erp/produtos/${item.id}` : `/erp/servicos?edit=${item.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition-colors flex items-center gap-1 text-xs font-medium"
                            title="Abrir detalhes completos no ERP em nova aba"
                        >
                            <EditIcon size={15} />
                            <span className="hidden sm:inline">Ver no ERP</span>
                        </a>
                        <button
                            onClick={onClose}
                            disabled={isPending}
                            className="p-2 rounded-lg text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition-colors disabled:opacity-50"
                        >
                            <XIcon size={18} />
                        </button>
                    </div>
                </div>

                {/* ─── Motivo da Moderação (se houver) ──────────────────────────────── */}
                {item.moderation_reason && (
                    <div className="px-5 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50 flex items-start gap-2.5 shrink-0">
                        <AlertTriangleIcon size={16} className="text-brand-red shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-brand-red uppercase tracking-wider block">
                                Detecção de Segurança / Moderação
                            </span>
                            <p className="text-xs text-brand-red/90 mt-0.5 line-clamp-2">
                                {item.moderation_reason}
                            </p>
                        </div>
                    </div>
                )}

                {/* ─── Conteúdo: Galeria de Imagens com Seleção Direta ───────────────── */}
                <div className="p-5 flex-1 overflow-y-auto">
                    {isRejecting ? (
                        /* ─── Sub-tela de Rejeição Rápida ─── */
                        <div className="flex flex-col gap-4 py-2 animate-in fade-in duration-150">
                            <div className="flex items-center gap-2 text-brand-red font-bold text-base">
                                <AlertTriangleIcon size={18} />
                                Rejeitar {typeLabel} do Marketplace
                            </div>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Selecione um motivo padrão ou digite uma justificativa clara para o lojista corrigir o problema:
                            </p>

                            {/* Sugestões rápidas de motivos */}
                            <div className="flex flex-wrap gap-2">
                                {quickReasons.map((qr) => (
                                    <button
                                        key={qr}
                                        type="button"
                                        onClick={() => setRejectReason(qr)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors text-left ${rejectReason === qr
                                                ? "bg-brand-red text-white border-brand-red"
                                                : "bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border"
                                            }`}
                                    >
                                        {qr}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Descreva o motivo da recusa detalhadamente..."
                                rows={4}
                                className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/50 resize-none"
                                autoFocus
                            />

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsRejecting(false)}
                                    disabled={isPending}
                                >
                                    Voltar para Fotos
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleConfirmReject}
                                    disabled={isPending || !rejectReason.trim()}
                                    className="bg-brand-red hover:bg-brand-red/90 text-white font-semibold"
                                >
                                    {isPending ? <Spinner size={16} /> : <TrashIcon size={15} />}
                                    Confirmar Rejeição
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* ─── Galeria de Fotos ─── */
                        <div className="space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <h3 className="font-bold text-base text-brand-dark dark:text-dark-heading">
                                        Imagens do Catálogo ({images.length})
                                    </h3>
                                    <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                        Clique sobre as imagens que você deseja <strong className="text-brand-red font-semibold">remover</strong>.
                                    </p>
                                </div>

                                {images.length > 0 && (
                                    <div className="flex items-center gap-2 text-xs">
                                        {selectedCount > 0 ? (
                                            <>
                                                <span className="font-bold text-brand-red">
                                                    {selectedCount} selecionada{selectedCount > 1 ? "s" : ""} para remoção
                                                </span>
                                                <button
                                                    onClick={clearSelection}
                                                    className="text-brand-inactive-text hover:underline"
                                                >
                                                    (Limpar)
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={selectAllImages}
                                                className="text-brand-inactive-text hover:underline"
                                            >
                                                Marcar todas
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {images.length === 0 ? (
                                <div className="p-8 text-center border-2 border-dashed border-brand-border dark:border-dark-border rounded-xl">
                                    <p className="text-sm font-medium text-brand-inactive-text">
                                        Este {typeLabel.toLowerCase()} não possui imagens cadastradas.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                                    {images.map((imgUrl, idx) => {
                                        const isSelected = selectedToRemove.has(imgUrl)
                                        const isAiFlagged = isImageFlagged(imgUrl, flaggedByAi)
                                        const fullUrl = getR2ImageUrl(imgUrl)

                                        return (
                                            <div
                                                key={imgUrl || idx}
                                                onClick={() => toggleImageSelection(imgUrl)}
                                                className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-200 select-none ${isSelected
                                                        ? "ring-3 ring-brand-red border-2 border-brand-red shadow-lg shadow-brand-red/10 scale-[0.98]"
                                                        : "border border-brand-border dark:border-dark-border hover:border-brand-dark/50 dark:hover:border-white/50"
                                                    }`}
                                            >
                                                <img
                                                    src={fullUrl}
                                                    alt={`Foto ${idx + 1}`}
                                                    className={`w-full h-full object-cover transition-transform duration-200 ${isSelected ? "opacity-40 grayscale-50 scale-95" : "group-hover:scale-105"
                                                        }`}
                                                    loading="lazy"
                                                />

                                                {/* Tag da IA se foi ela que sinalizou esta imagem */}
                                                {isAiFlagged && (
                                                    <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-red text-white shadow-xs flex items-center gap-1">
                                                        <AlertTriangleIcon size={10} /> IA Flagged
                                                    </span>
                                                )}

                                                {/* Botão de lupa para ver tela cheia */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setLightboxIndex(idx)
                                                    }}
                                                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Ampliar foto"
                                                >
                                                    <EyeIcon size={13} />
                                                </button>

                                                {/* Overlay e Badge quando selecionada para remover */}
                                                {isSelected ? (
                                                    <div className="absolute inset-0 bg-red-600/20 flex flex-col items-center justify-center gap-1 text-brand-red font-bold p-2 text-center">
                                                        <div className="w-8 h-8 rounded-full bg-brand-red text-white flex items-center justify-center shadow-md">
                                                            <TrashIcon size={16} />
                                                        </div>
                                                        <span className="text-[11px] uppercase tracking-wide bg-white/90 dark:bg-black/80 px-2 py-0.5 rounded font-black text-brand-red shadow-xs">
                                                            Remover
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-white text-[11px]">
                                                        <span>Foto #{idx + 1}</span>
                                                        <span className="text-white/80 text-[10px]">Clique p/ remover</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Informações adicionais do item */}
                            {item.description && (
                                <div className="mt-4 pt-4 border-t border-brand-border dark:border-dark-border">
                                    <h4 className="text-xs font-bold text-brand-inactive-text uppercase tracking-wider mb-1">
                                        Descrição
                                    </h4>
                                    <p className="text-xs text-brand-dark dark:text-dark-heading max-h-24 overflow-y-auto leading-relaxed">
                                        {item.description}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ─── Footer: Ações Rápidas ─────────────────────────────────────────── */}
                <div className="p-4 px-5 border-t border-brand-border dark:border-dark-border bg-brand-gray/20 dark:bg-dark-border/20 flex items-center justify-between gap-3 shrink-0 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isPending}
                        className="text-xs font-semibold"
                    >
                        Fechar
                    </Button>

                    {!isRejecting && (
                        <div className="flex items-center gap-2 flex-wrap ml-auto">
                            {/* Botão de Rejeição */}
                            <Button
                                variant="outline"
                                onClick={() => setIsRejecting(true)}
                                disabled={isPending}
                                className="text-brand-red hover:bg-brand-red/10 border-brand-red/30 text-xs font-semibold"
                            >
                                Rejeitar {typeLabel}
                            </Button>

                            {/* Se houver fotos selecionadas: botão de apenas remover */}
                            {selectedCount > 0 && (
                                <Button
                                    variant="outline"
                                    onClick={handleOnlyRemoveSelected}
                                    disabled={isPending}
                                    className="border-brand-red text-brand-red hover:bg-brand-red/10 text-xs font-semibold"
                                >
                                    {isPending ? <Spinner size={16} /> : <TrashIcon size={14} />}
                                    Apenas Remover ({selectedCount})
                                </Button>
                            )}

                            {/* Botão Principal */}
                            {selectedCount > 0 ? (
                                <Button
                                    onClick={handleRemoveAndApprove}
                                    disabled={isPending || remainingCount === 0}
                                    className="bg-brand-green hover:bg-brand-green/90 text-white font-bold text-xs shadow-xs"
                                >
                                    {isPending ? <Spinner size={16} /> : <CheckCircleIcon size={15} />}
                                    Remover ({selectedCount}) e Aprovar
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleApproveDirectly}
                                    disabled={isPending}
                                    className="bg-brand-green hover:bg-brand-green/90 text-white font-bold text-xs shadow-xs"
                                >
                                    {isPending ? <Spinner size={16} /> : <CheckCircleIcon size={15} />}
                                    Aprovar {typeLabel}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox para ampliação */}
            {lightboxIndex !== null && images[lightboxIndex] && (
                <div
                    className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[200]"
                    onClick={() => setLightboxIndex(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh]">
                        <img
                            src={getR2ImageUrl(images[lightboxIndex])}
                            alt=""
                            className="max-w-full max-h-[85vh] object-contain rounded-lg"
                        />
                        <button
                            onClick={() => setLightboxIndex(null)}
                            className="absolute -top-10 right-0 text-white/90 hover:text-white p-2"
                        >
                            <XIcon size={24} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
