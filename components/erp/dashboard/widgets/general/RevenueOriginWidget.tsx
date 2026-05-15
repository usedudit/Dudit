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
        <DashboardSectionCard title="Origem da receita" icon={ChartIcon}>
            <div className="flex flex-col xl:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                    <DashboardPieChart data={origins} />
                </div>
                
                {/* Legends */}
                <div className="flex flex-col gap-2.5 min-w-[140px] w-full xl:w-auto">
                    {origins.map((o, index) => {
                        const percent = totalValue > 0 ? (money(o.value) / totalValue) * 100 : 0
                        return (
                            <div key={o.label} className="flex items-center justify-between xl:justify-start gap-3">
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="h-2.5 w-2.5 rounded-full shrink-0" 
                                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} 
                                    />
                                    <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading truncate max-w-[100px]">
                                        {o.label}
                                    </span>
                                </div>
                                <span className="text-[12px] font-bold text-brand-inactive-text dark:text-dark-body ml-auto">
                                    {Math.round(percent)}%
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </DashboardSectionCard>
    )
}
