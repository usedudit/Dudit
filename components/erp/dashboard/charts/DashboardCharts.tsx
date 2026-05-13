"use client"

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { ChartPoint } from "@/lib/data/dashboard"

const config = {
  value: { label: "Valor", color: "#0066FF" },
  secondary: { label: "Secundário", color: "#22C55E" },
} satisfies ChartConfig

const colors = ["#0066FF", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"]

function formatCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
}

export function DashboardLineChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-[230px] w-full p-4">
      <ChartContainer config={config} className="h-full w-full">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#edf2f7" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} style={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} />
          <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={44} style={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="value" stroke="#0066FF" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

export function DashboardBarChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-[230px] w-full p-4">
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#edf2f7" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={14} style={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} />
          <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} width={44} style={{ fontSize: 12, fontWeight: 700, fill: "#94a3b8" }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={[8, 8, 4, 4]} fill="#0066FF" />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

export function DashboardPieChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-[230px] w-full p-4">
      <ChartContainer config={config} className="h-full w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={86} paddingAngle={3}>
            {data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  )
}
