import { getDeliveryInvitationMetaAction } from "@/app/actions/delivery-drivers"
import { acceptDeliveryDriverInvitationAction } from "@/app/actions/delivery-drivers"
import { getCurrentUser } from "@/lib/auth/authorization"
import { redirect } from "next/navigation"
import InviteView from "@/components/InviteView"

export default async function DeliveryInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const meta = await getDeliveryInvitationMetaAction(token)
  if (!meta.valid) {
    return <InviteView mode="error" message="Este convite é inválido, expirou ou já foi utilizado." />
  }
  const user = await getCurrentUser()
  const invitePath = `/entregadores/convite/${token}`

  async function handleLoginRedirect() {
    "use server"
    redirect(`/auth/login?next=${encodeURIComponent(invitePath)}`)
  }

  async function handleAccept() {
    "use server"
    const result = await acceptDeliveryDriverInvitationAction({ token })
    if (!result.success) {
      redirect(`/invite/error?message=${encodeURIComponent(result.error || "Erro ao aceitar convite.")}`)
    }
    redirect("/entregadores")
  }

  if (!user) {
    return (
      <InviteView
        mode="invite"
        partnerName="Portal do Entregador Dudit"
        inviteEmail={meta.email || ""}
        onAccept={handleAccept}
        onLoginRedirect={handleLoginRedirect}
      />
    )
  }

  return (
    <InviteView
      mode="accept"
      partnerName="Portal do Entregador Dudit"
      userEmail={user.email || ""}
      inviteEmail={meta.email || ""}
      isMismatch={meta.isEmailMatch !== true}
      onAccept={handleAccept}
      onLoginRedirect={handleLoginRedirect}
    />
  )
}
