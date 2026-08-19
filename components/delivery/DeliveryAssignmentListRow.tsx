"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge, BadgeVariant, Dropdown, DropdownItem } from "@/components/reusable"
import {
    TruckIcon,
    PhoneIcon,
    MapPinIcon,
    MoreHorizontalIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    EyeIcon,
    WhatsappIcon,
    StoreIcon,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"

export interface DeliveryAssignmentItem {
    assignment_id: string
    order_id: string
    order_number?: string | number
    partner_name?: string
    partner_id?: string
    customer_name: string
    customer_phone?: string
    delivery_address: string
    total_amount: number
    delivery_fee: number
    status: "assigned" | "accepted" | "picked_up" | "out_for_delivery" | "delivered" | "failed" | "cancelled" | string
    assigned_at?: string
    accepted_at?: string
    picked_up_at?: string
    delivered_at?: string
    payment_method?: string
    payment_status?: string
    payment_confirmed_at?: string
    notes?: string
    items?: Array<{ name: string; quantity: number }>
}

export const statusConfig: Record<
    string,
    { label: string; variant: BadgeVariant; icon?: React.ReactElement<{ className?: string }> | null }
> = {
    assigned: {
        label: "Atribuída",
        variant: "gray",
        icon: (<ClockIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
    accepted: {
        label: "Aceita",
        variant: "blue",
        icon: (<ClockIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
    picked_up: {
        label: "Retirada no Local",
        variant: "purple",
        icon: (<TruckIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
    out_for_delivery: {
        label: "Em Rota de Entrega",
        variant: "orange",
        icon: (<TruckIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
    delivered: {
        label: "Entregue",
        variant: "green",
        icon: (<CheckCircleIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
    failed: {
        label: "Falha na Entrega",
        variant: "red",
        icon: (<AlertTriangleIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
    cancelled: {
        label: "Cancelada",
        variant: "red",
        icon: (<AlertTriangleIcon size={12} />) as React.ReactElement<{ className?: string }>,
    },
}

interface DeliveryAssignmentListRowProps {
    assignment: DeliveryAssignmentItem
    onAdvanceStatus?: (assignment: DeliveryAssignmentItem) => void
}

export default function DeliveryAssignmentListRow({
    assignment,
}: DeliveryAssignmentListRowProps) {
    const router = useRouter()
    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as BadgeVariant,
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
        <tr className="hover:bg-brand-gray/60 dark:hover:bg-dark-border/30 transition-colors border-b border-brand-border/60 dark:border-dark-border/40 group">
            {/* PEDIDO */}
            <td className="py-3.5 px-3 pl-6">
                <Link
                    href={`/entregadores/entregas/${assignment.assignment_id}`}
                    className="font-bold text-sm text-brand-dark dark:text-dark-heading hover:text-brand-green transition-colors font-mono"
                >
                    {orderNumberDisplay}
                </Link>
                {assignment.assigned_at && (
                    <p className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                        {formatDate(assignment.assigned_at)}
                    </p>
                )}
            </td>

            {/* LOJA / PARCEIRO */}
            <td className="py-3.5 px-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-brand-dark dark:text-dark-heading">
                    <StoreIcon size={14} className="text-brand-inactive-text shrink-0" />
                    <span className="truncate max-w-[160px]">{assignment.partner_name || "Loja Parceira"}</span>
                </div>
            </td>

            {/* CLIENTE & CONTATO */}
            <td className="py-3.5 px-3">
                <div className="flex flex-col">
                    <span className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate max-w-[180px]">
                        {assignment.customer_name}
                    </span>
                    {assignment.customer_phone ? (
                        <div className="flex items-center gap-2 mt-0.5">
                            <a
                                href={`tel:${assignment.customer_phone}`}
                                className="text-xs text-brand-green hover:underline flex items-center gap-1"
                                title="Ligar para cliente"
                            >
                                <PhoneIcon size={11} />
                                <span>{assignment.customer_phone}</span>
                            </a>
                            {whatsappUrl && (
                                <a
                                    href={whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-600 hover:text-emerald-700"
                                    title="Chamar no WhatsApp"
                                >
                                    <WhatsappIcon size={13} />
                                </a>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs text-brand-inactive-text">Sem telefone</span>
                    )}
                </div>
            </td>

            {/* ENDEREÇO DE ENTREGA */}
            <td className="py-3.5 px-3">
                <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-1.5 text-xs text-brand-dark/90 dark:text-dark-body hover:text-brand-green transition-colors max-w-[220px]"
                    title="Abrir no Google Maps"
                >
                    <MapPinIcon size={14} className="text-brand-inactive-text shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{assignment.delivery_address || "Endereço não informado"}</span>
                </a>
            </td>

            {/* VALORES */}
            <td className="py-3.5 px-3">
                <div className="flex flex-col">
                    <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                        {formatCurrency(assignment.total_amount || 0)}
                    </span>
                    <span className="text-[11px] font-semibold text-brand-green">
                        Taxa: {formatCurrency(assignment.delivery_fee || 0)}
                    </span>
                </div>
            </td>

            {/* STATUS */}
            <td className="py-3.5 px-3 text-center">
                <Badge variant={statusMeta.variant} icon={statusMeta.icon} className="justify-center">
                    {statusMeta.label}
                </Badge>
            </td>

            {/* AÇÕES */}
            <td className="py-3.5 px-3 pr-6 text-center">
                <div className="flex items-center justify-center">
                    <Dropdown
                        align="right"
                        showChevron={false}
                        trigger={
                            <button
                                type="button"
                                className="w-8 h-8 rounded-full flex items-center justify-center text-brand-inactive-text hover:bg-brand-gray hover:text-brand-dark dark:hover:bg-dark-border dark:hover:text-dark-heading transition-colors"
                                aria-label="Ações da entrega"
                            >
                                <MoreHorizontalIcon size={18} />
                            </button>
                        }
                    >
                        <DropdownItem onClick={() => router.push(`/entregadores/entregas/${assignment.assignment_id}`)}>
                            <EyeIcon size={16} /> Ver Detalhes
                        </DropdownItem>

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
            </td>
        </tr>
    )
}
