'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatCurrency, checkBirthday } from "@/lib/utils";
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatBrazilMobile } from "@/lib/utils/phone-utils"

interface CustomerGridCardProps {
    customer: any
    selected: boolean
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onArchive?: () => void
    onUnarchive?: () => void
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
        onArchive,
        onUnarchive,
        onDetails,
        onPrefetchMouseEnter,
        onPrefetchMouseLeave,
        onPrefetchTouchStart,
        showBirthdayBadge,
    }: CustomerGridCardProps) => {

        const mobile = customer.phone || customer.mobile || customer.celular
        const orders = customer.orders || customer.total_orders || 0
        const status = customer.status || "ativo"
        const isArchived = status === "arquivado" || status === "archived"

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
                        imageUrl={customer.image_url || customer.imageUrl || customer.avatar_url || customer.avatar}
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
                                {(() => {
                                    return (
                                        <Tooltip text={`Status: ${isArchived ? "Arquivado" : status === 'ativo' ? "Ativo" : status === 'inativo' ? "Inativo" : "Bloqueado"}`}>
                                            <Badge
                                                variant={isArchived ? "orange" : status === 'ativo' ? "green" : status === 'inativo' ? "gray" : "red"}
                                                className="whitespace-nowrap scale-90 shrink-0"
                                            />
                                        </Tooltip>
                                    )
                                })()}
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

                        {/* Linha 3: Celular */}
                        {mobile && (
                            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center gap-1">
                                <svg className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                <span>{formatBrazilMobile(mobile)}</span>
                            </div>
                        )}

                        {/* Linha 4: Pedidos */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            <span>{orders} pedido{orders !== 1 ? "s" : ""}</span>
                        </div>

                        {/* Linha 5: Status */}
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center gap-1">
                            <svg className="w-3.5 h-3.5 text-brand-inactive-text dark:text-dark-body flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>{status === 'ativo' ? "Ativo" : status === 'inativo' ? "Inativo" : status === 'bloqueado' ? "Bloqueado" : "Arquivado"}</span>
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
                                {orders}
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
                            {(() => {
                                return (
                                    <ActionsDropdown
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                        onArchive={!isArchived ? onArchive : undefined}
                                        onUnarchive={isArchived ? onUnarchive : undefined}
                                    />
                                )
                            })()}
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
