"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "@/lib/icons"
import { Badge } from "@/components/reusable"

export interface MetricCardData {
  title: string
  value: string
  trend?: string
  trendDirection?: "up" | "down" | "stable"
  trendLabel?: string
  subtitle?: string
  icon?: React.ElementType
  tone?: "default" | "green" | "red" | "orange" | "blue"
}

interface ReportMetricCardProps {
  data: MetricCardData
  className?: string
}

export function ReportMetricCard({ data, className }: ReportMetricCardProps) {
  const TrendIcon = data.trendDirection === "up" ? ArrowUpIcon
    : data.trendDirection === "down" ? ArrowDownIcon
    : data.trendDirection === "stable" ? MinusIcon
    : null

  const badgeVariant = data.trendDirection === "up" ? "green"
    : data.trendDirection === "down" ? "red"
    : data.tone === "red" ? "red"
    : data.tone === "orange" ? "orange"
    : data.tone === "blue" ? "blue"
    : "gray"

  return (
    <div className={cn(
      "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {data.icon && (
            <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center shrink-0">
              <data.icon size={18} className="text-brand-dark dark:text-dark-heading" />
            </div>
          )}
          <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{data.title}</span>
        </div>
        {data.trend && (
          <Badge variant={badgeVariant} icon={TrendIcon ? <TrendIcon className="stroke-[3]" /> : null}>
            {data.trend}
          </Badge>
        )}
      </div>

      <div className="flex items-end justify-between gap-4">
        <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
          {data.value}
        </span>
        {data.subtitle && (
          <span className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body text-right leading-tight">
            {data.subtitle}
          </span>
        )}
      </div>

      {data.trendLabel && (
        <span className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mt-2">
          {data.trendLabel}
        </span>
      )}
    </div>
  )
}
