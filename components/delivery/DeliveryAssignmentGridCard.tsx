"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import {
    TruckIcon,
    MapPinIcon,
    Package,
} from "@/lib/icons"
import { formatCurrency, formatDate } from "@/lib/utils"
import { type DeliveryAssignmentItem, statusConfig } from "./DeliveryAssignmentListRow"

interface DeliveryAssignmentGridCardProps {
    assignment: DeliveryAssignmentItem
    onView?: (assignment: DeliveryAssignmentItem) => void
}

export default function DeliveryAssignmentGridCard({ assignment, onView }: DeliveryAssignmentGridCardProps) {
    const router = useRouter()
    const statusMeta = statusConfig[assignment.status] || {
        label: assignment.status,
        variant: "gray" as const,
        icon: null,
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
                    {/* Row 1: Pedido + Badge */}
                    <div className="flex justify-between items-start gap-1">
                        <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                            <h3
                                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0 font-mono"
                                title={String(orderNumberDisplay)}
                            >
                                {orderNumberDisplay}
                            </h3>
                            <div className="flex items-center shrink-0">
                                <Badge variant={statusMeta.variant} className="whitespace-nowrap scale-90 shrink-0">
                                    {statusMeta.label}
                                </Badge>
                            </div>
                        </div>

                        {/* Ações */}
                        <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                            <ActionsDropdown>
                                <DropdownItem onClick={() => handleView()}>
                                    <TruckIcon size={16} /> Ver Detalhes
                                </DropdownItem>
                                <DropdownItem onClick={() => window.open(mapsUrl, "_blank")}>
                                    <MapPinIcon size={16} /> Abrir Rota no Maps
                                </DropdownItem>
                            </ActionsDropdown>
                        </div>
                    </div>

                    {/* Row 2: Estabelecimento */}
                    <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
                        {assignment.partner_name || "Loja Parceira"}
                    </div>
                </div>
            </div>

            {/* Info Rows */}
            <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                            {assignment.customer_name}
                        </span>
                    </div>
                    <div className="flex flex-col gap-0.5 items-end shrink-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Data</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                            {assignment.assigned_at ? formatDate(assignment.assigned_at) : "-"}
                        </span>
                    </div>
                </div>

                <div className="flex justify-between items-center gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pedido</span>
                        <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(assignment.total_amount || 0)}
                        </span>
                        <span className="text-xs font-bold text-brand-green">
                            Taxa: {formatCurrency(assignment.delivery_fee || 0)}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
