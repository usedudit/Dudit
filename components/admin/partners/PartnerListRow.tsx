"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    StoreIcon,
    CheckCircleIcon,
    BlockedIcon,
    AlertTriangleIcon,
    UserIcon,
} from "@/lib/icons"
import type { EnforcementPartner } from "@/lib/admin/types"

interface PartnerListRowProps {
    partner: EnforcementPartner
    isPending: boolean
    onView: (partner: EnforcementPartner) => void
    onSuspendStore: (partner: EnforcementPartner) => void
    onUnsuspendStore: (partner: EnforcementPartner) => void
    onDisableERP: (partner: EnforcementPartner) => void
    onEnableERP: (partner: EnforcementPartner) => void
    onSuspendPartner: (partner: EnforcementPartner) => void
    onUnsuspendPartner: (partner: EnforcementPartner) => void
}

const PartnerListRow = React.memo(({
    partner,
    isPending,
    onView,
    onSuspendStore,
    onUnsuspendStore,
    onDisableERP,
    onEnableERP,
    onSuspendPartner,
    onUnsuspendPartner,
}: PartnerListRowProps) => {
    const isStore = partner.type === "store"

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer ${isStore ? "bg-blue-50/30 dark:bg-blue-900/5" : "bg-white dark:bg-dark-background"}`}
            onClick={() => onView(partner)}
        >
            {/* Loja */}
            <td className="p-2 pl-6 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                            {partner.store_name || partner.stores?.[0]?.name || "Loja"}
                        </span>
                        {partner.risk_score > 0 && (
                            <Badge variant={partner.risk_score >= 50 ? "red" : partner.risk_score >= 25 ? "orange" : "gray"}>
                                Risco: {partner.risk_score}
                            </Badge>
                        )}
                    </div>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {partner.id}
                    </span>
                </div>
            </td>

            {/* Proprietário */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-left">
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                        {partner.owner_name || "Lojista"}
                    </span>
                    <span className="text-[11px] font-medium text-brand-inactive-text opacity-70">
                        {partner.owner_user_id || "-"}
                    </span>
                </div>
            </td>

            {/* Data de Cadastro */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center">
                    <span className="font-medium text-[13px] text-brand-dark dark:text-dark-heading">
                        {new Date(partner.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body opacity-70">
                        {new Date(partner.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* Status */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex flex-col items-center gap-1 justify-center">
                    {partner.suspended_at ? (
                        <Badge variant="red">Loja Suspensa</Badge>
                    ) : partner.is_active ? (
                        <Badge variant="green">Loja Ativa</Badge>
                    ) : (
                        <Badge variant="gray">Inativa</Badge>
                    )}
                    {partner.erp_disabled && (
                        <Badge variant="red">ERP Desativado</Badge>
                    )}
                    {partner.suspended_case_id && (
                        <span className="font-mono text-[10px] text-red-600 dark:text-red-400 font-bold">
                            {partner.suspended_case_id}
                        </span>
                    )}
                </div>
            </td>

            {/* Ações */}
            <td className="p-2 pr-6 border-b border-brand-border dark:border-dark-border text-center">
                <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
                    <ActionsDropdown>
                        {partner.suspended_at ? (
                            <DropdownItem onClick={() => onUnsuspendStore(partner)} className="text-brand-green">
                                <CheckCircleIcon size={16} /> Reativar Loja
                            </DropdownItem>
                        ) : (
                            <DropdownItem onClick={() => onSuspendStore(partner)} className="text-brand-red">
                                <BlockedIcon size={16} /> Suspender Esta Loja
                            </DropdownItem>
                        )}

                        {partner.erp_disabled ? (
                            <DropdownItem onClick={() => onEnableERP(partner)} className="text-brand-green">
                                <CheckCircleIcon size={16} /> Reativar Acesso ERP
                            </DropdownItem>
                        ) : (
                            <DropdownItem onClick={() => onDisableERP(partner)} className="text-brand-red">
                                <BlockedIcon size={16} /> Desativar Acesso ERP
                            </DropdownItem>
                        )}

                        {!partner.is_active ? (
                            <DropdownItem onClick={() => onUnsuspendPartner(partner)} className="text-brand-green">
                                <CheckCircleIcon size={16} /> Reativar Parceiro Inteiro
                            </DropdownItem>
                        ) : (
                            <DropdownItem onClick={() => onSuspendPartner(partner)} className="text-brand-orange">
                                <AlertTriangleIcon size={16} /> Suspender Parceiro Inteiro
                            </DropdownItem>
                        )}
                    </ActionsDropdown>
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
