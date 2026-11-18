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
])

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
  for (const key of subKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const subResults = parseSpecCollection(obj[key])
      if (subResults.length > 0) return subResults
    }
  }

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
  if (!entity || typeof entity !== "object") return []

  // Se o próprio entity já for um array ou uma coleção de specs
  if (Array.isArray(entity)) {
    return parseSpecCollection(entity)
  }

  // Se entity for string JSON que veio diretamente
  if (typeof entity === "string") {
    return parseSpecCollection(entity)
  }

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

  // Se não encontrou em nenhum dos campos específicos, checar se há outras propriedades
  // que não sejam reservadas no próprio objeto (fallback para dicionário de atributos)
  const fallback = parseSpecCollection(entity)
  if (fallback.length > 0) return fallback

  return []
}
