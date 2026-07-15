import { FadeIn } from "@/components/animations/FadeIn"
import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getCurrentUser } from "@/lib/auth/server-user"
import { createClient } from "@/lib/supabase/server"
import { AdminPageHeader } from "@/components/admin/admin-page-header"

export default async function AdminBillingInvoicesPage() {
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

    return (
        <>
            <AdminPageHeader pageTitle="Faturas" userProfile={userProfile} />
            <FadeIn className="p-4">
                <div className="bg-white dark:bg-dark-surface rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden p-8">
                    <p className="text-brand-inactive-text">Módulo de faturas em construção.</p>
                </div>
            </FadeIn>
        </>
    )
}
