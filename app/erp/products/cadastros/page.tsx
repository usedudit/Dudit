import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getProductMetadataAction } from "@/app/actions/erp/product-metadata"
import ProductCadastrosPage from "@/components/erp/product-cadastros/ProductCadastrosPage"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  const partnerId = context.partnerId

  const result = await getProductMetadataAction(partnerId)
  if (!result.success || !result.data) {
    throw new Error(result.error || "Erro ao carregar dados")
  }

  return (
    <>
      <ERPPageHeader title="Cadastros de Produtos" />
      <FadeIn className="p-4">
        <ProductCadastrosPage
          initialMetadata={result.data}
          partnerId={partnerId}
        />
      </FadeIn>
    </>
  )
}
