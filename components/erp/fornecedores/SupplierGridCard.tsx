'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatDate } from "@/lib/utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface SupplierGridCardProps {
  supplier: any
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onDetails: () => void
  onPrefetchMouseEnter?: () => void
  onPrefetchMouseLeave?: () => void
  onPrefetchTouchStart?: () => void
}

const SupplierGridCard = React.memo(
  ({
    supplier,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onDetails,
    onPrefetchMouseEnter,
    onPrefetchMouseLeave,
    onPrefetchTouchStart,
  }: SupplierGridCardProps) => {

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-4 hover:border-brand-dark/30 dark:hover:border-brand-gray/30 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
        onClick={onDetails}
        onMouseEnter={onPrefetchMouseEnter}
        onMouseLeave={onPrefetchMouseLeave}
        onTouchStart={onPrefetchTouchStart}
      >
        <div className="flex gap-4 mb-2">
          <UserProfileImage
            fullName={supplier.name || "Fornecedor"}
            imageUrl={supplier.image_url || supplier.imageUrl || supplier.avatar_url}
            className="w-12 h-12 text-lg"
          />

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex justify-between items-start gap-1">
              <div className="flex items-center min-w-0 pr-1 gap-2">
                <h3
                  className="font-bold text-[15px] text-brand-dark dark:text-dark-heading truncate"
                  title={supplier.name}
                >
                  <span className="truncate">{supplier.name}</span>
                </h3>
                <Tooltip text={`Status: ${supplier.status === "ativo" ? "Ativo" : "Inativo"}`}>
                  <Badge
                    variant={supplier.status === "ativo" ? "green" : "gray"}
                    className="whitespace-nowrap scale-90 shrink-0"
                  />
                </Tooltip>
              </div>

              <div className="shrink-0 -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected} onChange={onSelect} />
              </div>
            </div>

            {supplier.supplier_code && (
              <div className="text-xs text-brand-inactive-text dark:text-dark-body font-medium truncate">
                <span>{supplier.supplier_code}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto pt-3 border-t border-brand-border dark:border-dark-border flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Cidade</span>
              <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
                {supplier.city && supplier.state ? `${supplier.city}, ${supplier.state}` : supplier.city || supplier.state || "-"}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 items-end min-w-0">
              <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Última Compra</span>
              <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading truncate">
                {supplier.last_import_at ? formatDate(supplier.last_import_at) : "-"}
              </span>
            </div>
          </div>

          <div className="flex items-end justify-end mt-1">
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ActionsDropdown
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          </div>
        </div>
      </motion.div>
    )
  },
  (prev, next) =>
    prev.selected === next.selected &&
    prev.supplier.id === next.supplier.id &&
    prev.supplier.name === next.supplier.name &&
    prev.supplier.status === next.supplier.status &&
    prev.supplier.supplier_code === next.supplier.supplier_code &&
    prev.supplier.city === next.supplier.city &&
    prev.supplier.state === next.supplier.state &&
    prev.supplier.last_import_at === next.supplier.last_import_at &&
    (prev.supplier.image_url || null) === (next.supplier.image_url || null)
)

SupplierGridCard.displayName = "SupplierGridCard"

export default SupplierGridCard
