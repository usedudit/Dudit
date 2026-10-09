"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { ClockIcon, BlockedIcon, PlayIcon, RepeatIcon } from "@/lib/icons"
import { getRecurringFrequencyLabel, getRecurringStatusLabel, getRecurringStatusVariant } from "@/lib/types/recurring"
import { formatDate, formatCurrency } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

export interface ForecastRow {
  id: string
  customerId?: string | null
  customerName: string
  customerEmail?: string | null
  customerImage?: string | null
  planId?: string | null
  planName: string
  frequencyType?: string | null
  frequencyInterval?: number | null
  status?: string
  deliveryType?: string
  deliveryAddress?: string | null
  shippingAmount?: number
  billingMode?: string
  mpPreapprovalId?: string | null
  amount?: number
  scheduledFor: string
}

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
}

interface ForecastListRowProps {
  row: ForecastRow
  columns: ColumnDef[]
  canManage: boolean
  onOpen: (id: string) => void
  onRunAction: (action: "pause" | "resume" | "cancel" | "resolve_stock" | "sync", id: string) => void
}

/** Rotulo da previsao: Hoje / Amanhã / em N dias / atrasada */
export const getForecastLabel = (raw: string | null | undefined): string => {
  if (!raw) return ""
  const target = new Date(raw)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000)

  if (diffDays < 0) return `Atrasada ${Math.abs(diffDays)}d`
  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Amanhã"
  return `Em ${diffDays} dias`
}

export const getForecastLabelVariant = (raw: string | null | undefined): "green" | "orange" | "red" | "gray" => {
  if (!raw) return "gray"
  const label = getForecastLabel(raw)
  if (label.startsWith("Atrasada")) return "red"
  if (label === "Hoje") return "orange"
  if (label === "Amanhã") return "green"
  return "gray"
}

export const ForecastListRow: React.FC<ForecastListRowProps> = ({
  row,
  columns,
  canManage,
  onOpen,
  onRunAction,
}) => {
  const canCancel = canManage && row.status !== "cancelled" && row.status !== "expired"

  const getJustifyClass = (align?: string) => {
    if (align === "center") return "justify-center"
    if (align === "right") return "justify-end"
    return "justify-start"
  }

  const getAlignClass = (align?: string) => {
    if (align === "center") return "text-center"
    if (align === "right") return "text-right"
    return "text-left"
  }

  const renderCellContent = (colId: string) => {
    switch (colId) {
      case "customer":
        return (
          <div className="flex items-center gap-3 text-left min-w-0">
            <UserProfileImage
              fullName={row.customerName || "Cliente"}
              imageUrl={row.customerImage || undefined}
              className="w-10 h-10 text-[14px]"
            />
            <div className="flex flex-col text-left min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px]">
                {row.customerName}
              </span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {row.customerEmail || "—"}
              </span>
            </div>
          </div>
        )
      case "plan":
        return (
          <div className="flex flex-col text-left min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
              {row.planName}
            </span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {row.frequencyType
                ? getRecurringFrequencyLabel(row.frequencyType as any, Number(row.frequencyInterval || 1))
                : "—"}
            </span>
          </div>
        )
      case "scheduledFor":
        return (
          <div className="flex flex-col items-start gap-1.5">
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
              {formatDate(row.scheduledFor)}
            </span>
            <Badge variant={getForecastLabelVariant(row.scheduledFor)}>
              {getForecastLabel(row.scheduledFor)}
            </Badge>
          </div>
        )
      case "value":
        return (
          <div className="flex flex-col items-end min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
              {formatCurrency(Number(row.amount || 0))}
            </span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
              {row.billingMode === "auto_mercado_pago" ? "Mercado Pago" : "Manual"}
            </span>
          </div>
        )
      case "modality":
        return (
          <div className="flex flex-col text-left min-w-0">
            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate">
              {row.deliveryType === "delivery" ? "Entrega" : "Retirada no local"}
            </span>
            <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate max-w-[160px]">
              {row.deliveryType === "delivery"
                ? row.deliveryAddress || "Endereço não informado"
                : formatCurrency(Number(row.shippingAmount || 0))}
            </span>
          </div>
        )
      case "actions":
        return (
          <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
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
        )
      default:
        return (
          <div className="flex flex-col text-left min-w-0">
            <Badge variant={getRecurringStatusVariant((row.status || "active") as any)}>
              {getRecurringStatusLabel((row.status || "active") as any)}
            </Badge>
          </div>
        )
    }
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => onOpen(row.id)}
      className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/20 transition-colors cursor-pointer bg-white dark:bg-dark-background"
    >
      {columns.map((col, index) => (
        <td
          key={col.id}
          className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)} ${index === 0 ? "pl-6" : ""} ${col.id === "actions" ? "pr-6" : ""}`}
        >
          <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
            {renderCellContent(col.id)}
          </div>
        </td>
      ))}
    </motion.tr>
  )
}

export default ForecastListRow
