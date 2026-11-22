export interface NormalizedSpecification {
  name: string
  value: string
}

/**
 * Chaves internas de produtos e serviços que não devem ser tratadas
 * como atributos técnicos quando o objeto for percorrido como mapa chave-valor.
 */
const IGNORED_SPEC_KEYS = new Set([
  "id",
  "short_id",
  "partner_id",
  "store_id",
  "name",
  "title",
  "description",
  "price",
  "cost_price",
  "promotional_price",
  "stock_quantity",
  "stock_available",
  "stock_reserved",
  "min_stock",
  "max_stock",
  "sku",
  "gtin",
  "images",
  "created_at",
  "updated_at",
  "is_active",
  "status",
  "moderation_status",
  "moderation_reason",
  "category_id",
  "subcategory_id",
  "category",
  "subcategory",
  "marketplace_category_id",
  "marketplace_category",
  "addon_groups",
  "accepts_offers",
  "accepts_trades",
  "condition",
  "condicao",
  "warranty",
  "warranty_value",
  "warranty_period",
  "availability_value",
  "availability_unit",
  "brand",
  "brand_id",
  "location",
  "location_id",
  "tags",
  "fulfillment_modes",
  "video_url",
  "video_type",
  "video_thumbnail",
  "video_duration",
  "video_provider_id",
  "payment_requirement",
  "show_price_in_store",
  "show_in_marketplace",
  "partners",
  "stores",
  "product_variants",
  "variants",
  "product_type",
  "service_type",
  "billing_unit",
  "price_type",
  "duration_minutes",
  "buffer_minutes",
  "resources",
  "assigned_staff",
  "notes",
  "rating",
  "product_logistics",
  "weight_gross",
  "weight_net",
  "width",
  "height",
  "length",
  "packaging_type",
  "preparation_days",
  "vendas_totais",
  "technical_specs",
  "technical_details",
  "attributes",
  "specs",
  "fts",
  "product_id",
  "external_id",
  "external_provider",
  "last_external_sync_at",
  "marketplace_score",
  "total_sales",
  "sales_last_30_days",
  "sales_last_7_days",
  "views_count",
  "views_last_30_days",
  "favorites_count",
  "last_sale_at",
  "mp_store_name",
  "is_on_promotion",
  "primary_image_index",
  "allow_sell_without_stock",
  "ncm",
  "cest",
  "origin",
  "item_type",
  "cfop_internal",
  "cfop_external",
  "csosn",
  "tax_percentage",
  "pis_cst",
  "pis_rate",
  "cofins_cst",
  "cofins_rate",
  "ipi_cst",
  "ipi_code",
  "product_situation",
  "c_benef",
  "inf_ad_prod",
  "fci_code",
  "cst_ibs_cbs",
  "c_class_trib",
  "unit",
  "unidade",
  "costPrice",
  "stock",
  "minStock",
  "maxStock",
  "productType",
  "localizacao",
  "digital_format",
  "delivery_format",
  "is_featured",
  "has_variants",
  "deleted_at",
  "deleted_by",
  "deleted_reason",
  "supplier_id",
  "fiscal_profile_id",
  "brand_rel",
  "location_rel",
  "product_fiscal_profiles",
])

/**
 * Chaves que indicam que o objeto passado é um registro completo de produto/serviço
 * (e não um dicionário avulso de especificações chave-valor).
 */
const ENTITY_RECORD_KEYS = [
  "technical_specs",
  "technical_details",
  "attributes",
  "specs",
  "partner_id",
  "store_id",
  "short_id",
  "sku",
  "price",
  "cost_price",
  "costPrice",
  "stock_quantity",
  "stock_available",
  "stock",
  "created_at",
  "updated_at",
  "product_type",
  "productType",
  "service_type",
  "product_id",
  "fts",
  "external_id",
  "ncm",
]

function parseJsonIfString(val: unknown): unknown {
  if (typeof val === "string") {
    const trimmed = val.trim()
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed)
      } catch {
        return val
      }
    }
  }
  return val
}

