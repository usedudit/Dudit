"use client"

import { useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn, formatCurrency } from "@/lib/utils"
import {
    BankIcon,
    EyeIcon,
    SparklesIcon,
} from "@/lib/icons"
import type { FinancialOverviewData, FinancialOverviewPeriod } from "@/lib/data/financial-overview"

type ProjectionRange = "sevenDays" | "thirtyDays"

const chartConfig = {
    gross: { label: "Receita bruta", color: "#0066FF" },
    net: { label: "Receita líquida", color: "#E11D48" },
} satisfies ChartConfig

const GreenTrendIcon = (props: any) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 17L17 7" />
    <path d="M7 7h10v10" />
  </svg>
)

const RedTrendIcon = (props: any) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 7l10 10" />
    <path d="M17 7v10H7" />
  </svg>
)

function formatCompactCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value || 0)
}

function MiniToggle<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T
    options: Array<{ value: T; label: string }>
    onChange: (value: T) => void
}) {
    return (
        <div className="inline-flex items-center rounded-full bg-[#F4F4F5] dark:bg-dark-border/50 p-1">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "h-8 px-4 rounded-full text-[14px] font-medium transition-colors",
                        value === option.value
                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading"
                            : "text-[#A1A1AA] hover:text-brand-dark dark:hover:text-dark-heading",
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

function CashCard({ value }: { value: number }) {
    return (
        <div className="relative flex flex-col h-full rounded-[16px] border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface overflow-hidden">
            <div className="relative w-full h-[140px] shrink-0 bg-gradient-to-br from-[#0066FF] to-[#0052CC]">
                <div className="absolute inset-0 bg-white/5" />
                <div className="absolute top-6 left-6">
                     <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                         <BankIcon className="w-5 h-5 text-white" />
                     </div>
                </div>
            </div>
            
            <div className="px-6 py-5 flex flex-col justify-end flex-1">
                <p className="text-[14px] font-medium text-[#A1A1AA] mb-1">Em caixa</p>
                <div className="flex items-center justify-between">
                    <p className="text-[28px] font-medium text-brand-dark dark:text-dark-heading">
                        <span className="text-[#A1A1AA] text-xl font-medium mr-1">R$</span>
                        {value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <button className="text-[#A1A1AA] hover:text-brand-dark dark:hover:text-dark-heading transition-colors">
                        <EyeIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}

function SummaryMetricCard({ title, value, tone, icon: Icon }: { title: string; value: number; tone: "green" | "red"; icon: any }) {
    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[16px] p-5 flex flex-col flex-1 justify-between min-h-[132px]">
            <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-[#A1A1AA]">{title}</span>
                <div className={cn("w-6 h-6 rounded flex items-center justify-center", tone === "green" ? "bg-[#22C55E] text-white" : "bg-[#EF4444] text-white")}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
            </div>
            <div className="border border-[#F4F4F5] dark:border-dark-border bg-[#FAFAFA] dark:bg-dark-background rounded-xl p-3">
                <p className="text-[24px] font-medium text-brand-dark dark:text-dark-heading flex items-baseline">
                    <span className="text-[#A1A1AA] text-[16px] font-medium mr-1.5">R$</span>
                    {value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
            </div>
        </div>
    )
}

function ProjectionCard({ data }: { data: FinancialOverviewData["projection"] }) {
    const [range, setRange] = useState<ProjectionRange>("sevenDays")
    const current = range === "sevenDays" ? data.sevenDays : data.thirtyDays

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[16px] p-6 flex flex-col justify-between h-full min-h-[280px]">
            <div>
                <div className="flex items-center justify-between mb-8">
                    <h2 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading">Projeção de receita</h2>
                    <MiniToggle
                        value={range}
                        onChange={setRange}
                        options={[
                            { value: "sevenDays", label: "Em 7 dias" },
                            { value: "thirtyDays", label: "Em 30 dias" },
                        ]}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[14px] font-medium text-[#A1A1AA]">Entradas esperadas</p>
                        <p className="text-[20px] font-semibold text-brand-dark dark:text-dark-heading">
                            <span className="text-[#A1A1AA] text-[16px] font-medium mr-1">R$</span>
                            {current.inflow.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[14px] font-medium text-[#A1A1AA]">Despesas previstas</p>
                        <p className="text-[20px] font-semibold text-brand-dark dark:text-dark-heading">
                            <span className="text-[#A1A1AA] text-[16px] font-medium mr-1">R$</span>
                            {current.outflow.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[14px] font-medium text-[#A1A1AA]">Saldo líquido</p>
                        <p className={cn("text-[20px] font-semibold", current.net >= 0 ? "text-[#16A34A]" : "text-[#EF4444]")}>
                            {current.net >= 0 ? "+" : ""}<span className="font-medium mr-1">R$</span>
                            {current.net.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button className="px-4 py-2 bg-white dark:bg-dark-surface border border-[#E4E4E7] dark:border-dark-border rounded-xl text-[14px] font-medium text-brand-dark dark:text-dark-heading hover:bg-[#F4F4F5] dark:hover:bg-dark-border/50 transition-colors">
                    Detalhes
                </button>
                <button className="px-4 py-2 bg-white dark:bg-dark-surface border border-[#E4E4E7] dark:border-dark-border rounded-xl text-[14px] font-medium text-brand-dark dark:text-dark-heading hover:bg-[#F4F4F5] dark:hover:bg-dark-border/50 transition-colors flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-[#0066FF]" />
                    Análise financeira
                </button>
            </div>
        </div>
    )
}

function RevenueEvolution({ data }: { data: FinancialOverviewData["revenueEvolution"] }) {
    const [period, setPeriod] = useState<FinancialOverviewPeriod>("daily")
    const chartData = data[period]

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[16px] flex flex-col h-full min-h-[380px] relative">
            <div className="px-6 pt-6 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading">Evolução da Receita</h2>
                <div className="flex items-center gap-4 text-[13px] font-medium text-[#A1A1AA]">
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0066FF]" />Receita bruta</span>
                    <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#E11D48]" />Receita líquida</span>
                </div>
            </div>
            <div className="absolute top-[80px] right-6 z-10">
                <MiniToggle
                    value={period}
                    onChange={setPeriod}
                    options={[
                        { value: "daily", label: "Diário" },
                        { value: "weekly", label: "Semanal" },
                        { value: "monthly", label: "Mensal" },
                    ]}
                />
            </div>
            <div className="px-4 pb-6 pt-16 flex-1">
                {chartData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: -20 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#F4F4F5" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} style={{ fontSize: '12px', fontWeight: 500, fill: '#A1A1AA' }} />
                            <YAxis tickFormatter={formatCompactCurrency} tickLine={false} axisLine={false} width={48} style={{ fontSize: '12px', fontWeight: 500, fill: '#A1A1AA' }} />
                            <ChartTooltip content={<ChartTooltipContent className="bg-white dark:bg-dark-surface border border-[#F4F4F5] dark:border-dark-border rounded-xl" formatter={(value: number, name: string) => (
                                <div className="flex w-full items-center justify-between gap-6 py-1">
                                    <span className="text-[13px] font-medium text-[#A1A1AA]">{name === "gross" ? "Receita bruta" : "Receita líquida"}</span>
                                    <span className="font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(value || 0))}</span>
                                </div>
                            )} />} />
                            <Line
                                type="monotone"
                                dataKey="gross"
                                stroke="#0066FF"
                                strokeWidth={2}
                                dot={{ fill: '#0066FF', strokeWidth: 2, r: 3, stroke: '#fff' }}
                                activeDot={{ r: 5, strokeWidth: 0 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="net"
                                stroke="#E11D48"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                dot={{ fill: '#E11D48', strokeWidth: 2, r: 3, stroke: '#fff' }}
                                activeDot={{ r: 5, strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ChartContainer>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-[14px] text-[#A1A1AA]">Sem receitas confirmadas no período.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

function RevenueDistribution({ data }: { data: FinancialOverviewData["revenueDistribution"] }) {
    const [period, setPeriod] = useState<FinancialOverviewPeriod>("daily")
    const total = data.reduce((acc, item) => acc + item.value, 0)

    return (
        <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-[16px] flex flex-col h-full min-h-[380px]">
            <div className="px-6 py-5 border-b border-[#F4F4F5] dark:border-dark-border/50">
                <h2 className="font-bold text-[16px] text-brand-dark dark:text-dark-heading mb-5">Distribuição da Receita</h2>
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-[14px] font-medium text-[#A1A1AA] mb-1">Total período</p>
                        <p className="text-[20px] font-semibold text-brand-dark dark:text-dark-heading">
                            <span className="text-[#A1A1AA] text-[16px] font-medium mr-1">R$</span>
                            {total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                    </div>
                    <MiniToggle
                        value={period}
                        onChange={setPeriod}
                        options={[
                            { value: "daily", label: "Diário" },
                            { value: "weekly", label: "Semanal" },
                            { value: "monthly", label: "Mensal" },
                        ]}
                    />
                </div>
            </div>
            <div className="p-6 space-y-6 overflow-auto">
                {data.length > 0 ? data.map((item) => (
                    <div key={item.label} className="grid grid-cols-[100px_1fr_40px_100px] items-center gap-4 text-[14px]">
                        <span className="font-medium text-brand-dark dark:text-dark-heading truncate">{item.label}</span>
                        <div className="w-full h-2 rounded-full bg-[#F4F4F5] dark:bg-dark-border overflow-hidden">
                            <div className="h-full rounded-full bg-[#0066FF] transition-all duration-500" style={{ width: `${Math.min(100, item.percentage)}%` }} />
                        </div>
                        <span className="text-[#A1A1AA] font-medium text-right">{item.percentage}%</span>
                        <span className="font-medium text-brand-dark dark:text-dark-heading text-right">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                )) : <p className="text-[14px] text-[#A1A1AA]">Sem origem de receita para exibir.</p>}
            </div>
        </div>
    )
}

export default function FinancialOverviewPage({ data }: { data: FinancialOverviewData }) {
    return (
        <div className="w-full flex flex-col gap-6">
            {/* Top Grid: Cash, Metrics, Projection */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1.5fr] gap-6">
                <CashCard value={data.totals.cash} />

                <div className="flex flex-col gap-4 h-full">
                    <SummaryMetricCard
                        title="A receber"
                        value={data.totals.receivable}
                        tone="green"
                        icon={GreenTrendIcon}
                    />
                    <SummaryMetricCard
                        title="Despesas"
                        value={data.totals.payable}
                        tone="red"
                        icon={RedTrendIcon}
                    />
                </div>

                <ProjectionCard data={data.projection} />
            </div>

            {/* Bottom Grid: Distribution & Evolution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-8">
                <RevenueDistribution data={data.revenueDistribution} />
                <RevenueEvolution data={data.revenueEvolution} />
            </div>
        </div>
    )
}
