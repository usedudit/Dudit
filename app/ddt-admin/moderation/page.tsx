import { AdminHeader } from "@/components/admin/admin-header"
import { AdminModerationPanel } from "@/components/admin/moderation/AdminModerationPanel"

export default async function ModerationPage() {
    return (
        <>
            <AdminHeader pageTitle="Moderação Manual" />
            <AdminModerationPanel />
        </>
    )
}
