"use client"

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis, Tooltip } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ChartPoint } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"

const config = {
  value: { label: "Este Período", color: "var(--brand-green)" },
  secondary: { label: "Período Anterior", color: "#D1D5DB" },
} satisfies ChartConfig

export const CHART_COLORS = ["#059669", "#003D32", "#f3f9f6", "#bcf49d", "#fff085"]

function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
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
              Vendas
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

export function DashboardLineChart({ data }: { data: any[] }) {
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
          {/* Secondary Line (Previous Period) */}
          <Line
            type="monotone"
            dataKey="secondary"
            stroke="#D1D5DB"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {/* Primary Line (Current Period) */}
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--brand-green)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

export function DashboardBarChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-[230px] w-full">
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={14} style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }} />
          <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={60} style={{ fontSize: 11, fontWeight: 500, fill: "#94a3b8" }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--brand-green)" />
        </BarChart>
      </ChartContainer>
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
  className
}: {
  data: ChartPoint[],
  totalValue?: string,
  totalLabel?: string,
  half?: boolean,
  innerRadius?: number,
  outerRadius?: number,
  className?: string
}) {
  const isLarge = outerRadius > 75;
  return (
    <div className={cn("w-full relative flex items-center justify-center", half ? "h-[140px]" : "h-[180px]", className)}>
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
      <ChartContainer config={config} className="h-full w-full">
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
            {data.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  )
}
