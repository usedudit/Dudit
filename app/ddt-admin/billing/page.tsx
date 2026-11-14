import { FadeIn } from "@/components/animations/FadeIn"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getCurrentUser } from "@/lib/auth/server-user"
import { createClient } from "@/lib/supabase/server"
import { adminListPurchasesAction } from "@/app/actions/billing/admin-purchases"
import { AdminHeader } from "@/components/admin/admin-header"
import PurchasesList from "@/components/admin/billing/PurchasesList"

export const dynamic = "force-dynamic"

export default async function AdminBillingPage() {
    await requireAdmin("moderator")
    const user = await getCurrentUser()
    const supabase = await createClient()
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user?.id)
        .maybeSingle()

    const userProfile = profile ? {
        fullName: profile.full_name || "Admin",
        email: user?.email || "",
        initials: profile.full_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "A",
        avatarColor: "bg-brand-green"
    } : undefined

    const result = await adminListPurchasesAction({ status: "all", limit: 100 })

    const initialData = result.success ? (result.data || []) : []
    const initialStats = result.stats || { total: 0, completed: 0, pending: 0, failed: 0, refunded: 0, cancelled: 0 }
    const initialTotalCount = result.totalCount || 0

    return (
        <>
            <AdminHeader pageTitle="Faturamento" userProfile={userProfile} />
            <FadeIn className="flex-1">
                <PurchasesList
                    initialData={initialData}
                    initialStats={initialStats}
                    initialTotalCount={initialTotalCount}
                />
            </FadeIn>
        </>
    )
}