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
                            {offer.dimensions_unknown && (
                                <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 shrink-0"
                                    title="Itens sem dimensão informada — confirme se cabe no seu veículo"
                                >
                                    ⚠ Sem dimensão
                                </span>
                            )}
                            {offer.vehicle_compatible === false && (
                                <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 shrink-0"
                                    title="Peso ou volume acima do limite recomendado para o seu veículo"
                                >
                                    ⚠ Acima do veículo
                                </span>
                            )}
                        </div>


                    </div>

                    {/* Row 2: Estabelecimento */}
                    <div className="flex flex-col gap-0.5 mt-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                            <span className="truncate">{offer.store_name || offer.partner_name || "Estabelecimento"}</span>
                        </div>
                        {(offer.pickup_distance_km != null || offer.delivery_minutes != null) && (
                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold text-brand-green">
                                <MapPinIcon size={11} className="shrink-0" />
                                <span>
                                    {offer.pickup_distance_km != null
                                        ? offer.pickup_distance_km === 0
                                            ? "No seu local"
                                            : `${offer.pickup_distance_km} km${offer.pickup_minutes != null ? ` · ${offer.pickup_minutes} min até a loja` : ""}`
                                        : ""}
                                    {offer.delivery_minutes != null
                                        ? `${offer.pickup_distance_km != null ? " · " : ""}${offer.delivery_minutes} min até o cliente`
                                        : ""}
                                </span>
                            </div>
                        )}
                        {offer.position_quality === "address" && (
                            <span className="text-[10px] text-brand-inactive-text dark:text-dark-body">
                                Calculado pelo endereço de cadastro
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Info Rows */}
            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                            {orderCount > 1 ? `Destino (${orderCount} paradas)` : "Destino da Entrega"}
                        </span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate" title={offer.delivery_address || "Região local"}>
                            {offer.delivery_address || "Região local"}
                        </span>
                        <span className="text-[10px] text-brand-inactive-text dark:text-dark-body">
                            🔒 Rua e número após aceite
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end shrink-0">
                        <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body text-right">
                            {tierSecondsLeft !== null && tierSecondsLeft > 0 ? "Janela atual" : "Aguardando"}
                        </span>
                        {tierSecondsLeft !== null && tierSecondsLeft > 0 ? (
                            <span className="text-xs font-bold flex items-center gap-1 text-brand-dark dark:text-dark-heading">
                                <ClockIcon size={12} />
                                fecha em {tierSecondsLeft}s
                            </span>
                        ) : elapsedMinutes !== null ? (
                            <span className="text-xs font-bold flex items-center gap-1 text-brand-dark dark:text-dark-heading">
                                <ClockIcon size={12} />
                                {elapsedMinutes === 0 ? "Agora" : `há ${elapsedMinutes} min`}
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
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                {formatCurrency(offer.delivery_fee || 0)}
                            </span>
                            {offer.bonus_amount != null && offer.bonus_amount > 0 && (
                                <span className="text-[11px] font-bold text-brand-green font-mono">
                                    + bônus {formatCurrency(offer.bonus_amount)}
                                </span>
                            )}
                            {offer.rs_per_km != null && offer.rs_per_km > 0 && (
                                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-mono">
                                    {formatCurrency(offer.rs_per_km)}/km
                                </span>
                            )}
                        </div>
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
                                <MapPinIcon size={16} /> Ver Região no Maps
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
