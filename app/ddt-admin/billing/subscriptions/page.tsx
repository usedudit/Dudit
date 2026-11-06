import { FadeIn } from "@/components/animations/FadeIn"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getCurrentUser } from "@/lib/auth/server-user"
import { createClient } from "@/lib/supabase/server"
import { adminListBillingSubscriptionsAction } from "@/app/actions/billing/admin-subscriptions"
import { AdminHeader } from "@/components/admin/admin-header"
import SubscriptionsList from "@/components/admin/billing/SubscriptionsList"

export const dynamic = "force-dynamic"

export default async function AdminBillingSubscriptionsPage() {
    await requireAdmin("moderator")
    const user = await getCurrentUser()
    const supabase = await createClient()
    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user?.id)
        .single()

    const userProfile = profile ? {
        fullName: profile.full_name || "Admin",
        email: profile.email || "",
        initials: profile.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "A",
        avatarColor: "bg-brand-green"
    } : undefined

    const result = await adminListBillingSubscriptionsAction({ status: "all", limit: 100 })

    const initialData = result.success ? (result.data || []) : []
    const initialStats = result.stats || { total: 0, active: 0, past_due: 0, cancelled: 0, trial: 0 }
    const initialTotalCount = result.totalCount || 0

    return (
        <>
            <AdminHeader pageTitle="Assinaturas" userProfile={userProfile} />
            <FadeIn className="flex-1">
                <SubscriptionsList
                    initialData={initialData}
                    initialStats={initialStats}
                    initialTotalCount={initialTotalCount}
                />
            </FadeIn>
        </>
    )
}