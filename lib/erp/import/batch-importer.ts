import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { encryptCPF } from "@/lib/crypto"
import { enrichAddressData } from "@/lib/services/location.service"
import { parseNumber } from "./validators"
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
  const { partnerId, storeId, entityType, rows, headers } = session

  const duplicateStrategy = options.duplicateStrategy || (options.skipDuplicates ? "skip" : "update")
  const autoCreateCategories = options.autoCreateCategories !== false
  const autoCreateBrands = options.autoCreateBrands !== false
  const autoCreateSuppliers = options.autoCreateSuppliers !== false

  const mappedRows = rows.map((row) => mapRowToObject(row, mapping))
  const rawRowsObjects = rows.map((row) => mapRowToRawHeaderObject(row, headers))

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

  // Pre-load / Auto-create suppliers for products
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
  const toUpdate: { id: string; data: any; sku: string }[] = []
  const productProfiles: Record<string, { fiscal: any; logistics: any }> = {}

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

    let sku = row["sku"]?.trim() || generateSKUBase(name)
    if (sku.length > 100) {
      sku = sku.substring(0, 100)
    }

    const price = parseNumber(row["price"])
    if (price === null) {
      errors++
      failedRows.push({
        rowIndex: rowNum,
        data: rawRow,
        errorMessage: `Preço de venda inválido ("${row["price"] || ""}"). Deve ser numérico.`,
      })
      continue
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
      store_id: storeId || undefined,
      name,
      sku,
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
      is_active: status === "ativo",
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

    productProfiles[sku] = {
      fiscal: {
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
      },
      logistics: {
        weight_gross: parseNumber(row["weight_gross"]) ?? 0,
        weight_net: parseNumber(row["weight_net"]) ?? 0,
        width: parseNumber(row["width"]) ?? 0,
        height: parseNumber(row["height"]) ?? 0,
        length: parseNumber(row["length"]) ?? 0,
        packaging_type: row["packaging_type"] || "Pacote/Caixa",
        preparation_days: parseNumber(row["preparation_days"]) ?? 0,
      },
    }

    const existing = existingProductMap.get(sku)
    if (existing) {
      if (duplicateStrategy === "update") {
        toUpdate.push({ id: existing.id, data: productData, sku })
      } else {
        duplicates++
      }
    } else {
      toInsert.push(productData)
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

      // Insert fiscal & logistics profiles
      const fiscalToInsert: any[] = []
      const logisticsToInsert: any[] = []

      for (const item of inserted || []) {
        if (item.sku && item.id) {
          const prof = productProfiles[item.sku]
          if (prof) {
            fiscalToInsert.push({ product_id: item.id, ...prof.fiscal })
            logisticsToInsert.push({ product_id: item.id, ...prof.logistics })
          }
        }
      }

      if (fiscalToInsert.length > 0) {
        await supabase.from("product_fiscal_profiles").insert(fiscalToInsert)
      }
      if (logisticsToInsert.length > 0) {
        await supabase.from("product_logistics").insert(logisticsToInsert)
      }
    }
  }

  // Perform updates
  if (toUpdate.length > 0) {
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
        const prof = productProfiles[item.sku]
        if (prof) {
          await supabase
            .from("product_fiscal_profiles")
            .upsert({ product_id: item.id, ...prof.fiscal }, { onConflict: "product_id" })
          await supabase
            .from("product_logistics")
            .upsert({ product_id: item.id, ...prof.logistics }, { onConflict: "product_id" })
        }
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

    for (const c of existing || []) {
      if (c.email) existingCustomersByEmail.set(c.email.toLowerCase(), c)
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
    if (rawCpf && rawCpf.length === 11) {
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
      cnpj,
      birth_date: row["birth_date"] || null,
      notes: row["notes"] || null,
      inscricao_estadual: row["inscricao_estadual"]?.trim() || null,
      status,
    }

    const existing = email ? existingCustomersByEmail.get(email) : null
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

    const price = parseNumber(row["price"])
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
      store_id: storeId || undefined,
      name,
      description: row["description"] || null,
      price,
      cost_price: parseNumber(row["cost_price"]),
      duration_minutes: Math.min(525600, Math.max(1, parseNumber(row["duration_minutes"]) ?? 60)),
      sku,
      unit: row["unit"] || "Serviço",
      service_type: serviceType,
      status,
      is_active: status === "ativo",
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
