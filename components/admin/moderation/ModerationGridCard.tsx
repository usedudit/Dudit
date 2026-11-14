"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    EyeIcon,
    CheckCircleIcon,
    CancelCircleIcon,
    EditIcon,
    StoreIcon,
    PackageIcon,
    BriefcaseIcon,
    UserIcon,
} from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { formatCurrency } from "@/lib/utils"
import type { ModerationItem } from "@/lib/admin/types"

interface ModerationGridCardProps {
    item: ModerationItem
    isPending?: boolean
    onDetail: (item: ModerationItem) => void
    onApprove: (id: string, type: ModerationItem["type"]) => void
    onReject: (item: ModerationItem) => void
    onEdit: (item: ModerationItem) => void
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

export const ModerationGridCard = React.memo(
    ({
        item,
        onDetail,
        onApprove,
        onReject,
        onEdit,
    }: ModerationGridCardProps) => {
        const typeLabel = TYPE_LABELS[item.type] || "Item"
        const statusInfo = STATUS_MAP[item.moderation_status] || {
            variant: "gray" as const,
            label: item.moderation_status,
        }

        const firstImage = item.images?.[0]
        const imageUrl = firstImage ? getR2ImageUrl(firstImage) : null

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={() => onDetail(item)}
            >
                <div className="flex gap-3 mb-3">
                    {/* Imagem do Item */}
                    <div className="w-16 h-16 rounded-xl bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden border border-brand-border dark:border-dark-border flex items-center justify-center">
                        {imageUrl ? (
                            <img
                                src={imageUrl}
                                alt={item.title}
                                loading="lazy"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-brand-inactive-text">
                                {item.type === "service" ? (
                                    <BriefcaseIcon size={22} />
                                ) : item.type === "partner" ? (
                                    <UserIcon size={22} />
                                ) : (
                                    <PackageIcon size={22} />
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-1">
                            <h3
                                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate flex-1"
                                title={item.title}
                            >
                                {item.title}
                            </h3>
                            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text truncate">
                            <StoreIcon size={12} className="shrink-0" />
                            <span className="truncate">{item.store_name || item.owner_store_name || "Loja"}</span>
                        </div>
                    </div>
                </div>

                {/* Badges e Preço */}
                <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-brand-border/60 dark:border-dark-border/60">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="gray">{typeLabel}</Badge>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>

                    {item.price !== undefined && item.price > 0 && (
                        <span className="font-bold text-xs text-brand-dark dark:text-dark-heading">
                            {formatCurrency(item.price)}
                        </span>
                    )}
                </div>
            </motion.div>
        )
    }
)

ModerationGridCard.displayName = "ModerationGridCard"
export default ModerationGridCard
