"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown } from "@/components/reusable"
import { DropdownItem } from "@/components/reusable/Dropdown"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getDeliveryStatusMeta, getDeliveryStatusIcon } from "@/lib/orders/status"

interface DeliveryGridCardProps {
  delivery: any
  onDetails: () => void
  onQuickStatusChange?: (deliveryId: string, status: string) => void
}

const DeliveryGridCard = React.memo(({ delivery, onDetails, onQuickStatusChange }: DeliveryGridCardProps) => {
  const statusMeta = getDeliveryStatusMeta(delivery.status)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
      onClick={onDetails}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate">{delivery.orderDisplayId}</h3>
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">{delivery.customerName}</p>
        </div>
        <Badge variant={statusMeta.variant} icon={getDeliveryStatusIcon(delivery.status)}>{statusMeta.label}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-brand-inactive-text">Valor entrega</p>
          <p className="font-bold text-brand-primary">{formatCurrency(delivery.deliveryFee || 0)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-inactive-text">Tempo estimado</p>
          <p className="font-bold text-brand-dark dark:text-dark-heading">{delivery.estimatedDurationMinutes ? `${delivery.estimatedDurationMinutes} min` : "-"}</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-brand-border dark:border-dark-border flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-brand-inactive-text">Saída</p>
          <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{delivery.startedAt ? formatDate(delivery.startedAt) : "-"}</p>
          <p className={`text-[11px] font-semibold ${delivery.deliveryTimingState === "late" ? "text-brand-red" : "text-brand-green"}`}>
            {delivery.deliveryTimingLabel || ""}
          </p>
          {delivery.deliveryTimingDetail ? (
            <p className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
              {delivery.deliveryTimingDetail}
            </p>
          ) : null}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <ActionsDropdown onEdit={onDetails}>
            <DropdownItem onClick={() => onQuickStatusChange?.(delivery.id, delivery.status)}>Alterar Status de Entrega</DropdownItem>
          </ActionsDropdown>
        </div>
      </div>
    </motion.div>
  )
})

DeliveryGridCard.displayName = "DeliveryGridCard"

export default DeliveryGridCard
