import { AdminHeader } from "@/components/admin/admin-header"
import PromotionsList from "@/components/admin/promotions/PromotionsList"
import { getAdminPromotions, getAdminPromotionsStats } from "@/app/actions/admin/promotions"

export const dynamic = "force-dynamic"

export default async function AdminPromotionsPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminPromotions(null, 50),
        getAdminPromotionsStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Campanhas & Promoções" />
            <PromotionsList initialData={initialData.data} initialStats={initialStats} />
        </>
    )
}

