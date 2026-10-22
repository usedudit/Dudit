"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { DropdownItem } from "@/components/reusable/Dropdown"
import { EditIcon, TrashIcon } from "@/lib/icons"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

const TYPE_LABELS: Record<string, string> = {
    customer: "Cliente",
    supplier: "Fornecedor",
    service: "Serviço",
    employee: "Funcionário",
    partner: "Parceiro",
    other: "Outro",
}

export interface FinancialContactRow {
    id: string
    name: string
    type: string
    description: string | null
    deleted_at?: string | null
}

const FinancialContactCard = React.memo(
    ({
        item,
        onClick,
        onEdit,
        onDelete,
    }: {
        item: FinancialContactRow
        onClick: () => void
        onEdit: () => void
        onDelete: () => void
    }) => (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex items-center gap-3 relative"
        >
            <div className="flex items-center gap-3 min-w-0 flex-1" onClick={onClick}>
                <UserProfileImage
                    fullName={item.name || "Contato"}
                    className="w-11 h-11 text-base shrink-0"
                />
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate">
                        {item.name}
                    </h3>
                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body mt-0.5 truncate">
                        {TYPE_LABELS[item.type] || item.type}
                    </p>
                    {item.description ? (
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-2 mt-1 break-words">
                            {item.description}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <ActionsDropdown onEdit={onEdit} onDelete={onDelete} />
            </div>
        </motion.div>
    ),
)

FinancialContactCard.displayName = "FinancialContactCard"

export default FinancialContactCard
