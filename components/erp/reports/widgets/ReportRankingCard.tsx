"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { AwardIcon } from "@/lib/icons"
import { CHART_COLORS } from "@/components/erp/dashboard/charts/DashboardCharts"

export interface RankingItem {
  id: string
  label: string
  value: string | number
  subtitle?: string
  trend?: string
  trendDirection?: "up" | "down" | "stable"
}

interface ReportRankingCardProps {
  title: string
  items: RankingItem[]
  maxItems?: number
  valueLabel?: string
  className?: string
  variant?: "default" | "compact"
  icon?: React.ElementType
}

function RankBadge({ position }: { position: number }) {
  if (position <= 3) {
    return (
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
        position === 1 && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        position === 2 && "bg-slate-100 text-slate-600 dark:bg-slate-800/30 dark:text-slate-300",
        position === 3 && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      )}>
        {position}
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0 text-xs font-bold text-brand-inactive-text dark:text-dark-body">
      {position}
    </div>
  )
}

export function ReportRankingCard({
  title,
  items,
  maxItems = 8,
  valueLabel,
  className,
  variant = "default",
  icon: Icon
}: ReportRankingCardProps) {
  const ranked = items.slice(0, maxItems)

  return (
    <div className={cn(
      "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border",
      className
    )}>
      {Icon ? (
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
            <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
          </div>
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
        </div>
      ) : (
        <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">{title}</h3>
      )}

      <div className="space-y-4">
        {ranked.map((item, i) => (
          <div key={item.id} className="flex items-center gap-4">
            <RankBadge position={i + 1} />

            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading truncate">
                {item.label}
              </div>
              {item.subtitle && (
                <div className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body truncate">
                  {item.subtitle}
                </div>
              )}
            </div>

            <div className="text-right shrink-0">
              <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading">
                {item.value}
              </div>
              {item.trend && (
                <div className={cn(
                  "text-[11px] font-semibold",
                  item.trendDirection === "up" && "text-brand-green",
                  item.trendDirection === "down" && "text-[#cc4745]",
                  (!item.trendDirection || item.trendDirection === "stable") && "text-brand-inactive-text"
                )}>
                  {item.trend}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="py-8 text-center">
          <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhum dado disponível.</span>
        </div>
      )}
    </div>
  )
}
