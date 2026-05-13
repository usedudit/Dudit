import type { OperationsDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardList } from "../tables/DashboardList"

export function OperationsTab({ data }: { data: OperationsDashboardData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data.metrics.map((metric) => <DashboardMetricCard key={metric.title} metric={metric} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Entregas do dia"><DashboardList items={data.deliveriesToday} empty="Nenhuma entrega hoje." /></DashboardSectionCard>
        <DashboardSectionCard title="OS em andamento"><DashboardList items={data.serviceOrders} empty="Nenhuma OS em andamento." /></DashboardSectionCard>
      </div>
    </div>
  )
}
