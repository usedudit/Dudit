import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { Button } from "@/components/reusable"
import Link from "next/link"
import { LabelGenerator } from "@/components/erp/label-generator"

export default async function GenerateLabelsPage() {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: partner } = await supabase.from("partners").select("*").eq("user_id", user.id).single()

  if (!partner) {
    redirect("/dashboard")
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, gtin, price, promotional_price, description")
    .eq("partner_id", partner.id)
    .eq("is_active", true)
    .order("name")

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Gerar Etiquetas</h1>
            <p className="text-muted-foreground">Selecione produtos para gerar etiquetas com código de barras</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/erp/labels" prefetch={false}>Voltar</Link>
          </Button>
        </div>

        <LabelGenerator products={products || []} />
      </div>
    </div>
  )
}
