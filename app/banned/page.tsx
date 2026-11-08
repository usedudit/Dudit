import { getBannedUserProfile } from "@/lib/auth/ban-check"
import { redirect } from "next/navigation"
import BannedView from "@/components/admin/BannedView"
import { getCurrentUser } from "@/lib/auth/authorization"

export default async function BannedPage() {
    const user = await getCurrentUser()

    if (!user) {
        redirect("/auth/login")
    }

    const bannedProfile = await getBannedUserProfile(user.id)
    if (!bannedProfile) {
        redirect("/")
    }

    return <BannedView profile={bannedProfile} user={user} />
}
