import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { checkAndClearExpiredBan } from "@/lib/auth/ban-check"
import { redirect } from "next/navigation"
import BannedView from "@/components/admin/BannedView"
import { getCurrentUser } from "@/lib/auth/authorization"

export default async function BannedPage() {
    const user = await getCurrentUser()

    if (!user) {
        redirect("/auth/login")
    }

    const supabase = await getSupabaseServerClient()

    const isBanned = await checkAndClearExpiredBan(user.id)
    if (!isBanned) {
        redirect("/")
    }

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("banned_at, banned_until, banned_reason")
        .eq("user_id", user.id)
        .single()

    return <BannedView profile={profile} />
}
