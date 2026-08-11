import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportProductsPage } from "@/components/erp/product/ImportProductsPage"

export const dynamic = "force-dynamic"

export default async function ImportProductsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  return (
    <ImportProductsPage
      partnerId={context.partnerId}
    />
  )
}
