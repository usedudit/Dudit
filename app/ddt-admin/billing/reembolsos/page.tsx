import { FadeIn } from "@/components/animations/FadeIn"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getCurrentUser } from "@/lib/auth/server-user"
import { AdminRefundsPage } from "@/components/admin/AdminRefundsPage"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

export default async function AdminBillingRefundsPage() {
    await requireAdmin("moderator")
    const user = await getCurrentUser()

    const fullName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Admin"
    const userProfile = {
        fullName,
        email: user?.email || "",
        initials: fullName.slice(0, 2).toUpperCase(),
        avatarColor: "bg-brand-green"
    }

    return (
        <>
            <AdminPageHeader pageTitle="Solicitações de Reembolso" userProfile={userProfile} />
            <FadeIn className="p-4">
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden">
                    <AdminRefundsPage />
                </div>
            </FadeIn>
        </>
    )
}
