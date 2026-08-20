"use client"

import React from "react"
import Link from "next/link"
import { Badge, Button } from "@/components/reusable"
import {
    MapPinIcon,
    PhoneIcon,
    WhatsappIcon,
    StoreIcon,
    Package,
    ClockIcon,
    TruckIcon,
    CheckCircleIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface AvailableDeliveryGridCardProps {
    offer: {
        assignment_id: string
        order_id: string
        order_number?: string | number
        store_name?: string
        partner_name?: string
        store_phone?: string
        store_address?: string
        customer_name?: string
        customer_phone?: string
        delivery_address?: string
        delivery_fee: number
        total_amount: number
        assigned_at?: string
        notes?: string
        items?: Array<{ name: string; quantity: number }>
    }
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

    return (
        <article className="flex flex-col justify-between rounded-2xl border border-brand-border bg-white p-5 shadow-xs hover:shadow-md transition-all duration-200 dark:border-dark-border dark:bg-dark-surface hover:border-emerald-500/30 dark:hover:border-emerald-500/30 group">
            <div>
                {/* TOP BAR: ORDER # & STATUS */}
                <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="font-bold text-base text-brand-dark dark:text-dark-heading font-mono">
                        {orderNumberDisplay}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Disponível
                    </span>
                </div>

                {/* STORE / ESTABELECIMENTO */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-brand-border/60 dark:border-dark-border/40 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    <StoreIcon size={14} className="shrink-0 text-brand-green" />
                    <span className="truncate font-semibold text-brand-dark dark:text-dark-heading">
                        {offer.store_name || offer.partner_name || "Estabelecimento"}
                    </span>
                    {offer.assigned_at && (
                        <span className="ml-auto shrink-0 text-[11px] opacity-75">
                            {formatDate(offer.assigned_at)}
                        </span>
                    )}
                </div>

                {/* STORE ADDRESS */}
                {offer.store_address && (
                    <div className="flex items-start gap-1.5 text-xs text-brand-inactive-text dark:text-dark-body mb-3">
                        <MapPinIcon size={13} className="shrink-0 text-brand-green mt-0.5" />
                        <span className="line-clamp-1">Retirada: {offer.store_address}</span>
                    </div>
                )}

                {/* CUSTOMER & DESTINATION */}
                <div className="rounded-xl bg-brand-gray/80 dark:bg-dark-border/30 p-3 mb-4 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-brand-dark dark:text-dark-heading">
                        <span>Cliente: {offer.customer_name || "Cliente"}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-brand-inactive-text dark:text-dark-body">
                        <MapPinIcon size={13} className="shrink-0 text-purple-500 mt-0.5" />
                        <span className="line-clamp-2 leading-relaxed">
                            Entrega: {offer.delivery_address || "Endereço não informado"}
                        </span>
                    </div>
                </div>

                {/* ITEMS COUNT SUMMARY */}
                {offer.items && offer.items.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text mb-4">
                        <Package size={13} className="shrink-0" />
                        <span className="truncate">
                            {offer.items.reduce((acc, it) => acc + (it.quantity || 1), 0)} itens (
                            {offer.items.map((it) => it.name).join(", ")})
                        </span>
                    </div>
                )}
            </div>

            {/* CARD FOOTER */}
            <div className="pt-3 border-t border-brand-border/60 dark:border-dark-border/40 flex items-center justify-between gap-3">
                <div className="flex flex-col">
                    <span className="text-[11px] uppercase font-bold text-brand-inactive-text">
                        Sua Taxa
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(offer.delivery_fee || 0)}
                    </span>
                </div>

                <Button
                    variant="default"
                    size="sm"
                    onClick={() => onAccept(offer.assignment_id)}
                    disabled={isAccepting}
                    isLoading={isAccepting}
                    className="font-bold px-4"
                >
                    Aceitar Entrega
                </Button>
            </div>
        </article>
    )
}
