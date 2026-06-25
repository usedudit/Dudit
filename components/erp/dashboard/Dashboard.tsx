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

interface DashboardProps {
  partnerId: string;
  sells: string[];
  period?: Period;
  compare?: CompareMode;
}

export async function Dashboard({ partnerId, sells, period = "monthly", compare = "previous" }: DashboardProps) {
  const [
    metricsData,
    revenueChartData,
    revenueOriginData,
    alertsData,
    activityData,
    topCategoriesData
  ] = await Promise.all([
    getGeneralMetrics(partnerId, period),
    getGeneralRevenueChart(partnerId, period),
    getGeneralRevenueOrigin(partnerId, period),
    getGeneralAlerts(partnerId, sells),
    getGeneralActivity(partnerId),
    getGeneralTopCategories(partnerId, sells, period)
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        {/* Row 1 */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <SummaryCards metrics={metricsData.metrics} />
        </div>
        <div className="lg:col-span-6 flex flex-col gap-6">
          <ExpenseBreakdown originData={revenueOriginData.origins} revenueChartTrend={revenueChartData.trend} />
        </div>

        {/* Row 2 */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <Cashflow revenueData={revenueChartData.revenue} totalRevenue={revenueChartData.total} />
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
