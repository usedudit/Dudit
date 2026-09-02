"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ActionsDropdown } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import { ClockIcon, TruckIcon, UserIcon } from "@/lib/icons"

interface DeliveryKanbanCardProps {
  delivery: any
  onDetails: () => void
  onEdit?: () => void
  onQuickStatusChange?: (deliveryId: string, status: string) => void
}

// Function to calculate relative time elapsed
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

export default function DeliveryKanbanCard({
  delivery,
  onDetails,
  onEdit,
  onQuickStatusChange,
}: DeliveryKanbanCardProps) {
  const [elapsed, setElapsed] = useState("")

  // Set up timer to update the "elapsed" label dynamically
  useEffect(() => {
    setElapsed(getRelativeTimeElapsed(delivery.createdAtMs))
    const interval = setInterval(() => {
      setElapsed(getRelativeTimeElapsed(delivery.createdAtMs))
    }, 15000) // Update every 15 seconds
    return () => clearInterval(interval)
  }, [delivery.createdAtMs])

  const statusMeta = getDeliveryStatusMeta(delivery.status)
  const canEdit = ["pending", "not_sent", "preparing"].includes(delivery.status)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", delivery.id)
    e.dataTransfer.effectAllowed = "move"
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 cursor-pointer flex flex-col justify-between transition-colors duration-200"
      onClick={onDetails}
      draggable={true}
      onDragStart={handleDragStart as any}
    >
      <div>
        {/* Top Row: Created Date / Elapsed Time & Options */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1 text-[11px] text-brand-inactive-text dark:text-dark-body font-medium">
            <ClockIcon size={12} className="shrink-0" />
            <span>Criada {elapsed}</span>
            {delivery.deliveryTimingLabel && (
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${delivery.deliveryTimingState === "late" ? "bg-red-50 text-brand-red dark:bg-red-950/20" : "bg-green-50 text-brand-green dark:bg-green-950/20"}`}>
                {delivery.deliveryTimingLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown
              onStatus={() => onQuickStatusChange?.(delivery.id, delivery.status)}
              onEdit={canEdit && onEdit ? onEdit : undefined}
              onCancel={delivery.status !== "cancelled" ? () => onQuickStatusChange?.(delivery.id, "cancelled") : undefined}
              cancelLabel="Cancelar entrega"
            />
          </div>
        </div>

        {/* Title Row: ID & Order Count & Status Badge */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">
            {delivery.orderDisplayId}
          </span>
          {delivery.orderCount > 1 && (
            <span className="bg-brand-slate dark:bg-dark-border text-brand-dark dark:text-dark-heading text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
              +{delivery.orderCount - 1} ped.
            </span>
          )}
        </div>

        {/* Description / Customer info */}
        <div className="space-y-1">
          <h4 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
            {delivery.customerName}
          </h4>

          {delivery.customerAddress ? (
            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-normal line-clamp-2" title={delivery.customerAddress}>
              {delivery.customerAddress}
            </p>
          ) : (
            <p className="text-xs italic text-brand-inactive-text dark:text-dark-body">
              Retirada no balcão / Sem endereço
            </p>
          )}
        </div>

        {/* Details Section: Driver & Fee */}
        <div className="mt-3.5 space-y-1.5 text-[11px] font-medium text-brand-inactive-text dark:text-dark-body border-t border-brand-border/40 dark:border-dark-border/40 pt-2.5">
          {delivery.deliveryPersonName ? (
            <div className="flex items-center gap-1.5 text-brand-dark dark:text-dark-heading min-w-0">
              {delivery.isPlatformDriver || delivery.is_platform_driver || delivery.platform_driver ? (
                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" className="w-3.5 h-3.5 object-contain shrink-0" />
              ) : (
                <UserIcon size={12} className="shrink-0 text-brand-inactive-text" />
              )}
              <span className="truncate">{delivery.deliveryPersonName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <UserIcon size={12} className="shrink-0" />
              <span>Sem entregador</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <TruckIcon size={12} className="shrink-0" />
              <span>Taxa: <strong className="text-brand-primary">{formatCurrency(delivery.deliveryFee || 0)}</strong></span>
            </div>

            {delivery.estimatedDurationMinutes ? (
              <span className="bg-brand-slate dark:bg-dark-border px-1.5 py-0.5 rounded text-[10px]">
                {delivery.estimatedDurationMinutes} min
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
