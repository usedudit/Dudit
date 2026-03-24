import { Suspense } from "react"
import { ERPHeader } from "@/components/erp/erp-header"
import StockMovementPageContent from "@/components/erp/stock-movements/StockMovementPageContent"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireUser, getCurrentPartner } from "@/lib/auth/authorization"
import { getStockMovementsCached } from "@/lib/data/stock-movements"
import { redirect } from "next/navigation"

export default async function StockMovementsPage() {
  const user = await requireUser()
  const partner = await getCurrentPartner()

  if (!partner) {
    redirect("/dashboard")
  }

  const movements = await getStockMovementsCached(partner.id)

  return (
    <>
      <ERPHeader
        pageTitle="Movimentação de Estoque"
        userProfile={{
          fullName: user.email?.split("@")[0] || "Usuário",
          email: user.email || "",
          initials: (user.email?.[0] || "U").toUpperCase(),
          avatarColor: "bg-brand-primary"
        }}
      />
      <FadeIn className="flex-1 overflow-y-auto">
        <Suspense fallback={<div className='p-8 flex justify-center text-brand-inactive-text'>Carregando movimentações...</div>}>
          <StockMovementPageContent
            partnerId={partner.id}
            movements={movements || []}
          />
        </Suspense>
      </FadeIn>
    </>
  )
}
