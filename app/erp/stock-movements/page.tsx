import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
import StockMovementPageContent from "@/components/erp/stock-movements/StockMovementPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentPartner } from "@/lib/auth/authorization"
import { getStockMovementsCached } from "@/lib/data/stock-movements"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import StockMovementsLoading from "./loading"

export default async function StockMovementsPage() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const partner = await getCurrentPartner()

  if (!partner) {
    redirect("")
  }

  const movements = await getStockMovementsCached(partner.id)

  const userProfile = {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary"
  }

  return (
    <>
      <ERPHeader
        pageTitle="Movimentação de Estoque"
        userProfile={userProfile}
      />
      <FadeIn className="p-4">
        <Suspense fallback={<StockMovementsLoading />}>
          <StockMovementPageContent
            partnerId={partner.id}
            movements={movements || []}
          />
        </Suspense>
      </FadeIn>
    </>
  )
}
