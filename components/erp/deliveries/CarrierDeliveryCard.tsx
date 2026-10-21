"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Badge, Dropdown, DropdownItem } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { getCarrierStatusLabel, getCarrierStatusVariant } from "@/lib/orders/carrier-status"
import { getCarrierBrandIcon } from "@/lib/utils/carrier-brand"
import { formatDeliveryDaysRange } from "@/lib/utils"
import { ClockIcon, MoneyIcon, TruckIcon } from "@/lib/icons"

interface CarrierDeliveryCardProps {
  shipment: any
  onOpenOrder: (orderId: string) => void
}

function getRelativeTimeElapsed(createdAtMs: number): string {
  const diffMs = Date.now() - createdAtMs
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "agora"
  if (diffMins < 60) return `há ${diffMins} min`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `há ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  return `há ${diffDays} dias`
}

export default function CarrierDeliveryCard({ shipment, onOpenOrder }: CarrierDeliveryCardProps) {
  const [elapsed, setElapsed] = useState("")

  useEffect(() => {
    setElapsed(getRelativeTimeElapsed(shipment.createdAtMs))
    const interval = setInterval(() => {
      setElapsed(getRelativeTimeElapsed(shipment.createdAtMs))
    }, 15000)
    return () => clearInterval(interval)
  }, [shipment.createdAtMs])

  const statusVariant = getCarrierStatusVariant(shipment.carrierStatus)
  const brandIcon = getCarrierBrandIcon(shipment.carrierName, shipment.serviceName)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 cursor-pointer flex flex-col justify-between transition-colors duration-200"
      onClick={() => onOpenOrder(shipment.orderId)}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1 text-[11px] text-brand-inactive-text dark:text-dark-body font-medium">
            <ClockIcon size={12} className="shrink-0" />
            <span>Criada {elapsed}</span>
          </div>
          <Badge variant={statusVariant}>{getCarrierStatusLabel(shipment.carrierStatus)}</Badge>
        </div>

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
            {shipment.orderNumber}
          </span>
        </div>

        <div className="space-y-1">
          <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
            {shipment.customerName}
          </h4>
          {shipment.customerAddress ? (
            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-normal line-clamp-2" title={shipment.customerAddress}>
              {shipment.customerAddress}
            </p>
          ) : (
            <p className="text-xs italic text-brand-inactive-text dark:text-dark-body">
              Sem endereço informado
            </p>
          )}
        </div>

        <div className="mt-3.5 space-y-1.5 text-[11px] font-medium text-brand-inactive-text dark:text-dark-body border-t border-brand-border/40 dark:border-dark-border/40 pt-2.5">
          <div className="flex items-center gap-1.5 text-brand-dark dark:text-dark-heading min-w-0">
            <img src={brandIcon} alt={shipment.carrierName} className="w-3.5 h-3.5 object-contain shrink-0" />
            <span className="truncate">
              {shipment.serviceName || shipment.carrierName}
            </span>
          </div>

          {shipment.deliveryMinDays != null || shipment.deliveryMaxDays != null ? (
            <div className="flex items-center gap-1 text-brand-dark dark:text-dark-heading">
              <TruckIcon size={12} className="shrink-0" />
              <span>{formatDeliveryDaysRange(shipment.deliveryMinDays, shipment.deliveryMaxDays)}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-brand-dark dark:text-dark-heading">
              <MoneyIcon size={12} className="shrink-0" />
              <span>Taxa: <strong>{formatCurrency(shipment.deliveryFee || 0)}</strong></span>
            </div>
          </div>

          {shipment.trackingNumber ? (
            <div className="truncate text-brand-dark dark:text-dark-heading">Rastreio: {shipment.trackingNumber}</div>
          ) : null}
        </div>
      </div>

      {shipment.trackingUrl ? (
        <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Dropdown
            align="right"
            fullWidth={false}
            width="w-48"
            trigger={
              <button
                type="button"
                className="text-[11px] font-bold text-brand-dark dark:text-dark-heading underline decoration-brand-dark dark:decoration-dark-heading"
              >
                Ações
              </button>
            }
          >
            <DropdownItem onClick={() => window.open(shipment.trackingUrl, "_blank")}>
              <TruckIcon size={18} /> Rastrear envio
            </DropdownItem>
            <DropdownItem onClick={() => onOpenOrder(shipment.orderId)}>
              <ClockIcon size={18} /> Abrir pedido
            </DropdownItem>
          </Dropdown>
        </div>
      ) : null}
    </motion.div>
  )
}
