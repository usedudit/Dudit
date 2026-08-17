import { getDeliveryInvitationMetaAction } from "@/app/actions/delivery-drivers"
import DeliveryInviteForm from "@/components/delivery/DeliveryInviteForm"

export default async function DeliveryInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const meta = await getDeliveryInvitationMetaAction(token)
  if (!meta.valid) {
    return <main className="mx-auto flex min-h-screen max-w-lg items-center px-6"><div className="w-full rounded-2xl border border-brand-border bg-white p-8 text-center dark:border-dark-border dark:bg-dark-surface"><h1 className="text-xl font-bold">Convite indisponível</h1><p className="mt-2 text-sm text-brand-inactive-text">Este convite é inválido, expirou ou já foi utilizado.</p></div></main>
  }
  return <DeliveryInviteForm token={token} maskedEmail={meta.email || ""} />
}
