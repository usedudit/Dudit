'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatCurrency, checkBirthday } from "@/lib/utils";
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface CustomerGridCardProps {
    customer: any
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onDetails: () => void
    /** Prefetch handlers for hover/touch-based entity preloading */
    onPrefetchMouseEnter?: () => void
    onPrefetchMouseLeave?: () => void
    onPrefetchTouchStart?: () => void
    showBirthdayBadge?: boolean
}

const CustomerGridCard = React.memo(
    ({
        customer,
        selected,
        onSelect,
        onEdit,
        onDelete,
        onDetails,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
        showBirthdayBadge,
    }: CustomerGridCardProps) => {

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
                onClick={onDetails}
                onMouseEnter={onPrefetchMouseEnter}
                onMouseLeave={onPrefetchMouseLeave}
                onTouchStart={onPrefetchTouchStart}
            >
                <div className="flex gap-4 mb-2">
                    {/* Avatar do Cliente */}
                    <UserProfileImage
                        fullName={customer.name || "Cliente"}
                        imageUrl={customer.image_url || customer.imageUrl || customer.avatar_url}
                        className="w-12 h-12 text-lg"
                    />

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                        {/* Linha 1: Nome + Badge Status + Checkbox */}
                        <div className="flex justify-between items-start gap-1">
                            <div className="flex flex-wrap items-center min-w-0 pr-1 gap-2">
                                <h3
                                    className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                                    title={customer.name}
                                >
                                    <span className="truncate">{customer.name}</span>
                                </h3>
                                <Tooltip text={`Status: ${customer.status === 'ativo' ? "Ativo" : customer.status === 'inativo' ? "Inativo" : "Bloqueado"}`}>
                                    <Badge
                                        variant={customer.status === 'ativo' ? "green" : customer.status === 'inativo' ? "gray" : "red"}
                                        className="whitespace-nowrap scale-90 shrink-0"
                                    />
                                </Tooltip>
                                {(() => {
                                    const bdayInfo = checkBirthday(customer.birth_date)
                                    return showBirthdayBadge && bdayInfo && (bdayInfo.isToday || bdayInfo.isUpcoming) ? (
                                        <Tooltip
                                            text={bdayInfo.isToday ? "Cliente faz aniversário hoje" : `Cliente faz aniversário em ${bdayInfo.daysUntil} dias`}
                                        >
                                            <Badge variant={bdayInfo.isToday ? "purple" : "blue"} icon={null} className="select-none scale-90 shrink-0">
                                                🎂 {bdayInfo.isToday ? "Aniversário Hoje" : `Em ${bdayInfo.daysUntil} dias`}
                                            </Badge>
                                        </Tooltip>
                                    ) : null
                                })()}
                            </div>

                            {/* Checkbox com stopPropagation */}
                            <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={selected} onChange={onSelect} />
                            </div>
                        </div>

                        {/* Linha 2: ID */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
                            <span>ID {customer.id || "-"}</span>
                        </div>
                    </div>
                </div>

                {/* Área do Rodapé */}
                <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                    {/* Linha A: Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Total Gasto</span>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {customer.totalOrderValue ? formatCurrency(customer.totalOrderValue) : "-"}
                            </span>
                        </div>

                        <div className="flex flex-col gap-0.5 items-end">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pedidos</span>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {customer.orders || 0}
                            </span>
                        </div>
                    </div>

                    {/* Linha B: Último Pedido e Ações */}
                    <div className="flex items-end justify-between mt-1">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Último Pedido</span>
                            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">{customer.lastOrderDate || "-"}</span>
                        </div>

                        {/* Botão de Ações */}
                        <div
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ActionsDropdown
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>
        )
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.customer.originalId === next.customer.originalId &&
        prev.customer.name === next.customer.name &&
        prev.customer.status === next.customer.status &&
        prev.customer.orders === next.customer.orders &&
        prev.customer.totalOrderValue === next.customer.totalOrderValue &&
        prev.customer.birth_date === next.customer.birth_date &&
        prev.showBirthdayBadge === next.showBirthdayBadge
)

CustomerGridCard.displayName = "CustomerGridCard"

export default CustomerGridCard
