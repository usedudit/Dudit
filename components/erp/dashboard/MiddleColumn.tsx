"use client";

import React from "react";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { ChevronDownIcon as ChevronDown } from "@/lib/icons";
import { formatCurrency as brl } from "@/lib/utils";

const ORIGIN_COLORS = [
  'var(--color-brand-dark)',
  'var(--color-brand-green)',
  'var(--color-brand-border)',
  '#93c5fd', // blue
  '#fbcfe8', // pink
];

export function ExpenseBreakdown({ originData, revenueChartTrend }: { originData: any[], revenueChartTrend: string }) {
  const totalRevenue = (originData || []).reduce((acc, o) => acc + Number(o.value), 0);

  const chartData = (originData || []).map((origin, index) => {
    const percent = totalRevenue > 0 ? Math.round((Number(origin.value) / totalRevenue) * 100) : 0;
    return {
      name: origin.label,
      value: percent,
      fill: ORIGIN_COLORS[index % ORIGIN_COLORS.length],
    };
  });

  const trendPositive = !revenueChartTrend?.startsWith("-");

  return (
    <div className="bg-white rounded-[24px] p-6 border border-brand-border flex flex-col h-full">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-brand-dark">Origem da Receita</h3>
        <button className="flex items-center space-x-1 text-[13px] font-bold text-brand-dark hover:text-brand-inactive-text">
          <span>Últimos 30 Dias</span>
          <ChevronDown size={16} className="text-brand-inactive-text" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-center gap-8 flex-1">
        {/* Radial Chart */}
        <div className="h-[220px] w-full sm:w-[220px] shrink-0 relative mb-6 sm:mb-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="100%"
              barSize={14}
              data={chartData}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar
                background={{ fill: 'var(--color-brand-green-light)' }}
                dataKey="value"
                cornerRadius={10}
              />
            </RadialBarChart>
          </ResponsiveContainer>
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
              const color = ORIGIN_COLORS[index % ORIGIN_COLORS.length];

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
