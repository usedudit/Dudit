import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { XmlImportPageContent } from "@/components/erp/xml-import/XmlImportPageContent"
import { listImportsAction } from "@/app/actions/erp/xml-import"

export default async function XmlImportPage() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  const imports = await listImportsAction(context.partnerId, 10)

  return (
    <>
      <ERPPageHeader title="Importar XML" />
      <FadeIn className="p-4">
        <XmlImportPageContent
          partnerId={context.partnerId}
          recentImports={imports.success ? imports.imports || [] : []}
        />
      </FadeIn>
    </>
  )
}
