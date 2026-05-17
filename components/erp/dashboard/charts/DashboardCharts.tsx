"use client"

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ChartPoint } from "@/lib/data/dashboard"

const config = {
  value: { label: "Este Período", color: "var(--brand-green)" },
  secondary: { label: "Período Anterior", color: "#D1D5DB" },
} satisfies ChartConfig

export const CHART_COLORS = ["#059669", "#003D32", "#0FA96B", "#bcf49d", "#fff085"]

function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
}

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

export function DashboardPieChart({ data, totalValue, totalLabel }: { data: ChartPoint[], totalValue?: string, totalLabel?: string }) {
  return (
    <div className="h-[230px] w-full relative flex items-center justify-center">
      {totalValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
          <span className="text-[11px] font-medium text-brand-inactive-text dark:text-dark-body">{totalLabel || "Total"}</span>
          <span className="text-[17px] font-bold text-brand-dark dark:text-dark-heading tracking-tight">{totalValue}</span>
        </div>
      )}
      <ChartContainer config={config} className="h-full w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={65}
            outerRadius={90}
            paddingAngle={2}
            cx="50%"
            cy="50%"
          >
            {data.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  )
}
