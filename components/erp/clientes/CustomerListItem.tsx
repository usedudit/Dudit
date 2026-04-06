'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface CustomerListItemProps {
  customer: any
  columns: ColumnDef[]
  selected: boolean
  onSelect: (id: string) => void
  onEdit: (customer: any) => void
  onDelete: (customer: any) => void
  onDetails: (customer: any) => void
}

const CustomerListItem = React.memo(
  ({
    customer,
    columns,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onDetails,
  }: CustomerListItemProps) => {

    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "name":
          return (
            <div className="flex items-center gap-3 text-left">
              <UserProfileImage
                fullName={customer.name || "Cliente"}
                className="w-10 h-10 text-[14px]"
              />
              <div className="flex flex-col">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[200px] xl:max-w-[300px]">
                  {customer.name}
                </span>
                <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  ID {customer.id || "-"}
                </span>
              </div>
            </div>
          )

        case "orders":
          return (
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
              {customer.orders || 0}
            </span>
          )

        case "total_spent":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {customer.totalOrderValue ? `R$ ${customer.totalOrderValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
            </span>
          )

        case "store_credit":
          return (
            <span className={`text-[13px] font-bold ${customer.storeCredit > 0 ? 'text-brand-primary' : 'text-brand-inactive-text'}`}>
              {customer.storeCredit ? `R$ ${customer.storeCredit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
            </span>
          )

        case "status":
          return (
            <Badge variant={customer.status === 'ativo' ? "green" : customer.status === 'inativo' ? "gray" : "red"}>
              {customer.status === 'ativo' ? "Ativo" : customer.status === 'inativo' ? "Inativo" : "Bloqueado"}
            </Badge>
          )

        case "last_order":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {customer.lastOrderDate || "N/A"}
            </span>
          )

        case "actions":
          return (
            <div
              className="flex justify-center action-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <ActionsDropdown
                onView={() => onDetails(customer)}
                onEdit={() => onEdit(customer)}
                onDelete={() => onDelete(customer)}
              />
            </div>
          )

        default:
          return null
      }
    }

    const getAlignClass = (align?: string) => {
      if (align === "center") return "text-center justify-center"
      if (align === "right") return "text-right justify-end"
      return "text-left justify-start"
    }

    return (
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        onClick={() => onDetails(customer)}
      >
        <td
          className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox checked={selected} onChange={() => onSelect(customer.originalId)} />
        </td>

        {columns.map((col) => (
          <td
            key={col.id}
            className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(col.align)}`}
          >
            {renderCellContent(col.id)}
          </td>
        ))}
      </motion.tr>
    )
  },
  (prev, next) =>
    prev.customer === next.customer &&
    prev.selected === next.selected &&
    prev.columns === next.columns
)

CustomerListItem.displayName = "CustomerListItem"

export default CustomerListItem
