import { AdminHeader } from "@/components/admin/admin-header"
import ModerationList from "@/components/admin/moderation/ModerationList"
import { getModerationQueue } from "@/app/actions/admin/moderation"

export default async function ModerationPage() {
    const initialData = await getModerationQueue(null, 20)

    return (
        <>
            <AdminHeader pageTitle="Moderação de Conteúdo" />
            <ModerationList initialData={initialData} />
        </>
    )
}
