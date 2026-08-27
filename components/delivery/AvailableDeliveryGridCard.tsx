"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { TruckIcon, MapPinIcon, Package, ClockIcon } from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { type AvailableDeliveryOffer } from "./AvailableDeliveryListRow"

interface AvailableDeliveryGridCardProps {
    offer: AvailableDeliveryOffer
    onAccept: (assignmentId: string) => void
    onView?: (offer: AvailableDeliveryOffer) => void
    isAccepting?: boolean
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

export default function AvailableDeliveryGridCard({
    offer,
    onAccept,
    onView,
    isAccepting = false,
}: AvailableDeliveryGridCardProps) {
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
        const interval = setInterval(calc, 30000)
        return () => clearInterval(interval)
    }, [offer.assigned_at])

    const orderCount = offer.order_count || offer.orders?.length || 1

    const orderNumberDisplay = orderCount > 1
        ? `Rota com ${orderCount} pedidos`
        : offer.order_number
            ? `#${offer.order_number}`
            : `#${String(offer.order_id || assignmentId).slice(0, 8)}`

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        offer.delivery_address || ""
    )}`

    const itemCount = (offer.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)

    const handleCardClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("[role='menu']")) return
        if (onView) {
            onView(offer)
        } else if (assignmentId) {
            router.push(`/entregadores/entregas-disponiveis?view=${assignmentId}`)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleCardClick}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex flex-col h-full relative cursor-pointer"
        >
            <div className="flex gap-4 mb-2">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <TruckIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>

                <div className="flex-1 min-w-0">
                    {/* Row 1: Pedido + Badge */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-1.5 min-w-0 pr-1 flex-wrap">
                            <h3
                                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0 font-mono"
                                title={String(orderNumberDisplay)}
                            >
                                {orderNumberDisplay}
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 whitespace-nowrap shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Disponível
                            </span>
                            {orderCount > 1 && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 shrink-0">
                                    {orderCount} paradas
                                </span>
                            )}
                        </div>


                    </div>

                    {/* Row 2: Estabelecimento */}
                    <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate mt-1">
                        {offer.store_name || offer.partner_name || "Estabelecimento"}
                    </div>
                </div>
            </div>

            {/* Info Rows */}
            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                            {orderCount > 1 ? "Destinatários" : "Cliente"}
                        </span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                            {offer.customer_name || (orderCount > 1 ? `${orderCount} pedidos nesta rota` : "Cliente")}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end shrink-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body text-right">Tempo Restante</span>
                        {timeLeftSeconds !== null ? (
                            <span className={`text-xs font-bold flex items-center gap-1 ${
                                timeLeftSeconds < 180 ? "text-amber-600 dark:text-amber-400 animate-pulse" : "text-brand-dark dark:text-dark-heading"
                            }`}>
                                <ClockIcon size={12} />
                                {Math.floor(timeLeftSeconds / 60)}:{String(timeLeftSeconds % 60).padStart(2, "0")}
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                {offer.assigned_at ? formatDate(offer.assigned_at) : "-"}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex justify-between items-center gap-2 pt-1">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">Sua Remuneração</span>
                        <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            {formatCurrency(offer.delivery_fee || 0)}
                        </span>
                        {itemCount > 0 && (
                            <span className="text-[11px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1">
                                <Package size={11} />
                                {itemCount} itens
                            </span>
                        )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <ActionsDropdown>
                            <DropdownItem onClick={() => router.push(`/entregadores/entregas-disponiveis/${assignmentId}`)}>
                                <TruckIcon size={16} /> Ver Detalhes da Corrida
                            </DropdownItem>
                            <DropdownItem onClick={() => window.open(mapsUrl, "_blank")}>
                                <MapPinIcon size={16} /> Abrir Rota no Maps
                            </DropdownItem>
                        </ActionsDropdown>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => onAccept(assignmentId)}
                            disabled={isAccepting}
                            isLoading={isAccepting}
                            className="text-xs h-8 px-4 font-bold shadow-sm"
                        >
                            Aceitar
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
