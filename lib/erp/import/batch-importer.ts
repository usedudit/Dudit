import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { encryptCPF } from "@/lib/crypto"
import { generateCpfLookupHash } from "@/lib/services/cpf-hash"
import { enrichAddressData } from "@/lib/services/location.service"
import { parseNumber, parseDate, parseTime } from "./validators"
import { canUseFeature, checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import type { ColumnMapping, FailedRow, ImportOptions, ImportResult, ImportSession } from "./types"

const BATCH_SIZE = 250

function mapRowToObject(
  row: string[],
  mapping: ColumnMapping[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const col of mapping) {
    if (col.field && col.headerIndex < row.length) {
      const value = row[col.headerIndex]?.trim() ?? ""
      if (value) {
        if (result[col.field]) {
          result[col.field] += ", " + value
        } else {
          result[col.field] = value
        }
      }
    }
  }
  return result
}

function mapRowToRawHeaderObject(
  row: string[],
  headers: string[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    result[headers[i]] = row[i]?.trim() ?? ""
  }
  return result
}

export async function executeImport(
  session: ImportSession,
  mapping: ColumnMapping[],
  options: ImportOptions = {},
): Promise<ImportResult> {
  const startTime = Date.now()
  const supabase = await getSupabaseServerClient()
  const admin = getAdminClient()
  let { partnerId, storeId, entityType, rows, headers } = session

  // Ensure storeId is resolved for entity types that require it
  if (!storeId && (entityType === "products" || entityType === "services")) {
    const { data: stores } = await admin.from("stores").select("id").eq("partner_id", partnerId).limit(1)
    if (stores && stores.length > 0) {
      storeId = stores[0].id
    }
  }

  // Auto-backfill existing orphan records for this partner if we have a valid storeId
  if (storeId) {
    try {
      if (entityType === "services") {
        await admin
          .from("services")
          .update({ store_id: storeId })
          .eq("partner_id", partnerId)
          .is("store_id", null)
      } else if (entityType === "products") {
        await admin
          .from("products")
          .update({ store_id: storeId })
          .eq("partner_id", partnerId)
          .is("store_id", null)
      }
    } catch (backfillErr) {
      console.warn("[BatchImport] Error backfilling orphan store_id:", backfillErr)
    }
  }

  const duplicateStrategy = options.duplicateStrategy || (options.skipDuplicates ? "skip" : "update")
  const autoCreateCategories = options.autoCreateCategories !== false
  const autoCreateBrands = options.autoCreateBrands !== false
  const autoCreateSuppliers = options.autoCreateSuppliers !== false

  const mappedRows = rows.map((row) => mapRowToObject(row, mapping))
  const rawRowsObjects = rows.map((row) => mapRowToRawHeaderObject(row, headers))

  // ─── Plan limit check for products & services (items) ────────────────────
  let remainingItemsSlots: number | null = null
  if (entityType === "products" || entityType === "services") {
    const limitResult = await checkLimit(partnerId, "items")
    if (!limitResult.allowed) {
      return {
        importId: "",
        successRows: 0,
        createdRows: 0,
        updatedRows: 0,
        errorRows: rows.length,
        duplicateRows: 0,
        warningRows: 0,
        durationMs: 0,
        errorMessage: limitResult.message || "Limite de itens do plano atingido. Faça upgrade para importar mais.",
        failedRows: rows.map((_, i) => ({
          rowIndex: i + 1,
          data: rawRowsObjects[i],
          errorMessage: limitResult.message || "Limite de itens do plano atingido.",
        })),
      }
    }
    if (limitResult.limit !== "unlimited") {
      remainingItemsSlots = limitResult.limit - limitResult.current
      if (remainingItemsSlots <= 0) {
        remainingItemsSlots = 0
      }
    }
  }

  let successRows = 0
  let createdRows = 0
  let updatedRows = 0
  let errorRows = 0
  let duplicateRows = 0
  let warningRows = 0
  const failedRows: FailedRow[] = []
  const errorMessages: string[] = []

  // Pre-load / Auto-create categories
  const hasCategoryCol = mapping.some((m) => m.field === "category")
  const categoryCache = new Map<string, string>()

  if (hasCategoryCol) {
    const catTable = entityType === "products" ? "product_categories" : "service_categories"
    const allCatNames = [
      ...new Set(mappedRows.map((r) => r["category"]?.trim()).filter(Boolean)),
    ]

    if (allCatNames.length > 0) {
      const { data: existing } = await supabase
        .from(catTable)
        .select("id, name")
        .eq("partner_id", partnerId)

      for (const c of existing || []) {
        categoryCache.set(c.name.trim().toLowerCase(), c.id)
      }

      if (autoCreateCategories) {
        const missingCats = allCatNames.filter(
          (name) => !categoryCache.has(name.toLowerCase())
        )
        if (missingCats.length > 0) {
          const toInsertCats = missingCats.map((name) => ({
            partner_id: partnerId,
            name,
            is_active: true,
          }))
          const { data: createdCats } = await supabase
            .from(catTable)
            .insert(toInsertCats)
            .select("id, name")

          for (const c of createdCats || []) {
            categoryCache.set(c.name.trim().toLowerCase(), c.id)
          }
        }
      }
    }
  }

  // Pre-load / Auto-create brands for products
  const hasBrandCol = mapping.some((m) => m.field === "brand")
  const brandCache = new Map<string, string>()

  if (hasBrandCol && entityType === "products") {
    const allBrandNames = [
      ...new Set(mappedRows.map((r) => r["brand"]?.trim()).filter(Boolean)),
    ]
    if (allBrandNames.length > 0) {
      const { data: existing } = await supabase
        .from("brands")
        .select("id, name")
        .eq("partner_id", partnerId)

      for (const b of existing || []) {
        brandCache.set(b.name.trim().toLowerCase(), b.id)
      }

      if (autoCreateBrands) {
        const missingBrands = allBrandNames.filter(
          (name) => !brandCache.has(name.toLowerCase())
        )
        if (missingBrands.length > 0) {
          const toInsertBrands = missingBrands.map((name) => ({
            partner_id: partnerId,
            name,
            is_active: true,
          }))
          const { data: createdBrands } = await supabase
            .from("brands")
            .insert(toInsertBrands)
            .select("id, name")

          for (const b of createdBrands || []) {
            brandCache.set(b.name.trim().toLowerCase(), b.id)
          }
        }
      }
    }
  }

  // Pre-load / Auto-create suppliers for products (if mapped)
  const hasSupplierCol = mapping.some((m) => m.field === "supplier")
  const supplierCache = new Map<string, string>()

  if (hasSupplierCol && entityType === "products") {
    const allSupplierNames = [
      ...new Set(mappedRows.map((r) => r["supplier"]?.trim()).filter(Boolean)),
    ]
    if (allSupplierNames.length > 0) {
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("partner_id", partnerId)

      for (const s of existing || []) {
        supplierCache.set(s.name.trim().toLowerCase(), s.id)
      }

      if (autoCreateSuppliers) {
        const missingSuppliers = allSupplierNames.filter(
          (name) => !supplierCache.has(name.toLowerCase())
        )
        if (missingSuppliers.length > 0) {
          const toInsertSuppliers = missingSuppliers.map((name) => ({
            partner_id: partnerId,
            name,
            is_active: true,
          }))
          const { data: createdSuppliers } = await supabase
            .from("suppliers")
            .insert(toInsertSuppliers)
            .select("id, name")

          for (const s of createdSuppliers || []) {
            supplierCache.set(s.name.trim().toLowerCase(), s.id)
          }
        }
      }
    }
  }

  // Pre-load caches for appointments
  const staffCache = new Map<string, { id: string; name: string }>()
  const serviceCache = new Map<string, any>()
  const customerCache = new Map<string, string>()
  let defaultStaff: { id: string; name: string } = { id: "", name: "Profissional" }

  if (entityType === "appointments") {
    const { data: partnerUsers } = await admin
      .from("partner_users")
      .select("id, user_id, role_id")
      .eq("partner_id", partnerId)

    if (partnerUsers && partnerUsers.length > 0) {
      const userIds = partnerUsers.map((pu: any) => pu.user_id)
      const userResults = await Promise.allSettled(
        userIds.map((uid: string) => admin.auth.admin.getUserById(uid))
      )
      for (let idx = 0; idx < partnerUsers.length; idx++) {
        const pu = partnerUsers[idx]
        const res = userResults[idx]
        let memberName = "Profissional"
        if (res.status === "fulfilled" && res.value.data?.user) {
          const u = res.value.data.user
          const meta = u.user_metadata || {}
          memberName = meta.full_name || meta.name || meta.display_name || u.email?.split("@")[0] || "Profissional"
        }
        if (!defaultStaff.id) {
          defaultStaff = { id: pu.id, name: memberName }
        }
        const norm = memberName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        staffCache.set(norm, { id: pu.id, name: memberName })
      }
    }

    const { data: services } = await admin
      .from("services")
      .select("id, name, price, category_id, duration_minutes")
      .eq("partner_id", partnerId)

    for (const s of services || []) {
      const norm = String(s.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      serviceCache.set(norm, s)
    }

    const { data: customers } = await admin
      .from("customers")
      .select("id, name, phone, email")
      .eq("partner_id", partnerId)

    for (const c of customers || []) {
      if (c.phone) {
        const cleanPhone = String(c.phone).replace(/\D/g, "")
        if (cleanPhone) customerCache.set(`phone:${cleanPhone}`, c.id)
      }
      if (c.email) {
        customerCache.set(`email:${String(c.email).trim().toLowerCase()}`, c.id)
      }
      if (c.name) {
        const norm = String(c.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        customerCache.set(`name:${norm}`, c.id)
      }
    }
  }

  // Fetch default profit margin if importing products or services
  let defaultProfitMarginPercent: number | null = null
  if (entityType === "products" || entityType === "services") {
    const { data: partnerData } = await supabase
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .single()
    const margin = partnerData?.business_info?.salesSettings?.defaultProfitMarginPercent
    if (typeof margin === "number" && margin > 0) {
      defaultProfitMarginPercent = margin
    }
  }

  // Execute in batches
  for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
    const batch = mappedRows.slice(i, i + BATCH_SIZE)
    const rawBatch = rawRowsObjects.slice(i, i + BATCH_SIZE)
    const startIndex = i

    if (entityType === "products") {
      const result = await importProductBatch(
        supabase,
        partnerId,
        storeId,
        batch,
        rawBatch,
        startIndex,
        supplierCache,
        categoryCache,
        brandCache,
        duplicateStrategy,
        defaultProfitMarginPercent,
        remainingItemsSlots,
      )
      successRows += result.success
      createdRows += result.created
      updatedRows += result.updated
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      failedRows.push(...result.failedRows)
      if (result.errorMessage) errorMessages.push(result.errorMessage)
    } else if (entityType === "customers") {
      const result = await importCustomerBatch(
        admin,
        partnerId,
        batch,
        rawBatch,
        startIndex,
        duplicateStrategy,
      )

      // Customers don't have a plan limit (unlimited), so no slot tracking needed
      successRows += result.success
      createdRows += result.created
      updatedRows += result.updated
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      failedRows.push(...result.failedRows)
      if (result.errorMessage) errorMessages.push(result.errorMessage)
    } else if (entityType === "services") {
      const result = await importServiceBatch(
        supabase,
        partnerId,
        storeId,
        batch,
        rawBatch,
        startIndex,
        categoryCache,
        duplicateStrategy,
        defaultProfitMarginPercent,
        remainingItemsSlots,
      )
      successRows += result.success
      createdRows += result.created
      updatedRows += result.updated
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      failedRows.push(...result.failedRows)
      if (result.errorMessage) errorMessages.push(result.errorMessage)
    } else if (entityType === "appointments") {
      const result = await importAppointmentBatch(
        supabase,
        admin,
        partnerId,
        storeId,
        batch,
        rawBatch,
        startIndex,
        staffCache,
        serviceCache,
        customerCache,
        defaultStaff,
        duplicateStrategy,
      )
      successRows += result.success
      createdRows += result.created
      updatedRows += result.updated
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      failedRows.push(...result.failedRows)
      if (result.errorMessage) errorMessages.push(result.errorMessage)
    }
  }

  const durationMs = Date.now() - startTime

  return {
    importId: "",
    successRows,
    createdRows,
    updatedRows,
    errorRows,
    duplicateRows,
    warningRows,
    durationMs,
    errorMessage: errorMessages.length > 0 ? errorMessages.join(" | ") : undefined,
    failedRows,
  }
}

/* ========================================================================= */
/* PRODUCT VARIANTS PARSER & HELPERS                                         */
/* ========================================================================= */

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

function formatForVariantSku(text: string): string {
  if (!text) return ""
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .substring(0, 10)
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

/* ========================================================================= */
/* PRODUCTS BATCH IMPORT                                                     */
/* ========================================================================= */

async function importProductBatch(
  supabase: any,
  partnerId: string,
  storeId: string,
  batch: Record<string, string>[],
  rawBatch: Record<string, string>[],
  startIndex: number,
  supplierCache: Map<string, string>,
  categoryCache: Map<string, string>,
  brandCache: Map<string, string>,
  duplicateStrategy: "skip" | "update",
  defaultProfitMarginPercent: number | null = null,
  remainingSlots: number | null = null,
): Promise<{
  success: number
  created: number
  updated: number
  errors: number
  duplicates: number
  warnings: number
  errorMessage?: string
  failedRows: FailedRow[]
}> {
  let created = 0
  let updated = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  const failedRows: FailedRow[] = []
  let errorMessage: string | undefined = undefined
  let newlyInsertedCount = 0

  const skus = batch.map((r) => r["sku"]?.trim()).filter(Boolean) as string[]
  const existingProductMap = new Map<string, any>()

  if (skus.length > 0) {
    const { data: existing } = await supabase
      .from("products")
      .select("id, sku, name")
      .eq("partner_id", partnerId)
      .in("sku", skus)

    for (const p of existing || []) {
      existingProductMap.set(p.sku, p)
    }
  }

  const toInsert: any[] = []
  const toInsertMetadata: { fiscal: any; logistics: any; variants?: ParsedVariant[] }[] = []
  const toUpdate: { id: string; data: any; fiscal: any; logistics: any; variants?: ParsedVariant[] }[] = []

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]
    const rawRow = rawBatch[i]
    const rowNum = startIndex + i + 1

    let name = row["name"]?.trim() || ""
    if (!name) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: "Nome do produto é obrigatório e está em branco.",
      })
      continue
    }

    if (name.length > 150) {
      name = name.substring(0, 150)
      warnings++
    }

    let price = parseNumber(row["price"])
    const costPrice = parseNumber(row["cost_price"])

    // Apply default profit margin if price is missing or zero and cost price is given
    if ((price === null || price === 0) && costPrice !== null && costPrice > 0 && defaultProfitMarginPercent && defaultProfitMarginPercent > 0) {
      price = Math.round(costPrice * (1 + defaultProfitMarginPercent / 100) * 100) / 100
    }

    if (price === null) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: `Preço de venda inválido ("${row["price"] || ""}"). Deve ser numérico.`,
      })
      continue
    }

    // Parse product variants if specified
    const variantsRaw = row["variants"]?.trim()
    const variantTypeRaw = row["variant_type"]?.trim()
    let parsedVariants: ParsedVariant[] = []
    let hasVariants = false

    if (variantsRaw) {
      const baseSkuForVariants = row["sku"]?.trim() || generateSKUBase(name)
      parsedVariants = parseProductVariants(variantsRaw, variantTypeRaw, {
        sku: baseSkuForVariants,
        price,
        stock_quantity: parseNumber(row["stock_quantity"]) ?? 0,
      })
      if (parsedVariants.length > 0) {
        hasVariants = true
      }
    }

    let sku = hasVariants ? null : (row["sku"]?.trim() || generateSKUBase(name))
    if (sku && sku.length > 100) {
      sku = sku.substring(0, 100)
    }

    let status = "ativo"
    const rawStatus = row["status"]?.trim().toLowerCase()
    if (rawStatus) {
      if (["inativo", "inactive", "0", "false", "desativado"].includes(rawStatus)) {
        status = "inativo"
      } else if (["rascunho", "draft"].includes(rawStatus)) {
        status = "rascunho"
      }
    }

    let showInMarketplace = true
    const rawVis = row["show_in_marketplace"]?.trim().toLowerCase()
    if (rawVis && ["oculto", "privado", "unpublished", "inativo", "0", "false", "nao", "não"].includes(rawVis)) {
      showInMarketplace = false
    }

    const productData: any = {
      partner_id: partnerId,
      store_id: storeId || null,
      name,
      sku: sku || null,
      description: row["description"] || null,
      price,
      stock_quantity: parseNumber(row["stock_quantity"]) ?? 0,
      cost_price: parseNumber(row["cost_price"]),
      min_stock: parseNumber(row["min_stock"]),
      unit: row["unit"] || "UN",
      gtin: row["gtin"] || null,
      product_type: row["product_type"] || "Físico",
      condition: row["condition"] || "Novo",
      promotional_price: parseNumber(row["promotional_price"]),
      status,
      show_in_marketplace: showInMarketplace,
    }

    if (hasVariants) {
      // If variants have stock and the product's main stock is 0, update product stock to sum of variants
      const totalVariantStock = parsedVariants.reduce((sum, v) => sum + v.stock_quantity, 0)
      if (totalVariantStock > 0 && productData.stock_quantity === 0) {
        productData.stock_quantity = totalVariantStock
      }
    }

    if (row["category"]) {
      const catKey = row["category"].trim().toLowerCase()
      if (categoryCache.has(catKey)) {
        productData.category_id = categoryCache.get(catKey)
      }
    }

    if (row["brand"]) {
      const brandKey = row["brand"].trim().toLowerCase()
      if (brandCache.has(brandKey)) {
        productData.brand_id = brandCache.get(brandKey)
      }
    }

    if (row["supplier"]) {
      const supplierKey = row["supplier"].trim().toLowerCase()
      if (supplierCache.has(supplierKey)) {
        productData.supplier_id = supplierCache.get(supplierKey)
      }
    }

    if (row["tags"]) {
      productData.tags = row["tags"].split(",").map((t) => t.trim()).filter(Boolean)
    }

    const fiscal = {
      ncm: row["ncm"] || null,
      cest: row["cest"] || null,
      origin: row["origin"] ? parseInt(row["origin"].replace(/\D/g, "")) || 0 : 0,
      item_type: "00",
      cfop_internal: "5102",
      cfop_external: "6102",
      csosn: "102",
      pis_cst: "99",
      pis_rate: 0.0,
      cofins_cst: "99",
      cofins_rate: 0.0,
      ipi_cst: "99",
    }
    const logistics = {
      weight_gross: parseNumber(row["weight_gross"]) ?? 0,
      weight_net: parseNumber(row["weight_net"]) ?? 0,
      width: parseNumber(row["width"]) ?? 0,
      height: parseNumber(row["height"]) ?? 0,
      length: parseNumber(row["length"]) ?? 0,
      packaging_type: row["packaging_type"] || "Pacote/Caixa",
      preparation_days: parseNumber(row["preparation_days"]) ?? 0,
    }

    const existing = sku ? existingProductMap.get(sku) : null
    if (existing) {
      if (duplicateStrategy === "update") {
        toUpdate.push({ id: existing.id, data: productData, fiscal, logistics, variants: parsedVariants })
      } else {
        duplicates++
      }
    } else {
      // Check plan limit before inserting new product
      if (remainingSlots !== null && newlyInsertedCount >= remainingSlots) {
        errors++
        warnings++
        failedRows.push({
          rowIndex: rowNum,
          data: rawRow,
          errorMessage: "Limite de itens do plano atingido. Faça upgrade para importar mais itens.",
        })
        continue
      }
      newlyInsertedCount++
      toInsert.push(productData)
      toInsertMetadata.push({ fiscal, logistics, variants: parsedVariants })
    }
  }

  // Perform inserts
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("products")
      .insert(toInsert)
      .select("id, name, sku")

    if (error) {
      console.error("[BatchImport] Erro ao inserir produtos:", error)
      errors += toInsert.length
      errorMessage = error.message
    } else {
      created += inserted?.length ?? 0

      // Insert fiscal & logistics profiles and variants
      const fiscalToInsert: any[] = []
      const logisticsToInsert: any[] = []
      const variantsToInsert: any[] = []

      for (let idx = 0; idx < (inserted?.length ?? 0); idx++) {
        const item = inserted[idx]
        const meta = toInsertMetadata[idx]
        if (item?.id && meta) {
          if (meta.fiscal) {
            fiscalToInsert.push({ product_id: item.id, ...meta.fiscal })
          }
          if (meta.logistics) {
            logisticsToInsert.push({ product_id: item.id, ...meta.logistics })
          }
          if (meta.variants && meta.variants.length > 0) {
            for (const v of meta.variants) {
              variantsToInsert.push({
                product_id: item.id,
                ...v,
              })
            }
          }
        }
      }

      if (fiscalToInsert.length > 0) {
        await supabase.from("product_fiscal_profiles").insert(fiscalToInsert)
      }
      if (logisticsToInsert.length > 0) {
        await supabase.from("product_logistics").insert(logisticsToInsert)
      }

      // Insert product variants if any
      if (variantsToInsert.length > 0) {
        const isVariantsAllowed = await canUseFeature(partnerId, "product_variants")
        if (isVariantsAllowed) {
          const { error: variantInsertError } = await supabase
            .from("product_variants")
            .insert(variantsToInsert)

          if (variantInsertError) {
            console.error("[BatchImport] Erro ao inserir variantes:", variantInsertError)
          }
        } else {
          warnings += variantsToInsert.length
          console.warn("[BatchImport] Plano não inclui product_variants, ignorando inserção de variações.")
        }
      }
    }
  }

  // Perform updates
  if (toUpdate.length > 0) {
    const variantsToUpsert: any[] = []

    for (const item of toUpdate) {
      const { error } = await supabase
        .from("products")
        .update(item.data)
        .eq("id", item.id)
        .eq("partner_id", partnerId)

      if (error) {
        errors++
        errorMessage = error.message
      } else {
        updated++
        if (item.fiscal) {
          await supabase
            .from("product_fiscal_profiles")
            .upsert({ product_id: item.id, ...item.fiscal }, { onConflict: "product_id" })
        }
        if (item.logistics) {
          await supabase
            .from("product_logistics")
            .upsert({ product_id: item.id, ...item.logistics }, { onConflict: "product_id" })
        }

        if (item.variants && item.variants.length > 0) {
          for (const v of item.variants) {
            variantsToUpsert.push({
              product_id: item.id,
              ...v,
            })
          }
        }
      }
    }

    if (variantsToUpsert.length > 0) {
      const isVariantsAllowed = await canUseFeature(partnerId, "product_variants")
      if (isVariantsAllowed) {
        const { error: variantUpsertError } = await supabase
          .from("product_variants")
          .upsert(variantsToUpsert, { onConflict: "sku" })

        if (variantUpsertError) {
          console.error("[BatchImport] Erro ao atualizar variantes:", variantUpsertError)
        }
      } else {
        warnings++
      }
    }
  }

  return {
    success: created + updated,
    created,
    updated,
    errors,
    duplicates,
    warnings,
    errorMessage,
    failedRows,
  }
}

