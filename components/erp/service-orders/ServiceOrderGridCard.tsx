"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge } from "@/components/reusable"
import { WrenchIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { r2PublicConfig } from "@/lib/r2/r2-public"

interface ServiceOrderGridCardProps {
  order: any
  selected: boolean
  onSelect: () => void
  onDetails: () => void
  statusColor: string
  statusLabel: string
}

const ServiceOrderGridCard = React.memo(
  ({
    order,
    selected,
    onSelect,
    onDetails,
    statusColor,
    statusLabel,
  }: ServiceOrderGridCardProps) => {
    const formatDate = (d: string) => {
      if (!d) return "-"
      return new Date(d).toLocaleDateString("pt-BR")
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={`bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative ${
          selected ? "ring-2 ring-brand-green" : ""
        }`}
        onClick={onDetails}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
              <WrenchIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate">
                {order.order_number}
              </h3>
              <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate mt-0.5">
                {formatDate(order.created_at)}
              </p>
            </div>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={onSelect}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 mb-3">
          <p className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate mb-1">
            {order.title}
          </p>
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
            {order.customer_snapshot?.name || "Sem cliente"}
          </p>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-brand-border dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Badge variant={statusColor as any}>
              {statusLabel}
            </Badge>
          </div>
          <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
            {formatCurrency(order.total_amount || 0)}
          </span>
        </div>

        {order.expected_completion_date && (
          <div className="mt-2 text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">
            Prevista: {formatDate(order.expected_completion_date)}
          </div>
        )}
      </motion.div>
    )
  },
)

ServiceOrderGridCard.displayName = "ServiceOrderGridCard"
export default ServiceOrderGridCard
