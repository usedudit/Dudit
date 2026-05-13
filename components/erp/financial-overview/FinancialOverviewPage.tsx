"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn, formatCurrency } from "@/lib/utils"
import { ArrowDownIcon, ArrowUpIcon, ArrowLeftRightIcon, BankIcon, ChartIcon, ClockIcon, MoneyIcon } from "@/lib/icons"
import type { FinancialOverviewData, FinancialOverviewPeriod } from "@/lib/data/financial-overview"

type ProjectionRange = "sevenDays" | "thirtyDays"

const chartConfig = {
  gross: { label: "Receita bruta", color: "#1d7df2" },
  net: { label: "Receita líquida", color: "#16a34a" },
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
    <section className={cn("bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl overflow-hidden", className)}>
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

function SummaryCard({
  title,
  value,
  description,
  tone,
  icon: Icon,
}: {
  title: string
  value: number
  description: string
  tone?: "green" | "red" | "dark"
  icon: any
}) {
  return (
    <SectionCard className="p-5 min-h-[140px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">{title}</p>
        <div className="w-9 h-9 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border">
          <Icon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
        </div>
      </div>
      <div>
        <p
          className={cn(
            "text-2xl md:text-[26px] font-bold text-brand-dark dark:text-dark-heading tracking-normal",
            tone === "green" && "text-brand-green",
            tone === "red" && "text-brand-red",
          )}
        >
          {formatCurrency(value)}
        </p>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">{description}</p>
      </div>
    </SectionCard>
  )
}

function ProjectionCard({ data }: { data: FinancialOverviewData["projection"] }) {
  const [range, setRange] = useState<ProjectionRange>("sevenDays")
  const current = range === "sevenDays" ? data.sevenDays : data.thirtyDays

  return (
    <SectionCard className="lg:col-span-2">
      <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand-dark dark:text-dark-heading">Projeção financeira</h2>
          <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">Entradas e saídas previstas pelo vencimento.</p>
        </div>
        <MiniToggle
          value={range}
          onChange={setRange}
          options={[
            { value: "sevenDays", label: "7 dias" },
            { value: "thirtyDays", label: "30 dias" },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5">
        <ProjectionMetric label="Entradas previstas" value={current.inflow} tone="green" />
        <ProjectionMetric label="Saídas previstas" value={current.outflow} tone="red" />
        <ProjectionMetric label="Saldo líquido" value={current.net} tone={current.net >= 0 ? "green" : "red"} />
      </div>
    </SectionCard>
  )
}

function ProjectionMetric({ label, value, tone }: { label: string; value: number; tone: "green" | "red" }) {
  return (
    <div className="rounded-xl border border-brand-border dark:border-dark-border p-4">
      <p className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">{label}</p>
      <p className={cn("text-xl font-bold mt-2 text-brand-dark dark:text-dark-heading", tone === "green" ? "text-brand-green" : "text-brand-red")}>
        {formatCurrency(value)}
      </p>
    </div>
  )
}

function RevenueEvolution({ data }: { data: FinancialOverviewData["revenueEvolution"] }) {
  const [period, setPeriod] = useState<FinancialOverviewPeriod>("daily")
  const chartData = data[period]

  return (
    <SectionCard>
      <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand-dark dark:text-dark-heading">Evolução da receita</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-brand-inactive-text dark:text-dark-body">
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#1d7df2]" />Receita bruta</span>
            <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand-green" />Receita líquida</span>
          </div>
        </div>
        <MiniToggle
          value={period}
          onChange={setPeriod}
          options={(Object.keys(periodLabels) as FinancialOverviewPeriod[]).map((value) => ({ value, label: periodLabels[value] }))}
        />
      </div>
      <div className="p-5">
        {chartData.length > 0 ? (
          <ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto">
            <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} />
              <YAxis tickFormatter={formatCompactCurrency} tickLine={false} axisLine={false} width={72} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value: number, name: string) => (
                <div className="flex w-full items-center justify-between gap-6">
                  <span>{name === "gross" ? "Receita bruta" : "Receita líquida"}</span>
                  <span className="font-mono font-semibold text-brand-dark dark:text-dark-heading">{formatCurrency(Number(value || 0))}</span>
                </div>
              )} />} />
              <Line type="monotone" dataKey="gross" stroke="var(--color-gross)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" stroke="var(--color-net)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        ) : (
          <EmptyState text="Sem receitas confirmadas no período." />
        )}
      </div>
    </SectionCard>
  )
}

function RevenueDistribution({ data }: { data: FinancialOverviewData["revenueDistribution"] }) {
  const total = data.reduce((acc, item) => acc + item.value, 0)
  return (
    <SectionCard>
      <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border">
        <h2 className="font-bold text-brand-dark dark:text-dark-heading">Distribuição da receita</h2>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">Total do período: <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</span></p>
      </div>
      <div className="p-5 space-y-4">
        {data.length > 0 ? data.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(88px,1fr)_minmax(100px,1.4fr)_64px_minmax(104px,auto)] items-center gap-3 text-sm">
            <span className="font-semibold text-brand-dark dark:text-dark-heading truncate">{item.label}</span>
            <div className="h-2 rounded-full bg-brand-gray dark:bg-dark-border overflow-hidden">
              <div className="h-full rounded-full bg-brand-dark dark:bg-dark-heading" style={{ width: `${Math.min(100, item.percentage)}%` }} />
            </div>
            <span className="text-brand-inactive-text dark:text-dark-body text-right">{item.percentage}%</span>
            <span className="font-bold text-brand-dark dark:text-dark-heading text-right">{formatCurrency(item.value)}</span>
          </div>
        )) : <EmptyState text="Sem origem de receita para exibir." />}
      </div>
    </SectionCard>
  )
}

