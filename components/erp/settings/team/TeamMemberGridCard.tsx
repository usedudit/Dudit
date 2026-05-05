"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { PartnerRole } from "@/lib/permissions/types"

const ROLE_LABELS: Record<PartnerRole, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    MANAGER: "Gestor",
    OPERATOR: "Operador",
    DELIVERY: "Entregador",
}

interface TeamMemberGridCardProps {
    member: {
        id: string
        userId: string
        email: string
        fullName: string | null
        avatarUrl: string | null
        role: PartnerRole
        createdAt: string
        isOwner: boolean
    }
    roleColors: Record<PartnerRole, string>
    onEdit?: () => void
    onRemove?: () => void
    canModify?: boolean
}

const TeamMemberGridCard = React.memo(({
    member,
    roleColors,
    onEdit,
    onRemove,
    canModify = false
}: TeamMemberGridCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-5 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex flex-col h-full relative"
        >
            <div className="flex flex-col items-center text-center gap-3 mb-4">
                {/* Avatar */}
                <div className="relative">
                    <UserProfileImage
                        fullName={member.fullName || member.email || "Membro"}
                        className="w-20 h-20 text-[32px] border-4 border-white dark:border-dark-surface shadow-sm"
                    />
                    {member.isOwner && (
                        <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white p-1 rounded-full border-2 border-white dark:border-dark-surface shadow-sm" title="Proprietário">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1 w-full">
                    <h3 className="font-bold text-[17px] text-brand-dark dark:text-dark-heading leading-tight truncate px-2" title={member.fullName || "Sem nome"}>
                        {member.fullName || "Sem nome"}
                    </h3>
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate px-4">
                        {member.email}
                    </p>
                </div>
            </div>

            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
                <Badge
                    className={`font-semibold px-3 py-1 rounded-full ${roleColors[member.role]}`} variant={"gray"}                >
                    {ROLE_LABELS[member.role] || member.role}
                </Badge>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body mr-1">
                        Desde {new Date(member.createdAt).toLocaleDateString("pt-BR", { month: 'short', year: 'numeric' })}
                    </span>

                    {canModify && (onEdit || onRemove) && (
                        <div onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown
                                onEdit={onEdit}
                                onDelete={onRemove}
                            />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    )
})

TeamMemberGridCard.displayName = "TeamMemberGridCard"

export default TeamMemberGridCard
