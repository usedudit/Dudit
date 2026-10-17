"use client"

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { WrenchIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"

interface ServiceOrderGridCardProps {
  order: any
  selected: boolean
  onSelect: () => void
  onDetails: () => void
  onEdit?: () => void
  onStatus?: () => void
  onShare?: () => void
  onPrint?: () => void
  onDelete?: () => void
  statusColor: string
  statusLabel: string
  teamMembers?: any[]
  /** Prefetch handlers for hover/touch-based entity preloading */
  onPrefetchMouseEnter?: () => void
  onPrefetchMouseLeave?: () => void
  onPrefetchTouchStart?: () => void
}

const ServiceOrderGridCard = React.memo(
  ({
    order,
    selected,
    onSelect,
    onDetails,
    onEdit,
    onStatus,
    onShare,
    onPrint,
    onDelete,
    statusColor,
    statusLabel,
    teamMembers = [],
    onPrefetchMouseEnter,
    onPrefetchMouseLeave,
    onPrefetchTouchStart,
  }: ServiceOrderGridCardProps) => {
    const formatDate = (d: string) => {
      if (!d) return "-"
      return new Date(d).toLocaleDateString("pt-BR")
    }

    const assignedMember = teamMembers.find(m => m.userId === order.assigned_user_id)
    const assignedName = assignedMember ? (assignedMember.fullName || assignedMember.name) : "-"

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
        onClick={onDetails}
        onMouseEnter={onPrefetchMouseEnter}
        onMouseLeave={onPrefetchMouseLeave}
        onTouchStart={onPrefetchTouchStart}
      >
        <div className="flex gap-4 mb-2">
          {/* Visual Indicator */}
          <div className="w-12 h-12 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
            <WrenchIcon className="w-6 h-6 text-brand-inactive-text dark:text-dark-body" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Row 1: ID + Badge + Checkbox */}
            <div className="flex justify-between items-start gap-1">
              <div className="flex items-center gap-2 min-w-0 pr-1 flex-nowrap">
                <h3
                  className="font-bold text-[14px] text-brand-dark dark:text-dark-heading leading-tight truncate shrink-0"
                  title={order.order_number}
                >
                  {order.order_number}
                </h3>
                <div className="flex items-center shrink-0">
                  <Tooltip text={`Status: ${statusLabel}`}>
                    <Badge
                      variant={statusColor as any}
                      className="whitespace-nowrap scale-90 shrink-0"
                    />
                  </Tooltip>
                </div>
              </div>

              {/* Checkbox */}
              <div className="shrink-0 -mt-0.5 -mr-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onChange={onSelect} />
              </div>
            </div>

            {/* Row 2: Title of the OS */}
            <div className="text-sm font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {order.title}
            </div>
          </div>
        </div>

        {/* Info Rows */}
        <div className="mt-auto pt-4 border-t border-brand-border dark:border-dark-border flex flex-col gap-3">
          {/* Row 1: Cliente & Emissão */}
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cliente</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                {order.customer_snapshot?.name || "Sem cliente"}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end shrink-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Emissão</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                {formatDate(order.created_at)}
              </span>
            </div>
          </div>

          {/* Row 2: Responsável & Previsão */}
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Responsável</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
                {assignedName}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end shrink-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body text-right">Previsão</span>
              <span className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                {order.expected_completion_date ? formatDate(order.expected_completion_date) : "Não definida"}
              </span>
            </div>
          </div>

          {/* Row 3: Valor & Actions */}
          <div className="flex justify-between items-center gap-2">
            <div></div>
            {/* Botão de Ações */}
            <div
              className="shrink-0 flex items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-bold text-brand-primary mr-1">
                {formatCurrency(order.total_amount || 0)}
              </span>
              <ActionsDropdown
                onEdit={onEdit}
                onStatus={onStatus}
                onShare={onShare}
                onPrint={onPrint}
                onDelete={onDelete}
              />
            </div>
          </div>
        </div>
      </motion.div>
    )
  },
)

ServiceOrderGridCard.displayName = "ServiceOrderGridCard"
export default ServiceOrderGridCard
