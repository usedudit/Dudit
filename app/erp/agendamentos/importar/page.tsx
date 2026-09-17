import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportAppointmentsPage } from "@/components/erp/appointments/ImportAppointmentsPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function ImportAppointmentsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  return (
    <>
      <ERPPageHeader title="Importar Agendamentos" />
      <FadeIn className="p-4">
        <ImportAppointmentsPage partnerId={context.partnerId} />
      </FadeIn>
    </>
  )
}
