import { ERPPageHeader } from "@/components/erp/page-header-state"
import StockMovementPageContent from "@/components/erp/stock-movements/StockMovementPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getERPStockMovementsPageAction } from "@/app/actions/erp/stock-movements"

export default async function StockMovementsPage() {
  // Layout already guarantees auth + valid context - just read cached data
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  const { partnerId, activeStoreId } = context
  const storeId = activeStoreId || undefined
  const page = await getERPStockMovementsPageAction(partnerId, { cursor: null, limit: 100, storeId })
  if (!page.success) {
    throw new Error(page.error || "Erro ao carregar movimentações de estoque.")
  }

  return (
    <>
      <ERPPageHeader title="Movimentação de Estoque" />
      <FadeIn className="p-4">
        <StockMovementPageContent
          partnerId={partnerId}
          storeId={storeId}
          movements={page.items || []}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
        />
      </FadeIn>
    </>
  )
}
