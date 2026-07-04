"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Dropdown, DropdownItem } from "@/components/reusable"
import { DashboardLineChart, DashboardBarChart, DashboardPieChart } from "@/components/erp/dashboard/charts/DashboardCharts"

type ChartType = "line" | "bar" | "pie"

interface ReportChartCardProps {
  title: string
  subtitle?: string
  chartType: ChartType
  data: any[]
  totalValue?: string
  totalLabel?: string
  period?: string
  onPeriodChange?: (period: string) => void
  periodOptions?: string[]
  className?: string
  children?: React.ReactNode
}

export function ReportChartCard({
  title,
  subtitle,
  chartType,
  data,
  totalValue,
  totalLabel,
  period,
  onPeriodChange,
  periodOptions,
  className,
  children,
}: ReportChartCardProps) {
  return (
    <div className={cn(
      "bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border",
      className
    )}>
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">{title}</h3>
          {subtitle && (
            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-1">{subtitle}</p>
          )}
        </div>
        {periodOptions && onPeriodChange && (
          <Dropdown
            fullWidth={false}
            align="right"
            width="w-44"
            trigger={
              <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors">
                {period || periodOptions[0]}
              </button>
            }
          >
            {periodOptions.map((p) => (
              <DropdownItem key={p} onClick={() => onPeriodChange(p)}>{p}</DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>

      {children}

      {chartType === "line" && <DashboardLineChart data={data} />}
      {chartType === "bar" && <DashboardBarChart data={data} />}
      {chartType === "pie" && (
        <div className="flex justify-center">
          <DashboardPieChart
            data={data}
            totalValue={totalValue || String(data.reduce((a: number, b: any) => a + Number(b.value || 0), 0))}
            totalLabel={totalLabel || "Total"}
            innerRadius={68}
            outerRadius={92}
            className="h-[260px]"
          />
        </div>
      )}
    </div>
  )
}
