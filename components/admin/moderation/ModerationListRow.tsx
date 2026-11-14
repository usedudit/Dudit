"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    CheckCircleIcon,
    StoreIcon,
    CancelCircleIcon,
    ChevronsUpDown,
    EyeIcon,
    EditIcon,
    PackageIcon,
    BriefcaseIcon,
    UserIcon,
} from "@/lib/icons"
import { usePartnerTimezone } from "@/lib/store-context"
import { useModalLayer } from "@/lib/modal-stack"
import type { ModerationItem } from "@/lib/admin/types"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface ModerationListRowProps {
    item: ModerationItem
    isPending: boolean
    onDetail: (item: ModerationItem) => void
    onApprove: (id: string, type: ModerationItem["type"]) => void
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
    product: PackageIcon,
    service: BriefcaseIcon,
    partner: UserIcon,
    community_video: PackageIcon,
    return_dispute: PackageIcon,
}

const getTypeLabel = (type: string) => {
    if (type === "product") return "Produto"
    if (type === "service") return "Serviço"
    if (type === "partner") return "Perfil"
    if (type === "community_video") return "Vídeo"
    if (type === "return_dispute") return "Disputa"
    return "Item"
}

const ModerationListRow = React.memo(({
    item,
    isPending,
    onDetail,
    onApprove,
}: ModerationListRowProps) => {
    const tz = usePartnerTimezone()
    const [showLightbox, setShowLightbox] = useState(false)
    const [lightboxIndex, setLightboxIndex] = useState(0)

    const statusMap: Record<string, { variant: "orange" | "red" | "green" | "gray" | "blue"; label: string }> = {
        pending_moderation: { variant: "orange", label: "Pendente" },
        flagged: { variant: "red", label: "Flagged" },
        approved: { variant: "green", label: "Aprovado" },
        rejected: { variant: "red", label: "Rejeitado" },
        needs_images: { variant: "blue", label: "Sem imagens" },
    }

    const statusInfo = statusMap[item.moderation_status] || { variant: "gray" as const, label: item.moderation_status }

    const firstImage = item.images?.[0]
    const imageUrl = firstImage ? getR2ImageUrl(firstImage) : null

    const allImages = (item.images || []).map(url => getR2ImageUrl(url))

    const openLightbox = (index: number = 0) => {
        setLightboxIndex(index)
        setShowLightbox(true)
    }

    const TypeIcon = TYPE_ICONS[item.type] || PackageIcon
    const typeLabel = getTypeLabel(item.type)

    return (
        <>
            <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
                onClick={() => onDetail(item)}
            >
                {/* Item */}
                <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                    <div className="flex items-center gap-3 min-w-0">
                        <div
                            className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden shrink-0 border border-brand-border dark:border-dark-border cursor-pointer relative"
                            onClick={(e) => { e.stopPropagation(); openLightbox(0) }}
                        >
                            {imageUrl ? (
                                <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <TypeIcon className="w-5 h-5 text-brand-inactive-text" />
                                </div>
                            )}
                            {item.images && item.images.length > 1 && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <ChevronsUpDown className="w-5 h-5 text-white" />
                                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs bg-black/80 text-white px-1.5 py-0.5 rounded whitespace-nowrap">
                                        {item.images.length} imagens - clique para ver
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                                    {item.title}
                                </span>
                                <span className="px-1.5 py-0.5 bg-brand-gray dark:bg-dark-border rounded text-[9px] font-medium text-brand-inactive-text shrink-0">
                                    {typeLabel}
                                </span>
                            </div>
                            <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                                {item.id}
                            </span>
                        </div>
                    </div>
                </td>

                {/* Loja */}
                <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                            <StoreIcon size={12} className="text-brand-inactive-text shrink-0" />
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                                {item.store_name || item.owner_store_name}
                            </span>
                        </div>
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70 ml-4">
                            {item.store_id || item.partner_id}
                        </span>
                    </div>
                </td>

                {/* Imagens */}
                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        {item.images?.length || 0}
                    </span>
                    {item.images && item.images.length > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); openLightbox(0) }}
                            className="text-[10px] text-brand-green hover:underline mt-0.5 block cursor-pointer"
                        >
                            Ver
                        </button>
                    )}
                </td>

                {/* Data */}
                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                    <div className="flex flex-col items-center">
                        <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                            {new Date(item.created_at).toLocaleDateString("pt-BR", { timeZone: tz })}
                        </span>
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                            {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit', timeZone: tz })}
                        </span>
                    </div>
                </td>

                {/* Status */}
                <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                    <div className="flex justify-center">
                        <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                        </Badge>
                    </div>
                </td>

                {/* Ações */}
                <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                    <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                        <ActionsDropdown
                            onView={() => onDetail(item)}
                        >
                            <DropdownItem onClick={() => onDetail(item)}>
                                <EyeIcon size={16} /> Visualizar
                            </DropdownItem>
                            {item.type === "product" && (
                                <DropdownItem
                                    onClick={() => window.open(`/erp/produtos/${item.id}`, "_blank")}
                                >
                                    <EditIcon size={16} /> Editar no ERP
                                </DropdownItem>
                            )}
                            {(item.moderation_status === "pending_moderation" || item.moderation_status === "flagged") && (
                                <DropdownItem
                                    onClick={() => onApprove(item.id, item.type)}
                                    className="text-brand-green"
                                >
                                    <CheckCircleIcon size={16} /> Aprovar {typeLabel}
                                </DropdownItem>
                            )}
                            <DropdownItem
                                onClick={() => onDetail(item)}
                                className="text-brand-red"
                            >
                                <CancelCircleIcon size={16} /> Rejeitar {typeLabel}
                            </DropdownItem>
                        </ActionsDropdown>
                    </div>
                </td>
            </motion.tr>

            {/* Lightbox */}
            {showLightbox && (
                <ImageLightbox
                    isOpen={showLightbox}
                    onClose={() => setShowLightbox(false)}
                    images={allImages}
                    currentIndex={lightboxIndex}
                    onNavigate={(dir) => setLightboxIndex(prev => (prev + dir + allImages.length) % allImages.length)}
                />
            )}
        </>
    )
}, (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.moderation_status === next.item.moderation_status &&
    prev.isPending === next.isPending
)

ModerationListRow.displayName = "ModerationListRow"

export default ModerationListRow

function ImageLightbox({ isOpen, onClose, images, currentIndex, onNavigate }: {
    isOpen: boolean
    onClose: () => void
    images: string[]
    currentIndex: number
    onNavigate: (dir: 1 | -1) => void
}) {
    // z-index dinâmico: o lightbox abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)

    if (!isOpen || images.length === 0) return null

    const currentImage = images[currentIndex]

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" style={{ zIndex }} onClick={onClose}>
            <div className="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                <img
                    src={currentImage}
                    alt={`Imagem ${currentIndex + 1} de ${images.length}`}
                    className="max-w-full max-h-full object-contain"
                />
                {images.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate(-1) }}
                            className="absolute left-4 text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/50"
                            aria-label="Anterior"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onNavigate(1) }}
                            className="absolute right-4 text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/50"
                            aria-label="Próxima"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                            {currentIndex + 1} / {images.length}
                        </div>
                    </>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onClose() }}
                    className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/50"
                    aria-label="Fechar"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
