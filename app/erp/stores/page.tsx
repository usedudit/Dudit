import { Suspense } from "react"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { AccessDenied } from "@/components/erp/access-denied"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPermission } from "@/lib/permissions/access"
import { StoresPageContent } from "@/components/erp/stores/StoresPageContent"

export const dynamic = "force-dynamic"

export default async function StoresPage() {
  await requireUser()
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const { allowed } = await checkPermission(context.partnerId, "stores", "view")
  if (!allowed) return <AccessDenied />

  return (
    <>
      <ERPPageHeader title="Lojas e Filiais" />
      <FadeIn className="p-4">
        <Suspense fallback={<div>Carregando...</div>}>
          <StoresPageContent partnerId={context.partnerId} />
        </Suspense>
      </FadeIn>
    </>
  )
}