/* ========================================================================= */
/* CUSTOMERS BATCH IMPORT                                                    */
/* ========================================================================= */

async function importCustomerBatch(
  supabase: any,
  partnerId: string,
  batch: Record<string, string>[],
  rawBatch: Record<string, string>[],
  startIndex: number,
  duplicateStrategy: "skip" | "update",
): Promise<{
  success: number
  created: number
  updated: number
  errors: number
  duplicates: number
  warnings: number
  errorMessage?: string
  failedRows: FailedRow[]
}> {
  let created = 0
  let updated = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  const failedRows: FailedRow[] = []
  let errorMessage: string | undefined = undefined

  const emails = [...new Set(batch.map((r) => r["email"]?.trim().toLowerCase()).filter(Boolean))] as string[]
  const existingCustomersByEmail = new Map<string, any>()

  if (emails.length > 0) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id, email, name")
      .eq("partner_id", partnerId)
      .in("email", emails)
      .is("deleted_at", null)

    for (const c of existing || []) {
      if (c.email) existingCustomersByEmail.set(c.email.toLowerCase(), c)
    }
  }

  const cpfs = [...new Set(batch.map((r) => r["cpf"]?.replace(/\D/g, "")).filter((c) => c && c.length === 11))] as string[]
  const cpfHashes = cpfs.map((c) => generateCpfLookupHash(c)).filter(Boolean) as string[]
  const existingCustomersByCpfHash = new Map<string, any>()

  if (cpfHashes.length > 0) {
    const { data: existingByHash } = await supabase
      .from("customers")
      .select("id, email, name, cpf_lookup_hash")
      .eq("partner_id", partnerId)
      .in("cpf_lookup_hash", cpfHashes)
      .is("deleted_at", null)

    for (const c of existingByHash || []) {
      if (c.cpf_lookup_hash) existingCustomersByCpfHash.set(c.cpf_lookup_hash, c)
    }
  }

  const toInsert: any[] = []
  const toUpdate: { id: string; data: any }[] = []
  const addressBatch: { customer_name: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zip_code: string }[] = []

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]
    const rawRow = rawBatch[i]
    const rowNum = startIndex + i + 1

    let name = row["name"]?.trim() || ""
    if (!name) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: "Nome do cliente é obrigatório e está em branco.",
      })
      continue
    }

    if (name.length > 150) {
      name = name.substring(0, 150)
      warnings++
    }

    let email = row["email"]?.trim().toLowerCase() || null
    if (email) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
      if (!emailRegex.test(email)) {
        errors++
        failedRows.push({
          rowIndex: rowNum,
          data: rawRow,
          errorMessage: `E-mail inválido ("${email}").`,
        })
        continue
      }
    }

    const rawCpf = row["cpf"]?.replace(/\D/g, "") || null
    let cpfEncrypted = null
    let cpfLookupHash: string | null = null
    if (rawCpf && rawCpf.length === 11) {
      cpfLookupHash = generateCpfLookupHash(rawCpf)
      try {
        cpfEncrypted = await encryptCPF(rawCpf)
      } catch {
        // continue
      }
    }

    let cnpj = row["cnpj"]?.replace(/[^0-9A-Z]/gi, "") || null
    if (cnpj && cnpj.length !== 14) cnpj = null

    const personType = row["person_type"]?.toLowerCase().includes("jur") || cnpj ? "pj" : "pf"

    let status = "ativo"
    const rawStatus = row["status"]?.trim().toLowerCase()
    if (rawStatus && ["inativo", "inactive", "0", "false", "desativado", "bloqueado"].includes(rawStatus)) {
      status = rawStatus === "bloqueado" ? "bloqueado" : "inativo"
    }

    const customerData: any = {
      partner_id: partnerId,
      name,
      email,
      phone: row["phone"]?.trim() || null,
      phone_fixed: row["phone_fixed"]?.trim() || null,
      person_type: personType,
      cpf: cpfEncrypted,
      cpf_lookup_hash: cpfLookupHash,
      cnpj,
      birth_date: parseDate(row["birth_date"]),
      notes: row["notes"] || null,
      inscricao_estadual: row["inscricao_estadual"]?.trim() || null,
      status,
    }

    const existing = email
      ? existingCustomersByEmail.get(email)
      : (cpfLookupHash ? existingCustomersByCpfHash.get(cpfLookupHash) : null)
    if (existing) {
      if (duplicateStrategy === "update") {
        toUpdate.push({ id: existing.id, data: customerData })
      } else {
        duplicates++
      }
    } else {
      toInsert.push(customerData)
      addressBatch.push({
        customer_name: name,
        street: row["street"]?.trim() || "",
        number: row["number"]?.trim() || "",
        complement: row["complement"]?.trim() || "",
        neighborhood: row["neighborhood"]?.trim() || "",
        city: row["city"]?.trim() || "",
        state: row["state"]?.trim() || "",
        zip_code: row["zip_code"]?.trim() || "",
      })
    }
  }

  // Inserts
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("customers")
      .insert(toInsert)
      .select("id, name")

    if (error) {
      console.error("[BatchImport] Erro ao inserir clientes:", error)
      errors += toInsert.length
      errorMessage = error.message
    } else {
      created += inserted?.length ?? 0

      for (let i = 0; i < inserted.length; i++) {
        const addr = addressBatch[i]
        if (addr && (addr.street || addr.city)) {
          try {
            const enriched = await enrichAddressData({
              customer_id: inserted[i].id,
              street: addr.street,
              number: addr.number,
              complement: addr.complement || null,
              neighborhood: addr.neighborhood,
              city: addr.city,
              state: addr.state,
              zip_code: addr.zip_code,
              country: "BR",
              address_type: "primary",
              is_default: true,
            })
            await supabase.from("addresses").insert(enriched)
          } catch {
            // non-critical address enrichment error
          }
        }
      }
    }
  }

  // Updates
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      const { error } = await supabase
        .from("customers")
        .update(item.data)
        .eq("id", item.id)
        .eq("partner_id", partnerId)

      if (error) {
        errors++
        errorMessage = error.message
      } else {
        updated++
      }
    }
  }

  return {
    success: created + updated,
    created,
    updated,
    errors,
    duplicates,
    warnings,
    errorMessage,
    failedRows,
  }
}

