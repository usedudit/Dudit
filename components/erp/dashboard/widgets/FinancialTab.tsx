import type { FinancialDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardBarChart, DashboardLineChart, DashboardPieChart } from "../charts/DashboardCharts"
import { DashboardList } from "../tables/DashboardList"
import { MoneyIcon, ChartIcon, TagIcon, ListIcon, CreditCardIcon } from "@/lib/icons"

import { PeriodSelector } from "../PeriodSelector"

export function FinancialTab({ data }: { data: FinancialDashboardData }) {
  return (
    <div className="space-y-6">
      {/* Unified Metrics Card */}
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm shadow-brand-dark/5 dark:border-dark-border dark:bg-dark-surface">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
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
        <DashboardSectionCard title="Evolução da receita" icon={MoneyIcon} action={<PeriodSelector />}>
          <DashboardLineChart data={data.revenue} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Fluxo de caixa" icon={ChartIcon} action={<PeriodSelector />}>
          <DashboardLineChart data={data.cashflow} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Despesas por categoria" icon={TagIcon}>
          <DashboardBarChart data={data.expensesByCategory} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Distribuição financeira" icon={ChartIcon}>
          <DashboardPieChart data={data.distribution} />
        </DashboardSectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionCard title="Últimas movimentações" icon={ListIcon}>
          <DashboardList items={data.latestMovements} />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Contas vencidas" icon={CreditCardIcon}>
          <DashboardList items={data.overdueAccounts} empty="Nenhuma conta vencida." />
        </DashboardSectionCard>
        
        <DashboardSectionCard title="Maiores despesas" icon={MoneyIcon}>
          <DashboardList items={data.largestExpenses} />
        </DashboardSectionCard>
      </div>
    </div>
  )
}

