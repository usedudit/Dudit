import React from "react";
import { SummaryCards, Cashflow, NeedsAttention } from "./LeftColumn";
import { ExpenseBreakdown } from "./MiddleColumn";
import { TopCategories, RecentActivities } from "./RightColumn";
import {
  getGeneralMetrics,
  getGeneralRevenueChart,
  getGeneralRevenueOrigin,
  getGeneralAlerts,
  getGeneralActivity,
  getGeneralTopCategories
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
    compareRevenueData
  ] = await Promise.all([
    getGeneralMetrics(partnerId, period),
    getGeneralRevenueChart(partnerId, period),
    getGeneralRevenueOrigin(partnerId, period),
    getGeneralAlerts(partnerId, sells),
    getGeneralActivity(partnerId),
    getGeneralTopCategories(partnerId, sells, period),
    compareInfo ? getGeneralMetrics(partnerId, compareInfo.period, compareInfo.todayOverride) : Promise.resolve(null),
    compareInfo ? getGeneralRevenueChart(partnerId, compareInfo.period, compareInfo.todayOverride) : Promise.resolve(null),
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        {/* Row 1 */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <SummaryCards metrics={metrics} />
        </div>
        <div className="lg:col-span-6 flex flex-col gap-6">
          <ExpenseBreakdown originData={revenueOriginData.origins} revenueChartTrend={revenueChartData.trend} />
        </div>

        {/* Row 2 */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <Cashflow revenueData={revenueData} totalRevenue={revenueChartData.total} compareLabel={compareLabel || "Período Anterior"} />
        </div>
        <div className="lg:col-span-6 flex flex-col gap-6">
          <TopCategories categoriesData={topCategoriesData.categories} />
        </div>

        {/* Row 3 */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <NeedsAttention alerts={alertsData.alerts} />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-6">
          <RecentActivities activities={activityData.activity} />
        </div>
      </div>
    </div>
  );
}
