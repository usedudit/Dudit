"use client"

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis, Tooltip, Legend } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ChartPoint } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"

const config = {
  value: { label: "Este Período", color: "var(--brand-green)" },
  secondary: { label: "Período Anterior", color: "#D1D5DB" },
} satisfies ChartConfig

export const CHART_COLORS = ["#059669", "#003229", "#f3f9f6", "#bcf49d", "#fff085"]

export const CHART_COLORS_VIVID = ["#059669", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

export const CHART_COLORS_CATEGORY = ["#059669", "#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#e11d48"]

function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
}

function renderLegend({ payload }: any, labelMap?: Record<string, string>) {
  if (!payload || payload.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">
            {labelMap?.[entry.value] || entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const entry = payload[0];
    const color = entry.payload.fill || entry.color || "var(--color-brand-green)";
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[150px]">
        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">{entry.name}</p>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-current shrink-0" style={{ color }} />
            <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">
              Valor
            </span>
          </div>
          <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(entry.value))}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export function DashboardLineChart({ data, colors = ["var(--brand-green)", "#D1D5DB"], showLegend = false, legendLabels }: { data: any[]; colors?: string[]; showLegend?: boolean; legendLabels?: Record<string, string> }) {
  const keys = Object.keys(data[0] || {}).filter(k => k !== "label")
  return (
    <div className="h-[280px] w-full mt-4">
      <ChartContainer config={config} className="h-full w-full">
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            minTickGap={30}
            style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }}
          />
          <YAxis
            tickFormatter={formatCompact}
            tickLine={false}
            axisLine={false}
            width={60}
            style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i % colors.length]}
              strokeWidth={i === 0 ? 3 : 2}
              dot={false}
              activeDot={{ r: i === 0 ? 6 : 4 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
      {showLegend && renderLegend({ payload: keys.map((k, i) => ({ value: legendLabels?.[k] || k, color: colors[i % colors.length] })) })}
    </div>
  )
}

export function DashboardBarChart({ data, colors, showLegend = false, layout = "vertical", legendLabels }: { data: ChartPoint[]; colors?: string[]; showLegend?: boolean; layout?: "vertical" | "horizontal"; legendLabels?: Record<string, string> }) {
  if (layout === "horizontal") {
    const sorted = [...data].sort((a, b) => Number(b.value) - Number(a.value))
    const barColors = colors || CHART_COLORS_VIVID
    return (
      <div className="h-[280px] w-full mt-4">
        <ChartContainer config={config} className="h-full w-full">
          <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 80 }} barSize={18}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" tickFormatter={formatCompact} tickLine={false} axisLine={false} style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={80} style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {sorted.map((_, index) => (
                <Cell key={index} fill={barColors[index % barColors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        {showLegend && renderLegend({ payload: sorted.map((d, i) => ({ value: legendLabels?.[String(d.label)] || String(d.label), color: barColors[i % barColors.length] })) })}
      </div>
    )
  }

  const barColors = colors || [CHART_COLORS_VIVID[0]]
  const hasMultiColor = barColors.length > 1
  return (
    <div className="h-[230px] w-full">
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={14} style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }} />
          <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={60} style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {hasMultiColor ? data.map((_, index) => <Cell key={index} fill={barColors[index % barColors.length]} />) : null}
          </Bar>
        </BarChart>
      </ChartContainer>
      {showLegend && renderLegend({ payload: data.map((d, i) => ({ value: legendLabels?.[String(d.label)] || String(d.label), color: hasMultiColor ? barColors[i % barColors.length] : barColors[0] })) })}
    </div>
  )
}

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
  data: ChartPoint[],
  totalValue?: string,
  totalLabel?: string,
  half?: boolean,
  innerRadius?: number,
  outerRadius?: number,
  className?: string,
  showLegend?: boolean,
  colors?: string[],
}) {
  const isLarge = outerRadius > 75;
  return (
    <div className={cn("w-full", className)}>
      <div className="relative flex items-center justify-center">
        {totalValue && (
          <div className={cn("absolute flex flex-col items-center justify-center pointer-events-none mt-1", half ? "bottom-0" : "inset-0")}>
            <span className={cn("font-medium text-brand-inactive-text dark:text-dark-body", isLarge ? "text-[12px] mb-0.5" : "text-[11px]")}>
              {totalLabel || "Total"}
            </span>
            <span className={cn("font-bold text-brand-dark dark:text-dark-heading tracking-tight", isLarge ? "text-[21px]" : "text-[17px]")}>
              {totalValue}
            </span>
          </div>
        )}
        <ChartContainer config={config} className={cn(half ? "h-[140px]" : "h-[180px]", "w-full")}>
          <PieChart>
            <Tooltip content={<CustomPieTooltip />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              cx="50%"
              cy={half ? "100%" : "50%"}
              startAngle={half ? 180 : 90}
              endAngle={half ? 0 : -270}
            >
              {data.map((entry, index) => <Cell key={index} fill={(entry.fill as string) || colors[index % colors.length]} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>
      {showLegend && data.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
          {data.map((entry, index) => {
            const label = String(entry.label || "")
            return (
              <div key={index} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: (entry.fill as string) || colors[index % colors.length] }} />
                <span className="text-[11px] font-semibold text-brand-inactive-text dark:text-dark-body">{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
