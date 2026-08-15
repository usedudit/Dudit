'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface SupplierListRowProps {
  supplier: any
  columns: ColumnDef[]
  selected: boolean
  onSelect: (id: string) => void
  onEdit: (supplier: any) => void
  onDelete: (supplier: any) => void
  onDetails: (supplier: any) => void
  onPrefetchMouseEnter?: () => void
  onPrefetchMouseLeave?: () => void
  onPrefetchTouchStart?: () => void
}

const SupplierListRow = React.memo(
  ({
    supplier,
    columns,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onDetails,
    onPrefetchMouseEnter,
    onPrefetchMouseLeave,
    onPrefetchTouchStart,
  }: SupplierListRowProps) => {

    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "name":
          return (
            <div className="flex items-center gap-3 text-left">
              <UserProfileImage
                fullName={supplier.name || "Fornecedor"}
                imageUrl={supplier.image_url || supplier.imageUrl || supplier.avatar_url}
                className="w-10 h-10 text-[14px]"
              />
              <div className="flex flex-col">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                  {supplier.name}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {supplier.document || supplier.cnpj || supplier.cpf || ""}
                </span>
              </div>
            </div>
          )

        case "contacts":
          return (
            <div className="flex flex-col">
              {supplier.email && <span className="text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px]">{supplier.email}</span>}
              {supplier.phone && <span className="text-xs text-brand-inactive-text dark:text-dark-body">{formatBrazilPhone(supplier.phone)}</span>}
              {!supplier.email && !supplier.phone && <span className="text-[13px] text-brand-inactive-text">-</span>}
            </div>
          )

        case "imports":
          return (
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
              {supplier.xml_count || 0}
            </span>
          )

        case "total":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {supplier.total_imported_value ? formatCurrency(supplier.total_imported_value) : "-"}
            </span>
          )

        case "status":
          return (
            <Badge variant={supplier.status === "ativo" ? "green" : "gray"}>
              {supplier.status === "ativo" ? "Ativo" : "Inativo"}
            </Badge>
          )

        case "code":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {supplier.supplier_code || "-"}
            </span>
          )

        case "actions":
          return (
            <div
              className="flex justify-center action-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <ActionsDropdown
                onEdit={() => onEdit(supplier)}
                onDelete={() => onDelete(supplier)}
              />
            </div>
          )

        default:
          return null
      }
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

    return (
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        onClick={() => onDetails(supplier)}
        onMouseEnter={onPrefetchMouseEnter}
        onMouseLeave={onPrefetchMouseLeave}
        onTouchStart={onPrefetchTouchStart}
      >
        <td
          className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onChange={() => onSelect(supplier.id)} />
        </td>

        {columns.map((col) => (
          <td
            key={col.id}
            className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
          >
            <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
              {renderCellContent(col.id)}
            </div>
          </td>
        ))}
      </motion.tr>
    )
  },
  (prev, next) =>
    prev.supplier.id === next.supplier.id &&
    prev.supplier.name === next.supplier.name &&
    prev.supplier.status === next.supplier.status &&
    prev.supplier.xml_count === next.supplier.xml_count &&
    prev.supplier.total_imported_value === next.supplier.total_imported_value &&
    (prev.supplier.image_url || null) === (next.supplier.image_url || null) &&
    prev.selected === next.selected &&
    prev.columns === next.columns
)

SupplierListRow.displayName = "SupplierListRow"

export default SupplierListRow
