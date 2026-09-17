import { AdminHeader } from "@/components/admin/admin-header"
import { AdminModerationPanel } from "@/components/admin/moderation/AdminModerationPanel"
import { getModerationQueue } from "@/app/actions/admin/moderation"

export default async function ModerationPage() {
    const initialData = await getModerationQueue(null, 50, "pending_moderation")

    return (
        <>
            <AdminHeader pageTitle="Moderação" />
            <AdminModerationPanel initialData={initialData} />
        </>
    )
}
