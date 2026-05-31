import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission, requireMinimumPlan } from "@/lib/auth/authorization"
import { getWhatsappIntegrationAction } from "@/app/actions/whatsapp"
import { WhatsAppIntegrationPage } from "@/components/erp/integrations/WhatsAppIntegrationPage"

export default async function WhatsappIntegrationRoute() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  const canManage = await checkPartnerPermission(context.partnerId, "settings", "settings_integrations")
  if (!canManage) redirect("/erp/settings")

  try {
    await requireMinimumPlan(context.partnerId, "escalar")
  } catch {
    redirect("/erp/settings?tab=integracoes")
  }

  const result = await getWhatsappIntegrationAction()
  const initialData = result.success
    ? result.data
    : { connection: null, messages: [], templates: [] }

  return (
    <WhatsAppIntegrationPage
      initialConnection={initialData.connection}
      initialMessages={initialData.messages}
      initialTemplates={initialData.templates}
    />
  )
}
