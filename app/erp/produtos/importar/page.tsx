import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportProductsPage } from "@/components/erp/product/ImportProductsPage"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function ImportProductsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  return (
    <>
      <ERPPageHeader title="Importar Produtos" />
      <FadeIn className="p-4">
        <ImportProductsPage partnerId={context.partnerId} />
      </FadeIn>
    </>
  )
}
