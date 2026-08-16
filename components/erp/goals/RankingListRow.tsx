"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"

export type RankingRow = {
  user_id: string
  seller_name: string
  total_amount: number
  progress_percent: number
  position: number
}

interface ColumnDef {
  id: string
  align?: "left" | "center" | "right"
  width?: string
  minWidth?: string
}

interface RankingListRowProps {
  row: RankingRow
  columns: ColumnDef[]
}

function getPositionBadge(position: number) {
  if (position === 1) return "🥇"
  if (position === 2) return "🥈"
  if (position === 3) return "🥉"
  return ""
}

const RankingListRow = React.memo(
  ({ row, columns }: RankingListRowProps) => {
    const isTop3 = row.position <= 3

    const renderCellContent = (colId: string) => {
      switch (colId) {
        case "position":
          return (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isTop3
                ? "bg-brand-green text-white"
                : "bg-brand-gray text-brand-dark dark:bg-dark-border/60 dark:text-dark-heading"
                }`}
            >
              {row.position}
            </div>
          )

        case "seller":
          return (
            <div className="flex items-center gap-3 text-left min-w-0">
              <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading truncate max-w-[200px] xl:max-w-[300px]">
                {row.seller_name}
              </span>
              {isTop3 && <span className="shrink-0">{getPositionBadge(row.position)}</span>}
            </div>
          )

        case "total":
          return (
            <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
              {formatCurrency(row.total_amount)}
            </span>
          )

        case "progress":
          return (
            <div className="flex items-center gap-2 min-w-[110px]">
              <div className="w-16 h-1.5 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden">
                <div
                  className="h-full bg-brand-green transition-all duration-300"
                  style={{ width: `${Math.min(100, row.progress_percent || 0)}%` }}
                />
              </div>
              <Badge variant={isTop3 ? "green" : "gray"}>{row.progress_percent || 0}%</Badge>
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
        className={`transition-colors ${isTop3 ? "bg-brand-green/5 hover:bg-brand-green/10" : "bg-white dark:bg-dark-background hover:bg-brand-gray dark:hover:bg-dark-border/10"}`}
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
    prev.row.user_id === next.row.user_id &&
    prev.row.seller_name === next.row.seller_name &&
    prev.row.total_amount === next.row.total_amount &&
    prev.row.progress_percent === next.row.progress_percent &&
    prev.row.position === next.row.position &&
    prev.columns === next.columns
)

RankingListRow.displayName = "RankingListRow"

export default RankingListRow