/* ========================================================================= */
/* SERVICES BATCH IMPORT                                                     */
/* ========================================================================= */

async function importServiceBatch(
  supabase: any,
  partnerId: string,
  storeId: string,
  batch: Record<string, string>[],
  rawBatch: Record<string, string>[],
  startIndex: number,
  categoryCache: Map<string, string>,
  duplicateStrategy: "skip" | "update",
  defaultProfitMarginPercent: number | null = null,
  remainingSlots: number | null = null,
): Promise<{
  success: number
  created: number
  updated: number
  errors: number
  duplicates: number
  warnings: number
  errorMessage?: string
  failedRows: FailedRow[]
}> {
  let created = 0
  let updated = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  const failedRows: FailedRow[] = []
  let errorMessage: string | undefined = undefined
  let newlyInsertedCount = 0

  const skus = batch.map((r) => r["sku"]?.trim()).filter(Boolean) as string[]
  const existingServiceMap = new Map<string, any>()

  if (skus.length > 0) {
    const { data: existing } = await supabase
      .from("services")
      .select("id, sku, name")
      .eq("partner_id", partnerId)
      .in("sku", skus)

    for (const s of existing || []) {
      existingServiceMap.set(s.sku, s)
    }
  }

  const toInsert: any[] = []
  const toUpdate: { id: string; data: any }[] = []

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]
    const rawRow = rawBatch[i]
    const rowNum = startIndex + i + 1

    let name = row["name"]?.trim() || ""
    if (!name) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: "Nome do serviço é obrigatório e está em branco.",
      })
      continue
    }

    if (name.length > 150) {
      name = name.substring(0, 150)
      warnings++
    }

    let price = parseNumber(row["price"])
    const costPrice = parseNumber(row["cost_price"])

    // Apply default profit margin if price is missing or zero and cost price is given
    if ((price === null || price === 0) && costPrice !== null && costPrice > 0 && defaultProfitMarginPercent && defaultProfitMarginPercent > 0) {
      price = Math.round(costPrice * (1 + defaultProfitMarginPercent / 100) * 100) / 100
    }

    if (price === null) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: `Preço do serviço inválido ("${row["price"] || ""}"). Deve ser numérico.`,
      })
      continue
    }

    let sku = row["sku"]?.trim() || null
    if (sku && sku.length > 100) sku = sku.substring(0, 100)

    let status = "ativo"
    const rawStatus = row["status"]?.trim().toLowerCase()
    if (rawStatus && ["inativo", "inactive", "0", "false", "desativado"].includes(rawStatus)) {
      status = "inativo"
    }

    const rawType = row["service_type"]?.trim().toLowerCase()
    let serviceType = "in_person"
    if (rawType && (rawType.includes("online") || rawType.includes("remoto"))) {
      serviceType = "online"
    } else if (rawType && rawType.includes("hibrid")) {
      serviceType = "hybrid"
    }

    const serviceData: any = {
      partner_id: partnerId,
      store_id: storeId || null,
      name,
      description: row["description"] || null,
      price,
      cost_price: parseNumber(row["cost_price"]),
      duration_minutes: Math.min(525600, Math.max(1, parseNumber(row["duration_minutes"]) ?? 60)),
      sku,
      unit: row["unit"] || "Serviço",
      service_type: serviceType,
      status,
    }

    if (row["category"]) {
      const catKey = row["category"].trim().toLowerCase()
      if (categoryCache.has(catKey)) {
        serviceData.category_id = categoryCache.get(catKey)
      }
    }

    const existing = sku ? existingServiceMap.get(sku) : null
    if (existing) {
      if (duplicateStrategy === "update") {
        toUpdate.push({ id: existing.id, data: serviceData })
      } else {
        duplicates++
      }
    } else {
      // Check plan limit before inserting new service
      if (remainingSlots !== null && newlyInsertedCount >= remainingSlots) {
        errors++
        warnings++
        failedRows.push({
          rowIndex: rowNum,
          data: rawRow,
          errorMessage: "Limite de itens do plano atingido. Faça upgrade para importar mais itens.",
        })
        continue
      }
      newlyInsertedCount++
      toInsert.push(serviceData)
    }
  }

  // Inserts
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("services")
      .insert(toInsert)
      .select("id, name")

    if (error) {
      console.error("[BatchImport] Erro ao inserir serviços:", error)
      errors += toInsert.length
      errorMessage = error.message
    } else {
      created += inserted?.length ?? 0
    }
  }

  // Updates
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      const { error } = await supabase
        .from("services")
        .update(item.data)
        .eq("id", item.id)
        .eq("partner_id", partnerId)

      if (error) {
        errors++
        errorMessage = error.message
      } else {
        updated++
      }
    }
  }

  return {
    success: created + updated,
    created,
    updated,
    errors,
    duplicates,
    warnings,
    errorMessage,
    failedRows,
  }
}

