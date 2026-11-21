import { AdminHeader } from "@/components/admin/admin-header"
import PartnersList from "@/components/admin/partners/PartnersList"

export const dynamic = "force-dynamic"

export default async function PartnersPage() {
    return (
        <>
            <AdminHeader pageTitle="Parceiros" />
            <PartnersList
                initialData={{ data: [], nextCursor: null, prevCursor: null, hasMore: false }}
            />
        </>
    )
}
