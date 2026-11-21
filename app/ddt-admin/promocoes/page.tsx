import { AdminHeader } from "@/components/admin/admin-header"
import PromotionsList from "@/components/admin/promotions/PromotionsList"

export const dynamic = "force-dynamic"

export default async function AdminPromotionsPage() {
    return (
        <>
            <AdminHeader pageTitle="Campanhas & Promoções" />
            <PromotionsList initialData={[]} />
        </>
    )
}
