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
        <div className="flex gap-4 mb-2">
          {/* Icone da OS */}
          <div className="w-18 h-18 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
            <WrenchIcon className="w-8 h-8 text-brand-inactive-text dark:text-dark-body" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {/* Linha 1: Numero + Checkbox */}
            <div className="flex justify-between items-start gap-1">
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <h3
                  className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                  title={order.order_number}
                >
                  {order.order_number}
                </h3>
              </div>

              {/* Checkbox */}
              <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onCheckedChange={onSelect} />
              </div>
            </div>

            {/* Linha 2: Data de Criacao */}
            <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
              Criada em: {formatDate(order.created_at)}
            </div>
          </div>
        </div>

        {/* Corpo: Titulo e Cliente */}
        <div className="flex-1 min-w-0 mb-3 mt-2">
          <p className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate mb-1">
            {order.title}
          </p>
          <p className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
            Cliente: {order.customer_snapshot?.name || "Sem cliente"}
          </p>
        </div>

        {/* Rodape: Status, Total e Data Prevista */}
        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">Status</span>
              <Badge variant={statusColor as any} className="whitespace-nowrap scale-90 origin-left">
                {statusLabel}
              </Badge>
            </div>

            <div className="flex flex-col gap-0.5 items-end">
              <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">Total</span>
              <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                {formatCurrency(order.total_amount || 0)}
              </span>
            </div>
          </div>

          {order.expected_completion_date && (
            <div className="text-[10px] font-medium text-brand-inactive-text dark:text-dark-body text-left mt-1">
              Previsão: {formatDate(order.expected_completion_date)}
            </div>
          )}
        </div>
      </motion.div>
    )
  },
)

ServiceOrderGridCard.displayName = "ServiceOrderGridCard"
export default ServiceOrderGridCard
