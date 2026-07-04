"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from "@/lib/icons"

interface ComparisonItem {
  label: string
  current: string | number
  previous: string | number
  format?: "currency" | "number" | "percent" | "string"
  trend?: "up" | "down" | "stable"
}

interface ReportComparisonCardProps {
  title: string
  currentPeriodLabel: string
  previousPeriodLabel: string
  items: ComparisonItem[]
  className?: string
}

function formatValue(value: string | number, format?: string) {
  const num = typeof value === "number" ? value : Number(String(value).replace(/[^\d,.-]/g, "").replace(",", ".")) || value
  if (typeof num === "number" && !isNaN(num)) {
    if (format === "currency") {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num)
    }
    if (format === "percent") {
      return `${Math.round(num)}%`
    }
    if (format === "number") {
      return new Intl.NumberFormat("pt-BR").format(num)
    }
  }
  return String(value)
}

export function ReportComparisonCard({
  title,
  currentPeriodLabel,
  previousPeriodLabel,
  items,
  className,
}: ReportComparisonCardProps) {
  return (
    <div className={cn(
      "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border",
      className
    )}>
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">{title}</h3>

      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-3 items-center">
        <div className="text-[13px] font-semibold text-brand-inactive-text">Indicador</div>
        <div className="text-[13px] font-semibold text-brand-inactive-text text-right">{currentPeriodLabel}</div>
        <div className="text-[13px] font-semibold text-brand-inactive-text text-right">{previousPeriodLabel}</div>
        <div className="text-[13px] font-semibold text-brand-inactive-text text-right">Tendência</div>

        {items.map((item, i) => {
          const TrendIcon = item.trend === "up" ? ArrowUpIcon
            : item.trend === "down" ? ArrowDownIcon
            : MinusIcon

          return (
            <React.Fragment key={i}>
              <div className="text-[14px] font-medium text-brand-dark dark:text-dark-heading py-2">
                {item.label}
              </div>
              <div className="text-[14px] font-bold text-brand-dark dark:text-dark-heading text-right py-2">
                {formatValue(item.current, item.format)}
              </div>
              <div className="text-[14px] font-medium text-brand-inactive-text text-right py-2">
                {formatValue(item.previous, item.format)}
              </div>
              <div className={cn(
                "flex justify-end py-2",
                item.trend === "up" && "text-brand-green",
                item.trend === "down" && "text-[#cc4745]",
                item.trend === "stable" && "text-brand-inactive-text"
              )}>
                <TrendIcon size={18} />
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
