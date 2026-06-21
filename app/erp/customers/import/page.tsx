import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportCustomersPage } from "@/components/erp/clientes/ImportCustomersPage"

export const dynamic = "force-dynamic"

export default async function ImportCustomersPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  return (
    <ImportCustomersPage
      partnerId={context.partnerId}
    />
  )
}
