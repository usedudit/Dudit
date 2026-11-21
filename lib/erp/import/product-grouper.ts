import { parseNumber } from "./validators"

export interface ParsedVariant {
  variant_name: string
  variant_type: string
  variant_value: string
  sku: string
  price_adjustment: number
  stock_quantity: number
  is_active: boolean
  variant_options: any
}

export interface ConsolidatedProductRow {
  /** Mapped fields for the parent product */
  row: Record<string, string>
  /** Raw header->value object for the parent row (used for failed row reports) */
  rawRow?: Record<string, string>
  /** Zero-based row index of the parent row in the original spreadsheet */
  primaryRowIndex: number
  /** All zero-based row indexes (parent + child variants) belonging to this product */
  rowIndexes: number[]
  /** Parsed variants (from child rows or inline variants column) */
  variants: ParsedVariant[]
  /** Whether this product was assembled from multiple spreadsheet rows */
  isGroupedParent: boolean
}

export type DetectedSpreadsheetSource =
  | "Tiny ERP"
  | "Bling"
  | "Shopify"
  | "WooCommerce"
  | "Nuvemshop"
  | "Dudit"
  | null

function normalizeKey(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-/_.:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function detectSpreadsheetSource(headers: string[]): DetectedSpreadsheetSource {
  const normSet = new Set(headers.map(normalizeKey))

  const has = (...terms: string[]) => terms.every((t) => normSet.has(normalizeKey(t)))
  const hasAny = (...terms: string[]) => terms.some((t) => normSet.has(normalizeKey(t)))

  // Tiny ERP: "Código (SKU)", "Tipo do produto", "Código do pai", "Formato embalagem"
  if (
    has("tipo do produto", "codigo do pai") ||
    has("formato embalagem", "codigo do pai") ||
    (has("codigo sku", "variacoes", "codigo do pai") && hasAny("descricao complementar", "valor ipi fixo", "ex tipi"))
  ) {
    return "Tiny ERP"
  }

  // Shopify: "Handle", "Title", "Option1 Name", "Variant SKU"
  if (has("handle", "title") && hasAny("option1 name", "variant sku", "variant price")) {
    return "Shopify"
  }

  // Nuvemshop: "Identificador URL", "Nome da variação 1", "Valor da variação 1"
  if (
    has("identificador url") &&
    hasAny("nome da variacao 1", "valor da variacao 1", "exibir na loja")
  ) {
    return "Nuvemshop"
  }

  // WooCommerce: "Type", "SKU", "Parent", "Attribute 1 name"
  if (
    hasAny("attribute 1 name", "attribute 1 value s") ||
    (has("type", "sku", "parent") && hasAny("regular price", "sale price"))
  ) {
    return "WooCommerce"
  }

  // Bling: "Código", "Descrição", "Código do pai" (or "Código pai") + Bling-specific columns
  if (
    hasAny("codigo do pai", "codigo pai") &&
    hasAny("unidade", "ncm", "origem", "situacao", "preco de custo")
  ) {
    return "Bling"
  }

  // Dudit template
  if (has("nome do produto", "sku codigo", "preco de venda") && hasAny("variacoes grade", "visibilidade na loja")) {
    return "Dudit"
  }

  return null
}

export function normalizePackagingType(raw?: string | null): "package" | "cilinder" | "envelope" {
  if (!raw) return "package"
  const norm = normalizeKey(raw)
  if (!norm) return "package"

  if (
    norm === "2" ||
    norm.includes("cilindr") ||
    norm.includes("cylind") ||
    norm.includes("rolo") ||
    norm.includes("prisma")
  ) {
    return "cilinder"
  }

  if (norm === "3" || norm.includes("envelop")) {
    return "envelope"
  }

  return "package"
}

export function normalizeProductType(raw?: string | null): "Físico" | "Digital" | "Serviço" {
  if (!raw) return "Físico"
  const norm = normalizeKey(raw)
  if (norm === "digital" || norm === "virtual" || norm === "download") {
    return "Digital"
  }
  if (norm === "servico" || norm === "service") {
    return "Serviço"
  }
  return "Físico"
}

export function normalizeUnit(raw?: string | null): string {
  if (!raw || !raw.trim()) return "UN"
  const upper = raw.trim().toUpperCase()
  const map: Record<string, string> = {
    UND: "UN",
    UNID: "UN",
    UNIDADE: "UN",
    PÇ: "PC",
    PEÇA: "PC",
    PECA: "PC",
    CAIXA: "CX",
    QUILO: "KG",
    QUILOGRAMA: "KG",
    GRAMA: "G",
    LITRO: "L",
    METRO: "M",
  }
  return map[upper] || upper.substring(0, 10)
}

export function isRowInactive(rawStatus?: string | null): boolean {
  if (!rawStatus) return false
  const norm = rawStatus.trim().toLowerCase()
  return ["inativo", "inactive", "0", "false", "desativado", "excluido", "excluído", "e"].includes(norm)
}

function formatForVariantSku(text: string): string {
  if (!text) return ""
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .substring(0, 10)
}

/**
 * Parses key-value attribute strings used by Brazilian ERPs:
 * - Tiny ERP: "Cor:Branca||Tamanho:P"
 * - Bling ERP: "Cor:Branca;Tamanho:P" or "Cor:Branca; Tamanho:P"
 * - Generic: "Cor: Branca / Tamanho: P" or "Tamanho:P"
 *
 * Returns null if the string looks like Dudit's inline "Name: Stock: Price" format
 * (where the value after ":" is a numeric stock count).
 */
export function parseKeyValueVariantAttributes(
  raw: string | null | undefined,
): { variantType: string; variantName: string; attributes: Record<string, string> } | null {
  if (!raw || !raw.trim()) return null
  const trimmed = raw.trim()

  // Must contain ":" to be key:value pairs, and must not be parenthetical Dudit format
  if (!trimmed.includes(":") || trimmed.includes("(") || trimmed.includes("[")) {
    return null
  }

  let segments: string[] = []
  if (trimmed.includes("||")) {
    segments = trimmed.split("||").map((s) => s.trim()).filter(Boolean)
  } else if (trimmed.includes("|")) {
    segments = trimmed.split("|").map((s) => s.trim()).filter(Boolean)
  } else if (trimmed.includes(";")) {
    segments = trimmed.split(";").map((s) => s.trim()).filter(Boolean)
  } else {
    segments = [trimmed]
  }

  if (segments.length === 0) return null

  const keys: string[] = []
  const values: string[] = []
  const attributes: Record<string, string> = {}

  for (const seg of segments) {
    const colonIdx = seg.indexOf(":")
    if (colonIdx <= 0) return null

    const key = seg.slice(0, colonIdx).trim()
    const rest = seg.slice(colonIdx + 1).trim()
    if (!key || !rest) return null

    // If there is another colon in `rest` (e.g. "P: 10: 39.90"), this is Dudit's inline format, not key:value
    if (rest.includes(":")) return null

    // If single segment without "||" and value is purely numeric (e.g. "P: 10"), it's Dudit's inline "Name: Stock"
    const isNumericValue = /^\d+([.,]\d+)?$/.test(rest)
    const isSizeOrShoeAttribute = /^(tamanho|tam|numera|numero|número|voltagem|tensao|tensão|capacidade|peso|medida|aro|tamanho\/numeração)$/i.test(
      key,
    )
    if (isNumericValue && !trimmed.includes("||") && !isSizeOrShoeAttribute) {
      return null
    }

    keys.push(key)
    values.push(rest)
    attributes[key] = rest
  }

  if (keys.length === 0) return null

  return {
    variantType: keys.join(" / ").substring(0, 50),
    variantName: values.join(" / ").substring(0, 50),
    attributes,
  }
}

export function parseProductVariants(
  rawVariants: string | null | undefined,
  rawVariantType: string | null | undefined,
  productBase: {
    sku: string
    price: number
    stock_quantity: number
  },
): ParsedVariant[] {
  if (!rawVariants || !rawVariants.trim()) return []

  const trimmedRaw = rawVariants.trim()

  // Handle single-variant Tiny/Bling key-value string (e.g. "Cor:Branca||Tamanho:P")
  if (trimmedRaw.includes("||")) {
    const kv = parseKeyValueVariantAttributes(trimmedRaw)
    if (kv) {
      const baseSku = productBase.sku || "PRD"
      const suffix = kv.variantName
        .split("/")
        .map((p) => formatForVariantSku(p.trim()))
        .filter(Boolean)
        .join("-")
      return [
        {
          variant_name: kv.variantName,
          variant_type: rawVariantType?.trim() || kv.variantType,
          variant_value: kv.variantName,
          sku: `${baseSku}-${suffix || 1}`.substring(0, 100),
          price_adjustment: productBase.price,
          stock_quantity: productBase.stock_quantity,
          is_active: true,
          variant_options: null,
        },
      ]
    }
  }

  // 1. Split items: primary delimiter is semicolon (;)
  let items: string[] = []
  if (trimmedRaw.includes(";")) {
    items = trimmedRaw.split(";").map((s) => s.trim()).filter(Boolean)
  } else if (trimmedRaw.includes("\n")) {
    items = trimmedRaw.split("\n").map((s) => s.trim()).filter(Boolean)
  } else if (!trimmedRaw.includes("(") && trimmedRaw.includes(",")) {
    items = trimmedRaw.split(",").map((s) => s.trim()).filter(Boolean)
  } else {
    // If parentheses are used with commas, e.g. "P (10), M (20)"
    items = trimmedRaw.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean)
  }

  if (items.length === 0) return []

  // Limit maximum 50 variants per product
  if (items.length > 50) {
    items = items.slice(0, 50)
  }

  let defaultType = rawVariantType?.trim() || ""

  // If no variant type provided, attempt smart inference from items
  if (!defaultType) {
    const allValues = items.map((it) => it.split(/[\(\[\:\;\|]/)[0].trim())
    const hasCombo = allValues.some((v) => v.includes("/"))
    if (hasCombo) {
      defaultType = "Opção 1 / Opção 2"
    } else {
      const sizePattern = /^(PP|P|M|G|GG|XG|XGG|G1|G2|G3|G4|3[4-9]|4[0-9]|5[0-2]|XXS|XS|S|M|L|XL|XXL|XXXL)$/i
      const colorPattern = /^(azul|preto|preta|branco|branca|vermelho|vermelha|verde|amarelo|amarela|rosa|cinza|bege|marrom|roxo|roxa|laranja|dourado|dourada|prata|off-white|nude|vinho|bordo|coral|turquesa|lilas|grafite|estampado|estampada)$/i

      const allSizes = allValues.every((v) => sizePattern.test(v))
      const allColors = allValues.every((v) => colorPattern.test(v))

      if (allSizes) {
        defaultType = "Tamanho"
      } else if (allColors) {
        defaultType = "Cor"
      } else {
        defaultType = "Variação"
      }
    }
  }

  if (defaultType.length > 50) {
    defaultType = defaultType.substring(0, 50)
  }

  const parsedVariants: ParsedVariant[] = []
  const usedSkus = new Set<string>()

  for (let idx = 0; idx < items.length; idx++) {
    const rawItem = items[idx]
    if (!rawItem) continue

    let variantName = ""
    let stock = 0
    let price = productBase.price
    let customSku: string | null = null

    // Check if parentheses or brackets format: e.g. "P (Estoque: 10, Preço: 49.90, SKU: CAM-P)" or "M [15]"
    if (rawItem.includes("(") || rawItem.includes("[")) {
      const parenMatch = rawItem.match(/^([^\(\[]+)(?:[\(\[](.*)[\)\]])?$/)
      if (parenMatch) {
        variantName = parenMatch[1].trim()
        const insideParen = parenMatch[2]?.trim()

        if (insideParen) {
          const parts = insideParen.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
          let hasNamedKey = false

          for (const part of parts) {
            const lowerPart = part.toLowerCase()
            if (
              lowerPart.startsWith("est") ||
              lowerPart.startsWith("qtd") ||
              lowerPart.startsWith("quant") ||
              lowerPart.startsWith("stock") ||
              lowerPart.startsWith("saldo") ||
              lowerPart.startsWith("qty")
            ) {
              const val = parseNumber(part.split(":")[1] || part.replace(/^[a-zA-Z\s]+/g, ""))
              if (val !== null && val >= 0) stock = Math.floor(val)
              hasNamedKey = true
            } else if (
              lowerPart.startsWith("pre") ||
              lowerPart.startsWith("val") ||
              lowerPart.startsWith("price") ||
              lowerPart.startsWith("pv")
            ) {
              const val = parseNumber(part.split(":")[1] || part.replace(/^[a-zA-Z\s]+/g, ""))
              if (val !== null && val >= 0) price = val
              hasNamedKey = true
            } else if (
              lowerPart.startsWith("sku") ||
              lowerPart.startsWith("cód") ||
              lowerPart.startsWith("cod") ||
              lowerPart.startsWith("ref")
            ) {
              const val = part.split(":")[1]?.trim()
              if (val) customSku = val
              hasNamedKey = true
            }
          }

          // Positional values if no named key-values
          if (!hasNamedKey) {
            if (parts.length === 1) {
              const num = parseNumber(parts[0])
              if (num !== null && num >= 0) stock = Math.floor(num)
            } else if (parts.length >= 2) {
              const n1 = parseNumber(parts[0])
              const n2 = parseNumber(parts[1])
              if (n1 !== null && n1 >= 0) stock = Math.floor(n1)
              if (n2 !== null && n2 >= 0) price = n2
              if (parts[2]) customSku = parts[2]
            }
          }
        }
      }
    } else if (rawItem.includes("|")) {
      // Pipe format: "P | 10 | 49.90 | CAM-P"
      const parts = rawItem.split("|").map((p) => p.trim())
      variantName = parts[0]
      if (parts[1]) {
        const n = parseNumber(parts[1])
        if (n !== null && n >= 0) stock = Math.floor(n)
      }
      if (parts[2]) {
        const p = parseNumber(parts[2])
        if (p !== null && p >= 0) price = p
      }
      if (parts[3]) customSku = parts[3]
    } else if (rawItem.includes(":")) {
      // Colon format: "P: 10" or "P: 10: 49.90"
      const parts = rawItem.split(":").map((p) => p.trim())
      variantName = parts[0]
      if (parts[1]) {
        const n = parseNumber(parts[1])
        if (n !== null && n >= 0) stock = Math.floor(n)
      }
      if (parts[2]) {
        const p = parseNumber(parts[2])
        if (p !== null && p >= 0) price = p
      }
      if (parts[3]) customSku = parts[3]
    } else {
      variantName = rawItem.trim()
    }

    if (!variantName) continue

    if (variantName.length > 50) {
      variantName = variantName.substring(0, 50)
    }

    // Generate or validate SKU
    let variantSku = customSku ? customSku.trim() : ""
    if (!variantSku) {
      const baseSku = productBase.sku || "PRD"
      const suffix = variantName
        .split("/")
        .map((p) => formatForVariantSku(p.trim()))
        .filter(Boolean)
        .join("-")

      variantSku = `${baseSku}-${suffix || idx + 1}`
    }

    if (variantSku.length > 100) {
      variantSku = variantSku.substring(0, 100)
    }

    // Ensure unique SKU within batch
    let uniqueVariantSku = variantSku
    let counter = 1
    while (usedSkus.has(uniqueVariantSku.toLowerCase())) {
      uniqueVariantSku = `${variantSku}-${counter}`
      counter++
    }
    usedSkus.add(uniqueVariantSku.toLowerCase())

    parsedVariants.push({
      variant_name: variantName,
      variant_type: defaultType,
      variant_value: variantName,
      sku: uniqueVariantSku,
      price_adjustment: price,
      stock_quantity: stock,
      is_active: true,
      variant_options: null,
    })
  }

  return parsedVariants
}

function buildVariantFromChildRow(
  childRow: Record<string, string>,
  parentRow: Record<string, string>,
  fallbackOptionNames: { opt1?: string; opt2?: string },
  childIndex: number,
  usedSkus: Set<string>,
): ParsedVariant {
  const parentPrice = parseNumber(parentRow["price"]) ?? 0
  const childPrice = parseNumber(childRow["price"])
  const price = childPrice !== null ? childPrice : parentPrice

  const rawStock = parseNumber(childRow["stock_quantity"])
  const stock = rawStock !== null && rawStock >= 0 ? Math.floor(rawStock) : 0

  let variantType = childRow["variant_type"]?.trim() || parentRow["variant_type"]?.trim() || ""
  let variantName = ""

  // 1) Try structured key:value attributes in `variants` column (Tiny ERP: "Cor:Branca||Tamanho:P", Bling: "Cor:Branca;Tamanho:P")
  const kv = parseKeyValueVariantAttributes(childRow["variants"])
  if (kv) {
    if (!variantType) variantType = kv.variantType
    variantName = kv.variantName
  }

  // 2) Try Option1/Option2 columns (Shopify, Nuvemshop, WooCommerce)
  if (!variantName) {
    const opt1Val = childRow["option1_value"]?.trim()
    const opt2Val = childRow["option2_value"]?.trim()
    const opt1Name = childRow["option1_name"]?.trim() || fallbackOptionNames.opt1 || ""
    const opt2Name = childRow["option2_name"]?.trim() || fallbackOptionNames.opt2 || ""

    const vals = [opt1Val, opt2Val].filter((v): v is string => Boolean(v) && v.toLowerCase() !== "default title")
    const names = [opt1Val ? opt1Name : "", opt2Val ? opt2Name : ""].filter(Boolean)

    if (vals.length > 0) {
      variantName = vals.join(" / ")
      if (!variantType && names.length > 0) {
        variantType = names.join(" / ")
      }
    }
  }

  // 3) Try raw `variants` string as plain label
  if (!variantName && childRow["variants"]?.trim()) {
    variantName = childRow["variants"].trim()
  }

  // 4) Fallback: diff child name against parent name, or use child name / SKU
  if (!variantName) {
    const parentName = parentRow["name"]?.trim() || ""
    const childName = childRow["name"]?.trim() || ""
    if (parentName && childName && childName.toLowerCase().startsWith(parentName.toLowerCase())) {
      const diff = childName.slice(parentName.length).replace(/^[\s\-–—:/]+/, "").trim()
      if (diff) variantName = diff
    }
    if (!variantName) {
      variantName = childName || childRow["sku"]?.trim() || `Variação ${childIndex + 1}`
    }
  }

  if (!variantType) {
    variantType = variantName.includes("/") ? "Opção 1 / Opção 2" : "Variação"
  }

  if (variantName.length > 50) variantName = variantName.substring(0, 50)
  if (variantType.length > 50) variantType = variantType.substring(0, 50)

  let variantSku = childRow["sku"]?.trim() || ""
  if (!variantSku) {
    const baseSku = parentRow["sku"]?.trim() || "PRD"
    const suffix = variantName
      .split("/")
      .map((p) => formatForVariantSku(p.trim()))
      .filter(Boolean)
      .join("-")
    variantSku = `${baseSku}-${suffix || childIndex + 1}`
  }

  if (variantSku.length > 100) variantSku = variantSku.substring(0, 100)

  let uniqueSku = variantSku
  let counter = 1
  while (usedSkus.has(uniqueSku.toLowerCase())) {
    uniqueSku = `${variantSku}-${counter}`
    counter++
  }
  usedSkus.add(uniqueSku.toLowerCase())

  return {
    variant_name: variantName,
    variant_type: variantType,
    variant_value: variantName,
    sku: uniqueSku,
    price_adjustment: price,
    stock_quantity: stock,
    is_active: !isRowInactive(childRow["status"]),
    variant_options: null,
  }
}

/**
 * Consolidates flat spreadsheet rows into logical products with their variants.
 *
 * Supports:
 * 1. Parent-child SKU hierarchy (Tiny ERP, Bling, WooCommerce):
 *    Parent has `sku = X`, `parent_sku = ""`. Children have `parent_sku = X`.
 * 2. Handle / URL-slug grouping (Shopify, Nuvemshop):
 *    Multiple rows share the same `parent_sku` (Handle / Identificador URL),
 *    where the first row has the product `name` and subsequent rows are variants.
 * 3. Single-row inline variants (Dudit native template):
 *    Single row with `variants` column like "P (Estoque: 10); M (Estoque: 20)".
 */
export function consolidateProductRows(
  mappedRows: Record<string, string>[],
  rawRows?: Record<string, string>[],
): ConsolidatedProductRow[] {
  if (mappedRows.length === 0) return []

  // Index rows by SKU (lowercase) for rows that do NOT have a different parent_sku
  const parentIndexBySku = new Map<string, number>()
  mappedRows.forEach((row, idx) => {
    const sku = row["sku"]?.trim()
    const parentSku = row["parent_sku"]?.trim()
    if (sku && (!parentSku || parentSku.toLowerCase() === sku.toLowerCase())) {
      const key = sku.toLowerCase()
      if (!parentIndexBySku.has(key)) {
        parentIndexBySku.set(key, idx)
      }
    }
  })

  // Track children attached to an explicit parent row index
  const childrenByParentIdx = new Map<number, number[]>()
  const consumedRowIndices = new Set<number>()

  // Track rows grouped by parent_sku when NO row has `sku === parent_sku`
  // (e.g. Shopify Handle, Nuvemshop Identificador URL, or orphan Tiny/Bling children)
  const groupsByKey = new Map<string, number[]>()

  mappedRows.forEach((row, idx) => {
    const parentSku = row["parent_sku"]?.trim()
    const sku = row["sku"]?.trim()
    if (!parentSku) return

    const parentKey = parentSku.toLowerCase()
    const explicitParentIdx = parentIndexBySku.get(parentKey)

    if (explicitParentIdx !== undefined && explicitParentIdx !== idx) {
      // Explicit parent-child match (Tiny ERP, Bling, WooCommerce)
      const list = childrenByParentIdx.get(explicitParentIdx) || []
      list.push(idx)
      childrenByParentIdx.set(explicitParentIdx, list)
      consumedRowIndices.add(idx)
    } else if (!sku || parentKey !== sku.toLowerCase()) {
      // Candidate for Handle/Identificador URL group or orphan parent_sku group
      const list = groupsByKey.get(parentKey) || []
      list.push(idx)
      groupsByKey.set(parentKey, list)
    }
  })

  // Identify multi-row Handle / orphan groups
  const handleGroupByFirstIdx = new Map<number, { parentKey: string; memberIndices: number[] }>()
  for (const [parentKey, indices] of groupsByKey.entries()) {
    // Only treat as a group if there are multiple rows OR if the single row has no explicit parent
    // and has key:value variant attributes / option values
    const firstNamedIdx = indices.find((i) => Boolean(mappedRows[i]["name"]?.trim())) ?? indices[0]
    if (indices.length > 1) {
      handleGroupByFirstIdx.set(firstNamedIdx, { parentKey, memberIndices: indices })
      for (const memberIdx of indices) {
        if (memberIdx !== firstNamedIdx) {
          consumedRowIndices.add(memberIdx)
        }
      }
    }
  }

  const consolidated: ConsolidatedProductRow[] = []

  for (let idx = 0; idx < mappedRows.length; idx++) {
    if (consumedRowIndices.has(idx)) continue

    const row = mappedRows[idx]
    const rawRow = rawRows?.[idx]

    // Case 1: Explicit parent with child rows (Tiny ERP, Bling, WooCommerce)
    const childIndices = childrenByParentIdx.get(idx)
    if (childIndices && childIndices.length > 0) {
      const usedSkus = new Set<string>()
      const fallbackOptionNames = {
        opt1: row["option1_name"]?.trim(),
        opt2: row["option2_name"]?.trim(),
      }
      const variants: ParsedVariant[] = childIndices
        .slice(0, 50)
        .map((cIdx, vIdx) =>
          buildVariantFromChildRow(mappedRows[cIdx], row, fallbackOptionNames, vIdx, usedSkus),
        )

      const totalVariantStock = variants.reduce((sum, v) => sum + v.stock_quantity, 0)
      const mergedRow: Record<string, string> = { ...row }
      if (totalVariantStock > 0) {
        mergedRow["stock_quantity"] = String(totalVariantStock)
      }
      // Backfill parent price from first variant if parent price is blank
      if (!mergedRow["price"]?.trim() && variants.length > 0 && variants[0].price_adjustment > 0) {
        mergedRow["price"] = String(variants[0].price_adjustment)
      }
      if (!mergedRow["variant_type"]?.trim() && variants.length > 0) {
        mergedRow["variant_type"] = variants[0].variant_type
      }

      consolidated.push({
        row: mergedRow,
        rawRow,
        primaryRowIndex: idx,
        rowIndexes: [idx, ...childIndices],
        variants,
        isGroupedParent: true,
      })
      continue
    }

    // Case 2: Handle / Identificador URL group (Shopify, Nuvemshop) or orphan parent_sku group
    const handleGroup = handleGroupByFirstIdx.get(idx)
    if (handleGroup) {
      const { memberIndices } = handleGroup
      const usedSkus = new Set<string>()
      const fallbackOptionNames = {
        opt1: row["option1_name"]?.trim(),
        opt2: row["option2_name"]?.trim(),
      }

      const variants: ParsedVariant[] = memberIndices
        .slice(0, 50)
        .map((mIdx, vIdx) =>
          buildVariantFromChildRow(mappedRows[mIdx], row, fallbackOptionNames, vIdx, usedSkus),
        )

      const totalVariantStock = variants.reduce((sum, v) => sum + v.stock_quantity, 0)
      const mergedRow: Record<string, string> = { ...row }
      // Use parent_sku as parent SKU if the first row's SKU was actually a variant SKU
      if (
        mergedRow["parent_sku"]?.trim() &&
        variants.some((v) => v.sku.toLowerCase() === (mergedRow["sku"]?.trim() || "").toLowerCase())
      ) {
        mergedRow["sku"] = mergedRow["parent_sku"].trim()
      }
      if (totalVariantStock > 0) {
        mergedRow["stock_quantity"] = String(totalVariantStock)
      }
      if (!mergedRow["price"]?.trim() && variants.length > 0 && variants[0].price_adjustment > 0) {
        mergedRow["price"] = String(variants[0].price_adjustment)
      }
      if (!mergedRow["variant_type"]?.trim() && variants.length > 0) {
        mergedRow["variant_type"] = variants[0].variant_type
      }

      consolidated.push({
        row: mergedRow,
        rawRow,
        primaryRowIndex: idx,
        rowIndexes: memberIndices,
        variants,
        isGroupedParent: true,
      })
      continue
    }

    // Case 3: Single row (simple product or Dudit inline variants string)
    let inlineVariants: ParsedVariant[] = []
    const variantsRaw = row["variants"]?.trim()
    if (variantsRaw) {
      inlineVariants = parseProductVariants(variantsRaw, row["variant_type"]?.trim(), {
        sku: row["sku"]?.trim() || "PRD",
        price: parseNumber(row["price"]) ?? 0,
        stock_quantity: parseNumber(row["stock_quantity"]) ?? 0,
      })
    }

    consolidated.push({
      row,
      rawRow,
      primaryRowIndex: idx,
      rowIndexes: [idx],
      variants: inlineVariants,
      isGroupedParent: false,
    })
  }

  return consolidated
}
