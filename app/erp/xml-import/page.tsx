import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { XmlImportPageContent } from "@/components/erp/xml-import/XmlImportPageContent"
import { listImportsAction } from "@/app/actions/erp/xml-import"

export default async function XmlImportPage() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  const plan = await getPartnerPlan(context.partnerId)
  const isFreePlan = plan.slug.toLowerCase() === "free"
  const planGate = isFreePlan ? { requiredPlanSlug: "crescer" as const } : undefined

  const imports = !isFreePlan ? await listImportsAction(context.partnerId, { limit: 10 }) : { success: true, imports: [] }

  return (
    <>
      <ERPPageHeader title="Importar XML" />
      <FadeIn className="p-4">
        <XmlImportPageContent
          partnerId={context.partnerId}
          initialImports={imports.success ? imports.imports || [] : []}
          planGate={planGate}
        />
      </FadeIn>
    </>
  )
}
