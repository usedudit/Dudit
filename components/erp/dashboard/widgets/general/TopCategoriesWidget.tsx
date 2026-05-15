import { getGeneralTopCategories } from "@/lib/data/dashboard"
import { DashboardSectionCard } from "../../cards/DashboardSectionCard"
import { DashboardBarChart } from "../../charts/DashboardCharts"
import { TagIcon } from "@/lib/icons"

export async function TopCategoriesWidget({ partnerId, sells }: { partnerId: string; sells: string[] }) {
    const { categories } = await getGeneralTopCategories(partnerId, sells)

    if (categories.length === 0) return null

    return (
        <DashboardSectionCard title="Top categorias" className="h-full">
            <DashboardBarChart data={categories} />
        </DashboardSectionCard>
    )
}
