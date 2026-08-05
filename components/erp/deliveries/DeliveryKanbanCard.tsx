"use client"

import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge } from "@/components/reusable"
import { DropdownItem } from "@/components/reusable/Dropdown"
import { formatCurrency } from "@/lib/utils"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import { ClockIcon, MapPinIcon, TruckIcon, UserIcon } from "@/lib/icons"

interface DeliveryKanbanCardProps {
  delivery: any
  onDetails: () => void
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

  const isClosed = ["delivered", "cancelled", "delivery_failed"].includes(delivery.status)

  // Style helper for channels (iFood, Site, PDV)
  const getChannelStyle = (source: string) => {
    const src = String(source || "").toLowerCase().trim()
    if (src === "ifood") {
      return "bg-red-50 text-red-600 border-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/40"
    }
    if (src === "site" || src === "store" || src === "website") {
      return "bg-emerald-50 text-emerald-600 border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
    }
    if (src === "pdv" || src === "presencial" || src === "pos") {
      return "bg-indigo-50 text-indigo-600 border-indigo-200/50 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/40"
    }
    return "bg-gray-50 text-gray-600 border-gray-200/50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700/40"
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", delivery.id)
    e.dataTransfer.effectAllowed = "move"
  }

  const formatChannelName = (src: string) => {
    const str = String(src || "").toLowerCase().trim()
    if (str === "ifood") return "iFood"
    if (str === "pdv" || str === "pos") return "PDV"
    if (str === "site" || str === "store" || str === "website") return "Site"
    return src.charAt(0).toUpperCase() + src.slice(1)
  }

  // Render dynamic action buttons on the footer
  const renderActionButtons = () => {
    if (isClosed) return null

    const handleActionClick = (e: React.MouseEvent, status: string) => {
      e.stopPropagation()
      onQuickStatusChange?.(delivery.id, status)
    }

    if (delivery.status === "preparing") {
      return (
        <div className="flex gap-2 w-full mt-4 pt-3 border-t border-brand-border dark:border-dark-border">
          <button
            onClick={(e) => handleActionClick(e, "sent")}
            className="flex-1 py-1.5 px-3 bg-brand-primary hover:bg-brand-dark text-white rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer"
          >
            Enviar p/ Rota
          </button>
          <button
            onClick={(e) => handleActionClick(e, "cancelled")}
            className="py-1.5 px-3 bg-gray-100 hover:bg-red-50 hover:text-red-600 dark:bg-dark-border dark:hover:bg-red-950/20 text-gray-500 dark:text-dark-body rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )
    }

    if (delivery.status === "sent" || delivery.status === "pickup_available") {
      return (
        <div className="flex gap-2 w-full mt-4 pt-3 border-t border-brand-border dark:border-dark-border">
          <button
            onClick={(e) => handleActionClick(e, "delivered")}
            className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer"
          >
            Entregue
          </button>
          <button
            onClick={(e) => handleActionClick(e, "delivery_failed")}
            className="py-1.5 px-3 bg-gray-100 hover:bg-red-50 hover:text-red-600 dark:bg-dark-border dark:hover:bg-red-950/20 text-gray-500 dark:text-dark-body rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer"
            title="Falha na entrega"
          >
            Falhou
          </button>
        </div>
      )
    }

    return null
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
            <ActionsDropdown onEdit={onDetails}>
              <DropdownItem onClick={() => onQuickStatusChange?.(delivery.id, delivery.status)}>Alterar Status de Entrega</DropdownItem>
            </ActionsDropdown>
          </div>
        </div>

        {/* Title Row: ID & Order Count */}
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
            <div className="flex items-center gap-1 text-brand-dark dark:text-dark-heading">
              <UserIcon size={12} className="shrink-0" />
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

      {/* Card Footer: Quick Actions */}
      {renderActionButtons()}
    </motion.div>
  )
}
