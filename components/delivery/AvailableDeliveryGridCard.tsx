"use client"

import React from "react"
import { motion } from "framer-motion"
import { Button, Dropdown, DropdownItem } from "@/components/reusable"
import {
    MapPinIcon,
    PhoneIcon,
    WhatsappIcon,
    StoreIcon,
    MoreHorizontalIcon,
    Package,
    TruckIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
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

    const cleanPhone = (offer.customer_phone || "").replace(/\D/g, "")
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        offer.delivery_address || ""
    )}`
    const whatsappUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : null

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 group flex flex-col h-full relative"
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
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 whitespace-nowrap scale-90 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Disponível
                            </span>
                        </div>

                        {/* Ações */}
                        <div className="shrink-0 -mt-1 -mr-1">
                            <Dropdown
                                align="right"
                                showChevron={false}
                                trigger={
                                    <button
                                        type="button"
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:hover:bg-dark-border dark:hover:text-dark-heading transition-colors cursor-pointer"
                                        aria-label="Ações da oferta"
                                    >
                                        <MoreHorizontalIcon size={18} />
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
                            </Dropdown>
                        </div>
                    </div>

                    {/* Linha 2: Estabelecimento • Data */}
                    <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate flex items-center">
                        <span className="truncate">{offer.store_name || offer.partner_name || "Estabelecimento"}</span>
                        {offer.assigned_at && (
                            <>
                                <span className="mx-1.5">•</span>
                                <span className="truncate">{formatDate(offer.assigned_at)}</span>
                            </>
                        )}
                    </div>

                    {/* Linha 3: Cliente */}
                    <div className="flex items-center gap-2 mt-1.5 min-w-0">
                        <UserProfileImage
                            fullName={offer.customer_name || "Cliente"}
                            className="h-6 w-6 text-[10px] shrink-0"
                        />
                        <span className="text-[13px] font-semibold text-brand-dark dark:text-dark-heading truncate">
                            {offer.customer_name || "Cliente"}
                        </span>
                        {cleanPhone && (
                            <div className="flex items-center gap-1 shrink-0 ml-auto">
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
                        {offer.delivery_address || "Endereço de entrega não informado"}
                    </span>
                </a>
            </div>

            {/* Itens */}
            {offer.items && offer.items.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text mb-2">
                    <Package size={13} className="shrink-0" />
                    <span className="truncate">
                        {offer.items.reduce((acc, it) => acc + (it.quantity || 1), 0)} itens (
                        {offer.items.map((it) => it.name).join(", ")})
                    </span>
                </div>
            )}

            {/* Área do Rodapé */}
            <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
                <div className="flex items-end justify-between mt-1">
                    {/* Valores */}
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Sua Taxa</span>
                        <div className="flex items-center gap-2.5">
                            <span className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                                {formatCurrency(offer.delivery_fee || 0)}
                            </span>
                        </div>
                        {!!offer.total_amount && (
                            <span className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                Pedido: {formatCurrency(offer.total_amount)}
                            </span>
                        )}
                    </div>

                    {/* Botão de Aceitar */}
                    <div className="shrink-0">
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => onAccept(offer.assignment_id)}
                            disabled={isAccepting}
                            isLoading={isAccepting}
                            className="text-xs h-8 px-3 font-bold"
                            leftIcon={<TruckIcon size={14} />}
                        >
                            Aceitar
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}