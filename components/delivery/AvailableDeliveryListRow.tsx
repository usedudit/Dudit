"use client"

import React from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/reusable"
import { Package } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"

export interface AvailableDeliveryOffer {
    assignment_id: string
    order_id: string
    order_number?: string | number
    partner_name?: string
    store_name?: string
    store_phone?: string
    store_logo_url?: string
    store_address?: string
    customer_name?: string
    customer_phone?: string
    delivery_address?: string
    delivery_fee: number
    total_amount?: number
    payment_method?: string
    assigned_at?: string
    notes?: string
    items?: Array<{ name: string; quantity: number }>
}

interface AvailableDeliveryListRowProps {
    offer: AvailableDeliveryOffer
    onAccept: (assignmentId: string) => void
    isAccepting?: boolean
}

export default function AvailableDeliveryListRow({
    offer,
    onAccept,
    isAccepting = false,
}: AvailableDeliveryListRowProps) {
    const orderNumberDisplay = offer.order_number
        ? `#${offer.order_number}`
        : `#${String(offer.order_id).slice(0, 8)}`

    const itemCount = (offer.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="group hover:bg-brand-gray/60 dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background"
        >
            {/* PEDIDO */}
            <td className="py-2.5 pl-6 pr-2 border-b border-brand-border dark:border-dark-border w-[180px]">
                <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors font-mono">
                        {orderNumberDisplay}
                    </span>
                    {offer.assigned_at && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                            {formatDate(offer.assigned_at)}
                        </span>
                    )}
                </div>
            </td>

            {/* ESTABELECIMENTO */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[220px]">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate block max-w-[200px]">
                    {offer.store_name || offer.partner_name || "Estabelecimento"}
                </span>
            </td>

            {/* DESTINO DA ENTREGA */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[300px]">
                <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[260px]">
                        {offer.customer_name || "Cliente"}
                    </span>
                    <span className="text-xs text-brand-dark/90 dark:text-dark-body line-clamp-1 max-w-[260px]">
                        {offer.delivery_address || "Endereço não informado"}
                    </span>
                </div>
            </td>

            {/* TAXA */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[150px]">
                <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(offer.delivery_fee || 0)}
                    </span>
                    {offer.items && offer.items.length > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                            <Package size={11} />
                            {itemCount} itens
                        </span>
                    )}
                </div>
            </td>

            {/* AÇÃO */}
            <td className="py-2.5 pr-6 pl-2 border-b border-brand-border dark:border-dark-border text-right w-[150px] rounded-r-lg">
                <Button
                    variant="default"
                    size="sm"
                    onClick={() => onAccept(offer.assignment_id)}
                    disabled={isAccepting}
                    isLoading={isAccepting}
                    className="font-bold px-4"
                >
                    Aceitar
                </Button>
            </td>
        </motion.tr>
    )
}
