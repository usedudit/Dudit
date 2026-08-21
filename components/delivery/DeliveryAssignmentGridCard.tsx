"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Badge, Button, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    MapPinIcon,
    PhoneIcon,
    WhatsappIcon,
    StoreIcon,
    Package,
    ClockIcon,
    TruckIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { type DeliveryAssignmentItem, statusConfig } from "./DeliveryAssignmentListRow"

interface DeliveryAssignmentGridCardProps {
    assignment: DeliveryAssignmentItem
    onView?: (assignment: DeliveryAssignmentItem) => void
}

export default function DeliveryAssignmentGridCard({ assignment, onView }: DeliveryAssignmentGridCardProps) {
    const router = useRouter()
    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as const,
        icon: (<ClockIcon size={12} />) as React.ReactElement<{ className?: string }>,
    }

    const orderNumberDisplay = assignment.order_number
        ? `#${assignment.order_number}`
        : `#${String(assignment.order_id).slice(0, 8)}`

    const cleanPhone = (assignment.customer_phone || "").replace(/\D/g, "")
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        assignment.delivery_address || ""
    )}`
    const whatsappUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null

    const handleView = () => {
        if (onView) {
            onView(assignment)
        } else {
            router.push(`/entregadores/entregas/${assignment.assignment_id}`)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
            onClick={handleView}
        >
            <div className="flex gap-4 mb-2">
                {/* Avatar / Estabelecimento */}
                <div className="w-[52px] h-[52px] rounded-full bg-brand-gray dark:bg-dark-border shrink-0 overflow-hidden flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <StoreIcon size={24} className="text-brand-inactive-text" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    {/* Linha 1: Pedido + Status */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                            <h3
                                className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate font-mono"
                                title={String(orderNumberDisplay)}
                            >
                                <span className="truncate">{orderNumberDisplay}</span>
                            </h3>
                            <Badge variant={statusMeta.variant} icon={statusMeta.icon} className="whitespace-nowrap scale-90 shrink-0">
                                {statusMeta.label}
                            </Badge>
                        </div>

                        {/* Ações */}
                        <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown
                                trigger={
                                    <button
                                        type="button"
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:hover:bg-dark-border dark:hover:text-dark-heading transition-colors cursor-pointer"
                                        aria-label="Ações da entrega"
                                    >
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                    </button>
                                }
                            >
                                <DropdownItem onClick={() => window.open(mapsUrl, "_blank")}>
                                    <MapPinIcon size={16} /> Abrir Rota no Maps
                                </DropdownItem>
                                {cleanPhone && (
                                    <DropdownItem onClick={() => window.open(`tel:${cleanPhone}`, "_self")}>
                                        <PhoneIcon size={16} /> Ligar para Cliente
                                    </DropdownItem>
                                )}
                                {whatsappUrl && (
                                    <DropdownItem onClick={() => window.open(whatsappUrl, "_blank")}>
                                        <WhatsappIcon size={16} /> Chamar no WhatsApp
                                    </DropdownItem>
                                )}
                            </ActionsDropdown>
                        </div>
                    </div>

                    {/* Linha 2: Estabelecimento • Data */}
                    <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center">
                        <span className="truncate">{assignment.partner_name || "Loja Parceira"}</span>
                        {assignment.assigned_at && (
                            <>
                                <span className="mx-1.5">•</span>
                                <span className="truncate">{formatDate(assignment.assigned_at)}</span>
                            </>
                        )}
                    </div>

                    {/* Linha 3: Cliente */}
                    <div className="flex items-center gap-2 mt-1.5 min-w-0">
                        <UserProfileImage
                            fullName={assignment.customer_name || "Cliente"}
                            className="h-6 w-6 text-[10px] shrink-0"
                        />
                        <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading truncate">
                            {assignment.customer_name}
                        </span>
                        {cleanPhone && (
                            <div className="flex items-center gap-1 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                                <a
                                    href={`tel:${cleanPhone}`}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-brand-inactive-text hover:bg-brand-green hover:text-white transition-colors"
                                    title="Ligar para cliente"
                                >
                                    <PhoneIcon size={12} />
                                </a>
                                {whatsappUrl && (
                                    <a
                                        href={whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                                        title="Chamar no WhatsApp"
                                    >
                                        <WhatsappIcon size={12} />
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Endereço de entrega */}
            <div className="rounded-xl bg-brand-gray/80 dark:bg-dark-border/30 p-3 mb-2 text-xs">
                <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-brand-dark/90 dark:text-dark-body hover:text-brand-green transition-colors"
                >
                    <MapPinIcon size={14} className="text-brand-green shrink-0 mt-0.5" />
                    <span className="line-clamp-2 leading-relaxed">
                        {assignment.delivery_address || "Endereço de entrega não informado"}
                    </span>
                </a>
            </div>

            {/* Itens */}
            {assignment.items && assignment.items.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text mb-2">
                    <Package size={13} className="shrink-0" />
                    <span className="truncate">
                        {assignment.items.reduce((acc, it) => acc + (it.quantity || 1), 0)} itens (
                        {assignment.items.map((it) => it.name).join(", ")})
                    </span>
                </div>
            )}

            {/* Área do Rodapé */}
            <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border">
                <div className="flex items-end justify-between">
                    {/* Valores */}
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pedido</span>
                        <div className="flex items-center gap-2.5">
                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(assignment.total_amount || 0)}
                            </span>
                        </div>
                        <span className="text-xs font-bold text-brand-green">
                            Taxa: {formatCurrency(assignment.delivery_fee || 0)}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}