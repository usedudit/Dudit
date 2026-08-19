"use client"

import React from "react"
import Link from "next/link"
import { Badge, Button } from "@/components/reusable"
import {
    MapPinIcon,
    PhoneIcon,
    WhatsappIcon,
    StoreIcon,
    ChevronRightIcon,
    Package,
    ClockIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { type DeliveryAssignmentItem, statusConfig } from "./DeliveryAssignmentListRow"

interface DeliveryAssignmentGridCardProps {
    assignment: DeliveryAssignmentItem
}

export default function DeliveryAssignmentGridCard({ assignment }: DeliveryAssignmentGridCardProps) {
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

    return (
        <article className="flex flex-col justify-between rounded-2xl border border-brand-border bg-white p-5 shadow-xs hover:shadow-md transition-all duration-200 dark:border-dark-border dark:bg-dark-surface hover:border-brand-dark/20 dark:hover:border-dark-border/80 group">
            <div>
                {/* TOP BAR: ORDER # & STATUS */}
                <div className="flex items-center justify-between gap-2 mb-3">
                    <Link
                        href={`/entregadores/entregas/${assignment.assignment_id}`}
                        className="font-bold text-base text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors font-mono"
                    >
                        {orderNumberDisplay}
                    </Link>
                    <Badge variant={statusMeta.variant} icon={statusMeta.icon}>
                        {statusMeta.label}
                    </Badge>
                </div>

                {/* STORE / ESTABELECIMENTO */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-brand-border/60 dark:border-dark-border/40 text-xs font-medium text-brand-inactive-text dark:text-dark-body">
                    <StoreIcon size={14} className="shrink-0" />
                    <span className="truncate">{assignment.partner_name || "Loja Parceira"}</span>
                    {assignment.assigned_at && (
                        <span className="ml-auto shrink-0 text-[11px] opacity-75">
                            {formatDate(assignment.assigned_at)}
                        </span>
                    )}
                </div>

                {/* CUSTOMER INFO */}
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <UserProfileImage
                            fullName={assignment.customer_name || "Cliente"}
                            className="h-10 w-10 text-sm shrink-0"
                        />
                        <div className="min-w-0">
                            <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                {assignment.customer_name}
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                {assignment.customer_phone || "Sem telefone"}
                            </p>
                        </div>
                    </div>

                    {/* CONTACT ACTIONS */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {cleanPhone && (
                            <a
                                href={`tel:${cleanPhone}`}
                                className="w-8 h-8 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-brand-green hover:text-white transition-colors"
                                title="Ligar para cliente"
                            >
                                <PhoneIcon size={14} />
                            </a>
                        )}
                        {whatsappUrl && (
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-colors"
                                title="Chamar no WhatsApp"
                            >
                                <WhatsappIcon size={15} />
                            </a>
                        )}
                    </div>
                </div>

                {/* DELIVERY ADDRESS */}
                <div className="rounded-xl bg-brand-gray/80 dark:bg-dark-border/30 p-3 mb-4 text-xs">
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

                {/* ITEMS COUNT SUMMARY */}
                {assignment.items && assignment.items.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-inactive-text mb-4">
                        <Package size={13} className="shrink-0" />
                        <span className="truncate">
                            {assignment.items.reduce((acc, it) => acc + (it.quantity || 1), 0)} itens (
                            {assignment.items.map((it) => it.name).join(", ")})
                        </span>
                    </div>
                )}
            </div>

            {/* CARD FOOTER */}
            <div className="pt-3 border-t border-brand-border/60 dark:border-dark-border/40 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                    <span className="text-[11px] uppercase font-bold text-brand-inactive-text">
                        Pedido: {formatCurrency(assignment.total_amount || 0)}
                    </span>
                    <span className="text-xs font-bold text-brand-green">
                        Taxa: {formatCurrency(assignment.delivery_fee || 0)}
                    </span>
                </div>

                <Link href={`/entregadores/entregas/${assignment.assignment_id}`}>
                    <Button
                        variant="outline"
                        size="sm"
                        rightIcon={<ChevronRightIcon size={14} />}
                        className="text-xs h-8 px-3"
                    >
                        Detalhes
                    </Button>
                </Link>
            </div>
        </article>
    )
}
