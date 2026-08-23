import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportServicesPage } from "@/components/erp/servicos/ImportServicesPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function ImportServicesPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  return (
    <>
      <ERPPageHeader title="Importar Serviços" />
      <FadeIn className="p-4">
        <ImportServicesPage partnerId={context.partnerId} />
      </FadeIn>
    </>
  )
}
