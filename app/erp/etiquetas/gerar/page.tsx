import { redirect } from "next/navigation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { checkPermission } from "@/lib/permissions/access"
import { AccessDenied } from "@/components/erp/access-denied"
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

  const { getPartnerPlan } = await import("@/lib/services/subscription.service")
  const plan = await getPartnerPlan(partner.id)
  if (plan.slug.toLowerCase() === "free") {
    redirect("/erp/etiquetas")
  }

  const { allowed } = await checkPermission(partner.id, "products", "view")
  if (!allowed) return <AccessDenied />

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, gtin, price, promotional_price, description")
    .eq("partner_id", partner.id)
    .eq("is_active", true)
    .order("name")

  // Fetch variants for all products
  const productIds = (products || []).map((p) => p.id)
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_id, variant_type, variant_name, sku, price_adjustment, stock_quantity, is_active")
    .in("product_id", productIds)
    .eq("is_active", true)
    .order("variant_name")

  // Fetch max installments from payment methods
  const { data: paymentMethods } = await supabase
    .from("payment_methods")
    .select("max_installments")
    .eq("partner_id", partner.id)
    .eq("is_active", true)
    .not("max_installments", "is", null)

  const maxInstallments = (paymentMethods || [])
    .map((pm) => pm.max_installments)
    .filter((n): n is number => n != null && n > 0)
    .reduce((max, n) => Math.max(max, n), 0) || undefined

  // Attach variants to products
  const productsWithVariants = (products || []).map((product) => ({
    ...product,
    variants: (variants || []).filter((v) => v.product_id === product.id),
  }))

  return (
    <div className="min-h-svh p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Gerar Etiquetas</h1>
            <p className="text-muted-foreground">Selecione produtos para gerar etiquetas com código de barras</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/erp/etiquetas" prefetch={false}>Voltar</Link>
          </Button>
        </div>

        <LabelGenerator
          products={productsWithVariants}
          maxInstallments={maxInstallments}
        />
      </div>
    </div>
  )
}
