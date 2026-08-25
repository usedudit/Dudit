"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/reusable"
import { Package, ClockIcon, MapPinIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"

export interface AvailableDeliveryOffer {
    id?: string
    assignment_id: string
    order_id: string
    order_number?: string | number
    order_count?: number
    orders?: any[]
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
    onView?: (offer: AvailableDeliveryOffer) => void
    isAccepting?: boolean
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

export default function AvailableDeliveryListRow({
    offer,
    onAccept,
    onView,
    isAccepting = false,
}: AvailableDeliveryListRowProps) {
    const router = useRouter()
    const assignmentId = offer.assignment_id || offer.id || ""
    const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null)

    useEffect(() => {
        if (!offer.assigned_at) return
        const calc = () => {
            const assignedTime = new Date(offer.assigned_at!).getTime()
            const diff = Math.max(0, Math.floor((assignedTime + FIFTEEN_MINUTES_MS - Date.now()) / 1000))
            setTimeLeftSeconds(diff)
        }
        calc()
        const interval = setInterval(calc, 1000)
        return () => clearInterval(interval)
    }, [offer.assigned_at])

    const orderCount = offer.order_count || offer.orders?.length || 1

    const orderNumberDisplay = orderCount > 1
        ? `Rota c/ ${orderCount} pedidos`
        : offer.order_number
            ? `#${offer.order_number}`
            : `#${String(offer.order_id || assignmentId).slice(0, 8)}`

    const itemCount = (offer.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)

    const handleRowClick = (e: React.MouseEvent) => {
        // Ignora se clicou em um botão
        if ((e.target as HTMLElement).closest("button")) return
        if (onView) {
            onView(offer)
        } else if (assignmentId) {
            router.push(`/entregadores/entregas-disponiveis?view=${assignmentId}`)
        }
    }

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleRowClick}
            className="group hover:bg-brand-gray/60 dark:hover:bg-dark-border/20 transition-colors bg-white dark:bg-dark-background cursor-pointer"
        >
            {/* PEDIDO / ROTA */}
            <td className="py-2.5 pl-6 pr-2 border-b border-brand-border dark:border-dark-border w-[180px]">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors font-mono">
                            {orderNumberDisplay}
                        </span>
                        {orderCount > 1 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                                {orderCount} paradas
                            </span>
                        )}
                    </div>
                    {timeLeftSeconds !== null && (
                        <span className={`text-[11px] font-semibold flex items-center gap-1 mt-0.5 ${
                            timeLeftSeconds < 180 ? "text-amber-600 dark:text-amber-400 animate-pulse" : "text-brand-inactive-text dark:text-dark-body"
                        }`}>
                            <ClockIcon size={11} />
                            {Math.floor(timeLeftSeconds / 60)}:{String(timeLeftSeconds % 60).padStart(2, "0")} restante
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
                        {offer.customer_name || (orderCount > 1 ? `${orderCount} destinatários` : "Cliente")}
                    </span>
                    <span className="text-xs text-brand-dark/90 dark:text-dark-body line-clamp-1 max-w-[260px]">
                        {offer.delivery_address || "Endereço a consultar"}
                    </span>
                </div>
            </td>

            {/* TAXA */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[150px]">
                <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(offer.delivery_fee || 0)}
                    </span>
                    {itemCount > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                            <Package size={11} />
                            {itemCount} itens
                        </span>
                    )}
                </div>
            </td>

            {/* AÇÃO */}
            <td className="py-2.5 pr-6 pl-2 border-b border-brand-border dark:border-dark-border text-right w-[150px] rounded-r-lg">
                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => onAccept(assignmentId)}
                        disabled={isAccepting}
                        isLoading={isAccepting}
                        className="font-bold px-4"
                    >
                        Aceitar
                    </Button>
                </div>
            </td>
        </motion.tr>
    )
}
