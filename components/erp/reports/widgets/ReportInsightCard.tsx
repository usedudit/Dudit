"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { TrendingUpIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon, SparklesIcon } from "@/lib/icons"

export type InsightTone = "positive" | "negative" | "warning" | "info" | "neutral"

export interface Insight {
  id: string
  message: string
  tone: InsightTone
  category?: string
}

interface ReportInsightCardProps {
  insights: Insight[]
  title?: string
  className?: string
}

const toneConfig: Record<InsightTone, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  positive: {
    icon: CheckCircleIcon,
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-800 dark:text-green-300",
    border: "border-green-200 dark:border-green-800",
  },
  negative: {
    icon: AlertTriangleIcon,
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-800 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
  },
  warning: {
    icon: TrendingUpIcon,
    bg: "bg-orange-50 dark:bg-orange-900/20",
    text: "text-orange-800 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
  },
  info: {
    icon: InfoIcon,
    bg: "bg-blue-50 dark:bg-blue-900/20",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800",
  },
  neutral: {
    icon: SparklesIcon,
    bg: "bg-brand-gray dark:bg-dark-border/30",
    text: "text-brand-dark dark:text-dark-heading",
    border: "border-brand-border dark:border-dark-border",
  },
}

export function ReportInsightCard({ insights, title = "Insights", className }: ReportInsightCardProps) {
  if (insights.length === 0) return null

  return (
    <div className={cn(
      "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border",
      className
    )}>
      <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-6">{title}</h3>

      <div className="space-y-3">
        {insights.map((insight) => {
          const config = toneConfig[insight.tone]
          const Icon = config.icon

          return (
            <div
              key={insight.id}
              className={cn(
                "flex items-start gap-3 p-4 rounded-[16px] border",
                config.bg,
                config.border
              )}
            >
              <div className={cn("mt-0.5 shrink-0", config.text)}>
                <Icon size={20} />
              </div>
              <div>
                <p className={cn("text-[14px] font-semibold leading-snug", config.text)}>
                  {insight.message}
                </p>
                {insight.category && (
                  <span className="text-[11px] font-medium text-brand-inactive-text mt-1 block">
                    {insight.category}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
