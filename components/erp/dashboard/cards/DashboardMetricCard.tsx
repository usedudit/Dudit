import type { Metric } from "@/lib/data/dashboard"
import { KPICard } from "./KPICard"

export function DashboardMetricCard({ metric, isLast }: { metric: Metric; isLast?: boolean }) {
    return (
        <KPICard
            title={metric.title}
            value={metric.value}
            trend={metric.trend}
            isLast={isLast}
        />
    )
}
