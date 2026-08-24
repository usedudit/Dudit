"use client"

import React from "react"
import { motion } from "framer-motion"
import { Button, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { TruckIcon, MapPinIcon, Package } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { type AvailableDeliveryOffer } from "./AvailableDeliveryListRow"

interface AvailableDeliveryGridCardProps {
    offer: AvailableDeliveryOffer
    onAccept: (assignmentId: string) => void
    isAccepting?: boolean
}

export default function AvailableDeliveryGridCard({
    offer,
    onAccept,
    isAccepting = false,
}: AvailableDeliveryGridCardProps) {
    const orderNumberDisplay = offer.order_number
        ? `#${offer.order_number}`
        : `#${String(offer.order_id).slice(0, 8)}`

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        offer.delivery_address || ""
    )}`

    const itemCount = (offer.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex flex-col h-full relative"
        >
            <div className="flex gap-4 mb-2">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <TruckIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>

                <div className="flex-1 min-w-0">
                    {/* Row 1: Pedido + Badge */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                            <h3
                                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0 font-mono"
                                title={String(orderNumberDisplay)}
                            >
                                {orderNumberDisplay}
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 whitespace-nowrap scale-90 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Disponível
                            </span>
                        </div>

                        {/* Ações */}
                        <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown>
                                <DropdownItem onClick={() => window.open(mapsUrl, "_blank")}>
                                    <MapPinIcon size={16} /> Abrir Rota no Maps
                                </DropdownItem>
                            </ActionsDropdown>
                        </div>
                    </div>

                    {/* Row 2: Estabelecimento */}
                    <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                        {offer.store_name || offer.partner_name || "Estabelecimento"}
                    </div>
                </div>
            </div>

            {/* Info Rows */}
            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                            {offer.customer_name || "Cliente"}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end shrink-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Data</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                            {offer.assigned_at ? formatDate(offer.assigned_at) : "-"}
                        </span>
                    </div>
                </div>

                <div className="flex justify-between items-center gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Sua Taxa</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(offer.delivery_fee || 0)}
                        </span>
                        {itemCount > 0 && (
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                                <Package size={11} />
                                {itemCount} itens
                            </span>
                        )}
                    </div>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => onAccept(offer.assignment_id)}
                            disabled={isAccepting}
                            isLoading={isAccepting}
                            className="text-xs h-8 px-3 font-bold"
                        >
                            Aceitar
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
