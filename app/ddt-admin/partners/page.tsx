import { AdminHeader } from "@/components/admin/admin-header"
import PartnersList from "@/components/admin/partners/PartnersList"
import { getPartners, getAdminPartnerStats } from "@/app/actions/admin/enforcement"

export const dynamic = "force-dynamic"

export default async function PartnersPage() {
    const [initialData, initialStats] = await Promise.all([
        getPartners(null, 10),
        getAdminPartnerStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Parceiros" />
            <PartnersList initialData={initialData} initialStats={initialStats} />
        </>
    )
}
