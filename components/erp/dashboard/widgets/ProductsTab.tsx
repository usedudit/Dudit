import type { ProductsDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardBarChart, DashboardLineChart } from "../charts/DashboardCharts"
import { DashboardList } from "../tables/DashboardList"

export function ProductsTab({ data }: { data: ProductsDashboardData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {data.metrics.map((metric) => <DashboardMetricCard key={metric.title} metric={metric} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Produtos mais vendidos"><DashboardBarChart data={data.bestSellers} /></DashboardSectionCard>
        <DashboardSectionCard title="Categorias que mais vendem"><DashboardBarChart data={data.categorySales} /></DashboardSectionCard>
        <DashboardSectionCard title="Evolução de vendas"><DashboardLineChart data={data.salesEvolution} /></DashboardSectionCard>
        <DashboardSectionCard title="Horários com mais pedidos"><DashboardBarChart data={data.busyHours} /></DashboardSectionCard>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionCard title="Top produtos"><DashboardList items={data.topProducts} /></DashboardSectionCard>
        <DashboardSectionCard title="Produtos parados"><DashboardList items={data.idleProducts} /></DashboardSectionCard>
        <DashboardSectionCard title="Estoque crítico"><DashboardList items={data.criticalStock} /></DashboardSectionCard>
      </div>
    </div>
  )
}
