import { getGeneralRevenueChart } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardLineChart } from "../../charts/DashboardCharts"
import { MoneyIcon, HelpCircleIcon } from "@/lib/icons"
import { PeriodSelector } from "../../PeriodSelector"
import { brl, money } from "@/lib/data/dashboard"
import { cn } from "@/lib/utils"

export async function RevenueChartWidget({ partnerId }: { partnerId: string }) {
    const { revenue, total, trend } = await getGeneralRevenueChart(partnerId)
    const trendPositive = trend.startsWith("+")

    return (
        <DashboardSectionCard
            title={<>Receita Total <HelpCircleIcon className="h-3.5 w-3.5 text-brand-inactive-text cursor-help" /></>}
            icon={MoneyIcon}
            className="xl:col-span-2"
            action={<PeriodSelector />}
        >
            <div className="flex flex-col gap-1">
                {/* Value & Legend Row */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-[32px] font-bold tracking-tight text-brand-dark dark:text-dark-heading leading-none">
                            {brl(total)}
                        </span>
                        {trend && (
                            <span className={cn(
                                "text-[15px] font-bold",
                                trendPositive ? "text-brand-green" : "text-brand-red"
                            )}>
                                {trend} <span className="text-brand-inactive-text font-medium text-[13px]">vs mês passado</span>
                            </span>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-[13px] font-bold text-brand-dark dark:text-dark-heading">
                        <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full bg-brand-dark" />
                            <span>Este Mês</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full border-2 border-gray-300" />
                            <span>Mês Passado</span>
                        </div>
                    </div>
                </div>

                {/* Chart */}
                <DashboardLineChart data={revenue} />
            </div>
        </DashboardSectionCard>
    )
}
