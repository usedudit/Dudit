'use client';

import React from "react"
import { motion } from "framer-motion"
import { Badge, ActionsDropdown } from "@/components/reusable"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { formatCurrency } from "@/lib/utils"
import type { SellerCommissionRow } from "@/app/actions/erp/produtividade"

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface CommissionListItemProps {
  seller: SellerCommissionRow
  columns: ColumnDef[]
  isExpanded: boolean
  onToggleExpand: () => void
  canPayCommission: boolean
  onPay: () => void
}

const CommissionListItem = React.memo(
  ({
    seller,
    columns,
    isExpanded,
    onToggleExpand,
    canPayCommission,
    onPay,
  }: CommissionListItemProps) => {
    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "seller":
          return (
            <div className="flex items-center gap-3 text-left">
              <UserProfileImage
                fullName={seller.name || "Vendedor"}
                imageUrl={seller.avatarUrl}
                className="w-10 h-10 text-[14px]"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[150px] xl:max-w-[250px]">
                  {seller.name}
                </span>
                <span className="text-xs font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {seller.commissionType === "percentage_sale"
                    ? `${seller.commissionValue}%`
                    : seller.commissionType === "fixed_per_sale"
                      ? `R$ ${seller.commissionValue}`
                      : "Sem comissão"}
                </span>
              </div>
            </div>
          )

        case "pending":
          return (
            <span className="text-[13px] font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(seller.pendingAmount)}
            </span>
          )

        case "paid":
          return (
            <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(seller.paidAmount)}
            </span>
          )

        case "bonus":
          return (
            <span className="text-[13px] font-bold text-purple-600 dark:text-purple-400">
              {formatCurrency(seller.bonusAmount)}
            </span>
          )

        case "total":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {formatCurrency(seller.totalAccumulated)}
            </span>
          )

        case "actions":
          return (
            <div className="flex items-center justify-center gap-1 action-btn" onClick={(e) => e.stopPropagation()}>
              {canPayCommission && seller.pendingAmount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPay()
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap"
                >
                  Pagar
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand()
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-brand-gray dark:hover:bg-dark-border/30 transition-colors"
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-brand-inactive-text transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
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
        onClick={onToggleExpand}
      >
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
    prev.seller.partnerUserId === next.seller.partnerUserId &&
    prev.seller.pendingAmount === next.seller.pendingAmount &&
    prev.seller.paidAmount === next.seller.paidAmount &&
    prev.seller.bonusAmount === next.seller.bonusAmount &&
    prev.seller.totalAccumulated === next.seller.totalAccumulated &&
    prev.isExpanded === next.isExpanded &&
    prev.canPayCommission === next.canPayCommission &&
    prev.columns === next.columns
)

CommissionListItem.displayName = "CommissionListItem"

export default CommissionListItem
