"use client"

import React from "react"
import { motion } from "framer-motion"
import { ActionsDropdown, Badge, Checkbox } from "@/components/reusable"
import { SparklesIcon, TagIcon } from "@/lib/icons"
import {
  CouponRow,
  getCouponApplyScopeLabel,
  getCouponCustomerScopeLabel,
  getCouponPrimaryMeta,
  getCouponStatusLabel,
  getCouponStatusVariant,
  getCouponUsageSummary,
  getCouponValiditySummary,
} from "@/lib/types/coupon"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
}

interface CouponListItemProps {
  coupon: CouponRow
  columns: ColumnDef[]
  selected: boolean
  onSelect: (id: string) => void
  onDetails: (coupon: CouponRow) => void
  onEdit?: (coupon: CouponRow) => void
  onToggleStatus?: (coupon: CouponRow) => void
  onDelete?: (coupon: CouponRow) => void
  onShare?: (coupon: CouponRow) => void
}

const CouponListItem = React.memo(
  ({ coupon, columns, selected, onSelect, onDetails, onEdit, onToggleStatus, onDelete, onShare }: CouponListItemProps) => {
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

    const renderCellContent = (columnId: string) => {
      switch (columnId) {
        case "coupon":
          return (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border shrink-0 flex items-center justify-center border border-brand-border dark:border-dark-border">
                <TagIcon className="w-4 h-4 text-brand-dark dark:text-dark-heading" />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[180px] leading-tight mb-0.5">
                  {coupon.code}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {getCouponPrimaryMeta(coupon)}
                </span>
              </div>
            </div>
          )
        case "scope":
          return (
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                {getCouponApplyScopeLabel(coupon.apply_scope)}
              </span>
              <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                {getCouponCustomerScopeLabel(coupon.customer_scope)}
              </span>
            </div>
          )
        case "usage":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{getCouponUsageSummary(coupon)}</span>
          )
        case "validity":
          return (
            <span className="text-[13px] font-medium text-brand-dark dark:text-dark-heading">{getCouponValiditySummary(coupon)}</span>
          )
        case "status":
          return (
            <div className={`flex ${getJustifyClass(columns.find((column) => column.id === "status")?.align)}`}>
              <div className="flex flex-wrap justify-end gap-2">
                {coupon.is_automatic && (
                  <Badge variant="purple" icon={<SparklesIcon />} className="whitespace-nowrap">
                    Automático
                  </Badge>
                )}
                <Badge variant={getCouponStatusVariant(coupon)} className="whitespace-nowrap">
                  {getCouponStatusLabel(coupon)}
                </Badge>
              </div>
            </div>
          )
        case "actions":
          return (
            <div className="flex justify-center action-btn" onClick={(event) => event.stopPropagation()}>
              <ActionsDropdown
                onView={() => onDetails(coupon)}
                onEdit={onEdit ? () => onEdit(coupon) : undefined}
                onCancel={onToggleStatus ? () => onToggleStatus(coupon) : undefined}
                cancelLabel={coupon.is_active ? "Desativar" : "Ativar"}
                onDelete={onDelete ? () => onDelete(coupon) : undefined}
                onShare={onShare ? () => onShare(coupon) : undefined}
              />
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
        className="group hover:[&:not(:has(.action-btn:hover))]:bg-brand-gray dark:hover:[&:not(:has(.action-btn:hover))]:bg-dark-border/10 transition-colors cursor-pointer bg-white dark:bg-dark-background"
        onClick={() => onDetails(coupon)}
      >
        <td
          className="p-2 pl-6 border-b border-brand-border dark:border-dark-border w-12"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox checked={selected} onChange={() => onSelect(coupon.id)} />
        </td>
        {columns.map((column) => (
          <td
            key={column.id}
            className={`p-2 border-b border-brand-border dark:border-dark-border ${getAlignClass(column.align)}`}
          >
            <div className={`flex items-center w-full min-w-0 ${getJustifyClass(column.align)}`}>
              {renderCellContent(column.id)}
            </div>
          </td>
        ))}
      </motion.tr>
    )
  },
)

CouponListItem.displayName = "CouponListItem"

export default CouponListItem
