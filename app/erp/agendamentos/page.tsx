import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import AppointmentsPage from "@/components/erp/appointments/AppointmentsPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function AgendamentosPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "appointments", "view")
  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Agendamentos" />
      <FadeIn className="p-4">
        <AppointmentsPage partnerId={partnerId} />
      </FadeIn>
    </>
  )
}
