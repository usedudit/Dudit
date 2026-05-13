import type { GeneralDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardLineChart, DashboardPieChart, DashboardBarChart } from "../charts/DashboardCharts"
import { DashboardList } from "../tables/DashboardList"

export function GeneralTab({ data }: { data: GeneralDashboardData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data.metrics.map((metric, index) => <DashboardMetricCard key={metric.title} metric={metric} featured={index === 0} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionCard title="Evolução da receita" className="xl:col-span-2"><DashboardLineChart data={data.revenue} /></DashboardSectionCard>
        <DashboardSectionCard title="Receita produtos vs serviços"><DashboardPieChart data={data.revenueSplit} /></DashboardSectionCard>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Distribuição por categoria"><DashboardBarChart data={data.distribution} /></DashboardSectionCard>
        <DashboardSectionCard title="Últimos pedidos"><DashboardList items={data.latestOrders} /></DashboardSectionCard>
        <DashboardSectionCard title="Próximos agendamentos"><DashboardList items={data.nextAppointments} /></DashboardSectionCard>
        <DashboardSectionCard title="Contas vencendo"><DashboardList items={data.dueAccounts} empty="Nenhuma conta vencendo." /></DashboardSectionCard>
        <DashboardSectionCard title="Produtos com estoque crítico" className="xl:col-span-2"><DashboardList items={data.criticalStock} empty="Nenhum produto crítico." /></DashboardSectionCard>
      </div>
    </div>
  )
}
