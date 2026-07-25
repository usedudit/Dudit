"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    UserIcon,
    CheckCircleIcon,
    AlertCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    StoreIcon
} from "@/lib/icons"
import type { EnforcementUser } from "@/lib/admin/types"

interface UserEnforcementListRowProps {
    user: EnforcementUser
    isPending: boolean
    onUnban: (user: EnforcementUser) => void
    onBan: (user: EnforcementUser) => void
    onView: (user: EnforcementUser) => void
}

const UserEnforcementListRow = React.memo(({
    user,
    isPending,
    onUnban,
    onBan,
    onView
}: UserEnforcementListRowProps) => {

    const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : "?"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={() => onView(user)}
        >
            {/* Usuário */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                        {user.full_name || "Sem nome"}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {user.user_id}
                    </span>
                </div>
            </td>

            {/* Loja */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                {user.partner ? (
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                            <StoreIcon size={12} className="text-brand-inactive-text shrink-0" />
                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                                {user.partner?.store_name || user.partner?.stores?.[0]?.name || "Loja"}
                            </span>
                        </div>
                        <span className="text-[11px] font-medium text-brand-inactive-text opacity-70 ml-4">
                            {user.partner?.id}
                        </span>
                    </div>
                ) : (
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-50">Sem loja</span>
                )}
            </td>

            {/* Data */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(user.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(user.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    {user.banned_at ? (
                        user.banned_until && new Date(user.banned_until) < new Date() ? (
                            <Badge variant="orange">Ban expirado</Badge>
                        ) : (
                            <Badge variant="red">Banido</Badge>
                        )
                    ) : (
                        <Badge variant="green">Ativo</Badge>
                    )}
                </div>
            </td>

            {/* Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown>
                        {user.banned_at ? (
                            <DropdownItem onClick={() => onUnban(user)} className="text-brand-green">
                                <CheckCircleIcon size={16} /> Desbanir Usuário
                            </DropdownItem>
                        ) : (
                            <DropdownItem onClick={() => onBan(user)} className="text-brand-red">
                                <AlertCircleIcon size={16} /> Banir Usuário
                            </DropdownItem>
                        )}
                    </ActionsDropdown>
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.user === next.user &&
    prev.isPending === next.isPending
)

UserEnforcementListRow.displayName = "UserEnforcementListRow"

export default UserEnforcementListRow
