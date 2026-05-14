import { getGeneralRevenueOrigin } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardPieChart } from "../../charts/DashboardCharts"
import { ChartIcon } from "@/lib/icons"

export async function RevenueOriginWidget({ partnerId }: { partnerId: string }) {
    const { origins } = await getGeneralRevenueOrigin(partnerId)

    // Don't render if 0 or 1 origin — pie chart would be useless
    if (origins.length <= 1) return null

    return (
        <DashboardSectionCard title="Origem da receita" icon={ChartIcon}>
            <DashboardPieChart data={origins} />
        </DashboardSectionCard>
    )
}
