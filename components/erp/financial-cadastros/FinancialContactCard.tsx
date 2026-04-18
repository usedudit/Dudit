"use client"

import React from "react"
import { motion } from "framer-motion"
import { UserIcon } from "@/lib/icons"

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
}

const FinancialContactCard = React.memo(
    ({ item, onClick }: { item: FinancialContactRow; onClick: () => void }) => (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onClick()
                }
            }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer flex flex-col h-full gap-2"
        >
            <div className="flex gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <UserIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading truncate">{item.name}</h3>
                    <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">
                        {TYPE_LABELS[item.type] || item.type}
                    </p>
                </div>
            </div>
            {item.description ? (
                <p className="text-xs text-brand-inactive-text dark:text-dark-body line-clamp-2">{item.description}</p>
            ) : null}
        </motion.div>
    ),
)

FinancialContactCard.displayName = "FinancialContactCard"

export default FinancialContactCard
