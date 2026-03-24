import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { acceptInvitation, validateInvitation } from "@/app/actions/invitations"
import { setPendingInviteToken } from "@/lib/auth/partner-context"
import InviteView from "@/components/InviteView"

export default async function InvitePage({
    params,
}: {
    params: Promise<{ token: string }>
}) {
    const { token } = await params

    const validation = await validateInvitation(token)

    if (!validation.valid) {
        return <InviteView mode="error" message={validation.error || "Convite inválido."} />
    }

    const user = await getCurrentUser()

    const handleLoginRedirect = async () => {
        "use server"
        await setPendingInviteToken(token)
        redirect(`/auth/login?next=${encodeURIComponent("/invite/accept")}`)
    }

    const handleAccept = async () => {
        "use server"
        const result = await acceptInvitation(token)
        if (result.success) {
            redirect("/erp/dashboard")
        } else {
            redirect(`/invite/error?message=${encodeURIComponent(result.error || "Erro ao aceitar convite.")}`)
        }
    }

    return (
        <InviteView
            mode="invite"
            partnerName={validation.partnerName!}
            inviteEmail={validation.email!}
            userEmail={user?.email ?? null}
            onAccept={handleAccept}
            onLoginRedirect={handleLoginRedirect}
        />
    )
}