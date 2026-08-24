"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Badge, BadgeVariant, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    TruckIcon,
    CheckCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    MapPinIcon,
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
    onView?: (assignment: DeliveryAssignmentItem) => void
}

export default function DeliveryAssignmentListRow({
    assignment,
    onView,
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

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        assignment.delivery_address || ""
    )}`

    const handleView = () => {
        if (onView) {
            onView(assignment)
        } else {
            router.push(`/entregadores/entregas/${assignment.assignment_id}`)
        }
    }

    return (
        <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="group hover:bg-brand-gray/60 dark:hover:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
            onClick={handleView}
        >
            {/* PEDIDO */}
            <td className="py-2.5 pl-6 pr-2 border-b border-brand-border dark:border-dark-border w-[180px]">
                <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading group-hover:text-brand-green transition-colors font-mono">
                        {orderNumberDisplay}
                    </span>
                    {assignment.assigned_at && (
                        <span className="text-[11px] text-brand-inactive-text dark:text-dark-body mt-0.5">
                            {formatDate(assignment.assigned_at)}
                        </span>
                    )}
                </div>
            </td>

            {/* ESTABELECIMENTO */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[180px]">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate block max-w-[160px]">
                    {assignment.partner_name || "Loja Parceira"}
                </span>
            </td>

            {/* CLIENTE */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[200px]">
                <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading truncate block max-w-[180px]">
                    {assignment.customer_name}
                </span>
            </td>

            {/* ENDEREÇO */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[240px]">
                <span className="text-xs text-brand-dark/90 dark:text-dark-body truncate block max-w-[220px]">
                    {assignment.delivery_address || "Endereço não informado"}
                </span>
            </td>

            {/* VALORES */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border w-[130px]">
                <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                        {formatCurrency(assignment.total_amount || 0)}
                    </span>
                    <span className="text-[11px] font-semibold text-brand-green">
                        Taxa: {formatCurrency(assignment.delivery_fee || 0)}
                    </span>
                </div>
            </td>

            {/* STATUS */}
            <td className="p-2 border-b border-brand-border dark:border-dark-border text-center w-[160px]">
                <Badge variant={statusMeta.variant} icon={statusMeta.icon} className="justify-center">
                    {statusMeta.label}
                </Badge>
            </td>

            {/* AÇÕES */}
            <td className="py-2.5 pr-6 pl-2 border-b border-brand-border dark:border-dark-border text-center w-[70px] rounded-r-lg" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center action-btn">
                    <ActionsDropdown>
                        <DropdownItem onClick={() => handleView()}>
                            <TruckIcon size={16} /> Ver Detalhes
                        </DropdownItem>
                        <DropdownItem onClick={() => window.open(mapsUrl, "_blank")}>
                            <MapPinIcon size={16} /> Abrir Rota no Maps
                        </DropdownItem>
                    </ActionsDropdown>
                </div>
            </td>
        </motion.tr>
    )
}
