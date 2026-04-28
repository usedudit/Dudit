import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import AppointmentsPage from "@/components/erp/appointments"

export const dynamic = "force-dynamic"

export default async function AgendamentosPage() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "appointments", "view")
  if (!allowed) return <AccessDenied />

  return <AppointmentsPage />
}
