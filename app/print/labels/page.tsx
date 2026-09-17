import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { LABEL_PRESETS, buildCustomPreset, type LabelPreset, type LabelContentConfig, DEFAULT_CONTENT_CONFIG } from "@/lib/labels/presets"
import { LabelSheet, type LabelProduct } from "@/components/erp/labels/LabelSheet"
import { generateEAN13 } from "@/lib/utils/barcode"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { redirect } from "next/navigation"

interface PrintData {
  presetId: string
  customPreset?: {
    labelWidth: number
    labelHeight: number
    cols: number
    rows: number
    marginTop: number
    marginRight: number
    marginBottom: number
    marginLeft: number
    spacingX: number
    spacingY: number
    paperSize?: "a4" | "letter"
  }
  contentConfig: LabelContentConfig
  products: { id: string; quantity: number; barcodeValue?: string; variantId?: string }[]
}

interface PageProps {
  searchParams: Promise<{ data?: string; headless?: string }>
}

export default async function PrintLabelsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/auth/login")
  }

  const resolvedSearchParams = await searchParams
  if (!resolvedSearchParams.data) {
    return <div className="p-8 text-center text-brand-red font-bold">Dados não encontrados.</div>
  }

  let printData: PrintData
  try {
    printData = JSON.parse(decodeURIComponent(resolvedSearchParams.data))
  } catch {
    return <div className="p-8 text-center text-brand-red font-bold">Dados inválidos.</div>
  }

  const supabase = getAdminClient()

  const { data: partner } = await supabase.from("partners").select("id").eq("user_id", user.id).single()
  if (!partner) {
    redirect("/select-erp")
  }

  try {
    await requirePartnerAccessWithPermission(partner.id, "products", "view", user)
  } catch {
    return <div className="p-8 text-center text-brand-red font-bold">Acesso negado.</div>
  }

  const productIds = printData.products.map((p) => p.id)
  const { data: dbProducts } = await supabase
    .from("products")
    .select("id, name, sku, gtin, price, promotional_price")
    .in("id", productIds) as unknown as {
    data: { id: string; name: string; sku: string | null; gtin: string | null; price: number; promotional_price: number | null }[] | null
  }

  const productMap = new Map(dbProducts?.map((p) => [p.id, p]) || [])

  // Fetch variants for products that have a variantId
  const variantIds = printData.products
    .filter((p) => p.variantId)
    .map((p) => p.variantId!) as string[]

  let variantMap = new Map<string, { id: string; product_id: string; variant_type: string; variant_name: string; sku: string | null; price_adjustment: number }>()

  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, product_id, variant_type, variant_name, sku, price_adjustment")
      .in("id", variantIds)

    if (variants) {
      for (const v of variants) {
        variantMap.set(v.id, v)
      }
    }
  }

  // Fetch max installments
  const { data: paymentMethods } = await supabase
    .from("payment_methods")
    .select("max_installments")
    .eq("partner_id", partner.id)
    .eq("is_active", true)
    .not("max_installments", "is", null)

  const maxInstallments = (paymentMethods as { max_installments: number | null }[] || [])
    .map((pm: { max_installments: number | null }) => pm.max_installments)
    .filter((n: number | null): n is number => n != null && n > 0)
    .reduce((max: number, n: number) => Math.max(max, n), 0) || undefined

  const labelProducts: LabelProduct[] = printData.products
    .map((p) => {
      const db = productMap.get(p.id)
      if (!db) return null

      const variant = p.variantId ? variantMap.get(p.variantId) : null
      const price = variant ? db.price + variant.price_adjustment : db.price
      const promoPrice = variant && db.promotional_price != null
        ? db.promotional_price + variant.price_adjustment
        : db.promotional_price
      const sku = variant?.sku || db.sku

      return {
        id: variant ? variant.id : db.id,
        name: db.name,
        sku,
        gtin: db.gtin,
        barcodeValue: p.barcodeValue || db.gtin || generateEAN13(),
        price,
        promotionalPrice: promoPrice,
        internalCode: sku,
        labelQuantity: p.quantity,
        variant: variant
          ? {
              type: variant.variant_type,
              name: variant.variant_name,
            }
          : undefined,
      }
    })
    .filter(Boolean) as LabelProduct[]

  if (labelProducts.length === 0) {
    return <div className="p-8 text-center text-brand-red font-bold">Nenhum produto encontrado.</div>
  }

  const contentConfig: LabelContentConfig = {
    ...DEFAULT_CONTENT_CONFIG,
    ...printData.contentConfig,
  }

  const preset: LabelPreset =
    printData.presetId === "custom" && printData.customPreset
      ? buildCustomPreset(printData.customPreset)
      : LABEL_PRESETS.find((p) => p.id === printData.presetId) || LABEL_PRESETS[0]

  return (
    <PrintLayout paperSize={preset.paperSize}>
      <LabelSheet
        products={labelProducts}
        preset={preset}
        contentConfig={contentConfig}
        maxInstallments={maxInstallments}
        printMode
      />
    </PrintLayout>
  )
}
