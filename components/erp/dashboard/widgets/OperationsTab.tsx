import type { OperationsDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardList } from "../tables/DashboardList"
import { TruckIcon, FileIcon } from "@/lib/icons"

export function OperationsTab({ data }: { data: OperationsDashboardData }) {
  return (
    <div className="space-y-6">
      {/* Unified Metrics Card */}
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm shadow-brand-dark/5 dark:border-dark-border dark:bg-dark-surface">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6">
          {data.metrics.map((metric, index) => (
            <DashboardMetricCard 
              key={metric.title} 
              metric={metric} 
              isLast={index === data.metrics.length - 1} 
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Entregas do dia" icon={TruckIcon}>
          <DashboardList items={data.deliveriesToday} empty="Nenhuma entrega hoje." />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="OS em andamento" icon={FileIcon}>
          <DashboardList items={data.serviceOrders} empty="Nenhuma OS em andamento." />
        </DashboardSectionCard>
      </div>
    </div>
  )
}

