import type { ServicesDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardList } from "../tables/DashboardList"

export function ServicesTab({ data }: { data: ServicesDashboardData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data.metrics.map((metric, index) => <DashboardMetricCard key={metric.title} metric={metric} featured={index === 0} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
        <DashboardSectionCard title="Distribuição operacional">
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
            <div className="border-b border-brand-border dark:border-dark-border lg:border-b-0 lg:border-r">
              <div className="px-5 py-3 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Funcionários</div>
              <DashboardList items={data.staffRows} />
            </div>
            <div className="border-b border-brand-border dark:border-dark-border lg:border-b-0 lg:border-r">
              <div className="px-5 py-3 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Categorias</div>
              <DashboardList items={data.categoryRows} />
            </div>
            <div>
              <div className="px-5 py-3 text-[13px] font-bold text-brand-inactive-text dark:text-dark-body">Serviços</div>
              <DashboardList items={data.serviceRows} />
            </div>
          </div>
        </DashboardSectionCard>
        <DashboardSectionCard title="Agendamentos de hoje"><DashboardList items={data.todayAppointments} empty="Nenhum agendamento hoje." /></DashboardSectionCard>
      </div>
    </div>
  )
}
