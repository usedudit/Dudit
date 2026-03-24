import { AdminHeader } from "@/components/admin/admin-header"
import PartnersList from "@/components/admin/PartnersList"
import { getPartners } from "@/app/actions/admin/enforcement"

export default async function PartnersPage() {
    const initialData = await getPartners(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Parceiros" />
            <PartnersList initialData={initialData} />
        </>
    )
}
