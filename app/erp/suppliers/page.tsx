import { redirect } from "next/navigation"
import { Button } from "@/components/reusable"
import Link from "next/link"
import { SuppliersList } from "@/components/erp/suppliers-list"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerSuppliersCached } from "@/lib/data/suppliers"

export default async function SuppliersPage() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/select-erp")

  const suppliers = await getPartnerSuppliersCached(context.partnerId)

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Fornecedores</h1>
            <p className="text-muted-foreground">Gerencie seus fornecedores</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/erp/dashboard" prefetch={false}>Voltar</Link>
            </Button>
            <Button asChild>
              <Link href="/erp/suppliers/new" prefetch={false}>Adicionar fornecedor</Link>
            </Button>
          </div>
        </div>

        <SuppliersList suppliers={suppliers || []} partnerId={context.partnerId} />
      </div>
    </div>
  )
}
