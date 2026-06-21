import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportServicesPage } from "@/components/erp/servicos/ImportServicesPage"

export const dynamic = "force-dynamic"

export default async function ImportServicesPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  return (
    <ImportServicesPage
      partnerId={context.partnerId}
    />
  )
}
