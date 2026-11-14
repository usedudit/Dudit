import { AdminHeader } from "@/components/admin/admin-header"
import CommunityVideosList from "@/components/admin/videos/CommunityVideosList"
import { getAdminCommunityVideos, getAdminCommunityVideosStats } from "@/app/actions/admin/community-videos"

export const dynamic = "force-dynamic"

export default async function AdminVideosPage() {
    const [initialData, initialStats] = await Promise.all([
        getAdminCommunityVideos(null, 50),
        getAdminCommunityVideosStats(),
    ])

    return (
        <>
            <AdminHeader pageTitle="Vídeos da Comunidade" />
            <CommunityVideosList initialData={initialData.data} initialStats={initialStats} />
        </>
    )
}

