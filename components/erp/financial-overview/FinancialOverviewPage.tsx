"use client"

import { useState } from "react"
import type { ReactNode } from "react"

import { CartesianGrid, Line, LineChart, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn, formatCurrency } from "@/lib/utils"
import {
    ArrowDownIcon,
    ArrowUpIcon,
    ArrowLeftRightIcon,
    BankIcon,
    ChartIcon,
    ClockIcon,
    MoneyIcon,
    EyeIcon,
    SparklesIcon,
    TrendingUpIcon,
    ArrowRightIcon
} from "@/lib/icons"
import { Button, Badge } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import type { FinancialOverviewData, FinancialOverviewPeriod } from "@/lib/data/financial-overview"

type ProjectionRange = "sevenDays" | "thirtyDays"

const chartConfig = {
    gross: { label: "Receita bruta", color: "#0066FF" },
    net: { label: "Receita líquida", color: "#E11D48" },
} satisfies ChartConfig

const periodLabels: Record<FinancialOverviewPeriod, string> = {
    daily: "Diário",
    weekly: "Semanal",
    monthly: "Mensal",
}

function formatCompactCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value || 0)
}

function formatDate(ymd: string) {
    const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
    if (!y || !m || !d) return ymd
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "America/Sao_Paulo",
    })
}

function SectionCard({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <section className={cn("bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl overflow-hidden", className)}>
            {children}
        </section>
    )
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
        <div className="inline-flex items-center rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray/50 dark:bg-dark-background p-1">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "h-8 px-3 rounded-lg text-sm font-semibold transition-colors",
                        value === option.value
                            ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border"
                            : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading",
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
        <SectionCard className="relative p-6 flex flex-col justify-end min-h-[240px] group overflow-hidden border-0">
            {/* Decorative Blue Header */}
            <div className="absolute top-0 left-0 right-0 h-[120px] bg-gradient-to-br from-[#0066FF] to-[#0052CC] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-transparent" />
                {/* Simulated Wave/Shape from image */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[120%] h-16 bg-white dark:bg-dark-surface rounded-[50%_50%_0_0]" />
                <div className="absolute top-6 left-6 w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <BankIcon className="w-5 h-5 text-white" />
                </div>
            </div>

            <div className="relative z-10">
                <p className="text-[15px] font-semibold text-brand-inactive-text dark:text-dark-body mb-1">Em caixa</p>
                <div className="flex items-center justify-between">
                    <p className="text-[32px] font-bold text-brand-dark dark:text-dark-heading leading-tight">
                        {formatCurrency(value)}
                    </p>
                    <button className="text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading transition-colors p-2">
                        <EyeIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </SectionCard>
    )
}

function SummaryMetricCard({ title, value, tone, icon: Icon }: { title: string; value: number; tone: "green" | "red"; icon: any }) {
    return (
        <SectionCard className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold text-brand-inactive-text dark:text-dark-body">{title}</span>
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", tone === "green" ? "bg-brand-green/10 text-brand-green" : "bg-brand-red/10 text-brand-red")}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <div className="bg-white dark:bg-dark-background/50 rounded-xl p-2">
                <p className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                    {formatCurrency(value)}
                </p>
            </div>
        </SectionCard>
    )
}

function ListContainer({ title, children, subtitle, headerControls }: { title: string; children: ReactNode; subtitle?: string; headerControls?: ReactNode }) {
    return (
        <SectionCard className="flex flex-col h-full">
            <div className="px-6 py-5 border-b border-brand-border dark:border-dark-border flex items-center justify-between bg-white dark:bg-dark-surface">
                <div className="flex flex-col">
                    <h2 className="font-bold text-[18px] text-brand-dark dark:text-dark-heading">{title}</h2>
                    {subtitle && <p className="text-[13px] text-brand-inactive-text dark:text-dark-body mt-0.5 font-medium">{subtitle}</p>}
                </div>
                {headerControls}
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <tbody>
                        {children}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    )
}

function StandardListRow({ left, middle, right, onClick }: { left: ReactNode; middle?: ReactNode; right: ReactNode; onClick?: () => void }) {
    return (
        <tr
            className="group hover:bg-brand-gray/40 dark:hover:bg-dark-border/10 transition-colors cursor-pointer border-b border-brand-border last:border-0 dark:border-dark-border bg-white dark:bg-dark-surface"
            onClick={onClick}
        >
            <td className="py-4 pl-6 pr-4">
                {left}
            </td>
            {middle && (
                <td className="py-4 px-4 hidden md:table-cell">
                    {middle}
                </td>
            )}
            <td className="py-4 pr-6 pl-4 text-right">
                {right}
            </td>
        </tr>
    )
}

