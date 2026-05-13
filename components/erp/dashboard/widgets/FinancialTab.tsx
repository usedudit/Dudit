import type { FinancialDashboardData } from "@/lib/data/dashboard"
import { DashboardMetricCard } from "../cards/DashboardMetricCard"
import { DashboardSectionCard } from "../cards/DashboardSectionCard"
import { DashboardBarChart, DashboardLineChart, DashboardPieChart } from "../charts/DashboardCharts"
import { DashboardList } from "../tables/DashboardList"

export function FinancialTab({ data }: { data: FinancialDashboardData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric, index) => <DashboardMetricCard key={metric.title} metric={metric} featured={index === 0} />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardSectionCard title="Evolução da receita"><DashboardLineChart data={data.revenue} /></DashboardSectionCard>
        <DashboardSectionCard title="Fluxo de caixa"><DashboardLineChart data={data.cashflow} /></DashboardSectionCard>
        <DashboardSectionCard title="Despesas por categoria"><DashboardBarChart data={data.expensesByCategory} /></DashboardSectionCard>
        <DashboardSectionCard title="Distribuição financeira"><DashboardPieChart data={data.distribution} /></DashboardSectionCard>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <DashboardSectionCard title="Últimas movimentações"><DashboardList items={data.latestMovements} /></DashboardSectionCard>
        <DashboardSectionCard title="Contas vencidas"><DashboardList items={data.overdueAccounts} empty="Nenhuma conta vencida." /></DashboardSectionCard>
        <DashboardSectionCard title="Maiores despesas"><DashboardList items={data.largestExpenses} /></DashboardSectionCard>
      </div>
    </div>
  )
}
