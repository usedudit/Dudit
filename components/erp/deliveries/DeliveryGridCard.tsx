"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import { TruckIcon } from "@/lib/icons"

interface DeliveryGridCardProps {
  delivery: any
  onDetails: () => void
  onEdit?: () => void
  onQuickStatusChange?: (deliveryId: string, status: string) => void
}

const DeliveryGridCard = React.memo(({ delivery, onDetails, onEdit, onQuickStatusChange }: DeliveryGridCardProps) => {
  const statusMeta = getDeliveryStatusMeta(delivery.status)
  const canEdit = ["pending", "not_sent", "preparing"].includes(delivery.status)

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
        <Tooltip text={statusMeta.label}>
          <Badge variant={statusMeta.variant} icon={<TruckIcon />} />
        </Tooltip>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-brand-inactive-text">Entregador</p>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {(delivery.isPlatformDriver || delivery.is_platform_driver || delivery.platform_driver) && (
              <Tooltip text="Entregador da Rede Dudit">
                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" className="w-3 h-3 object-contain shrink-0 cursor-help" />
              </Tooltip>
            )}
            <p className="font-bold text-xs text-brand-dark dark:text-dark-heading truncate">
              {delivery.deliveryPersonName || "Entrega própria"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-brand-inactive-text">Taxa entrega</p>
          <p className="font-bold text-brand-primary text-xs mt-0.5">{formatCurrency(delivery.deliveryFee || 0)}</p>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        <div className="flex justify-between items-end gap-2">
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
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown
              onStatus={() => onQuickStatusChange?.(delivery.id, delivery.status)}
              onEdit={canEdit && onEdit ? onEdit : undefined}
              onCancel={delivery.status !== "cancelled" ? () => onQuickStatusChange?.(delivery.id, "cancelled") : undefined}
              cancelLabel="Cancelar entrega"
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
})

DeliveryGridCard.displayName = "DeliveryGridCard"

export default DeliveryGridCard
