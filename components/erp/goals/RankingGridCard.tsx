"use client"

import React from "react"
import { motion } from "framer-motion"
import { Badge } from "@/components/reusable"
import { formatCurrency } from "@/lib/utils"

type RankingRow = {
  user_id: string
  seller_name: string
  total_amount: number
  progress_percent: number
  position: number
}

interface RankingGridCardProps {
  row: RankingRow
}

function getPositionBadge(position: number) {
  if (position === 1) return "🥇"
  if (position === 2) return "🥈"
  if (position === 3) return "🥉"
  return ""
}

const RankingGridCard = React.memo(function RankingGridCard({ row }: RankingGridCardProps) {
  const isTop3 = row.position <= 3

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-2xl border ${isTop3
        ? "border-brand-green bg-brand-green/5"
        : "border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface"
        } p-5 flex items-center justify-between gap-4 transition-all hover:shadow-sm`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${isTop3 ? "bg-brand-green text-white" : "bg-brand-gray text-brand-dark dark:bg-dark-border/60 dark:text-dark-heading"
            }`}
        >
          {row.position}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2 text-lg truncate">
            {row.seller_name} {isTop3 && getPositionBadge(row.position)}
          </p>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body">
            Total vendido:{" "}
            <span className="font-semibold text-brand-dark dark:text-dark-heading">
              {formatCurrency(row.total_amount)}
            </span>
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-brand-inactive-text mb-1 font-medium">Atingimento</p>
        <Badge variant={isTop3 ? "green" : "gray"} className="text-sm px-3 py-1">
          {row.progress_percent}%
        </Badge>
      </div>
    </motion.div>
  )
})

RankingGridCard.displayName = "RankingGridCard"

export default RankingGridCard