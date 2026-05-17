import { getGeneralMetrics } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../../cards/DashboardMetricCard"

export async function MetricsWidget({ partnerId }: { partnerId: string }) {
    const { metrics } = await getGeneralMetrics(partnerId)

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {metrics.map((metric, index) => (
                <DashboardMetricCard
                    key={metric.title}
                    metric={metric}
                />
            ))}
        </div>
    )
}
