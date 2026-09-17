import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportCustomersPage } from "@/components/erp/clientes/ImportCustomersPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function ImportCustomersPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  return (
    <>
      <ERPPageHeader title="Importar Clientes" />
      <FadeIn className="p-4">
        <ImportCustomersPage partnerId={context.partnerId} />
      </FadeIn>
    </>
  )
}
