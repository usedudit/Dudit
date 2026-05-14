import { getGeneralMetrics } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../../cards/DashboardMetricCard"

export async function MetricsWidget({ partnerId }: { partnerId: string }) {
    const { metrics } = await getGeneralMetrics(partnerId)

    return (
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm shadow-brand-dark/5 dark:border-dark-border dark:bg-dark-surface">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric, index) => (
                    <DashboardMetricCard
                        key={metric.title}
                        metric={metric}
                        isLast={index === metrics.length - 1}
                    />
                ))}
            </div>
        </div>
    )
}
