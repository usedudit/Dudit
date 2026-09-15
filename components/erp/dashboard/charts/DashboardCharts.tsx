"use client"

import React from "react"
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import type { ChartPoint } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"

const config = {
  value: { label: "Este Período", color: "var(--brand-green)" },
  secondary: { label: "Período Anterior", color: "#D1D5DB" },
} satisfies ChartConfig

export const CHART_COLORS = ["#059669", "#003229", "#f3f9f6", "#bcf49d", "#fff085"]

export const CHART_COLORS_VIVID = ["#059669", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

export const CHART_COLORS_CATEGORY = ["#059669", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#e11d48"]

export function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0)
}

export function getFormatter(format?: "currency" | "compact" | "number" | "quantity") {
  if (format === "currency") return formatCurrency
  if (format === "number") return (v: number) => v.toLocaleString("pt-BR")
  if (format === "quantity") return (v: number) => `${v} un`
  return formatCompact
}

/**
 * Universal custom tooltip with solid branding, bold typography and dark mode support
 */
export function CustomChartTooltip({ active, payload, label, formatter, valuePrefix = "", valueSuffix = "" }: any) {
  if (!active || !payload || !payload.length) return null

  const title = label || payload[0]?.name || payload[0]?.payload?.label

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-3.5 shadow-xl flex flex-col gap-2 font-sans min-w-[160px] z-50 pointer-events-none">
      {title && (
        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading border-b border-brand-border/60 dark:border-dark-border/60 pb-1.5 mb-0.5">
          {title}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {payload.map((entry: any, index: number) => {
          const color = entry.color || entry.stroke || entry.fill || entry.payload?.fill || "var(--color-brand-green, #059669)"
          const name = entry.name === "value" ? "Este Período" : entry.name === "secondary" ? "Período Anterior" : (entry.name || entry.dataKey || "Valor")
          const rawVal = entry.value
          let displayVal = rawVal
          if (formatter) {
            displayVal = formatter(rawVal, name, entry)
          } else if (typeof rawVal === "number") {
            displayVal = rawVal.toLocaleString("pt-BR")
          }
          return (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body truncate max-w-[130px]">
                  {name}
                </span>
              </div>
              <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading shrink-0 tabular-nums">
                {valuePrefix}{displayVal}{valueSuffix}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const CustomPieTooltip = ({ active, payload, formatter }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0]
    const color = entry.payload.fill || entry.color || "var(--color-brand-green, #059669)"
    const rawVal = entry.value
    const valFormatted = formatter
      ? formatter(rawVal)
      : typeof rawVal === "number"
        ? rawVal.toLocaleString("pt-BR")
        : rawVal

    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border p-3.5 shadow-xl flex flex-col gap-2 font-sans min-w-[150px] pointer-events-none z-50">
        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{entry.name || entry.payload.label}</p>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
              Valor
            </span>
          </div>
          <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
            {valFormatted}
          </span>
        </div>
      </div>
    )
  }
  return null
}

export function DashboardLineChart({
  data,
  colors = ["#059669", "#94a3b8"],
  showLegend = false,
  legendLabels,
  format,
  height = "h-[260px]",
}: {
  data: any[]
  colors?: string[]
  showLegend?: boolean
  legendLabels?: Record<string, string>
  format?: "currency" | "compact" | "number" | "quantity"
  height?: string
}) {
  const valueFormatter = getFormatter(format)
  const keys = Object.keys(data[0] || {}).filter(k => k !== "label" && k !== "id")
  return (
    <div className={cn("w-full mt-2", height)}>
      <ChartContainer config={config} className="h-full w-full">
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" className="text-brand-border/60 dark:text-dark-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            minTickGap={25}
            tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-semibold' }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tickLine={false}
            axisLine={false}
            width={65}
            tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-semibold' }}
          />
          <Tooltip content={<CustomChartTooltip formatter={valueFormatter} />} />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={legendLabels?.[key] || key}
              stroke={colors[i % colors.length]}
              strokeWidth={i === 0 ? 3 : 2}
              dot={false}
              activeDot={{ r: i === 0 ? 6 : 4, fill: colors[i % colors.length], stroke: "#ffffff", strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
          {keys.map((k, i) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body">
                {legendLabels?.[k] || k}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardBarChart({
  data,
  colors,
  showLegend = false,
  layout = "vertical",
  legendLabels,
  format,
  height = "h-[240px]",
}: {
  data: ChartPoint[]
  colors?: string[]
  showLegend?: boolean
  layout?: "vertical" | "horizontal"
  legendLabels?: Record<string, string>
  format?: "currency" | "compact" | "number" | "quantity"
  height?: string
}) {
  const valueFormatter = getFormatter(format)
  const barColors = colors || [CHART_COLORS_VIVID[0]]
  const hasMultiColor = barColors.length > 1

  return (
    <div className={cn("w-full mt-2", height)}>
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 10 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" className="text-brand-border/60 dark:text-dark-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={14}
            tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-semibold' }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tickLine={false}
            axisLine={false}
            width={65}
            tick={{ fill: 'currentColor', className: 'text-brand-inactive-text dark:text-dark-body text-[11px] font-semibold' }}
          />
          <Tooltip content={<CustomChartTooltip formatter={valueFormatter} />} />
          <Bar dataKey="value" name="Valor" radius={[6, 6, 0, 0]}>
            {data.map((_, index) => <Cell key={index} fill={barColors[index % barColors.length]} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: hasMultiColor ? barColors[i % barColors.length] : barColors[0] }} />
              <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body">
                {legendLabels?.[String(d.label)] || String(d.label)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Standard Donut / Round chart layout:
 * Donut on Left side with center value, and structured Legend on Right side (max 5-6 items)
 */
export function DashboardDonutChart({
  data,
  totalValue,
  totalLabel = "Total",
  innerRadius = 52,
  outerRadius = 72,
  className,
  colors = CHART_COLORS_CATEGORY,
  maxLegendItems = 6,
  format,
}: {
  data: ChartPoint[]
  totalValue?: string | number
  totalLabel?: string
  innerRadius?: number
  outerRadius?: number
  className?: string
  colors?: string[]
  maxLegendItems?: number
  format?: "currency" | "compact" | "number" | "quantity"
}) {
  const valueFormatter = getFormatter(format)
  const sortedData = [...data].sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
  const displayLegend = sortedData.slice(0, maxLegendItems)
  const sumTotal = sortedData.reduce((acc, item) => acc + Number(item.value || 0), 0)
  const displayedTotal = totalValue !== undefined ? String(totalValue) : formatCompact(sumTotal)

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-6 w-full my-auto", className)}>
      {/* Donut chart on Left */}
      <div className="relative shrink-0 flex items-center justify-center w-[160px] h-[160px]">
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-1">
          <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body leading-tight truncate max-w-[90px]">
            {totalLabel}
          </span>
          <span className="text-[17px] font-extrabold text-brand-dark dark:text-dark-heading tracking-tight leading-tight mt-0.5 truncate max-w-[100px]">
            {displayedTotal}
          </span>
        </div>
        <ChartContainer config={config} className="w-[160px] h-[160px]">
          <PieChart>
            <Tooltip content={<CustomPieTooltip formatter={valueFormatter} />} />
            <Pie
              data={sortedData}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              cx="50%"
              cy="50%"
            >
              {sortedData.map((entry, index) => (
                <Cell key={index} fill={(entry.fill as string) || colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>

      {/* Legend list on Right */}
      <div className="flex-1 w-full flex flex-col justify-center gap-2.5 min-w-0">
        {displayLegend.map((item, idx) => {
          const color = (item.fill as string) || colors[idx % colors.length]
          const pct = sumTotal > 0 ? ((Number(item.value || 0) / sumTotal) * 100).toFixed(0) : "0"
          const valFormatted = valueFormatter
            ? valueFormatter(Number(item.value || 0))
            : (typeof item.value === "number" ? item.value.toLocaleString("pt-BR") : item.value)

          return (
            <div key={idx} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[120px]" title={String(item.label)}>
                  {item.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-right">
                <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
                  {valFormatted}
                </span>
                <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
                  ({pct}%)
                </span>
              </div>
            </div>
          )
        })}
        {sortedData.length === 0 && (
          <p className="text-xs text-brand-inactive-text dark:text-dark-body text-center py-4">Sem dados no período.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Standard Horizontal Bar List for top items / rankings:
 * Title positioned ABOVE full-width bar, eliminating recharts whitespace margins and layout clipping
 */
export function HorizontalBarRankingList({
  items,
  colors = CHART_COLORS_VIVID,
  maxItems = 5,
  format,
  className,
}: {
  items: Array<{ label: string; value: number | string; subtitle?: string }>
  colors?: string[]
  maxItems?: number
  format?: "currency" | "compact" | "number" | "quantity"
  className?: string
}) {
  const valueFormatter = getFormatter(format)
  const displayItems = items.slice(0, maxItems)
  const maxVal = Math.max(...displayItems.map(i => Number(i.value) || 0), 1)

  return (
    <div className={cn("flex flex-col justify-center gap-3.5 w-full my-auto", className)}>
      {displayItems.map((item, index) => {
        const numVal = Number(item.value) || 0
        const percentage = Math.min(Math.max((numVal / maxVal) * 100, 4), 100)
        const color = colors[index % colors.length]
        const formattedVal = valueFormatter
          ? valueFormatter(numVal)
          : (typeof item.value === "number" ? item.value.toLocaleString("pt-BR") : item.value)

        return (
          <div key={index} className="flex flex-col gap-1 w-full">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[70%]" title={item.label}>
                {item.label}
              </span>
              <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading shrink-0 tabular-nums">
                {formattedVal}
              </span>
            </div>
            <div className="w-full h-2 bg-brand-border/60 dark:bg-dark-border/60 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${percentage}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
      {displayItems.length === 0 && (
        <p className="text-xs text-brand-inactive-text dark:text-dark-body text-center py-6">Nenhum dado no período.</p>
      )}
    </div>
  )
}

/** Legacy DashboardPieChart maintained for backwards compatibility */
export function DashboardPieChart({
  data,
  totalValue,
  totalLabel,
  half,
  innerRadius = 50,
  outerRadius = 70,
  className,
  showLegend = false,
  colors = CHART_COLORS_CATEGORY,
}: {
  data: ChartPoint[]
  totalValue?: string
  totalLabel?: string
  half?: boolean
  innerRadius?: number
  outerRadius?: number
  className?: string
  showLegend?: boolean
  colors?: string[]
}) {
  return (
    <DashboardDonutChart
      data={data}
      totalValue={totalValue}
      totalLabel={totalLabel}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      className={className}
      colors={colors}
      maxLegendItems={showLegend ? 6 : 0}
    />
  )
}
