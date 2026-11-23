"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Badge, Button, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { TruckIcon, MapPinIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { type AvailableDeliveryOffer } from "./AvailableDeliveryListRow"

interface AvailableDeliveryGridCardProps {
    offer: AvailableDeliveryOffer
    onAccept: (assignmentId: string) => void
    onView?: (offer: AvailableDeliveryOffer) => void
    isAccepting?: boolean
}

export default function AvailableDeliveryGridCard({
    offer,
    onAccept,
    onView,
    isAccepting = false,
}: AvailableDeliveryGridCardProps) {
    const router = useRouter()
    const assignmentId = offer.assignment_id || offer.id || ""
    const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null)
    const [tierSecondsLeft, setTierSecondsLeft] = useState<number | null>(null)

    useEffect(() => {
        const calc = () => {
            if (offer.assigned_at) {
                const assignedTime = new Date(offer.assigned_at).getTime()
                setElapsedMinutes(Math.max(0, Math.floor((Date.now() - assignedTime) / 60000)))
            }
            if (offer.offer_expires_at) {
                const expTime = new Date(offer.offer_expires_at).getTime()
                setTierSecondsLeft(Math.max(0, Math.floor((expTime - Date.now()) / 1000)))
            } else {
                setTierSecondsLeft(null)
            }
        }
        calc()
        const interval = setInterval(calc, offer.offer_expires_at ? 1000 : 30000)
        return () => clearInterval(interval)
    }, [offer.assigned_at, offer.offer_expires_at])

    const orderCount = offer.order_count || offer.orders?.length || 1
    const orderNumberDisplay = orderCount > 1
        ? `Rota (${orderCount})`
        : offer.order_number
            ? `#${offer.order_number}`
            : `#${String(offer.order_id || assignmentId).slice(0, 8)}`

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        offer.delivery_address || ""
    )}`

    const handleView = () => {
        if (onView) {
            onView(offer)
        } else if (assignmentId) {
            router.push(`/entregadores/entregas-disponiveis?view=${assignmentId}`)
        }
    }

    const timeLabel = tierSecondsLeft !== null && tierSecondsLeft > 0
        ? `Fecha em ${tierSecondsLeft}s`
        : elapsedMinutes !== null
            ? elapsedMinutes === 0
                ? "Agora"
                : `Há ${elapsedMinutes} min`
            : "-"

    const distanceLabel = offer.pickup_distance_km != null
        ? offer.pickup_distance_km === 0
            ? "No local"
            : `${offer.pickup_distance_km} km${offer.pickup_minutes != null ? ` · ${offer.pickup_minutes} min` : ""}`
        : "-"

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
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                    <TruckIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
                </div>

                <div className="flex-1 min-w-0">
                    {/* Row 1: Pedido + Badge + Ações (mesmo padrão DeliveryAssignmentGridCard) */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                            <h3
                                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0 font-mono"
                                title={String(orderNumberDisplay)}
                            >
                                {orderNumberDisplay}
                            </h3>
                            <div className="flex items-center shrink-0">
                                <Badge variant="orange" className="whitespace-nowrap scale-90 shrink-0">
                                    Disponível
                                </Badge>
                            </div>
                        </div>

                        <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown>
                                <DropdownItem onClick={() => handleView()}>
                                    <TruckIcon size={16} /> Ver Detalhes
                                </DropdownItem>
                                <DropdownItem onClick={() => window.open(mapsUrl, "_blank")}>
                                    <MapPinIcon size={16} /> Ver Região no Maps
                                </DropdownItem>
                            </ActionsDropdown>
                        </div>
                    </div>

                    {/* Row 2: Estabelecimento + Endereço do estabelecimento */}
                    <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                        {offer.store_name || offer.partner_name || "Estabelecimento"}
                    </div>
                    {offer.store_address && (
                        <div className="text-xs text-brand-inactive-text dark:text-dark-body truncate" title={offer.store_address}>
                            {offer.store_address}
                        </div>
                    )}
                </div>
            </div>

            {/* Avisos opcionais com Badge nativo */}
            {(offer.dimensions_unknown || offer.vehicle_compatible === false || orderCount > 1) && (
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {orderCount > 1 && (
                        <Badge variant="purple" className="scale-90 origin-left">
                            {orderCount} paradas
                        </Badge>
                    )}
                    {offer.dimensions_unknown && (
                        <Badge variant="orange" className="scale-90 origin-left">
                            Sem dimensão
                        </Badge>
                    )}
                    {offer.vehicle_compatible === false && (
                        <Badge variant="red" className="scale-90 origin-left">
                            Acima do veículo
                        </Badge>
                    )}
                </div>
            )}

            {/* Info Rows (mesmo padrão DeliveryAssignmentGridCard) */}
            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Destino</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate" title={offer.delivery_address || "Região local"}>
                            {offer.delivery_address || "Região local"}
                        </span>
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                            Rua e nº após aceite
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end shrink-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Até a loja</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading whitespace-nowrap">
                            {distanceLabel}
                        </span>
                        <span className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                            {timeLabel}
                        </span>
                    </div>
                </div>

                <div className="flex justify-between items-center gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Remuneração</span>
                        <span className="text-sm font-bold text-brand-green">
                            {formatCurrency(offer.delivery_fee || 0)}
                            {offer.bonus_amount != null && offer.bonus_amount > 0 ? ` + ${formatCurrency(offer.bonus_amount)}` : ""}
                        </span>
                        {offer.rs_per_km != null && offer.rs_per_km > 0 && (
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                {formatCurrency(offer.rs_per_km)}/km
                            </span>
                        )}
                    </div>
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => onAccept(assignmentId)}
                            disabled={isAccepting}
                            isLoading={isAccepting}
                        >
                            Aceitar
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
