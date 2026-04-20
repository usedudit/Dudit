"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown } from "@/components/reusable"
import { formatCurrency, formatDate, formatTime } from "@/lib/utils"
import { getDeliveryStatusMeta } from "@/lib/orders/status"
import { TruckIcon } from "@/lib/icons"

interface DeliveryListItemProps {
  delivery: any
  columns: Array<{ id: string; align?: "left" | "center" | "right" }>
  onDetails: (delivery: any) => void
}

function getAlignClass(align?: string) {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

function getJustifyClass(align?: string) {
  if (align === "center") return "justify-center"
  if (align === "right") return "justify-end"
  return "justify-start"
}

const DeliveryListItem = React.memo(({ delivery, columns, onDetails }: DeliveryListItemProps) => {
  const statusMeta = getDeliveryStatusMeta(delivery.status)

  const renderCell = (id: string) => {
    switch (id) {
      case "order_id":
        return (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
              <TruckIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate">{delivery.orderDisplayId}</span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">{delivery.customerName}</span>
            </div>
          </div>
        )
      case "delivery_fee":
        return <span className="text-[13px] font-bold text-brand-primary">{formatCurrency(delivery.deliveryFee || 0)}</span>
      case "status":
        return <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      case "delivery_person":
        return <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{delivery.deliveryPersonName || "Não atribuído"}</span>
      case "estimated_time":
        return <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{delivery.estimatedDurationMinutes ? `${delivery.estimatedDurationMinutes} min` : "-"}</span>
      case "dates":
        return (
          <div className="flex flex-col text-left">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">{delivery.startedAt ? formatDate(delivery.startedAt) : "-"}</span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body">
              Prev.: {delivery.estimatedArrivalAt ? `${formatDate(delivery.estimatedArrivalAt)} ${formatTime(delivery.estimatedArrivalAt)}` : "-"}
            </span>
          </div>
        )
      case "delivered_at":
        return <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">{delivery.deliveredAt ? `${formatDate(delivery.deliveredAt)} ${formatTime(delivery.deliveredAt)}` : "-"}</span>
      case "actions":
        return (
          <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown onEdit={() => onDetails(delivery)} />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="group hover:bg-brand-gray dark:hover:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
      onClick={() => onDetails(delivery)}
    >
      {columns.map((col) => (
        <td key={col.id} className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}>
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>{renderCell(col.id)}</div>
        </td>
      ))}
    </motion.tr>
  )
})

DeliveryListItem.displayName = "DeliveryListItem"

export default DeliveryListItem
