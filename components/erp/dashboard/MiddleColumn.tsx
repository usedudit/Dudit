"use client";

import { formatCurrency as brl } from "@/lib/utils";
import { DashboardPieChart, CHART_COLORS } from "./charts/DashboardCharts";
import { CreditCardIcon } from "@/lib/icons";

export function ExpenseBreakdown({ originData, revenueChartTrend }: { originData: any[], revenueChartTrend: string }) {
    const totalRevenue = (originData || []).reduce((acc, o) => acc + Number(o.value), 0);
    const trendPositive = !revenueChartTrend?.startsWith("-");

    return (
        <div className="bg-white dark:bg-dark-surface rounded-[24px] p-6 border border-brand-border dark:border-dark-border flex flex-col h-full">
            <div className="flex items-center space-x-3 mb-8">
                <div className="w-10 h-10 rounded-full bg-brand-green-light dark:bg-dark-border/40 flex items-center justify-center text-brand-dark dark:text-dark-heading shrink-0">
                    <CreditCardIcon size={18} className="text-brand-dark dark:text-dark-heading" />
                </div>
                <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Origem da Receita</h3>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-8 sm:gap-12 flex-1">
                {/* Full Donut Chart */}
                <div className="w-full max-w-[300px] mx-auto shrink-0 flex items-center justify-center">
                    <DashboardPieChart
                        data={(originData || []).map(o => ({ label: o.label, value: Number(o.value) }))}
                        totalValue={brl(totalRevenue)}
                        totalLabel="Receita Total"
                        innerRadius={68}
                        outerRadius={92}
                        className="h-[220px]"
                    />
                </div>

                <div className="flex flex-col flex-1 w-full justify-center">
                    {/* Legend / List */}
                    <div className="space-y-1.5">
                        {(originData || []).map((item, index) => {
                            const percent = totalRevenue > 0 ? Math.round((Number(item.value) / totalRevenue) * 100) : 0;
                            const color = CHART_COLORS[index % CHART_COLORS.length];

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
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
