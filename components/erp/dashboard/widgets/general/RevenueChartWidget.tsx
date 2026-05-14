import { getGeneralRevenueChart } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardLineChart } from "../../charts/DashboardCharts"
import { MoneyIcon } from "@/lib/icons"
import { PeriodSelector } from "../../PeriodSelector"

export async function RevenueChartWidget({ partnerId }: { partnerId: string }) {
    const { revenue } = await getGeneralRevenueChart(partnerId)

    return (
        <DashboardSectionCard
            title="Evolução da receita"
            icon={MoneyIcon}
            className="xl:col-span-2"
            action={<PeriodSelector />}
        >
            <DashboardLineChart data={revenue} />
        </DashboardSectionCard>
    )
}
