"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import { 
    UserIcon, 
    CheckCircleIcon, 
    AlertCircleIcon, 
    ClockIcon, 
    AlertTriangleIcon 
} from "@/lib/icons"
import type { EnforcementUser } from "@/lib/admin/types"

interface UserEnforcementListRowProps {
    user: EnforcementUser
    isPending: boolean
    onUnban: (user: EnforcementUser) => void
    onBan: (user: EnforcementUser) => void
}

const UserEnforcementListRow = React.memo(({
    user,
    isPending,
    onUnban,
    onBan
}: UserEnforcementListRowProps) => {
    
    const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : "?"

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-[1fr_120px_160px_100px] gap-2 md:gap-4 items-center py-3 px-4 md:px-6 border-b border-brand-border dark:border-dark-border hover:bg-brand-gray/30 dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background group"
        >
            {/* Usuário info */}
            <div className="flex items-center gap-3 min-w-0 text-left">
                <div className="w-10 h-10 rounded-full bg-brand-green/10 dark:bg-brand-green/5 flex items-center justify-center shrink-0 border border-brand-green/20 dark:border-brand-green/10">
                    <span className="text-[13px] font-bold text-brand-green">
                        {initials}
                    </span>
                </div>
                <div className="min-w-0 flex flex-col">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                        {user.full_name || "Sem nome"}
                    </span>
                    {user.partner && (
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            Loja: {user.partner.store_name}
                        </span>
                    )}
                    {user.banned_at && user.banned_reason && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1 mt-0.5 font-bold">
                            <AlertTriangleIcon size={12} className="shrink-0" />
                            <span className="truncate">{user.banned_reason}</span>
                            {user.banned_until && (
                                <span className="shrink-0 ml-1 opacity-70">(até {new Date(user.banned_until).toLocaleDateString("pt-BR")})</span>
                            )}
                        </p>
                    )}
                </div>
            </div>

            {/* Status */}
            <div className="flex md:justify-center">
                {user.banned_at ? (
                    user.banned_until && new Date(user.banned_until) < new Date() ? (
                        <Badge variant="orange">Ban expirado</Badge>
                    ) : (
                        <Badge variant="red">{!user.banned_until ? "Banido" : "Banido (temporário)"}</Badge>
                    )
                ) : (
                    <Badge variant="green">Ativo</Badge>
                )}
            </div>

            {/* Criado em */}
            <div className="flex items-center md:justify-center gap-1.5 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                <ClockIcon size={14} className="opacity-70" />
                {new Date(user.created_at).toLocaleDateString("pt-BR")}
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end md:justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {user.banned_at ? (
                    <Button
                        variant="outline"
                        onClick={() => onUnban(user)}
                        disabled={isPending}
                        className="h-8 px-3 text-xs border-brand-green/20 hover:border-brand-green/40 hover:bg-brand-green/5 text-brand-green"
                    >
                        <CheckCircleIcon size={14} className="mr-1.5" />
                        Desbanir
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        onClick={() => onBan(user)}
                        disabled={isPending}
                        className="h-8 px-3 text-xs border-brand-red/20 hover:border-brand-red/40 hover:bg-brand-red/5 text-brand-red"
                    >
                        <AlertCircleIcon size={14} className="mr-1.5" />
                        Banir
                    </Button>
                )}
            </div>
        </motion.div>
    )
}, (prev, next) => 
    prev.user === next.user && 
    prev.isPending === next.isPending
)

UserEnforcementListRow.displayName = "UserEnforcementListRow"

export default UserEnforcementListRow
