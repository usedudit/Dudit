import React from "react"
import { SummaryCards, NeedsAttention } from "./LeftColumn"
import { RecentActivities } from "./RightColumn"
import { LatestOrdersCard, CriticalStockCard, NextAppointmentsCard } from "./BottomCards"
import { InsightsRegister } from "./InsightsRegister"
import { RevenueLimitCard } from "./widgets/general/RevenueLimitCard"
import {
  DashboardLineChart,
  DashboardDonutChart,
  DashboardBarChart,
  CHART_COLORS_CATEGORY,
} from "./charts/DashboardCharts"
import {
  getGeneralMetrics,
  getGeneralRevenueChart,
  getGeneralRevenueOrigin,
  getGeneralAlerts,
  getGeneralActivity,
  getGeneralAbcCurve,
  getGeneralOrdersChart,
  getDashboardGeneralData
} from "@/lib/data/dashboard"
import type { Period, CompareMode } from "@/lib/period-types"
import { COMPARE_PRESET_LABELS, getPeriodDateRange, compareModeToPeriod } from "@/lib/period-types"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { formatCurrency as brl } from "@/lib/utils"
import {
  TrendingUpIcon,
  CreditCardIcon,
  ShoppingCartIcon,
} from "@/lib/icons"

interface DashboardProps {
  partnerId: string
  sells: string[]
  period?: Period
  compare?: CompareMode
  compareFrom?: string
  compareTo?: string
}

function parseMetricValue(value: string): number {
  const cleaned = value.replace(/^R\$\s*/g, "").replace(/\./g, "").replace(",", ".")
  return parseFloat(cleaned) || 0
}

function computePercent(current: number, compare: number): string {
  if (compare <= 0 && current <= 0) return "0%"
  if (compare <= 0) return "+100%"
  const delta = ((current - compare) / compare) * 100
  return `${delta >= 0 ? "+" : ""}${Math.round(delta)}%`
}

