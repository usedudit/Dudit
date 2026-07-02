"use client"

import { useState, useMemo } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts"
import { formatCurrency } from "@/lib/utils"
import type { ProductivityOverview, ProductivityRankingRow } from "@/app/actions/erp/produtividade"
import {
  AwardIcon,
  TargetIcon,
  MoneyIcon,
  ShoppingCartIcon,
  ChartIcon,
  TrendingUpIcon,
} from "@/lib/icons"

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"]

const iconsList = [MoneyIcon, ShoppingCartIcon, TrendingUpIcon, TargetIcon, AwardIcon, ChartIcon, MoneyIcon, MoneyIcon]

const toneMap = [
  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400",
  "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400",
  "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
]

type Props = {
  overview: ProductivityOverview
  ranking: ProductivityRankingRow[]
}

function ChartTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-border p-3.5 shadow-lg flex flex-col gap-2 font-sans min-w-[170px]">
        <p className="text-[13px] font-bold text-brand-dark dark:text-dark-heading leading-tight truncate max-w-[200px]">{label}</p>
        <div className="flex flex-col gap-1.5 border-t border-brand-border dark:border-dark-border/40 pt-1.5 mt-0.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-current shrink-0" style={{ color: entry.fill }} />
                <span className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body">{entry.name}</span>
              </div>
              <span className="text-[12px] font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export default function ProductivityPage({ overview, ranking }: Props) {
  const [chartMetric, setChartMetric] = useState<"sold" | "commission">("sold")

  const sortedRanking = useMemo(() => [...ranking].sort((a, b) => b.totalSold - a.totalSold), [ranking])

  const barChartData = useMemo(
    () =>
      sortedRanking.slice(0, 10).map((r) => ({
        name: r.name.split(" ")[0],
        "Valor Vendido": r.totalSold,
        "Comissão": r.commissionGenerated,
      })),
    [sortedRanking],
  )

  const pieData = useMemo(
    () =>
      sortedRanking.slice(0, 8).map((r, i) => ({
        name: r.name,
        value: r.totalSold,
        color: COLORS[i % COLORS.length],
      })),
    [sortedRanking],
  )

  const cardData = useMemo(
    () => [
      { title: "Total Vendido", value: formatCurrency(overview.totalSold) },
      { title: "Qtd de Vendas", value: String(overview.totalSalesCount) },
      { title: "Ticket Médio", value: formatCurrency(overview.averageTicket) },
      { title: "Meta Geral", value: formatCurrency(overview.generalGoal) },
      { title: "Meta Atingida", value: `${overview.goalAchievedPercent.toFixed(1)}%` },
      { title: "Comissão Prevista", value: formatCurrency(overview.estimatedCommission) },
      { title: "Comissão Paga", value: formatCurrency(overview.paidCommission) },
      { title: "Comissão Pendente", value: formatCurrency(overview.pendingCommission) },
    ],
    [overview],
  )

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10 space-y-8">
          {/* Cards - exato estilo do dashboard SummaryCards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {cardData.map((card, i) => {
              const Icon = iconsList[i % iconsList.length]
              const toneClass = toneMap[i % toneMap.length]
              return (
                <div
                  key={card.title}
                  className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col justify-between"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${toneClass}`}>
                        <Icon size={18} />
                      </div>
                      <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">{card.title}</span>
                    </div>
                  </div>
                  <div className="flex items-baseline mt-2">
                    <h2 className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none">
                      {card.value}
                    </h2>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Charts */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Comparativo de Vendedores</h2>
              <div className="flex items-center gap-2 bg-brand-page-bg dark:bg-dark-background rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setChartMetric("sold")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    chartMetric === "sold"
                      ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                      : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
                  }`}
                >
                  Valor Vendido
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric("commission")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    chartMetric === "commission"
                      ? "bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading shadow-sm"
                      : "text-brand-inactive-text dark:text-dark-body hover:text-brand-dark dark:hover:text-dark-heading"
                  }`}
                >
                  Comissão
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-6 bg-white dark:bg-dark-surface">
                {barChartData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium">Nenhum dado disponível</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E7" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#A1A1AA" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip content={<ChartTooltip />} />
                      {chartMetric === "sold" ? (
                        <Bar dataKey="Valor Vendido" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      ) : (
                        <Bar dataKey="Comissão" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rounded-2xl border border-brand-border dark:border-dark-border p-6 bg-white dark:bg-dark-surface">
                <h3 className="text-sm font-bold text-brand-dark dark:text-dark-heading mb-4">Participação por Vendedor</h3>
                {pieData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium">Nenhum dado disponível</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width="60%" height={280}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 flex-1">
                      {pieData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-2 text-xs">
                          <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="text-brand-inactive-text dark:text-dark-body truncate flex-1">{entry.name}</span>
                          <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(entry.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ranking */}
          <div>
            <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-4">Ranking de Produtividade</h2>
            {sortedRanking.length === 0 ? (
              <IconPlaceholder
                title="Nenhum vendedor encontrado"
                subtitle="Os dados dos vendedores aparecerão aqui conforme as vendas forem realizadas."
              />
            ) : (
              <div className="space-y-3">
                {sortedRanking.map((seller, index) => (
                  <div
                    key={seller.partnerUserId}
                    className="rounded-2xl border border-brand-border dark:border-dark-border p-4 bg-white dark:bg-dark-surface flex items-center gap-4"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 bg-brand-page-bg dark:bg-dark-background text-brand-inactive-text dark:text-dark-body">
                      {index < 3 ? (
                        <span className="text-lg">{["🥇", "🥈", "🥉"][index]}</span>
                      ) : (
                        `#${index + 1}`
                      )}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-brand-page-bg dark:bg-dark-background overflow-hidden shrink-0">
                      {seller.avatarUrl ? (
                        <img src={seller.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-brand-inactive-text dark:text-dark-body">
                          {seller.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{seller.name}</p>
                      <p className="text-xs text-brand-inactive-text dark:text-dark-body">{seller.salesCount} vendas</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Vendido</p>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(seller.totalSold)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Ticket Médio</p>
                        <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(seller.averageTicket)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">Comissão</p>
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(seller.commissionGenerated)}</p>
                      </div>
                    </div>
                    <div className="flex sm:hidden items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-brand-inactive-text">Vendido</p>
                        <p className="text-sm font-bold text-brand-dark">{formatCurrency(seller.totalSold)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