/* ========================================================================= */
/* APPOINTMENTS BATCH IMPORTER                                               */
/* ========================================================================= */

function addMinutesToTimeStr(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number)
  const total = (h || 0) * 60 + (m || 0) + Math.max(0, minutes)
  const endH = Math.floor(total / 60) % 24
  const endM = total % 60
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`
}

function sanitizeAppointmentStatus(raw?: string | null): string {
  const s = String(raw || "").trim().toLowerCase()
  if (s === "confirmado" || s === "confirmed") return "Confirmado"
  if (s === "aguardando" || s === "pending" || s === "pendente") return "Aguardando"
  if (s === "iniciado" || s === "in progress" || s === "em andamento") return "Iniciado"
  if (s === "concluído" || s === "concluido" || s === "completed" || s === "finalizado" || s === "atendido") return "Concluído"
  if (s === "pago" || s === "paid") return "Pago"
  if (s === "pago parcialmente" || s === "partially paid" || s === "parcialmente pago") return "Pago Parcialmente"
  if (s === "ausência" || s === "ausencia" || s === "absence" || s === "no-show" || s === "faltou") return "Ausência"
  if (s === "cancelado" || s === "canceled" || s === "cancelled") return "Cancelado"
  if (s === "indisponível" || s === "indisponivel" || s === "unavailable") return "Indisponível"
  return "Reservado"
}

async function importAppointmentBatch(
  supabase: any,
  admin: any,
  partnerId: string,
  storeId: string | null,
  batch: Record<string, string>[],
  rawBatch: Record<string, string>[],
  startIndex: number,
  staffCache: Map<string, { id: string; name: string }>,
  serviceCache: Map<string, any>,
  customerCache: Map<string, string>,
  defaultStaff: { id: string; name: string },
  duplicateStrategy: "skip" | "update",
): Promise<{
  success: number
  created: number
  updated: number
  errors: number
  duplicates: number
  warnings: number
  errorMessage?: string
  failedRows: FailedRow[]
}> {
  let created = 0
  let updated = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  const failedRows: FailedRow[] = []
  let errorMessage: string | undefined = undefined

  // Plan limit check
  const limitCheck = await checkLimit(partnerId, "monthly_appointments")
  if (!limitCheck.allowed) {
    return {
      success: 0,
      created: 0,
      updated: 0,
      errors: batch.length,
      duplicates: 0,
      warnings: 0,
      errorMessage: limitCheck.message || "Limite mensal de agendamentos atingido.",
      failedRows: batch.map((r, i) => ({
        rowIndex: startIndex + i + 1,
        data: rawBatch[i],
        errorMessage: limitCheck.message || "Limite mensal de agendamentos atingido.",
      })),
    }
  }

  // Pre-fetch potential duplicate appointments from DB for the dates in this batch
  const batchDates = [...new Set(batch.map((r) => parseDate(r["start_date"])).filter(Boolean))] as string[]
  const existingApptKeyMap = new Map<string, string>() // key -> id

  if (batchDates.length > 0) {
    const { data: existingAppts } = await supabase
      .from("appointments")
      .select("id, customer_name, start_date, start_time")
      .eq("partner_id", partnerId)
      .in("start_date", batchDates)

    for (const a of existingAppts || []) {
      const key = `${String(a.customer_name || "").trim().toLowerCase()}|${a.start_date}|${String(a.start_time || "").slice(0, 5)}`
      existingApptKeyMap.set(key, a.id)
    }
  }

  const toInsert: any[] = []
  const toUpdate: { id: string; data: any }[] = []

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]
    const rawRow = rawBatch[i]
    const rowNum = startIndex + i + 1

    const customerName = (row["customer_name"] || row["name"])?.trim()
    if (!customerName) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: "Nome do cliente é obrigatório e está em branco.",
      })
      continue
    }

    const rawDate = row["start_date"]?.trim()
    const startDate = parseDate(rawDate)
    if (!startDate) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: `Data do agendamento inválida ("${rawDate || ""}"). Use o formato DD/MM/AAAA.`,
      })
      continue
    }

    const rawTime = row["start_time"]?.trim()
    const startTime = parseTime(rawTime)
    if (!startTime) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: `Horário de início inválido ("${rawTime || ""}"). Use o formato HH:MM.`,
      })
      continue
    }

    const serviceName = (row["service_name"] || row["service"])?.trim() || "Atendimento Geral"
    const normalizedServiceKey = serviceName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const matchedService = serviceCache.get(normalizedServiceKey)

    const rawEndTime = parseTime(row["end_time"])
    let durationMinutes = parseNumber(row["duration_minutes"])

    if (!durationMinutes && rawEndTime) {
      const [sh, sm] = startTime.split(":").map(Number)
      const [eh, em] = rawEndTime.split(":").map(Number)
      const diff = (eh * 60 + em) - (sh * 60 + sm)
      durationMinutes = diff > 0 ? diff : 60
    } else if (!durationMinutes) {
      durationMinutes = matchedService?.duration_minutes ?? 60
    }
    const finalDuration = Math.min(525600, Math.max(1, Number(durationMinutes || 60)))

    const derivedEndTime = rawEndTime || addMinutesToTimeStr(startTime, finalDuration)

    // Resolve Staff
    let staffId = defaultStaff.id
    let staffName = defaultStaff.name
    const rawStaff = row["staff_name"]?.trim()
    if (rawStaff) {
      const normStaff = rawStaff.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      const found = staffCache.get(normStaff)
      if (found) {
        staffId = found.id
        staffName = found.name
      } else {
        staffName = rawStaff
      }
    }

    // Resolve Customer
    let customerId: string | null = null
    const rawPhone = row["customer_phone"]?.replace(/\D/g, "")
    const rawEmail = row["customer_email"]?.trim().toLowerCase()
    const normCustName = customerName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

    if (rawPhone && customerCache.has(`phone:${rawPhone}`)) {
      customerId = customerCache.get(`phone:${rawPhone}`)!
    } else if (rawEmail && customerCache.has(`email:${rawEmail}`)) {
      customerId = customerCache.get(`email:${rawEmail}`)!
    } else if (customerCache.has(`name:${normCustName}`)) {
      customerId = customerCache.get(`name:${normCustName}`)!
    }

    // Price
    let price = parseNumber(row["price"])
    if (price === null) {
      price = matchedService?.price ?? 0
    }
    const finalPrice = Math.max(0, Number(price || 0))

    const apptData: any = {
      partner_id: partnerId,
      store_id: storeId || null,
      customer_id: customerId,
      customer_name: customerName,
      service_name: serviceName,
      service_id: matchedService?.id || null,
      category_id: matchedService?.category_id || null,
      start_date: startDate,
      start_time: startTime,
      end_date: startDate,
      end_time: derivedEndTime,
      duration_minutes: finalDuration,
      staff_partner_user_id: staffId,
      staff_name: staffName,
      price: finalPrice,
      pricing_unit: "Por Serviço",
      notes: row["notes"] || null,
      status: sanitizeAppointmentStatus(row["status"]),
      source: "appointment",
    }

    const dupKey = `${customerName.toLowerCase()}|${startDate}|${startTime.slice(0, 5)}`
    const existingId = existingApptKeyMap.get(dupKey)

    if (existingId) {
      if (duplicateStrategy === "update") {
        toUpdate.push({ id: existingId, data: apptData })
      } else {
        duplicates++
      }
    } else {
      toInsert.push(apptData)
    }
  }

  // Execute inserts
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("appointments")
      .insert(toInsert)
      .select("id")

    if (error) {
      console.error("[BatchImport] Erro ao inserir agendamentos:", error)
      errors += toInsert.length
      errorMessage = error.message
    } else {
      const insertedCount = inserted?.length ?? 0
      created += insertedCount
      try {
        await increment_usage_counter(partnerId, "appointments_month_count", insertedCount)
      } catch (err: any) {
        console.warn("[BatchImport] Erro ao incrementar contador mensal de agendamentos:", err.message)
      }
    }
  }

  // Execute updates
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      const { error } = await supabase
        .from("appointments")
        .update(item.data)
        .eq("id", item.id)
        .eq("partner_id", partnerId)

      if (error) {
        errors++
        errorMessage = error.message
      } else {
        updated++
      }
    }
  }

  return {
    success: created + updated,
    created,
    updated,
    errors,
    duplicates,
    warnings,
    errorMessage,
    failedRows,
  }
}
