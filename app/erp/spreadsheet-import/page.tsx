import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"
import { redirect } from "next/navigation"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ImportPageClient } from "@/components/erp/spreadsheet-import/page-client"
import { listImportsAction } from "@/app/actions/erp/spreadsheet-import"

export default async function SpreadsheetImportPage() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("")

  const imports = await listImportsAction(context.partnerId, 15)

  return (
    <>
      <ERPPageHeader title="Importar Planilha" />
      <ImportPageClient
        partnerId={context.partnerId}
        initialImports={imports.success ? imports.imports || [] : []}
      />
    </>
  )
}
