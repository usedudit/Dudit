import { getGeneralRevenueOrigin } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardPieChart, CHART_COLORS } from "../../charts/DashboardCharts"
import { PeriodSelector } from "../../PeriodSelector"
import { brl, money } from "@/lib/data/dashboard"

export async function RevenueOriginWidget({ partnerId }: { partnerId: string }) {
    const { origins } = await getGeneralRevenueOrigin(partnerId)

    if (origins.length <= 1) return null

    const totalValue = origins.reduce((acc, o) => acc + money(o.value), 0)

    return (
        <DashboardSectionCard 
            title="Origem da receita"
            action={<PeriodSelector />}
            className="flex flex-col h-full"
        >
            <div className="flex flex-col items-center gap-6 py-2">
                {/* Half Donut Chart */}
                <div className="w-full max-w-[280px]">
                    <DashboardPieChart 
                        data={origins} 
                        totalValue={brl(totalValue)} 
                        totalLabel="Receita Total"
                        half
                    />
                </div>

                {/* Vertical Legends List */}
                <div className="flex flex-col gap-4 w-full pt-4 border-t border-brand-border/40 dark:border-dark-border/40">
                    {origins.map((o, index) => (
                        <div key={o.label} className="flex items-center justify-between gap-4 w-full">
                            <div className="flex items-center gap-3.5">
                                {/* Vertical colored rounded bar */}
                                <div
                                    className="h-6 w-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                />
                                <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                    {o.label}
                                </span>
                            </div>
                            <span className="text-[14px] font-bold text-brand-dark dark:text-dark-heading">
                                {brl(o.value)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </DashboardSectionCard>
    )
}
