"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    CheckCircleIcon,
    StoreIcon,
    CancelCircleIcon,
    EyeIcon,
    EditIcon,
    PackageIcon,
    BriefcaseIcon,
    UserIcon,
} from "@/lib/icons"
import { usePartnerTimezone } from "@/lib/store-context"
import type { ModerationItem } from "@/lib/admin/types"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface ModerationListRowProps {
    item: ModerationItem
    isPending: boolean
    onDetail: (item: ModerationItem) => void
    onApprove: (id: string, type: ModerationItem["type"]) => void
    onReject: (item: ModerationItem) => void
    onEdit: (item: ModerationItem) => void
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
    product: PackageIcon,
    service: BriefcaseIcon,
    partner: UserIcon,
    recurring_plan: PackageIcon,
    community_video: PackageIcon,
    return_dispute: PackageIcon,
}

const TYPE_LABELS: Record<string, string> = {
    product: "Produto",
    service: "Serviço",
    recurring_plan: "Plano",
    partner: "Perfil",
    community_video: "Vídeo",
    return_dispute: "Disputa",
}

const STATUS_MAP: Record<string, { variant: "orange" | "red" | "green" | "gray" | "blue"; label: string }> = {
    pending_moderation: { variant: "orange", label: "Pendente" },
    pending: { variant: "orange", label: "Pendente" },
    flagged: { variant: "red", label: "Flagged" },
    approved: { variant: "green", label: "Aprovado" },
    rejected: { variant: "red", label: "Rejeitado" },
    needs_images: { variant: "blue", label: "Sem imagens" },
    in_review: { variant: "blue", label: "Em análise" },
}

const ModerationListRow = React.memo(({
    item,
    isPending,
    onDetail,
    onApprove,
    onReject,
    onEdit,
}: ModerationListRowProps) => {
    const tz = usePartnerTimezone()

    const statusInfo = STATUS_MAP[item.moderation_status] || {
        variant: "gray" as const,
        label: item.moderation_status,
    }

    const firstImage = item.images?.[0]
    const imageUrl = firstImage ? getR2ImageUrl(firstImage) : null

    const TypeIcon = TYPE_ICONS[item.type] || PackageIcon
    const typeLabel = TYPE_LABELS[item.type] || "Item"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onDetail(item)}
        >
            {/* Item */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-dark-border overflow-hidden shrink-0 border border-brand-border dark:border-dark-border flex items-center justify-center">
                        {imageUrl ? (
                            <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                            <TypeIcon className="w-5 h-5 text-brand-inactive-text" />
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

            {/* Tipo */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    <Badge variant="gray">
                        {typeLabel}
                    </Badge>
                </div>
            </td>

            {/* Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(item.created_at).toLocaleDateString("pt-BR", { timeZone: tz })}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: tz })}
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
                <div className="flex items-center justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown onView={() => onDetail(item)}>
                        <DropdownItem onClick={() => onDetail(item)}>
                            <EyeIcon size={16} /> Moderar
                        </DropdownItem>
                        <DropdownItem
                            onClick={() => onApprove(item.id, item.type)}
                            className="text-brand-green"
                        >
                            <CheckCircleIcon size={16} /> Aprovar
                        </DropdownItem>
                        <DropdownItem
                            onClick={() => onReject(item)}
                            className="text-brand-red"
                        >
                            <CancelCircleIcon size={16} /> Rejeitar
                        </DropdownItem>
                        <DropdownItem onClick={() => onEdit(item)}>
                            <EditIcon size={16} /> Editar
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
