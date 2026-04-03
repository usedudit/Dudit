import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
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

  return (
    <>
      <ERPPageHeader title="Movimentação de Estoque" />
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
