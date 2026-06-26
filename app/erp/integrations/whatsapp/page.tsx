import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { checkPermission } from "@/lib/permissions/access"
import { getWhatsappIntegrationAction } from "@/app/actions/whatsapp"
import { WhatsAppIntegrationPage } from "@/components/erp/integrations/WhatsAppIntegrationPage"

export default async function WhatsappIntegrationRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  const canManage = await checkPermission(context.partnerId, "settings", "settings_integrations")
  if (!canManage) redirect("/erp/settings")

  try {
    await requireMinimumPlan(context.partnerId, "escalar")
  } catch {
    redirect("/erp/settings?tab=integracoes")
  }

  const result = await getWhatsappIntegrationAction()
  const initialData = result.success
    ? result.data
    : { connection: null, allConnections: [], messages: [], templates: [] }

  return (
    <WhatsAppIntegrationPage
      initialConnection={initialData.connection}
      initialAllConnections={initialData.allConnections}
      initialMessages={initialData.messages}
      initialTemplates={initialData.templates}
    />
  )
}
