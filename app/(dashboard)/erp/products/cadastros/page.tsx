import { getActivePartnerId } from "@/lib/auth/partner-context"
import ProductCadastrosPage from "@/components/erp/product-cadastros/ProductCadastrosPage"
import { getProductMetadataAction } from "@/app/actions/erp/product-metadata"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Cadastros de Produtos | Dudit ERP",
  description: "Gerencie categorias, marcas e localizações dos seus produtos.",
}

export default async function Page() {
  const partnerId = await getActivePartnerId()
  if (!partnerId) redirect("/")

  const result = await getProductMetadataAction(partnerId)
  
  const initialMetadata = result.success && result.data ? result.data : {
    categories: [],
    brands: [],
    locations: []
  }

  return (
    <ProductCadastrosPage 
      initialMetadata={initialMetadata} 
      partnerId={partnerId} 
    />
  )
}