function normalizeSingleSpec(item: any): NormalizedSpecification | null {
  if (!item || typeof item !== "object") return null

  const name =
    item.name ??
    item.label ??
    item.key ??
    item.title ??
    item.titulo ??
    item.atributo ??
    ""

  let val =
    item.value ??
    item.val ??
    item.valor ??
    item.descricao ??
    ""

  if (typeof val === "boolean") {
    val = val ? "Sim" : "Não"
  } else if (typeof val === "number") {
    val = String(val)
  } else if (Array.isArray(val)) {
    val = val
      .map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)))
      .filter(Boolean)
      .join(", ")
  } else if (typeof val === "object" && val !== null) {
    if (val.value || val.name || val.label) {
      val = val.value || val.name || val.label
    } else {
      val = Object.entries(val)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    }
  } else {
    val = String(val ?? "")
  }

  const trimmedName = String(name).trim()
  const trimmedVal = String(val).trim()

  if (!trimmedName || !trimmedVal) return null

  return {
    name: trimmedName,
    value: trimmedVal,
  }
}

function parseSpecCollection(source: unknown): NormalizedSpecification[] {
  const parsed = parseJsonIfString(source)
  if (!parsed || typeof parsed !== "object") return []

  // Caso 1: Array direto de especificações
  if (Array.isArray(parsed)) {
    const results: NormalizedSpecification[] = []
    for (const item of parsed) {
      const normalized = normalizeSingleSpec(item)
      if (normalized) results.push(normalized)
    }
    return results
  }

  const obj = parsed as Record<string, any>

  // Caso 2: Objeto contendo uma propriedade conhecida com lista de atributos
  const subKeys = ["attributes", "technical_details", "technical_specs", "specs"]
  let hasExplicitSubKey = false
  for (const key of subKeys) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) {
      hasExplicitSubKey = true
      const subResults = parseSpecCollection(obj[key])
      if (subResults.length > 0) return subResults
    }
  }
  // Se o objeto é um wrapper explícito (ex: { attributes: [], addon_groups: [] }),
  // não percorrer chaves irmãs como se fossem especificações.
  if (hasExplicitSubKey) return []

  // Caso 3: Objeto mapa chave-valor (ex: { "Material": "Algodão", "Origem": "Nacional" })
  const results: NormalizedSpecification[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (IGNORED_SPEC_KEYS.has(key)) continue
    if (value === null || value === undefined) continue
    const normalized = normalizeSingleSpec({ name: key, value })
    if (normalized) results.push(normalized)
  }

  return results
}

/**
 * Extrai e normaliza especificações de produtos ou serviços em um formato padrão.
 * Compatível com:
 * - Produtos do ERP Dudit (onde technical_specs = { attributes: [...] })
 * - Serviços do ERP Dudit (onde technical_details = [...])
 * - Formatos com strings JSON, listas diretas, objetos chave/valor, technical_specs, technical_details, attributes ou specs.
 */
export function extractSpecifications(entity: any): NormalizedSpecification[] {
  if (!entity) return []

  // Se o próprio entity já for um array
  if (Array.isArray(entity)) {
    return parseSpecCollection(entity)
  }

  // Se entity for string JSON que veio diretamente
  if (typeof entity === "string") {
    return parseSpecCollection(entity)
  }

  if (typeof entity !== "object") return []

  // Checar campos candidatos no objeto de produto ou serviço
  const candidates = [
    entity.technical_specs,
    entity.technical_details,
    entity.attributes,
    entity.specs,
  ]

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const specs = parseSpecCollection(candidate)
      if (specs.length > 0) return specs
    }
  }

  // Nunca usar fallback chave-valor em registros de produto/serviço para evitar
  // vazar colunas do banco (costPrice, stock, ncm, fts, total_sales, etc.) como especificações.
  const isEntityRecord = ENTITY_RECORD_KEYS.some((key) => key in entity)
  if (isEntityRecord) return []

  // Fallback apenas para dicionários avulsos de atributos (ex: { "Material": "Algodão" })
  const fallback = parseSpecCollection(entity)
  if (fallback.length > 0) return fallback

  return []
}
