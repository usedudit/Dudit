"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatCurrency, formatDate, formatTime } from "@/lib/utils"
import { getDeliveryStatusMeta, getDeliveryStatusIcon } from "@/lib/orders/status"
import { TruckIcon, ClockIcon } from "@/lib/icons"

interface DeliveryGridCardProps {
  delivery: any
  onDetails: () => void
  onEdit?: () => void
  onQuickStatusChange?: (deliveryId: string, status: string) => void
}

const DeliveryGridCard = React.memo(({ delivery, onDetails, onEdit, onQuickStatusChange }: DeliveryGridCardProps) => {
  const statusMeta = getDeliveryStatusMeta(delivery.status)
  const canEdit = ["pending", "not_sent", "preparing"].includes(delivery.status)
  const isPlatformDriver = Boolean(delivery.isPlatformDriver || delivery.is_platform_driver || delivery.platform_driver)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
      onClick={onDetails}
    >
      <div className="flex gap-4 mb-2">
        {/* Visual Indicator */}
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
          <TruckIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: ID / Title + Badges */}
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                title={delivery.orderDisplayId}
              >
                {delivery.orderCount > 1 ? `Múltiplos pedidos (${delivery.orderCount})` : delivery.orderDisplayId}
              </h3>
              {delivery.deliveryTimingState === "late" && (
                <Tooltip text={delivery.deliveryTimingLabel || "Entrega atrasada"}>
                  <Badge variant="red" icon={<ClockIcon size={12} />} className="whitespace-nowrap scale-90 shrink-0" />
                </Tooltip>
              )}
              <div className="flex items-center shrink-0">
                <Badge variant={statusMeta.variant} icon={getDeliveryStatusIcon(delivery.status)} className="whitespace-nowrap">
                  {statusMeta.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Row 2: Taxa • Entregador */}
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span className="font-bold text-brand-primary">
              {formatCurrency(delivery.deliveryFee || 0)}
            </span>
            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
            <div className="flex items-center gap-1 min-w-0">
              {isPlatformDriver && (
                <Tooltip text="Entregador da Rede Dudit">
                  <img src="https://img.dudit.com.br/static/Icon.png" alt="Dudit" className="w-3 h-3 object-contain shrink-0 cursor-help" />
                </Tooltip>
              )}
              <span className="font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {delivery.deliveryPersonName || "Entrega própria"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Rows */}
      <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        {/* Row 1: Cliente & Saída / Previsão */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
              {delivery.customerName}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end shrink-0 max-w-[50%]">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Saída / Previsão</span>
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading text-right truncate">
              {delivery.startedAt ? formatDate(delivery.startedAt) : "-"}
              {delivery.estimatedArrivalAt ? ` • ${formatTime(delivery.estimatedArrivalAt)}` : ""}
            </span>
          </div>
        </div>

        {/* Row 2: Endereço & Actions */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Endereço</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate" title={delivery.customerAddress}>
              {delivery.customerAddress || "-"}
            </span>
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
