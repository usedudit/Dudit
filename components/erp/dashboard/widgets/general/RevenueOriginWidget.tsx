import { getGeneralRevenueOrigin } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardPieChart, CHART_COLORS } from "../../charts/DashboardCharts"
import { ChartIcon } from "@/lib/icons"
import { money } from "@/lib/data/dashboard"

export async function RevenueOriginWidget({ partnerId }: { partnerId: string }) {
    const { origins } = await getGeneralRevenueOrigin(partnerId)

    // Don't render if 0 or 1 origin — pie chart would be useless
    if (origins.length <= 1) return null

    const totalValue = origins.reduce((acc, o) => acc + money(o.value), 0)

    return (
        <DashboardSectionCard title="Origem da receita">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 md:gap-12 py-4">
                {/* Chart Container */}
                <div className="w-full max-w-[240px] h-[240px] flex items-center justify-center">
                    <DashboardPieChart data={origins} />
                </div>
                
                {/* Legends Container */}
                <div className="flex flex-col gap-4 min-w-[160px]">
                    {origins.map((o, index) => {
                        const percent = totalValue > 0 ? (money(o.value) / totalValue) * 100 : 0
                        return (
                            <div key={o.label} className="flex items-center gap-4">
                                <div 
                                    className="h-3 w-3 rounded-full shrink-0" 
                                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} 
                                />
                                <div className="flex flex-col">
                                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading leading-tight">
                                        {o.label}
                                    </span>
                                    <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body">
                                        {Math.round(percent)}%
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </DashboardSectionCard>
    )
}