function ProjectionCard({ data }: { data: FinancialOverviewData["projection"] }) {
    const [range, setRange] = useState<ProjectionRange>("sevenDays")
    const current = range === "sevenDays" ? data.sevenDays : data.thirtyDays

    return (
        <SectionCard className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
                <h2 className="font-bold text-[18px] text-brand-dark dark:text-dark-heading">Projeção de receita</h2>
                <MiniToggle
                    value={range}
                    onChange={setRange}
                    options={[
                        { value: "sevenDays", label: "Em 7 dias" },
                        { value: "thirtyDays", label: "Em 30 dias" },
                    ]}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-auto">
                <div className="flex flex-col gap-1">
                    <p className="text-[14px] font-semibold text-brand-inactive-text dark:text-dark-body">Entradas esperadas</p>
                    <p className="text-[24px] font-bold text-brand-dark/70 dark:text-dark-heading/70">{formatCurrency(current.inflow)}</p>
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-[14px] font-semibold text-brand-inactive-text dark:text-dark-body">Despesas previstas</p>
                    <p className="text-[24px] font-bold text-brand-dark/70 dark:text-dark-heading/70">{formatCurrency(current.outflow)}</p>
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-[14px] font-semibold text-brand-inactive-text dark:text-dark-body">Saldo líquido</p>
                    <p className={cn("text-[24px] font-bold", current.net >= 0 ? "text-brand-green" : "text-brand-red")}>
                        {current.net >= 0 ? "+" : ""}{formatCurrency(current.net)}
                    </p>
                </div>
            </div>
        </SectionCard>
    )
}


function RevenueEvolution({ data }: { data: FinancialOverviewData["revenueEvolution"] }) {
    const [period, setPeriod] = useState<FinancialOverviewPeriod>("daily")
    const chartData = data[period]

    return (
        <SectionCard>
            <div className="px-6 py-5 border-b border-brand-border dark:border-dark-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="font-bold text-[18px] text-brand-dark dark:text-dark-heading">Evolução da Receita</h2>
                    <div className="flex items-center gap-4 mt-2 text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#0066FF]" />Receita bruta</span>
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#E11D48]" />Receita líquida</span>
                    </div>
                </div>
                <MiniToggle
                    value={period}
                    onChange={setPeriod}
                    options={(Object.keys(periodLabels) as FinancialOverviewPeriod[]).map((value) => ({ value, label: periodLabels[value] }))}
                />
            </div>
            <div className="p-6">
                {chartData.length > 0 ? (
                    <ChartContainer config={chartConfig} className="h-[300px] w-full">
                        <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} style={{ fontSize: '12px', fontWeight: 600, fill: '#94a3b8' }} />
                            <YAxis tickFormatter={formatCompactCurrency} tickLine={false} axisLine={false} width={48} style={{ fontSize: '12px', fontWeight: 600, fill: '#94a3b8' }} />
                            <ChartTooltip content={<ChartTooltipContent formatter={(value: number, name: string) => (
                                <div className="flex w-full items-center justify-between gap-6 py-1">
                                    <span className="text-[13px] font-bold">{name === "gross" ? "Receita bruta" : "Receita líquida"}</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(value || 0))}</span>
                                </div>
                            )} />} />
                            <Line
                                type="monotone"
                                dataKey="gross"
                                stroke="#0066FF"
                                strokeWidth={2.5}
                                dot={{ fill: '#0066FF', strokeWidth: 2, r: 4, stroke: '#fff' }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="net"
                                stroke="#E11D48"
                                strokeWidth={2.5}
                                strokeDasharray="5 5"
                                dot={{ fill: '#E11D48', strokeWidth: 2, r: 4, stroke: '#fff' }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ChartContainer>
                ) : (
                    <div className="h-[300px] flex items-center justify-center">
                        <EmptyState text="Sem receitas confirmadas no período." />
                    </div>
                )}
            </div>
        </SectionCard>
    )
}

function RevenueDistribution({ data }: { data: FinancialOverviewData["revenueDistribution"] }) {
    const [period, setPeriod] = useState<FinancialOverviewPeriod>("daily")
    const total = data.reduce((acc, item) => acc + item.value, 0)

    return (
        <SectionCard>
            <div className="px-6 py-5 border-b border-brand-border dark:border-dark-border flex items-center justify-between">
                <div>
                    <h2 className="font-bold text-[18px] text-brand-dark dark:text-dark-heading">Distribuição da Receita</h2>
                    <p className="text-[13px] text-brand-inactive-text dark:text-dark-body mt-0.5 font-medium">
                        Total período: <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span>
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
            <div className="p-6 space-y-6">
                {data.length > 0 ? data.map((item) => (
                    <div key={item.label} className="grid grid-cols-[1fr_auto_60px_auto] items-center gap-4 text-sm">
                        <span className="font-bold text-brand-dark dark:text-dark-heading truncate max-w-[120px]">{item.label}</span>
                        <div className="w-full min-w-[100px] md:min-w-[160px] h-2.5 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden">
                            <div className="h-full rounded-full bg-[#0066FF] transition-all duration-500" style={{ width: `${Math.min(100, item.percentage)}%` }} />
                        </div>
                        <span className="text-brand-inactive-text dark:text-dark-body font-bold text-right tabular-nums">{item.percentage}%</span>
                        <span className="font-bold text-brand-dark dark:text-dark-heading text-right min-w-[100px]">{formatCurrency(item.value)}</span>
                    </div>
                )) : <EmptyState text="Sem origem de receita para exibir." />}
            </div>
        </SectionCard>
    )
}

