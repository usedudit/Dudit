import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { LABEL_PRESETS, buildCustomPreset, type LabelPreset, type LabelContentConfig, DEFAULT_CONTENT_CONFIG } from "@/lib/labels/presets"
import { LabelSheet, type LabelProduct } from "@/components/erp/labels/LabelSheet"
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
  }
  contentConfig: LabelContentConfig
  products: { id: string; quantity: number }[]
}

interface PageProps {
  searchParams: Promise<{ data?: string }>
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

  // Buscar partner_id do usuário
  const { data: partner } = await supabase.from("partners").select("id").eq("user_id", user.id).single()
  if (!partner) {
    redirect("/dashboard")
  }

  // Verificar permissão
  try {
    await requirePartnerAccessWithPermission(partner.id, "products", "view", user)
  } catch {
    return <div className="p-8 text-center text-brand-red font-bold">Acesso negado.</div>
  }

  // Buscar dados completos dos produtos
  const productIds = printData.products.map((p) => p.id)
  const { data: dbProducts } = await supabase
    .from("products")
    .select("id, name, sku, gtin, price, promotional_price")
    .in("id", productIds) as unknown as {
    data: { id: string; name: string; sku: string | null; gtin: string | null; price: number; promotional_price: number | null }[] | null
  }

  const productMap = new Map(dbProducts?.map((p: { id: string; name: string; sku: string | null; gtin: string | null; price: number; promotional_price: number | null }) => [p.id, p]) || [])

  const labelProducts: LabelProduct[] = printData.products
    .map((p) => {
      const db = productMap.get(p.id)
      if (!db) return null
      return {
        id: db.id,
        name: db.name,
        sku: db.sku,
        gtin: db.gtin,
        price: db.price,
        promotionalPrice: db.promotional_price,
        internalCode: db.sku,
        labelQuantity: p.quantity,
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
    <PrintLayout>
      <LabelSheet
        products={labelProducts}
        preset={preset}
        contentConfig={contentConfig}
        printMode
      />
    </PrintLayout>
  )
}
