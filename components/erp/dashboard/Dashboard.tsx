import React from "react";
import { SparklesIcon } from "@/lib/icons"
import { SummaryCards, Cashflow, NeedsAttention } from "./LeftColumn";
import { ExpenseBreakdown } from "./MiddleColumn";
import { TopCategories, RecentActivities } from "./RightColumn";
import { LatestOrdersCard, CriticalStockCard, NextAppointmentsCard } from "./BottomCards";
import { InsightsRegister } from "./InsightsRegister";
import {
  getGeneralMetrics,
  getGeneralRevenueChart,
  getGeneralRevenueOrigin,
  getGeneralAlerts,
  getGeneralActivity,
  getGeneralTopCategories,
  getDashboardGeneralData
} from "@/lib/data/dashboard";
import type { Period, CompareMode } from "@/lib/period-types";
import { COMPARE_PRESET_LABELS, getPeriodDateRange, compareModeToPeriod, addDays } from "@/lib/period-types";
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters";

interface DashboardProps {
  partnerId: string;
  sells: string[];
  period?: Period;
  compare?: CompareMode;
  compareFrom?: string;
  compareTo?: string;
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

export async function Dashboard({
  partnerId, sells, period = "monthly", compare = "none",
  compareFrom, compareTo,
}: DashboardProps) {
  const compareInfo = getCompareInfo(compare, period, compareFrom, compareTo)

  const [
    metricsData,
    revenueChartData,
    revenueOriginData,
    alertsData,
    activityData,
    topCategoriesData,
    compareMetricsData,
    compareRevenueData,
    generalData
  ] = await Promise.all([
    getGeneralMetrics(partnerId, period),
    getGeneralRevenueChart(partnerId, period),
    getGeneralRevenueOrigin(partnerId, period),
    getGeneralAlerts(partnerId, sells),
    getGeneralActivity(partnerId),
    getGeneralTopCategories(partnerId, sells, period),
    compareInfo ? getGeneralMetrics(partnerId, compareInfo.period, compareInfo.todayOverride) : Promise.resolve(null),
    compareInfo ? getGeneralRevenueChart(partnerId, compareInfo.period, compareInfo.todayOverride) : Promise.resolve(null),
    getDashboardGeneralData(partnerId),
  ]);

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
  const topCategory = topCategoriesData.categories[0]
  const originCount = revenueOriginData.origins.length

  const insights: { message: string; color: string }[] = []
  if (revenueVal > 0) {
    const trend = revenueMetric?.trend || ""
    if (trend.includes("+")) insights.push({ message: `Faturamento de ${revenueMetric?.value} - ${trend} em relação ao período anterior.`, color: "green" })
    else insights.push({ message: `Faturamento de ${revenueMetric?.value} no período.`, color: "blue" })
  }
  if (topCategory) {
    insights.push({ message: `"${topCategory.label}" é a categoria mais vendida.`, color: "blue" })
  }
  if (originCount > 0) {
    const topOrigin = revenueOriginData.origins.reduce((a, b) => (a.value > b.value ? a : b))
    insights.push({ message: `${topOrigin.label} é a principal origem de receita (${Math.round((Number(topOrigin.value) / revenueOriginData.origins.reduce((s, o) => s + Number(o.value), 0)) * 100)}%).`, color: "green" })
  }
  if (alertCount > 0) {
    insights.push({ message: `${alertCount} alerta(s) precisam de atenção no painel.`, color: "orange" })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Register Insights in global client context */}
      <InsightsRegister insights={insights} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        {/* Row 1: KPI Horizontal Card */}
        <div className="lg:col-span-12">
          <SummaryCards metrics={metrics} variant="horizontal" />
        </div>

        {/* Row 2: Total Revenue (2/3) and Revenue Origin (1/3) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <Cashflow revenueData={revenueData} totalRevenue={revenueChartData.total} compareLabel={compareLabel || "Período Anterior"} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <ExpenseBreakdown originData={revenueOriginData.origins} revenueChartTrend={revenueChartData.trend} />
        </div>

        {/* Row 3: Top Categories (2/3) and Recent Activities (1/3) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <TopCategories categoriesData={topCategoriesData.categories} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <RecentActivities activities={activityData.activity} />
        </div>

        {/* Row 4 (Bottom): 3 cards occupying 1/3 each */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <NeedsAttention alerts={alertsData.alerts} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <LatestOrdersCard items={generalData?.latestOrders || []} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          {sells.includes("services") ? (
            <NextAppointmentsCard items={generalData?.nextAppointments || []} />
          ) : (
            <CriticalStockCard items={generalData?.criticalStock || []} />
          )}
        </div>
      </div>
    </div>
  );
}