function LatestMovements({ data }: { data: FinancialOverviewData["latestMovements"] }) {
  return (
    <SectionCard>
      <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border">
        <h2 className="font-bold text-brand-dark dark:text-dark-heading">Últimas movimentações</h2>
      </div>
      <div className="divide-y divide-brand-border dark:divide-dark-border">
        {data.length > 0 ? data.map((item) => {
          const Icon = item.direction === "in" ? ArrowUpIcon : item.direction === "out" ? ArrowDownIcon : ArrowLeftRightIcon
          return (
            <div key={item.id} className="px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border flex items-center justify-center shrink-0">
                <Icon className={cn("w-4 h-4", item.direction === "in" ? "text-brand-green" : "text-brand-red")} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">{item.description}</p>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">{item.accountName} · {formatDate(item.date)} · {item.status}</p>
              </div>
              <p className={cn("text-sm font-bold shrink-0", item.direction === "in" ? "text-brand-green" : "text-brand-red")}>
                {item.direction === "in" ? "+" : "-"}{formatCurrency(item.value)}
              </p>
            </div>
          )
        }) : <EmptyState text="Nenhuma movimentação encontrada." className="p-5" />}
      </div>
    </SectionCard>
  )
}

function DueAccounts({ data }: { data: FinancialOverviewData["dueAccounts"] }) {
  return (
    <SectionCard>
      <div className="px-5 py-4 border-b border-brand-border dark:border-dark-border">
        <h2 className="font-bold text-brand-dark dark:text-dark-heading">Contas vencendo</h2>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">Hoje, atrasadas e próximas.</p>
      </div>
      <div className="divide-y divide-brand-border dark:divide-dark-border">
        {data.length > 0 ? data.map((item) => (
          <div key={item.id} className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading truncate">{item.description}</p>
                <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">{formatDate(item.dueDate)} · {dueLabel(item)}</p>
              </div>
              <p className={cn("text-sm font-bold shrink-0", item.direction === "in" ? "text-brand-green" : "text-brand-red")}>
                {formatCurrency(item.value)}
              </p>
            </div>
          </div>
        )) : <EmptyState text="Nada vencendo nos próximos dias." className="p-5" />}
      </div>
    </SectionCard>
  )
}

function dueLabel(item: FinancialOverviewData["dueAccounts"][number]) {
  if (item.dueKind === "overdue") return `${Math.abs(item.daysUntilDue)} dia(s) em atraso`
  if (item.dueKind === "today") return "vence hoje"
  return `vence em ${item.daysUntilDue} dia(s)`
}

function CashArea({ value }: { value: number }) {
  return (
    <SectionCard className="p-5 min-h-[140px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-brand-inactive-text dark:text-dark-body">Em caixa</p>
        <div className="w-9 h-9 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center border border-brand-border dark:border-dark-border">
          <BankIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
        </div>
      </div>
      <div>
        <p className="text-2xl md:text-[26px] font-bold text-brand-dark dark:text-dark-heading mt-1">{formatCurrency(value)}</p>
        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-2">Saldo atual das contas financeiras ativas.</p>
      </div>
    </SectionCard>
  )
}

function EmptyState({ text, className }: { text: string; className?: string }) {
  return <p className={cn("text-sm text-brand-inactive-text dark:text-dark-body", className)}>{text}</p>
}

export default function FinancialOverviewPage({ data }: { data: FinancialOverviewData }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <CashArea value={data.totals.cash} />
        <SummaryCard title="A receber" value={data.totals.receivable} description="Receitas pendentes e parcialmente pagas." tone="green" icon={ArrowUpIcon} />
        <SummaryCard title="A pagar" value={data.totals.payable} description="Despesas pendentes e parcialmente pagas." tone="red" icon={ArrowDownIcon} />
        <SummaryCard title="Saldo projetado" value={data.totals.projected7} description="Entradas menos saídas nos próximos 7 dias." tone={data.totals.projected7 >= 0 ? "green" : "red"} icon={ChartIcon} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ProjectionCard data={data.projection} />
        <SectionCard className="p-5 flex flex-col justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-gray dark:bg-dark-border border border-brand-border dark:border-dark-border flex items-center justify-center">
              <ClockIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body" />
            </div>
            <div>
              <h2 className="font-bold text-brand-dark dark:text-dark-heading">Atualização</h2>
              <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">Dados calculados a partir das contas e transações financeiras.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-brand-border dark:border-dark-border p-3">
              <BankIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body mb-2" />
              <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Contas reais</p>
              <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Caixa, banco e carteiras.</p>
            </div>
            <div className="rounded-xl border border-brand-border dark:border-dark-border p-3">
              <MoneyIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-body mb-2" />
              <p className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Saldo aberto</p>
              <p className="text-xs text-brand-inactive-text dark:text-dark-body mt-1">Considera pagamentos parciais.</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RevenueDistribution data={data.revenueDistribution} />
        <RevenueEvolution data={data.revenueEvolution} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <LatestMovements data={data.latestMovements} />
        <DueAccounts data={data.dueAccounts} />
      </div>
    </div>
  )
}
