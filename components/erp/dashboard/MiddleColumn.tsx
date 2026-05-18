"use client";

import React from "react";
import { formatCurrency as brl } from "@/lib/utils";
import { Dropdown, DropdownItem } from "@/components/reusable";
import { DashboardPieChart, CHART_COLORS } from "./charts/DashboardCharts";

export function ExpenseBreakdown({ originData, revenueChartTrend }: { originData: any[], revenueChartTrend: string }) {
  const totalRevenue = (originData || []).reduce((acc, o) => acc + Number(o.value), 0);
  const trendPositive = !revenueChartTrend?.startsWith("-");

  return (
    <div className="bg-white rounded-[24px] p-6 border border-brand-border flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-brand-dark">Origem da Receita</h3>
        <Dropdown
          fullWidth={false}
          align="right"
          width="w-44"
          trigger={
            <button className="flex items-center text-[13px] font-bold text-brand-dark hover:text-brand-inactive-text">
              <span>Últimos 30 Dias</span>
            </button>
          }
        >
          <DropdownItem>Últimos 30 Dias</DropdownItem>
        </Dropdown>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-8 flex-1">
        {/* Half Donut Chart */}
        <div className="w-full max-w-[260px] mx-auto -mb-4 shrink-0 flex items-center justify-center">
          <DashboardPieChart 
            data={(originData || []).map(o => ({ label: o.label, value: Number(o.value) }))} 
            totalValue={brl(totalRevenue)} 
            totalLabel="Receita Total"
            half
          />
        </div>

        <div className="flex flex-col flex-1 w-full justify-center">
          {/* Expense Summary Header */}
          <div className="mb-6">
            <div className="text-[13px] font-semibold text-brand-inactive-text mb-1">Total de Vendas</div>
            <div className="flex items-baseline space-x-3">
              <span className="text-[32px] font-extrabold text-brand-dark tracking-tight leading-none">{brl(totalRevenue)}</span>
              {revenueChartTrend && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-[6px] flex items-center space-x-1 ${trendPositive ? "bg-brand-green-secondary text-brand-green" : "bg-[#fce6e5] text-[#cc4745]"
                  }`}>
                  <span>{trendPositive ? "↑" : "↓"}</span><span>{revenueChartTrend.replace(/[+-]/g, "")}</span>
                </span>
              )}
            </div>
          </div>

          {/* Legend / List */}
          <div className="space-y-4">
            {(originData || []).map((item, index) => {
              const percent = totalRevenue > 0 ? Math.round((Number(item.value) / totalRevenue) * 100) : 0;
              const color = CHART_COLORS[index % CHART_COLORS.length];

              return (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-[14px] h-[14px] rounded-[4px] shrink-0" style={{ backgroundColor: color }} />
                    <div>
                      <div className="text-[15px] font-bold text-brand-dark leading-tight">{item.label}</div>
                      <div className="text-[13px] font-semibold text-brand-inactive-text mt-0.5">{brl(item.value)}</div>
                    </div>
                  </div>
                  <div className="text-[13px] font-extrabold text-brand-dark bg-brand-green-light px-3.5 py-1.5 rounded-lg border border-brand-border">
                    {percent}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
