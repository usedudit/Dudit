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
    offer_id?: string | null
    offer_tier?: number | null
    offer_mode?: "board" | "directed"
    offer_expires_at?: string | null
    dispatch_tier?: number
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
    bonus_amount?: number
    total_amount?: number
    payment_method?: string
    assigned_at?: string
    notes?: string
    items?: Array<{ name: string; quantity: number }>
    pickup_km?: number | null
    pickup_distance_km?: number | null
    distance_km?: number | null
    pickup_minutes?: number | null
    delivery_km?: number | null
    delivery_distance_km?: number | null
    delivery_minutes?: number | null
    eta_total_minutes?: number | null
    vehicle_compatible?: boolean
    position_quality?: "live" | "address" | "unknown"
    route_km?: number | null
    rs_per_km?: number | null
    dimensions_unknown?: boolean
    package_weight_kg?: number | null
    package_volume_l?: number | null
}

interface AvailableDeliveryListRowProps {
    offer: AvailableDeliveryOffer
    onAccept: (assignmentId: string) => void
    onView?: (offer: AvailableDeliveryOffer) => void
    isAccepting?: boolean
}

export default function AvailableDeliveryListRow({
    offer,
    onAccept,
    onView,
    isAccepting = false,
}: AvailableDeliveryListRowProps) {
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
            <td className="py-2.5 pr-2 border-b border-brand-border dark:border-dark-border w-[180px]">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors">
                            {orderNumberDisplay}
                        </span>
                        {orderCount > 1 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                                {orderCount} paradas
                            </span>
                        )}
                    </div>
                    {tierSecondsLeft !== null && tierSecondsLeft > 0 ? (
                        <span className="text-[11px] font-semibold flex items-center gap-1 mt-0.5 text-brand-inactive-text dark:text-dark-body">
                            <ClockIcon size={11} />
                            Fecha em {tierSecondsLeft}s
                        </span>
                    ) : elapsedMinutes !== null ? (
                        <span className="text-[11px] font-semibold flex items-center gap-1 mt-0.5 text-brand-inactive-text dark:text-dark-body">
                            <ClockIcon size={11} />
                            {elapsedMinutes === 0 ? "Agora" : `Há ${elapsedMinutes} min`}
                        </span>
                    ) : null}
                    {offer.dimensions_unknown && (
                        <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 w-fit"
                            title="Itens sem peso/dimensão informados — confirme se cabe no seu veículo"
                        >
                            ⚠ Sem dimensão
                        </span>
                    )}
                    {offer.vehicle_compatible === false && (
                        <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 w-fit"
                            title="Peso ou volume acima do limite recomendado para o seu veículo"
                        >
                            ⚠ Acima do limite do veículo
                        </span>
                    )}
                </div>
            </td>

            {/* ESTABELECIMENTO */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[220px]">
                <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate block max-w-[200px]">
                        {offer.store_name || offer.partner_name || "Estabelecimento"}
                    </span>
                    {offer.pickup_distance_km != null && (
                        <span className="text-[11px] font-medium text-brand-green flex items-center gap-1 mt-0.5">
                            <MapPinIcon size={11} />
                            {offer.pickup_distance_km === 0
                                ? "No mesmo local"
                                : `${offer.pickup_distance_km} km${offer.pickup_minutes != null ? ` · ${offer.pickup_minutes} min até a loja` : ""}`}
                        </span>
                    )}
                    {offer.delivery_minutes != null && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                            {offer.delivery_minutes} min até o cliente{offer.eta_total_minutes != null ? ` · ~${offer.eta_total_minutes} min total` : ""}
                        </span>
                    )}
                    {offer.position_quality === "address" && (
                        <span className="text-[10px] text-brand-inactive-text/80 dark:text-dark-body/80 mt-0.5">
                            Distância pelo endereço de cadastro
                        </span>
                    )}
                </div>
            </td>

            {/* DESTINO DA ENTREGA */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[300px]">
                <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[260px]" title={offer.delivery_address || "Região local"}>
                        {offer.delivery_address || "Região local"}
                    </span>
                    <span className="text-[11px] text-brand-inactive-text dark:text-dark-body flex items-center gap-1 mt-0.5">
                        <span>🔒 Rua e nº após aceite</span>
                        {orderCount > 1 && <span>• {orderCount} paradas</span>}
                    </span>
                </div>
            </td>

            {/* TAXA */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[150px]">
                <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(offer.delivery_fee || 0)}
                    </span>
                    {offer.bonus_amount != null && offer.bonus_amount > 0 && (
                        <span className="text-[11px] font-bold text-brand-green font-mono">
                            + bônus {formatCurrency(offer.bonus_amount)}
                        </span>
                    )}
                    {offer.rs_per_km != null && offer.rs_per_km > 0 && (
                        <span className="text-[11px] font-semibold text-emerald-700/90 dark:text-emerald-300/90 font-mono">
                            {formatCurrency(offer.rs_per_km)}/km
                        </span>
                    )}
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
