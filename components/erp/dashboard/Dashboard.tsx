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

interface DashboardProps {
  partnerId: string;
  sells: string[];
}

export async function Dashboard({ partnerId, sells }: DashboardProps) {
  // Fetch all general dashboard data in parallel on the server
  const [
    metricsData,
    revenueChartData,
    revenueOriginData,
    alertsData,
    activityData,
    topCategoriesData
  ] = await Promise.all([
    getGeneralMetrics(partnerId),
    getGeneralRevenueChart(partnerId),
    getGeneralRevenueOrigin(partnerId),
    getGeneralAlerts(partnerId, sells),
    getGeneralActivity(partnerId),
    getGeneralTopCategories(partnerId, sells)
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
