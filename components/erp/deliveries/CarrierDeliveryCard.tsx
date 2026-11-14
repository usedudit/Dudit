"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { formatCurrency, formatDeliveryDaysRange, formatDate } from "@/lib/utils"
import { getCarrierStatusLabel, getCarrierStatusVariant } from "@/lib/orders/carrier-status"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { TruckIcon, LinkIcon, PrinterIcon } from "@/lib/icons"

interface CarrierDeliveryCardProps {
  shipment: any
  onOpenOrder: (orderId: string) => void
}

export function getEstimatedDeliveryDate(createdAt?: string | null, maxDays?: number | null): string | null {
  if (!createdAt || maxDays == null || maxDays <= 0) return null
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return null
  let addedDays = 0
  const current = new Date(date)
  while (addedDays < maxDays) {
    current.setDate(current.getDate() + 1)
    const dayOfWeek = current.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++
    }
  }
  return formatDate(current.toISOString())
}

export default function CarrierDeliveryCard({ shipment, onOpenOrder }: CarrierDeliveryCardProps) {
  const isCancelled = shipment.situation === "cancelled" || shipment.carrierStatus === "cancelled"
  const statusVariant = isCancelled ? "red" : getCarrierStatusVariant(shipment.carrierStatus)
  const statusLabel = isCancelled ? "Cancelado" : getCarrierStatusLabel(shipment.carrierStatus)
  const brandIcon = getCarrierBrandIcon(shipment.carrierName, shipment.serviceName)
  const daysRange = formatDeliveryDaysRange(shipment.deliveryMinDays, shipment.deliveryMaxDays)
  const estimatedDate = getEstimatedDeliveryDate(shipment.createdAt, shipment.deliveryMaxDays)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
      onClick={() => onOpenOrder(shipment.orderId)}
    >
      <div className="flex gap-4 mb-2">
        {/* Visual Indicator */}
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
          {brandIcon ? (
            <img src={brandIcon} alt={shipment.carrierName || "Transportadora"} className="w-6 h-6 object-contain" />
          ) : (
            <TruckIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: Order Number + Status Badge */}
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                title={shipment.orderNumber}
              >
                {shipment.orderNumber}
              </h3>
              <div className="flex items-center shrink-0">
                <Badge
                  variant={statusVariant}
                  icon={brandIcon ? <img src={brandIcon} alt="Transportadora" className="w-3.5 h-3.5 object-contain" /> : <TruckIcon size={12} />}
                  className="whitespace-nowrap"
                >
                  {statusLabel}
                </Badge>
              </div>
            </div>
          </div>

          {/* Row 2: Carrier Service • Value */}
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span className="font-bold text-brand-primary">
              {formatCurrency(shipment.price != null ? shipment.price : (shipment.deliveryFee || 0))}
            </span>
            <span className="text-brand-inactive-text dark:text-dark-body">•</span>
            <span className="font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {shipment.serviceName || shipment.carrierName}
            </span>
          </div>
        </div>
      </div>

      {/* Info Rows */}
      <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        {/* Row 1: Cliente & Prazo */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
              {shipment.customerName}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end shrink-0 max-w-[50%]">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Prazo</span>
            <div className="flex flex-col items-end text-right">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">
                {daysRange || "—"}
              </span>
              {estimatedDate && (
                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  Prev.: {estimatedDate}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Endereço & Actions */}
        <div className="flex justify-between items-end gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Endereço</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate" title={shipment.customerAddress}>
              {shipment.customerAddress || "Sem endereço informado"}
            </span>
          </div>

          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown
              onView={() => onOpenOrder(shipment.orderId)}
            >
              {shipment.trackingUrl && (
                <DropdownItem onClick={() => window.open(shipment.trackingUrl, "_blank")}>
                  <LinkIcon size={18} /> Rastrear envio
                </DropdownItem>
              )}
              {shipment.labelUrl && (
                <DropdownItem onClick={() => window.open(shipment.labelUrl, "_blank")}>
                  <PrinterIcon size={18} /> Imprimir etiqueta
                </DropdownItem>
              )}
            </ActionsDropdown>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
