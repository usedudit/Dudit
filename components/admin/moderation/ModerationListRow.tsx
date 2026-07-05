"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    CheckCircleIcon,
    RemoveImageIcon,
    StoreIcon,
    CancelCircleIcon,
} from "@/lib/icons"
import type { ModerationItem } from "@/lib/admin/types"

interface ModerationListRowProps {
    item: ModerationItem
    isPending: boolean
    onDetail: (item: ModerationItem) => void
    onApprove: (id: string, type: ModerationItem["type"]) => void
}

const ModerationListRow = React.memo(({
    item,
    isPending,
    onDetail,
    onApprove
}: ModerationListRowProps) => {

    const statusMap: Record<string, { variant: "orange" | "red" | "green" | "gray" | "blue"; label: string }> = {
        pending_moderation: { variant: "orange", label: "Pendente" },
        flagged: { variant: "red", label: "Flagged" },
        approved: { variant: "green", label: "Aprovado" },
        rejected: { variant: "red", label: "Rejeitado" },
        needs_images: { variant: "blue", label: "Sem imagens" },
    }

    const statusInfo = statusMap[item.moderation_status] || { variant: "gray", label: item.moderation_status }

    const firstImage = item.images?.[0]
    const imageUrl = firstImage
        ? (firstImage.startsWith("http") ? firstImage : `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ""}/${firstImage}`)
        : null

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(item)}
        >
            {/* Produto */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                        {imageUrl ? (
                            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                {item.type === "partner" ? (
                                    <StoreIcon className="w-4 h-4 text-brand-inactive-text" />
                                ) : (
                                    <RemoveImageIcon className="w-4 h-4 text-brand-inactive-text" />
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                            {item.title}
                        </span>
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                            {item.id}
                        </span>
                    </div>
                </div>
            </td>

            {/* Parceiro */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1">
                        <StoreIcon size={12} className="text-brand-inactive-text shrink-0" />
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                            {item.owner_store_name}
                        </span>
                    </div>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70 ml-4">
                        {item.partner_id}
                    </span>
                </div>
            </td>

            {/* Imagens */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                    {item.images?.length || 0}
                </span>
            </td>

            {/* Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(item.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
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
                        {item.moderation_status === "pending_moderation" && (
                            <DropdownItem onClick={() => onApprove(item.id, item.type)} className="text-brand-green">
                                <CheckCircleIcon size={16} /> Aprovar {item.type === "product" ? "Produto" : item.type === "partner" ? "Perfil" : item.type === "community_video" ? "Vídeo" : "Serviço"}
                            </DropdownItem>
                        )}
                        <DropdownItem onClick={() => onDetail(item)} className="text-brand-red">
                            <CancelCircleIcon size={16} /> Rejeitar {item.type === "product" ? "Produto" : item.type === "partner" ? "Perfil" : item.type === "community_video" ? "Vídeo" : "Serviço"}
                        </DropdownItem>
                    </ActionsDropdown>
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.moderation_status === next.item.moderation_status &&
    prev.isPending === next.isPending
)

ModerationListRow.displayName = "ModerationListRow"

export default ModerationListRow
