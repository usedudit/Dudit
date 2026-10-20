"use client"

import React from "react"
import { motion } from "framer-motion"
import { ThreeDotsIcon, EditIcon, TrashIcon } from "@/lib/icons"
import { Dropdown, DropdownItem } from "@/components/reusable/Dropdown"
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
            role="button"
            tabIndex={0}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer flex items-center gap-3 group"
        >
            <UserProfileImage
                fullName={item.name || "Contato"}
                className="w-11 h-11 text-base"
            />
            <div className="min-w-0 flex-1" onClick={onClick}>
                <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate">{item.name}</h3>
                <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                    {TYPE_LABELS[item.type] || item.type}
                </p>
                {item.description ? (
                    <p className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-2 mt-1">{item.description}</p>
                ) : null}
            </div>

            <Dropdown
                trigger={
                    <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-brand-inactive-text hover:text-brand-dark dark:text-dark-body dark:hover:text-dark-heading hover:bg-gray-100 dark:hover:bg-dark-border transition-all duration-150"
                        aria-label="Mais opções"
                    >
                        <ThreeDotsIcon className="w-4 h-4" />
                    </button>
                }
                align="right"
                width="w-44"
                showChevron={false}
            >
                <DropdownItem onClick={onEdit}>
                    <EditIcon className="w-4 h-4" />
                    Editar
                </DropdownItem>
                <DropdownItem onClick={onDelete} className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400">
                    <TrashIcon className="w-4 h-4" />
                    Excluir
                </DropdownItem>
            </Dropdown>
        </motion.div>
    ),
)

FinancialContactCard.displayName = "FinancialContactCard"

export default FinancialContactCard
