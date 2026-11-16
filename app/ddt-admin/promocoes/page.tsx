import { AdminHeader } from "@/components/admin/admin-header"
import PromotionsList from "@/components/admin/promotions/PromotionsList"
import { getAdminCampaigns, getAdminCampaignsStats } from "@/app/actions/admin/promotions"

export const dynamic = "force-dynamic"

export default async function AdminPromotionsPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminCampaigns(null, 50),
        getAdminCampaignsStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Campanhas & Promoções" />
            <PromotionsList initialData={initialData.data} initialStats={initialStats} />
        </>
    )
}

