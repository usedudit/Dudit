"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Button } from "@/components/reusable"
import {
    StoreIcon,
    CheckCircleIcon,
    BlockedIcon,
    ClockIcon,
    AlertTriangleIcon
} from "@/lib/icons"
import type { EnforcementPartner } from "@/lib/admin/types"

interface PartnerListRowProps {
    partner: EnforcementPartner
    isPending: boolean
    onUnsuspend: (partner: EnforcementPartner) => void
    onSuspend: (partner: EnforcementPartner) => void
    onEnableERP: (partner: EnforcementPartner) => void
    onDisableERP: (partner: EnforcementPartner) => void
}

const PartnerListRow = React.memo(({
    partner,
    isPending,
    onUnsuspend,
    onSuspend,
    onEnableERP,
    onDisableERP
}: PartnerListRowProps) => {

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        >
            {/* Parceiro info */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/30">
                        <StoreIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex flex-col">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
                            {partner.store_name}
                        </span>
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            Dono: {partner.owner_name}
                        </span>
                        {partner.suspended_at && partner.suspended_until && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5 font-bold">
                                <AlertTriangleIcon size={12} className="shrink-0" />
                                Até {new Date(partner.suspended_until).toLocaleDateString("pt-BR")}
                            </p>
                        )}
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    {partner.erp_disabled ? (
                        <Badge variant="red">ERP Desabilitado</Badge>
                    ) : partner.suspended_at ? (
                        <Badge variant="orange">Suspenso</Badge>
                    ) : !partner.is_active ? (
                        <Badge variant="gray">Inativo</Badge>
                    ) : (
                        <Badge variant="green">Ativo</Badge>
                    )}
                </div>
            </td>

            {/* Risco */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center">
                    {partner.risk_score > 0 && (
                        <Badge variant={partner.risk_score >= 50 ? "red" : partner.risk_score >= 20 ? "orange" : "blue"}>
                            Risk: {partner.risk_score}
                        </Badge>
                    )}
                </div>
            </td>

            {/* Criado em */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    <ClockIcon size={14} className="opacity-70" />
                    {new Date(partner.created_at).toLocaleDateString("pt-BR")}
                </div>
            </td>

            {/* Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex items-center justify-center gap-2 flex-wrap action-btn opacity-0 group-hover:opacity-100 transition-opacity">
                    {partner.suspended_at ? (
                        <Button
                            variant="outline"
                            onClick={() => onUnsuspend(partner)}
                            disabled={isPending}
                            className="h-8 px-2 text-xs border-brand-green/20 hover:border-brand-green/40 hover:bg-brand-green/5 text-brand-green"
                        >
                            <CheckCircleIcon size={14} className="mr-1" /> Reativar
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => onSuspend(partner)}
                            disabled={isPending}
                            className="h-8 px-2 text-xs border-brand-orange/20 hover:border-brand-orange/40 hover:bg-brand-orange/5 text-brand-orange"
                        >
                            <AlertTriangleIcon size={14} className="mr-1" /> Suspender
                        </Button>
                    )}

                    {partner.erp_disabled ? (
                        <Button
                            variant="outline"
                            onClick={() => onEnableERP(partner)}
                            disabled={isPending}
                            className="h-8 px-2 text-xs border-brand-blue/20 hover:border-brand-blue/40 hover:bg-brand-blue/5 text-brand-blue"
                        >
                            <CheckCircleIcon size={14} className="mr-1" /> ERP
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => onDisableERP(partner)}
                            disabled={isPending}
                            className="h-8 px-2 text-xs border-brand-red/20 hover:border-brand-red/40 hover:bg-brand-red/5 text-brand-red"
                        >
                            <BlockedIcon size={14} className="mr-1" /> ERP
                        </Button>
                    )}
                </div>
            </td>
        </motion.tr>
    )
}, (prev, next) =>
    prev.partner === next.partner &&
    prev.isPending === next.isPending
)

PartnerListRow.displayName = "PartnerListRow"

export default PartnerListRow
