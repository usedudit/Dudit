import { getGeneralRevenueOrigin } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardPieChart, CHART_COLORS } from "../../charts/DashboardCharts"
import { PeriodSelector } from "../../PeriodSelector"
import { brl, money } from "@/lib/data/dashboard"

export async function RevenueOriginWidget({ partnerId }: { partnerId: string }) {
    const { origins } = await getGeneralRevenueOrigin(partnerId)

    // Don't render if 0 or 1 origin - pie chart would be useless
    if (origins.length <= 1) return null

    const totalValue = origins.reduce((acc, o) => acc + money(o.value), 0)

    return (
        <DashboardSectionCard 
            title="Origem da receita"
            action={<PeriodSelector />}
            className="flex flex-col h-full"
        >
            <div className="flex flex-col xl:flex-row items-center justify-center xl:justify-between gap-8 xl:gap-4 py-2 h-full flex-1">
                {/* Chart Container */}
                <div className="w-full xl:w-1/2 flex items-center justify-center">
                    <DashboardPieChart 
                        data={origins} 
                        totalValue={brl(totalValue)} 
                        totalLabel="Total" 
                    />
                </div>

                {/* Legends Container */}
                <div className="flex flex-col justify-center gap-4 w-full xl:w-1/2 px-4 xl:px-0">
                    {origins.map((o, index) => (
                        <div key={o.label} className="flex items-center justify-between gap-4 w-full">
                            <div className="flex items-center gap-3.5">
                                <div
                                    className="h-7 w-11 rounded-full shrink-0"
                                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                                />
                                <span className="text-[14px] font-medium text-brand-dark dark:text-dark-heading">
                                    {o.label}
                                </span>
                            </div>
                            <span className="text-[14px] font-medium text-brand-dark dark:text-dark-heading whitespace-nowrap">
                                {brl(o.value)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </DashboardSectionCard>
    )
}
