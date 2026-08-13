'use client';

import React from "react"
import { motion } from "framer-motion"
import { Checkbox, Badge, ActionsDropdown, Tooltip } from "@/components/reusable"
import { formatCurrency, checkBirthday } from "@/lib/utils";
import { formatBrazilMobile } from "@/lib/utils/phone-utils"
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
  onArchive?: (customer: any) => void
  onUnarchive?: (customer: any) => void
  onDetails: (customer: any) => void
  /** Prefetch handlers for hover/touch-based entity preloading */
  onPrefetchMouseEnter?: () => void
  onPrefetchMouseLeave?: () => void
  onPrefetchTouchStart?: () => void
  showBirthdayBadge?: boolean
}

const CustomerListItem = React.memo(
  ({
    customer,
    columns,
    selected,
    onSelect,
    onEdit,
    onDelete,
    onArchive,
    onUnarchive,
    onDetails,
    onPrefetchMouseEnter,
    onPrefetchMouseLeave,
    onPrefetchTouchStart,
    showBirthdayBadge,
  }: CustomerListItemProps) => {

    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "name": {
          const bdayInfo = checkBirthday(customer.birth_date)
          const birthdayBadge = showBirthdayBadge && bdayInfo && (bdayInfo.isToday || bdayInfo.isUpcoming) ? (
            <Tooltip
              text={bdayInfo.isToday ? "Cliente faz aniversário hoje" : `Cliente faz aniversário em ${bdayInfo.daysUntil} dias`}
            >
              <Badge variant={bdayInfo.isToday ? "purple" : "blue"} icon={null} className="select-none ml-2 shrink-0 scale-90">
                🎂 {bdayInfo.isToday ? "Aniversário Hoje" : `Em ${bdayInfo.daysUntil} dias`}
              </Badge>
            </Tooltip>
          ) : null

          return (
            <div className="flex items-center gap-3 text-left">
              <UserProfileImage
                fullName={customer.name || "Cliente"}
                imageUrl={customer.image_url || customer.imageUrl || customer.avatar_url || customer.avatar}
                className="w-10 h-10 text-[14px]"
              />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center">
                  <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading mb-0.5 truncate max-w-[150px] xl:max-w-[250px]">
                    {customer.name}
                  </span>
                  {birthdayBadge}
                </div>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  ID {customer.id || "-"}
                </span>
              </div>
            </div>
          )
        }

        case "phone":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {customer.phone ? formatBrazilMobile(customer.phone) : "-"}
            </span>
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
              {customer.totalOrderValue ? formatCurrency(customer.totalOrderValue) : "-"}
            </span>
          )

        case "store_credit":
          return (
            <span className={`text-[13px] font-bold ${customer.storeCredit > 0 ? 'text-brand-primary' : 'text-brand-inactive-text'}`}>
              {customer.storeCredit ? formatCurrency(customer.storeCredit) : "-"}
            </span>
          )

        case "status": {
          const isArchived = customer.status === "arquivado" || customer.status === "archived"
          return (
            <Badge variant={isArchived ? "orange" : customer.status === 'ativo' ? "green" : customer.status === 'inativo' ? "gray" : "red"}>
              {isArchived ? "Arquivado" : customer.status === 'ativo' ? "Ativo" : customer.status === 'inativo' ? "Inativo" : "Bloqueado"}
            </Badge>
          )
        }

        case "last_order":
          return (
            <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
              {customer.lastOrderDate || "N/A"}
            </span>
          )

        case "actions": {
          const isArchived = customer.status === "arquivado" || customer.status === "archived"
          return (
            <div
              className="flex justify-center action-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <ActionsDropdown
                onEdit={() => onEdit(customer)}
                onDelete={() => onDelete(customer)}
                onArchive={!isArchived && onArchive ? () => onArchive(customer) : undefined}
                onUnarchive={isArchived && onUnarchive ? () => onUnarchive(customer) : undefined}
              />
            </div>
          )
        }

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
        onClick={() => onDetails(customer)}
        onMouseEnter={onPrefetchMouseEnter}
        onMouseLeave={onPrefetchMouseLeave}
        onTouchStart={onPrefetchTouchStart}
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
            <div className={`flex items-center w-full min-w-0 ${getJustifyClass(col.align)}`}>
              {renderCellContent(col.id)}
            </div>
          </td>
        ))}
      </motion.tr>
    )
  },
  (prev, next) =>
    prev.customer.originalId === next.customer.originalId &&
    prev.customer.name === next.customer.name &&
    prev.customer.status === next.customer.status &&
    prev.customer.phone === next.customer.phone &&
    prev.customer.orders === next.customer.orders &&
    prev.customer.totalOrderValue === next.customer.totalOrderValue &&
    prev.customer.lastOrderDate === next.customer.lastOrderDate &&
    prev.customer.storeCredit === next.customer.storeCredit &&
    prev.customer.birth_date === next.customer.birth_date &&
    prev.selected === next.selected &&
    prev.columns === next.columns &&
    prev.showBirthdayBadge === next.showBirthdayBadge
)

CustomerListItem.displayName = "CustomerListItem"

export default CustomerListItem
