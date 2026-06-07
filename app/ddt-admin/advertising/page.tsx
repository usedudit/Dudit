import { AdminHeader } from "@/components/admin/admin-header"
import AdvertisementsList from "@/components/admin/advertising/AdvertisementsList"
import { getAdminAdvertisements } from "@/app/actions/admin/advertisements"

export const dynamic = "force-dynamic"

export default async function AdvertisingAdminPage() {
    const initialData = await getAdminAdvertisements()

    return (
        <>
            <AdminHeader pageTitle="Publicidade" />
            <AdvertisementsList initialData={initialData} />
        </>
    )
}
