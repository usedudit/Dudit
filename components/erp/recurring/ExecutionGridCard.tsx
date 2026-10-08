"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { ClockIcon } from "@/lib/icons"
import { getRecurringExecutionStatusLabel } from "@/lib/types/recurring"
import { formatDate, formatDateTime } from "@/lib/utils"

interface ExecutionGridCardProps {
  execution: any
  onOpenOrder?: (orderId: string) => void
}

const statusVariant = (status: string) => {
  if (status === "completed") return "green" as const
  if (status === "failed") return "red" as const
  if (status === "awaiting_payment") return "orange" as const
  return "gray" as const
}

export const ExecutionGridCard: React.FC<ExecutionGridCardProps> = ({ execution, onOpenOrder }) => {
  const orderNumber = execution.orders?.order_number

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => (execution.order_id && onOpenOrder ? onOpenOrder(execution.order_id) : undefined)}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      <div className="flex gap-4 mb-2">
        <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
          <ClockIcon size={18} className="text-brand-inactive-text dark:text-dark-body" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                title={formatDate(execution.scheduled_for)}
              >
                <span className="truncate">{formatDate(execution.scheduled_for) || "—"}</span>
              </h3>
              <Badge variant={statusVariant(execution.status)} className="whitespace-nowrap scale-90 shrink-0">
                {getRecurringExecutionStatusLabel(execution.status)}
              </Badge>
            </div>
          </div>

          <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
            {orderNumber ? `Pedido #${orderNumber}` : "Sem pedido gerado"}
          </div>

          {execution.error_message && (
            <div className="text-xs text-brand-red font-medium truncate mt-0.5">{execution.error_message}</div>
          )}
        </div>
      </div>

      {/* Área do Rodapé */}
      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Agendada</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {formatDate(execution.scheduled_for) || "—"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Concluída em</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {execution.completed_at ? formatDateTime(execution.completed_at) : "—"}
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between mt-1">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Pedido</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
              {orderNumber ? `#${orderNumber}` : "—"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ExecutionGridCard
