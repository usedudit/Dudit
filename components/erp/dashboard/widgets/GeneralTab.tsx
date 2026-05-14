import { Suspense } from "react"
import { MetricsWidget } from "./general/MetricsWidget"
import { AlertsWidget } from "./general/AlertsWidget"
import { RevenueChartWidget } from "./general/RevenueChartWidget"
import { RevenueOriginWidget } from "./general/RevenueOriginWidget"
import { ActivityWidget } from "./general/ActivityWidget"
import { TopCategoriesWidget } from "./general/TopCategoriesWidget"
import { MetricsSkeleton, ChartSkeleton, AlertsSkeleton, ListSkeleton } from "./general/skeletons"

export function GeneralTab({ partnerId, sells }: { partnerId: string; sells: string[] }) {
    return (
        <div className="space-y-6">
            {/* Universal Metrics */}
            <Suspense fallback={<MetricsSkeleton />}>
                <MetricsWidget partnerId={partnerId} />
            </Suspense>

            {/* Charts Row */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Suspense fallback={<ChartSkeleton className="xl:col-span-2" />}>
                    <RevenueChartWidget partnerId={partnerId} />
                </Suspense>
                <Suspense fallback={<ChartSkeleton />}>
                    <RevenueOriginWidget partnerId={partnerId} />
                </Suspense>
            </div>

            {/* Contextual Alerts */}
            <Suspense fallback={<AlertsSkeleton />}>
                <AlertsWidget partnerId={partnerId} sells={sells} />
            </Suspense>

            {/* Activity + Categories Row */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Suspense fallback={<ListSkeleton />}>
                    <ActivityWidget partnerId={partnerId} />
                </Suspense>
                <Suspense fallback={<ChartSkeleton />}>
                    <TopCategoriesWidget partnerId={partnerId} sells={sells} />
                </Suspense>
            </div>
        </div>
    )
}
