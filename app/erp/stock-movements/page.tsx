import { ERPPageHeader } from "@/components/erp/page-header-state"
import StockMovementPageContent from "@/components/erp/stock-movements/StockMovementPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { getStockMovementsCached } from "@/lib/data/stock-movements"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"

export default async function StockMovementsPage() {
  // Layout already guarantees auth + valid context - just read cached data
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  const partnerId = context.partnerId
  const movements = await getStockMovementsCached(partnerId)

  return (
    <>
      <ERPPageHeader title="Movimentação de Estoque" />
      <FadeIn className="p-4">
        <StockMovementPageContent
          partnerId={partnerId}
          movements={movements || []}
        />
      </FadeIn>
    </>
  )
}
