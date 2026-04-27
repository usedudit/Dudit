import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { consumePendingInviteToken, getPendingInviteToken, setPendingInviteToken } from "@/lib/auth/partner-context"
import { acceptInvitation, validateInvitation } from "@/app/actions/invitations"
import InviteView from "@/components/InviteView"
import { clearActivePartner } from "@/lib/auth/partner-context"

export default async function InviteAcceptPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token: queryToken } = await searchParams
    const cookieToken = await getPendingInviteToken()
    const token = cookieToken || queryToken

    if (!token) {
        redirect("/")
    }

    const validation = await validateInvitation(token)

    if (!validation.valid) {
        return <InviteView mode="error" message={validation.error || "Convite inválido."} />
    }

    const user = await getCurrentUser()

    if (!user) {
        await setPendingInviteToken(token)
        redirect(`/auth/login?next=${encodeURIComponent("/invite/accept")}`)
    }

    const userEmail = user.email?.trim().toLowerCase() ?? ""
    // Security update: email mismatch is only checked on action execution (acceptInvitation)
    // We only provide the masked email to the client
    const isMismatch = false

    const handleLoginRedirect = async () => {
        "use server"
        await setPendingInviteToken(token)
        redirect(`/auth/login?next=${encodeURIComponent("/invite/accept")}`)
    }

    const handleAccept = async () => {
        "use server"
        const consumed = await consumePendingInviteToken()
        const finalToken = consumed || token

        const result = await acceptInvitation(finalToken)
        if (result.success) {
            // Force ERP selection after accepting an invite to avoid stale active_partner_id.
            await clearActivePartner()
            redirect("/select-erp")
        } else {
            redirect(`/invite/error?message=${encodeURIComponent(result.error || "Erro ao aceitar convite.")}`)
        }
    }

    return (
        <InviteView
            mode="accept"
            partnerName={validation.partnerName!}
            userEmail={userEmail}
            inviteEmail={validation.email!}
            isMismatch={isMismatch}
            onAccept={handleAccept}
            onLoginRedirect={handleLoginRedirect}
        />
    )
}