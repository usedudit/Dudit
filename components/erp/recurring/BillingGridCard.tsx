"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { RepeatIcon } from "@/lib/icons"
import { formatDate, formatCurrency } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { getBillingStatusConfig, type BillingRow } from "./BillingListRow"

interface BillingGridCardProps {
  row: BillingRow
  onOpen: (orderId: string) => void
  onOpenSubscription?: (subscriptionId: string) => void
}

export const BillingGridCard: React.FC<BillingGridCardProps> = ({ row, onOpen, onOpenSubscription }) => {
  const status = getBillingStatusConfig(row.situation)
  const customerLabel = row.customer_name || "Cliente"

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => onOpen(row.id)}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      <div className="flex gap-4 mb-2">
        <UserProfileImage fullName={customerLabel} className="w-12 h-12 text-lg" />

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                title={row.order_number || row.id}
              >
                <span className="truncate">#{row.order_number || row.id.slice(0, 8)}</span>
              </h3>
              <Badge variant={status.variant} className="whitespace-nowrap scale-90 shrink-0">
                {status.label}
              </Badge>
            </div>
          </div>

          <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">{customerLabel}</div>

          <div className="text-xs text-brand-primary font-medium mt-0.5 truncate">
            {row.payment_method ? `Pagamento: ${row.payment_method}` : "Cobrança de assinatura"}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Data</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {row.created_at ? formatDate(row.created_at) : "-"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Valor</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {formatCurrency(Number(row.total_amount || 0))}
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between mt-1">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Situação</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{status.label}</span>
          </div>

          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown onView={() => onOpen(row.id)}>
              {onOpenSubscription && row.recurring_subscription_id && (
                <DropdownItem onClick={() => onOpenSubscription(row.recurring_subscription_id as string)}>
                  <RepeatIcon size={18} /> Ver assinatura
                </DropdownItem>
              )}
            </ActionsDropdown>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default BillingGridCard
