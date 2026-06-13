"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Tooltip } from "@/components/reusable"
import { ActionsDropdown } from "@/components/reusable/Accordion"
import { DropdownItem } from "@/components/reusable/Dropdown"
import { MoneyIcon, LinkIcon, KeyIcon, StarIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

const TYPE_LABELS: Record<string, string> = {
    bank: "Conta bancária",
    cash: "Caixa",
    wallet: "Carteira digital",
}

export interface FinanceAccountRow {
    id: string
    name: string
    type: string
    initial_balance: number | string
    current_balance: number | string | null
    is_active: boolean
    is_default?: boolean
    created_at: string
    updated_at?: string
    is_system_managed?: boolean
    integration_source?: string | null
}

function num(v: number | string | null | undefined): number {
    if (v === null || v === undefined) return 0
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : 0
}

const FinancialAccountCard = React.memo(
    ({
        item,
        onEdit,
        onDelete,
        onAdjustBalance,
    }: {
        item: FinanceAccountRow
        onEdit: () => void
        onDelete: () => void
        onAdjustBalance: () => void
    }) => {
        const initial = num(item.initial_balance)
        const current = item.current_balance === null || item.current_balance === undefined ? null : num(item.current_balance)

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onEdit}
            >
                <div className="flex gap-4 mb-2">
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <MoneyIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                                <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                    {item.name}
                                </h3>
                                {item.integration_source === "mercadopago" && item.is_system_managed && (
                                    <Tooltip text="Integração: Mercado Pago">
                                        <Badge variant="blue" icon={<LinkIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                )}
                                {item.integration_source === "mercadopago" && (
                                    <Tooltip text="Tipo: Gateway">
                                        <Badge variant="blue" icon={<KeyIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                )}
                                <Tooltip text={item.is_active ? "Status: Ativo" : "Status: Inativo"}>
                                    <Badge
                                        variant={item.is_active ? "green" : "red"}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    />
                                </Tooltip>
                                {item.is_default ? (
                                    <Tooltip text={`Padrão: ${TYPE_LABELS[item.type] || item.type}`}>
                                        <Badge variant="blue" icon={<StarIcon />} className="whitespace-nowrap scale-90 shrink-0" />
                                    </Tooltip>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5 text-sm text-brand-inactive-text dark:text-dark-body font-medium mt-1">
                            <span>{TYPE_LABELS[item.type] || item.type}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex gap-3 items-end justify-between">
                    <div className="flex gap-6 items-end">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Criado em</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {new Date(item.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Saldo inicial</span>
                            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(initial)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-end gap-3">
                        <div className="flex flex-col gap-0.5 text-right">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Saldo atual</span>
                            <span className={`text-[13px] font-bold ${
                                current === null
                                    ? "text-brand-dark dark:text-dark-heading"
                                    : current > 0
                                    ? "text-brand-green"
                                    : current < 0
                                    ? "text-brand-red"
                                    : "text-brand-dark dark:text-dark-heading"
                            }`}>
                                {current === null ? "-" : formatCurrency(current)}
                            </span>
                        </div>

                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown onEdit={onEdit} onDelete={onDelete}>
                                <DropdownItem onClick={onAdjustBalance}>Ajustar saldo</DropdownItem>
                            </ActionsDropdown>
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
)

FinancialAccountCard.displayName = "FinancialAccountCard"

export default FinancialAccountCard
