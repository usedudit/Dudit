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
import { COMPARE_LABELS } from "@/lib/period-types";

interface DashboardProps {
  partnerId: string;
  sells: string[];
  period?: Period;
  compare?: CompareMode;
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

export async function Dashboard({ partnerId, sells, period = "monthly", compare = "previous" }: DashboardProps) {
  const needsCompare = compare !== "previous"
  const comparePeriod = compare as Period

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
    needsCompare ? getGeneralMetrics(partnerId, comparePeriod) : Promise.resolve(null),
    needsCompare ? getGeneralRevenueChart(partnerId, comparePeriod) : Promise.resolve(null),
  ]);

  let metrics = metricsData.metrics
  let revenueData = revenueChartData.revenue
  let compareLabel = "período anterior"

  if (needsCompare && compareMetricsData && compareRevenueData) {
    compareLabel = COMPARE_LABELS[compare].toLowerCase()

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
          <Cashflow revenueData={revenueData} totalRevenue={revenueChartData.total} compareLabel={needsCompare ? compareLabel : "Período Anterior"} />
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
