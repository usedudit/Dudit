"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown, DropdownItem } from "@/components/reusable"
import { EyeIcon } from "@/lib/icons"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import type { DemandRow } from "./ForecastListRow"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

interface ForecastGridCardProps {
  row: DemandRow
  onOpenProduct: (productId: string) => void
}

export const ForecastGridCard: React.FC<ForecastGridCardProps> = ({ row, onOpenProduct }) => {
  const missing = row.quantity - row.stockAvailable
  const isLow = row.minStock > 0 && row.stockAvailable <= row.minStock

  const getStatusBadge = () => {
    if (missing > 0) return <Badge variant="red">{`Falta ${missing}`}</Badge>
    if (isLow) return <Badge variant="orange">Baixo</Badge>
    return <Badge variant="green">Normal</Badge>
  }

  const imgSrc = row.images?.[0]
    ? getR2ImageUrl(row.images[0], "thumbnail")
    : PLACEHOLDER_IMAGE

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => onOpenProduct(row.id)}
      className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
    >
      <div className="flex gap-4 mb-2">
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border flex items-center justify-center">
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

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start gap-1">
            <h3
              className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate pr-1"
              title={row.name}
            >
              {row.name}
            </h3>
            {getStatusBadge()}
          </div>

          <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate mt-0.5">
            {row.unit ? `Unidade: ${row.unit}` : "Unidade padrão"}
          </div>
        </div>
      </div>

      {/* Rodapé com Qtd Prevista e Estoque Atual */}
      <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Qtd. Prevista</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {row.quantity} {row.unit || ""}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 items-end min-w-0">
            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Estoque Atual</span>
            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
              {row.stockAvailable}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end mt-1">
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <ActionsDropdown onView={() => onOpenProduct(row.id)}>
              <DropdownItem onClick={() => onOpenProduct(row.id)}>
                <EyeIcon size={18} /> Ver produto
              </DropdownItem>
            </ActionsDropdown>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default ForecastGridCard
