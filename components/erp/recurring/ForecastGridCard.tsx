"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, Tooltip, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { BlockedIcon, PlayIcon, RepeatIcon, ClockIcon } from "@/lib/icons"
import { getRecurringFrequencyLabel, getRecurringStatusLabel, getRecurringStatusVariant } from "@/lib/types/recurring"
import { formatDate, formatCurrency } from "@/lib/utils"
import { getForecastLabel, getForecastLabelVariant, type ForecastRow } from "./ForecastListRow"

interface ForecastGridCardProps {
  row: ForecastRow
  canManage: boolean
  onOpen: (id: string) => void
  onRunAction: (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", id: string) => void
}

export const ForecastGridCard: React.FC<ForecastGridCardProps> = ({ row, canManage, onOpen, onRunAction }) => {
  const canCancel = canManage && row.status !== "cancelled" && row.status !== "expired"
  const customerLabel = row.customerName || "Cliente"

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
        <UserProfileImage
          fullName={customerLabel}
          imageUrl={row.customerImage || undefined}
          className="w-12 h-12 text-lg"
        />

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-1">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <h3
                className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                title={row.planName}
              >
                <span className="truncate">{row.planName}</span>
              </h3>
              <Tooltip text={`Status: ${getRecurringStatusLabel((row.status || "active") as any)}`}>
                <Badge
                  variant={getRecurringStatusVariant((row.status || "active") as any)}
                  className="whitespace-nowrap scale-90 shrink-0"
                />
              </Tooltip>
            </div>
            <Badge variant={getForecastLabelVariant(row.scheduledFor)} className="text-[10px] shrink-0 whitespace-nowrap">
              {getForecastLabel(row.scheduledFor)}
            </Badge>
          </div>

          <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
            {customerLabel}
          </div>

          <div className="text-xs text-brand-primary font-medium mt-0.5 truncate">
            {row.frequencyType
              ? `Recorrência: ${getRecurringFrequencyLabel(row.frequencyType as any, Number(row.frequencyInterval || 1))}`
              : "Recorrência -"}
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Previsão</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {formatDate(row.scheduledFor) || "-"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Próxima Cobrança</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {formatCurrency(Number(row.amount || 0))}
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between mt-1">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Modalidade</span>
            <span className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">
              {row.deliveryType === "delivery" ? "Entrega" : "Retirada no local"}
            </span>
          </div>

          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown
              onView={() => onOpen(row.id)}
              onCancel={canCancel ? () => onRunAction("cancel", row.id) : undefined}
              cancelLabel="Cancelar assinatura"
            >
              <DropdownItem onClick={() => onOpen(row.id)}>
                <ClockIcon size={18} /> Ver assinatura
              </DropdownItem>
              {canManage && row.status === "active" && (
                <DropdownItem onClick={() => onRunAction("pause", row.id)}>
                  <BlockedIcon size={18} /> Pausar
                </DropdownItem>
              )}
              {canManage && row.status === "paused" && (
                <DropdownItem onClick={() => onRunAction("resume", row.id)}>
                  <PlayIcon size={18} /> Reativar
                </DropdownItem>
              )}
              {canManage && row.mpPreapprovalId && (
                <DropdownItem onClick={() => onRunAction("sync", row.id)}>
                  <RepeatIcon size={18} /> Sincronizar com MP
                </DropdownItem>
              )}
            </ActionsDropdown>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ForecastGridCard
