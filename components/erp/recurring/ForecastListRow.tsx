"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { EyeIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
export { getForecastLabel, getForecastLabelVariant } from "./SubscriptionListRow"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

export interface DemandRow {
  id: string
  name: string
  unit: string | null
  images: string[] | null
  quantity: number
  stockAvailable: number
  minStock: number
}

// Aliasing for backwards compatibility
export type ForecastRow = DemandRow

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
}

interface ForecastListRowProps {
  row: DemandRow
  columns: ColumnDef[]
  onOpenProduct: (productId: string) => void
}

export const ForecastListRow: React.FC<ForecastListRowProps> = ({
  row,
  columns,
  onOpenProduct,
}) => {
  const missing = row.quantity - row.stockAvailable
  const isLow = row.minStock > 0 && row.stockAvailable <= row.minStock

  const getStatusBadge = () => {
    if (missing > 0) return <Badge variant="red">{`Falta ${missing}`}</Badge>
    if (isLow) return <Badge variant="orange">Baixo</Badge>
    return <Badge variant="green">Normal</Badge>
  }

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
      case "product":
        const imgSrc = row.images?.[0]
          ? getR2ImageUrl(row.images[0], "thumbnail")
          : PLACEHOLDER_IMAGE
        return (
          <div className="flex items-center gap-3 text-left min-w-0">
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border flex items-center justify-center">
              <img
                src={imgSrc}
                alt={row.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE
                }}
              />
            </div>
            <div className="flex flex-col text-left min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[280px]">
                {row.name}
              </span>
              <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                {row.unit ? `Unidade: ${row.unit}` : "Unidade padrão"}
              </span>
            </div>
          </div>
        )
      case "quantity":
        return (
          <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
            {row.quantity}
            {row.unit ? ` ${row.unit}` : ""}
          </span>
        )
      case "stock":
        return (
          <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
            {row.stockAvailable}
          </span>
        )
      case "status":
        return getStatusBadge()
      case "actions":
        return (
          <div className="flex justify-center action-btn" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown onView={() => onOpenProduct(row.id)}>
              <DropdownItem onClick={() => onOpenProduct(row.id)}>
                <EyeIcon size={18} /> Ver produto
              </DropdownItem>
            </ActionsDropdown>
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
      onClick={() => onOpenProduct(row.id)}
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
