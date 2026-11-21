import { AdminHeader } from "@/components/admin/admin-header"
import CommunityVideosList from "@/components/admin/videos/CommunityVideosList"

export const dynamic = "force-dynamic"

export default async function AdminVideosPage() {
    return (
        <>
            <AdminHeader pageTitle="Vídeos da Comunidade" />
            <CommunityVideosList initialData={[]} />
        </>
    )
}