function LatestMovements({ data }: { data: FinancialOverviewData["latestMovements"] }) {
    return (
        <ListContainer title="Últimas movimentações" subtitle="Transações recentes confirmadas">
            {data.length > 0 ? data.map((item) => {
                const Icon = item.direction === "in" ? ArrowUpIcon : item.direction === "out" ? ArrowDownIcon : ArrowLeftRightIcon
                return (
                    <StandardListRow
                        key={item.id}
                        left={
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 rounded-full bg-brand-gray/50 dark:bg-dark-border/20 border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                                    <Icon className={cn("w-4 h-4", item.direction === "in" ? "text-brand-green" : "text-brand-red")} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">{item.description}</p>
                                    <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body truncate mt-0.5">{item.accountName} · {formatDate(item.date)}</p>
                                </div>
                            </div>
                        }
                        middle={
                            <Badge variant="gray" className="text-[10px] uppercase font-bold">
                                {item.status}
                            </Badge>
                        }
                        right={
                            <div className="flex flex-col items-end">
                                <p className={cn("text-[15px] font-bold tabular-nums", item.direction === "in" ? "text-brand-green" : "text-brand-red")}>
                                    {item.direction === "in" ? "+" : "-"}{formatCurrency(item.value)}
                                </p>
                            </div>
                        }
                    />
                )
            }) : (
                <tr>
                    <td colSpan={3} className="p-8 text-center">
                        <EmptyState text="Nenhuma movimentação encontrada." />
                    </td>
                </tr>
            )}
        </ListContainer>
    )
}

function DueAccounts({ data }: { data: FinancialOverviewData["dueAccounts"] }) {
    return (
        <ListContainer title="Contas vencendo" subtitle="Hoje, atrasadas e próximas">
            {data.length > 0 ? data.map((item) => (
                <StandardListRow
                    key={item.id}
                    left={
                        <div className="min-w-0">
                            <p className="font-bold text-[14px] text-brand-dark dark:text-dark-heading truncate">{item.description}</p>
                            <p className="text-[12px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">{formatDate(item.dueDate)}</p>
                        </div>
                    }
                    middle={
                        <Badge
                            variant={item.dueKind === "overdue" ? "red" : item.dueKind === "today" ? "orange" : "gray"}
                            className="text-[10px] uppercase font-bold"
                        >
                            {dueLabel(item)}
                        </Badge>
                    }
                    right={
                        <p className={cn("text-[15px] font-bold tabular-nums", item.direction === "in" ? "text-brand-green" : "text-brand-red")}>
                            {formatCurrency(item.value)}
                        </p>
                    }
                />
            )) : (
                <tr>
                    <td colSpan={3} className="p-8 text-center">
                        <EmptyState text="Nada vencendo nos próximos dias." />
                    </td>
                </tr>
            )}
        </ListContainer>
    )
}

function dueLabel(item: FinancialOverviewData["dueAccounts"][number]) {
    if (item.dueKind === "overdue") return `${Math.abs(item.daysUntilDue)} dia(s) em atraso`
    if (item.dueKind === "today") return "vence hoje"
    return `vence em ${item.daysUntilDue} dia(s)`
}

function EmptyState({ text, className }: { text: string; className?: string }) {
    return <p className={cn("text-sm text-brand-inactive-text dark:text-dark-body", className)}>{text}</p>
}

export default function FinancialOverviewPage({ data }: { data: FinancialOverviewData }) {
    return (
        <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
            {/* Top Grid: Cash, Metrics, Projection */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_0.8fr_1.5fr] gap-6">
                <CashCard value={data.totals.cash} />

                <div className="grid grid-cols-1 gap-6">
                    <SummaryMetricCard
                        title="A receber"
                        value={data.totals.receivable}
                        tone="green"
                        icon={ArrowUpIcon}
                    />
                    <SummaryMetricCard
                        title="Despesas"
                        value={data.totals.payable}
                        tone="red"
                        icon={ArrowDownIcon}
                    />
                </div>

                <ProjectionCard data={data.projection} />
            </div>

            {/* Secondary Grid: Distribution & Evolution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <RevenueDistribution data={data.revenueDistribution} />
                <RevenueEvolution data={data.revenueEvolution} />
            </div>

            {/* Bottom Grid: Lists */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 pb-8">
                <LatestMovements data={data.latestMovements} />
                <DueAccounts data={data.dueAccounts} />
            </div>
        </div>
    )
}
