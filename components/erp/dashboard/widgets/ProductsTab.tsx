import type { ProductsDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardBarChart, DashboardLineChart } from "../charts/DashboardCharts"
import { DashboardList } from "../tables/DashboardList"
import { ShoppingBagIcon, TagIcon, TrendingUpIcon, ClockIcon, AwardIcon, PackageIcon } from "@/lib/icons"

import { PeriodSelector } from "../PeriodSelector"

export function ProductsTab({ data }: { data: ProductsDashboardData }) {
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
        <DashboardSectionCard title="Produtos mais vendidos" icon={ShoppingBagIcon} action={<PeriodSelector />}>
          <DashboardBarChart data={data.bestSellers} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Categorias que mais vendem" icon={TagIcon} action={<PeriodSelector />}>
          <DashboardBarChart data={data.categorySales} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Evolução de vendas" icon={TrendingUpIcon} action={<PeriodSelector />}>
          <DashboardLineChart data={data.salesEvolution} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Horários com mais pedidos" icon={ClockIcon}>
          <DashboardBarChart data={data.busyHours} />
        </DashboardSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionCard title="Top produtos" icon={AwardIcon}>
          <DashboardList items={data.topProducts} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Produtos parados" icon={PackageIcon}>
          <DashboardList items={data.idleProducts} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Estoque crítico" icon={PackageIcon}>
          <DashboardList items={data.criticalStock} />
        </DashboardSectionCard>
      </div>
    </div>
  )
}

