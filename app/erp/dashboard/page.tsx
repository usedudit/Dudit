import { ERPHeader } from "@/components/erp/erp-header"
import { FadeIn } from "@/components/animations/FadeIn"
import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"

export default async function ERPDashboardPage() {
  // Layout already guarantees auth + valid context — just read cached data
  const context = await getCurrentPartnerContext()
  const allAccess = await getAllUserPartnerAccess()
  const activeStore = allAccess.find((s: typeof allAccess[number]) => s.partnerId === context!.partnerId)

  return (
    <>
      <ERPHeader pageTitle={activeStore?.storeName ?? "ERP"} />
      <FadeIn className="min-h-svh p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <p className="text-muted-foreground">Central do Parceiro</p>
          </div>
        </div>
      </FadeIn>
    </>
  )
}
