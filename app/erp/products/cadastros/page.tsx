import { getActivePartnerId } from "@/lib/auth/partner-context"
import { getProductMetadataAction } from "@/app/actions/erp/product-metadata"
import ProductCadastrosPage from "@/components/erp/product-cadastros/ProductCadastrosPage"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPHeader } from "@/components/erp/erp-header"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const partnerId = await getActivePartnerId()
  if (!partnerId) {
    redirect("/select-erp")
  }

  const result = await getProductMetadataAction(partnerId)
  if (!result.success || !result.data) {
    throw new Error(result.error || "Erro ao carregar dados")
  }

  const userProfile = {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary"
  }

  return (
    <>
      <ERPHeader
        pageTitle="Cadastros de Produtos"
        userProfile={userProfile}
      />
      <FadeIn className="p-4">
        <ProductCadastrosPage
          initialMetadata={result.data}
          partnerId={partnerId}
        />
      </FadeIn>
    </>
  )
}
