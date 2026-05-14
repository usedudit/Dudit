import type { GeneralDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardLineChart, DashboardPieChart, DashboardBarChart } from "../charts/DashboardCharts"
import { DashboardList } from "../tables/DashboardList"
import { MoneyIcon, ChartIcon, TagIcon, ListIcon, CalendarIcon, CreditCardIcon, PackageIcon } from "@/lib/icons"

import { PeriodSelector } from "../PeriodSelector"

export function GeneralTab({ data }: { data: GeneralDashboardData }) {
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionCard 
          title="Evolução da receita" 
          icon={MoneyIcon} 
          className="xl:col-span-2"
          action={<PeriodSelector />}
        >
          <DashboardLineChart data={data.revenue} />
        </DashboardSectionCard>

        <DashboardSectionCard title="Receita produtos vs serviços" icon={ChartIcon}>
          <DashboardPieChart data={data.revenueSplit} />
        </DashboardSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Distribuição por categoria" icon={TagIcon}>
          <DashboardBarChart data={data.distribution} />
        </DashboardSectionCard>

        <DashboardSectionCard title="Últimos pedidos" icon={ListIcon}>
          <DashboardList items={data.latestOrders} />
        </DashboardSectionCard>

        <DashboardSectionCard title="Próximos agendamentos" icon={CalendarIcon}>
          <DashboardList items={data.nextAppointments} />
        </DashboardSectionCard>

        <DashboardSectionCard title="Contas vencendo" icon={CreditCardIcon}>
          <DashboardList items={data.dueAccounts} empty="Nenhuma conta vencendo." />
        </DashboardSectionCard>

        <DashboardSectionCard title="Produtos com estoque crítico" icon={PackageIcon} className="xl:col-span-2">
          <DashboardList items={data.criticalStock} empty="Nenhum produto crítico." />
        </DashboardSectionCard>
      </div>
    </div>
  )
}

