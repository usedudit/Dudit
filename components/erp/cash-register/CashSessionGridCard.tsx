'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, Checkbox } from "@/components/reusable"
import { ChevronDownIcon, ClockIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

interface CashSessionGridCardProps {
    session: any
    selected?: boolean
    onSelect?: (id: string) => void
    onDetails: (id: string) => void
}

const CashSessionGridCard = React.memo(
    ({
        session,
        selected,
        onSelect,
        onDetails
    }: CashSessionGridCardProps) => {

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={() => onDetails(session.id)}
            >
                <div className="flex gap-4 mb-2">
                    {/* Session Icon */}
                    <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                        <ClockIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: ID + Badge + Checkbox */}
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <h3
                                    className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                                    title={session.id.slice(0, 8).toUpperCase()}
                                >
                                    Sessão {session.id.slice(0, 8).toUpperCase()}
                                </h3>

                                <Badge
                                    variant={session.status === 'open' ? "green" : "gray"}
                                    className="whitespace-nowrap scale-90"
                                >
                                    {session.status === 'open' ? "Aberto" : "Fechado"}
                                </Badge>
                            </div>

                            {onSelect && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                        checked={selected || false}
                                        onChange={() => onSelect(session.id)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Linha 2: Items count */}
                        <div className="flex items-center mt-0.5">
                            <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                                <span>{session.user_name}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Totais */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Inicial</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {formatCurrency(Number(session.initial_amount || 0))}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-center text-center">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Recebido</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                                {formatCurrency(Number(session.total_received_amount || 0))}
                            </span>
                        </div>
                        <div className="flex flex-col gap-0.5 items-end text-right">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Final</span>
                            <span className="text-[13px] font-bold text-brand-primary dark:text-brand-primary truncate">
                                {formatCurrency(Number(session.expected_drawer_total || 0))}
                            </span>
                        </div>
                    </div>

                    {/* Data */}
                    <div className="flex items-end justify-between mt-1">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Aberta em</span>
                            <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                                {new Date(session.opened_at).toLocaleString('pt-BR')}
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.session === next.session &&
        prev.selected === next.selected
)

CashSessionGridCard.displayName = "CashSessionGridCard"

export default CashSessionGridCard
