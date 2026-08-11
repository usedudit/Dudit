"use client"

import React from "react"
import type { FinancialDashboardData } from "@/lib/data/dashboard"
import { SummaryCards } from "../LeftColumn"
import { DashboardPieChart, DashboardLineChart, DashboardBarChart, CHART_COLORS } from "../charts/DashboardCharts"
import { formatCurrency as brl } from "@/lib/utils"
import { Dropdown, DropdownItem, Button } from "@/components/reusable"
import { MoneyIcon, ChartIcon, CreditCardIcon, ListIcon, TagIcon } from "@/lib/icons"
import { useRouter } from "next/navigation"

export function FinancialTab({ data }: { data: FinancialDashboardData }) {
  const router = useRouter()

  // 1. Distribuição Financeira (Donut Chart)
  const totalDistribution = (data.distribution || []).reduce((acc, d) => acc + Number(d.value), 0)

  // 2. Cashflow data mapping
  const cashflowData = (data.cashflow || []).map(p => ({
    label: p.label,
    value: Number(p.value),
    secondary: Number(p.secondary || 0)
  }))

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full mx-auto">
        
        {/* Row 1 Left: Metrics (SummaryCards style) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <SummaryCards metrics={data.metrics} />
        </div>

        {/* Row 1 Right: Financial Distribution Donut Chart (ExpenseBreakdown style) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <ChartIcon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
                Distribuição Financeira
              </h3>
              <Dropdown
                fullWidth={false}
                align="right"
                width="w-44"
                trigger={
                  <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors">
                    <span>Últimos 30 Dias</span>
                  </button>
                }
              >
                <DropdownItem>Hoje</DropdownItem>
                <DropdownItem>Últimos 7 Dias</DropdownItem>
                <DropdownItem>Últimos 30 Dias</DropdownItem>
              </Dropdown>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-8 sm:gap-12 flex-1">
              <div className="w-full max-w-[240px] mx-auto shrink-0 flex items-center justify-center">
                <DashboardPieChart
                  data={(data.distribution || []).map(d => ({ label: d.label, value: Number(d.value) }))}
                  totalValue={brl(totalDistribution)}
                  totalLabel="Movimentação"
                  innerRadius={68}
                  outerRadius={92}
                  className="h-[220px]"
                />
              </div>

              <div className="flex flex-col flex-1 w-full justify-center">
                <div className="space-y-1.5">
                  {(data.distribution || []).map((item, index) => {
                    const percent = totalDistribution > 0 ? Math.round((Number(item.value) / totalDistribution) * 100) : 0
                    const color = CHART_COLORS[index % CHART_COLORS.length]

                    return (
                      <div key={item.label} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-[14px] h-[14px] rounded-[4px] shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-[15px] font-medium text-brand-dark dark:text-dark-heading leading-none">
                            {item.label} <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1.5">•</span> {brl(item.value)}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-brand-dark dark:text-dark-heading bg-brand-green-light dark:bg-dark-border/40 px-2 py-1 rounded-full border border-brand-border dark:border-dark-border">
                          {percent}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 Left: Fluxo de Caixa Line Chart (Cashflow style) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-4">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <MoneyIcon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
                Fluxo de Caixa
              </h3>
              <Dropdown
                fullWidth={false}
                align="right"
                width="w-44"
                trigger={
                  <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors">
                    <span>Últimos 30 Dias</span>
                  </button>
                }
              >
                <DropdownItem>Hoje</DropdownItem>
                <DropdownItem>Últimos 7 Dias</DropdownItem>
                <DropdownItem>Últimos 30 Dias</DropdownItem>
              </Dropdown>
            </div>

            <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
              <div>
                <span className="text-[13px] font-semibold text-brand-inactive-text dark:text-dark-body">Saldo Atual</span>
                <div className="text-[32px] font-bold text-brand-dark dark:text-dark-heading tracking-tight leading-none mt-1">
                  {data.metrics.find(m => m.title.includes("Saldo"))?.value || "R$ 0,00"}
                </div>
              </div>
            </div>

            <DashboardLineChart data={cashflowData} />
          </div>
        </div>

        {/* Row 2 Right: Despesas por Categoria Bar Chart (TopCategories style) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
            <div className="flex flex-wrap items-center justify-between mb-8 gap-4">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <TagIcon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
                Despesas por Categoria
              </h3>
              <Dropdown
                fullWidth={false}
                align="right"
                width="w-44"
                trigger={
                  <button className="flex items-center text-[13px] font-bold text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border rounded-full px-4 py-2 hover:bg-brand-green-light dark:hover:bg-dark-border transition-colors">
                    <span>Últimos 30 Dias</span>
                  </button>
                }
              >
                <DropdownItem>Hoje</DropdownItem>
                <DropdownItem>Últimos 7 Dias</DropdownItem>
                <DropdownItem>Últimos 30 Dias</DropdownItem>
              </Dropdown>
            </div>

            <DashboardBarChart data={(data.expensesByCategory || []).map(e => ({ label: e.label, value: Number(e.value) }))} />
          </div>
        </div>

        {/* Row 3 Left: Overdue Accounts Table (NeedsAttention style) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
            <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <CreditCardIcon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
                Contas Vencidas / Pendentes
              </h3>
            </div>

            {(!data.overdueAccounts || data.overdueAccounts.length === 0) ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">Nenhuma conta vencida ou pendente.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap min-w-[500px]">
                  <tbody>
                    {data.overdueAccounts.slice(0, 6).map((item) => {
                      return (
                        <tr key={item.id} className="border-b border-brand-border dark:border-dark-border last:border-b-0 h-[80px]">
                          <td className="pl-2">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading">
                                <CreditCardIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                              </div>
                              <div>
                                <div className="text-[15px] font-bold text-brand-dark dark:text-dark-heading mb-0.5">{item.title}</div>
                                <div className="text-[13px] font-medium text-brand-inactive-text dark:text-dark-body">
                                  {item.subtitle} · Vencimento: {item.meta}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right pr-6">
                            <span className={`text-[15px] font-bold ${item.tone === "red" ? "text-[#cc4745]" : "text-brand-green"}`}>
                              {item.value}
                            </span>
                          </td>
                          <td className="text-right w-[100px]">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[12px] font-bold py-1 px-4 whitespace-nowrap h-auto"
                              onClick={() => router.push("/erp/transacoes")}
                            >
                              Ver Detalhes
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Row 3 Right: Latest Movements / Transactions List (RecentActivities style) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex-1">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading flex items-center gap-2">
                <ListIcon size={20} className="text-brand-dark dark:text-dark-heading opacity-80" />
                Últimas Movimentações
              </h3>
            </div>

            <div className="space-y-8">
              <div>
                <div className="space-y-6 relative">
                  <div className="absolute left-[15px] top-4 bottom-[-16px] w-[2px] bg-brand-green-light dark:bg-dark-border/40 z-0" />
                  
                  {data.latestMovements.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex relative z-10 w-full">
                      <div className="w-8 h-8 rounded-full bg-brand-green-second dark:bg-dark-border/40 flex-shrink-0 flex items-center justify-center mr-4 border-[3px] border-white dark:border-dark-surface shadow-[0_0_0_2px_#ffffff] dark:shadow-[0_0_0_2px_rgba(28,28,30,0.5)]">
                        <MoneyIcon size={14} className={item.tone === "red" ? "text-[#cc4745]" : "text-brand-green"} />
                      </div>
                      <div className="flex flex-col justify-start -mt-0.5">
                        <div className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide mb-1">
                          {item.meta} · {item.subtitle}
                        </div>
                        <div className="text-[14px] font-semibold text-brand-dark dark:text-dark-heading leading-snug">
                          {item.title} <span className="text-brand-inactive-text dark:text-dark-body font-medium mx-1">•</span> <span className={item.tone === "red" ? "text-[#cc4745]" : "text-brand-green"}>{item.value}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
