"use client"

import { useMemo } from "react"
import { FadeIn } from "@/components/animations/FadeIn"
import { SummaryCards } from "@/components/erp/dashboard/LeftColumn"
import {
  DashboardBarChart,
  DashboardDonutChart,
  CHART_COLORS_CATEGORY,
} from "@/components/erp/dashboard/charts/DashboardCharts"
import { ReportRankingCard } from "@/components/erp/reports/widgets"
import { formatCurrency } from "@/lib/utils"
import type { ProductivityOverview, ProductivityRankingRow } from "@/app/actions/erp/produtividade"
import {
  AwardIcon,
  TargetIcon,
  MoneyIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  CreditCardIcon,
  Users,
} from "@/lib/icons"

type Props = {
  overview: ProductivityOverview
  ranking: ProductivityRankingRow[]
}

function CardHeader({
  icon: Icon,
  title,
  subtitle,
  legendItems,
}: {
  icon?: React.ElementType
  title: string
  subtitle?: string
  legendItems?: Array<{ label: string; color: string }>
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div className="flex items-center space-x-3">
        {Icon && (
          <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
            <Icon size={18} className="text-brand-dark dark:text-dark-heading" />
          </div>
        )}
        <div>
          <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-[12px] font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {legendItems && legendItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3.5 sm:self-center">
          {legendItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProductivityPage({ overview, ranking }: Props) {
  const sortedRanking = useMemo(() => [...ranking].sort((a, b) => b.totalSold - a.totalSold), [ranking])

  const kpis = useMemo(() => [
    { title: "Total Vendido", value: formatCurrency(overview.totalSold), trend: overview.totalSoldTrend || "", icon: MoneyIcon },
    { title: "Qtd de Vendas", value: String(overview.totalSalesCount), trend: overview.totalSalesCountTrend || "", icon: ShoppingCartIcon },
    { title: "Ticket Médio", value: formatCurrency(overview.averageTicket), trend: overview.averageTicketTrend || "", icon: CreditCardIcon },
    { title: "Comissão Estimada", value: formatCurrency(overview.estimatedCommission), trend: "", icon: AwardIcon },
  ], [overview])

  const barChartData = useMemo(
    () =>
      sortedRanking.slice(0, 10).map((r) => ({
        label: r.name.split(" ")[0],
        value: r.totalSold,
      })),
    [sortedRanking],
  )

  const pieData = useMemo(
    () =>
      sortedRanking.slice(0, 8).map((r) => ({
        label: r.name,
        value: r.totalSold,
      })),
    [sortedRanking],
  )

  const rankingItems = useMemo(
    () =>
      sortedRanking.slice(0, 5).map((r) => ({
        id: r.partnerUserId,
        label: r.name,
        value: formatCurrency(r.totalSold),
        subtitle: `${r.salesCount} vendas`,
      })),
    [sortedRanking],
  )

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background transition-colors duration-300">
      <div className="mx-auto w-full pt-4 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-10">
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Row 1: KPI Horizontal */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
              <div className="lg:col-span-12">
                <SummaryCards metrics={kpis} variant="horizontal" />
              </div>
            </div>

            {/* Row 2: Comparativo de Vendedores (8) + Participação (4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
              <div className="lg:col-span-8">
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                  <CardHeader
                    icon={TrendingUpIcon}
                    title="Comparativo de Vendedores"
                    legendItems={[{ label: "Valor Vendido", color: "#10B981" }]}
                  />
                  {barChartData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium">Nenhum dado disponível</p>
                    </div>
                  ) : (
                    <DashboardBarChart data={barChartData} colors={["#10B981"]} format="currency" />
                  )}
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                  <CardHeader icon={Users} title="Participação por Vendedor" />
                  {pieData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <p className="text-brand-inactive-text dark:text-dark-body text-sm font-medium">Nenhum dado disponível</p>
                    </div>
                  ) : (
                    <DashboardDonutChart
                      data={pieData}
                      totalValue={String(overview.totalSalesCount)}
                      totalLabel="Vendas"
                      colors={CHART_COLORS_CATEGORY}
                      format="currency"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Row 3: 3 Cards Iguais (4 + 4 + 4) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
              <div className="lg:col-span-4">
                <ReportRankingCard
                  title="Ranking de Vendedores"
                  items={rankingItems}
                  variant="compact"
                  icon={AwardIcon}
                  className="h-full"
                />
              </div>
              <div className="lg:col-span-4">
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                  <CardHeader icon={CreditCardIcon} title="Ticket Médio" />
                  <div className="my-auto text-center py-4">
                    <p className="text-[44px] font-extrabold text-brand-green dark:text-dark-heading leading-none">
                      {formatCurrency(overview.averageTicket)}
                    </p>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">por venda</p>
                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">
                      {overview.totalSalesCount} vendas no período
                    </p>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-4">
                <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
                  <CardHeader icon={TargetIcon} title="Comissão Estimada" />
                  <div className="my-auto text-center py-4">
                    <p className="text-[44px] font-extrabold text-brand-green dark:text-dark-heading leading-none">
                      {formatCurrency(overview.estimatedCommission)}
                    </p>
                    <p className="text-sm font-bold text-brand-dark dark:text-dark-heading mt-2">total estimado</p>
                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body mt-1">
                      Pago: {formatCurrency(overview.paidCommission)} · Pendente: {formatCurrency(overview.pendingCommission)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