function getCompareInfo(compare: CompareMode, period: Period, compareFrom?: string, compareTo?: string) {
  if (compare === "none") return null

  if (compare === "custom") {
    if (!compareFrom || !compareTo) return null
    const days = Math.round((new Date(compareTo + "T12:00:00Z").getTime() - new Date(compareFrom + "T12:00:00Z").getTime()) / 86400000) + 1
    let p: Period = "daily"
    if (days >= 25) p = "monthly"
    else if (days >= 5) p = "weekly"
    return {
      period: p,
      todayOverride: compareTo,
      label: `${compareFrom} a ${compareTo}`,
    }
  }

  const p = compareModeToPeriod(compare)
  if (!p) return null

  const { from } = getPeriodDateRange(period, getTodayYmdSaoPaulo())
  const currentStart = new Date(from + "T12:00:00Z")
  const compEnd = new Date(currentStart)
  compEnd.setUTCDate(compEnd.getUTCDate() - 1)
  const todayOverride = compEnd.toISOString().slice(0, 10)

  return {
    period: p,
    todayOverride,
    label: COMPARE_PRESET_LABELS[compare] || "Período Anterior",
  }
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
            <p className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body mt-0.5">{subtitle}</p>
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

export async function Dashboard({
  partnerId, sells, period = "monthly", compare = "none",
  compareFrom, compareTo,
}: DashboardProps) {
  const sellsSet = new Set(sells || [])
  const hasProducts = sellsSet.has("products")
  const hasOrders = sellsSet.has("orders")
  const hasAppointments = sellsSet.has("appointments")
  const compareInfo = getCompareInfo(compare, period, compareFrom, compareTo)

  const [
    metricsData,
    revenueChartData,
    revenueOriginData,
    alertsData,
    activityData,
    abcCurveData,
    ordersChartData,
    compareMetricsData,
    compareRevenueData,
    generalData
  ] = await Promise.all([
    getGeneralMetrics(partnerId, period),
    getGeneralRevenueChart(partnerId, period),
    getGeneralRevenueOrigin(partnerId, period),
    getGeneralAlerts(partnerId, sells),
    getGeneralActivity(partnerId),
    getGeneralAbcCurve(partnerId, period),
    getGeneralOrdersChart(partnerId, period),
    compareInfo ? getGeneralMetrics(partnerId, compareInfo.period, compareInfo.todayOverride) : Promise.resolve(null),
    compareInfo ? getGeneralRevenueChart(partnerId, compareInfo.period, compareInfo.todayOverride) : Promise.resolve(null),
    getDashboardGeneralData(partnerId),
  ])

  let metrics = metricsData.metrics
  let revenueData = revenueChartData.revenue
  let compareLabel: string | undefined

  if (compareInfo && compareMetricsData && compareRevenueData) {
    compareLabel = compareInfo.label

    metrics = metricsData.metrics.map((m, i) => {
      const compareMetric = compareMetricsData.metrics[i]
      if (!compareMetric) return m
      const currVal = parseMetricValue(m.value)
      const compVal = parseMetricValue(compareMetric.value)
      const trend = computePercent(currVal, compVal)
      return { ...m, trend: `${trend} vs ${compareLabel}` }
    })

    revenueData = revenueChartData.revenue.map((point, i) => ({
      ...point,
      secondary: compareRevenueData.revenue[i]?.value || 0
    }))
  }

  const revenueMetric = metrics.find(m => m.title.toLowerCase().includes("faturamento") || m.title.toLowerCase().includes("receita"))
  const revenueVal = revenueMetric ? parseMetricValue(revenueMetric.value) : 0
  const alertCount = alertsData.alerts.length
  const topOrigin = revenueOriginData.origins.reduce((a, b) => (a.value > b.value ? a : b))
  const originCount = revenueOriginData.origins.length
  const abcCategories = abcCurveData?.abcCurve || []
  const abcCountA = abcCategories.filter(a => a.category === "A").length
  const abcRevenueA = abcCategories.filter(a => a.category === "A").reduce((s, a) => s + Number(a.value), 0)

  const insights: { message: string; color: string }[] = []
  if (revenueVal > 0) {
    const trend = revenueMetric?.trend || ""
    if (trend.includes("+")) insights.push({ message: `Faturamento de ${revenueMetric?.value} - ${trend} em relação ao período anterior.`, color: "green" })
    else insights.push({ message: `Faturamento de ${revenueMetric?.value} no período.`, color: "blue" })
  }
  if (abcCountA > 0 && revenueVal > 0) {
    const pct = Math.round((abcRevenueA / revenueVal) * 100)
    insights.push({ message: `${abcCountA} produto(s) da Classe A representam ~${pct}% da receita.`, color: "green" })
  }
  if (originCount > 0) {
    insights.push({ message: `${topOrigin.label} é a principal origem de receita (${Math.round((Number(topOrigin.value) / revenueOriginData.origins.reduce((s, o) => s + Number(o.value), 0)) * 100)}%).`, color: "green" })
  }
  if (alertCount > 0) {
    insights.push({ message: `${alertCount} alerta(s) precisam de atenção no painel.`, color: "orange" })
  }

  const evoData = revenueData.map(p => ({ label: p.label, value: p.value, secondary: p.secondary }))
  const originDonutData = revenueOriginData.origins.map(o => ({ label: o.label, value: Number(o.value) }))
  const totalOrigin = revenueOriginData.origins.reduce((s, o) => s + Number(o.value), 0)
  const ordersBarData = ordersChartData.orders.map(p => ({ label: p.label, value: p.value }))
  const ordersTotal = ordersChartData.total

  return (
    <div className="flex flex-col gap-6">
      <InsightsRegister insights={insights} />

      {/* Row 1: KPI Horizontal Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-12">
          <SummaryCards metrics={metrics} variant="horizontal" />
        </div>
      </div>

      {/* Limite de faturamento (MEI / nano). Oculto quando o perfil não foi informado. */}
      <RevenueLimitCard />

      {/* Row 2: Faturamento (8) + Origem da Receita (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-8">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
            <CardHeader
              icon={TrendingUpIcon}
              title="Faturamento"
              legendItems={[{ label: "Este Período", color: "#79c325" }, { label: compareLabel || "Período Anterior", color: "#94a3b8" }]}
            />
            <DashboardLineChart data={evoData} format="currency" />
          </div>
        </div>
        {originCount > 1 && (
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
              <CardHeader icon={CreditCardIcon} title="Origem da Receita" />
              <DashboardDonutChart
                data={originDonutData}
                totalValue={brl(totalOrigin)}
                totalLabel="Receita Total"
                colors={CHART_COLORS_CATEGORY}
                format="currency"
              />
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Total de Pedidos (8) + Atividades Recentes (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-8">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border h-full flex flex-col justify-between">
            <CardHeader
              icon={ShoppingCartIcon}
              title="Total de Pedidos"
              subtitle={`${ordersTotal} pedido${ordersTotal === 1 ? "" : "s"} no período`}
            />
            <DashboardBarChart data={ordersBarData} colors={["#79c325"]} format="number" />
          </div>
        </div>
        <div className="lg:col-span-4">
          <RecentActivities activities={activityData.activity} />
        </div>
      </div>

      {/* Row 4: Precisa de Atenção (4) + Últimos Pedidos (4) + Próximos Agendamentos/Estoque Crítico (4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        <div className="lg:col-span-4">
          <NeedsAttention alerts={alertsData.alerts} />
        </div>
        {hasOrders && (
          <div className="lg:col-span-4">
            <LatestOrdersCard items={generalData?.latestOrders || []} />
          </div>
        )}
        {hasAppointments && (
          <div className="lg:col-span-4">
            <NextAppointmentsCard items={generalData?.nextAppointments || []} />
          </div>
        )}
        {hasProducts && !hasAppointments && (
          <div className="lg:col-span-4">
            <CriticalStockCard items={generalData?.criticalStock || []} />
          </div>
        )}
      </div>
    </div>
  )
}
