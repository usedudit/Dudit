"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import {
    ClockIcon,
    CheckCircleIcon,
    RemoveImageIcon,
} from "@/lib/icons"
import { formatDate } from "@/lib/utils"
import type { ModerationItem } from "@/lib/admin/types"

interface ModerationListRowProps {
    item: ModerationItem
    isPending: boolean
    onDetail: (item: ModerationItem) => void
    onApprove: (id: string) => void
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
            {/* Imagem */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-16">
                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden shrink-0 border border-brand-border dark:border-dark-border">
                    {imageUrl ? (
                        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <RemoveImageIcon className="w-4 h-4 text-brand-inactive-text" />
                        </div>
                    )}
                </div>
            </td>

            {/* Info */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                        {item.title}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                        {item.owner_store_name} • {item.images?.length || 0} imagens
                    </span>
                    {item.risk_score > 0 && (
                        <span className="text-[11px] font-bold text-brand-red">
                            Risk Score: {item.risk_score}
                        </span>
                    )}
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

            {/* Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    <ClockIcon size={14} className="opacity-70" />
                    {formatDate(item.created_at)}
                </div>
            </td>

            {/* Ações Rápidas */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex items-center justify-center action-btn opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <Button
                        variant="outline"
                        onClick={() => onApprove(item.id)}
                        disabled={isPending}
                        className="h-8 px-3 text-xs border-brand-green/20 hover:border-brand-green/40 hover:bg-brand-green/5 text-brand-green"
                        title="Aprovar produto"
                    >
                        <CheckCircleIcon size={14} className="mr-1.5" />
                        Aprovar
                    </Button>
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.item === next.item &&
    prev.isPending === next.isPending
)

ModerationListRow.displayName = "ModerationListRow"

export default ModerationListRow
