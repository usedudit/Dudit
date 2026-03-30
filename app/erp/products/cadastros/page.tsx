import { getActivePartnerId } from "@/lib/auth/partner-context"
import { getProductMetadataAction } from "@/app/actions/erp/product-metadata"
import ProductCadastrosPage from "@/components/erp/product-cadastros/ProductCadastrosPage"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Page() {
  const partnerId = await getActivePartnerId()
  if (!partnerId) {
    redirect("/select-erp")
  }

  const result = await getProductMetadataAction(partnerId)
  if (!result.success || !result.data) {
    throw new Error(result.error || "Erro ao carregar dados")
  }

  return (
    <ProductCadastrosPage 
      initialMetadata={result.data} 
      partnerId={partnerId} 
    />
  )
}
