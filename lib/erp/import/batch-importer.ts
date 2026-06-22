import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { generateSKUBase, generateSKUWithSuffix } from "@/lib/utils/code-generators"
import { encryptCPF } from "@/lib/crypto"
import { createAddressAction } from "@/app/actions/shared/addresses"
import type { ColumnMapping, EntityType, ImportResult, ImportSession } from "./types"

const BATCH_SIZE = 500

function cleanNumber(v: string): number | null {
  const cleaned = v.replace(",", ".").replace(/[^0-9.\-]/g, "")
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

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

export async function executeImport(
  session: ImportSession,
  mapping: ColumnMapping[],
  options: { skipDuplicates: boolean; skipErrors: boolean },
): Promise<ImportResult> {
  const startTime = Date.now()
  const supabase = await getSupabaseServerClient()
  const admin = getAdminClient()
  const { partnerId, storeId, entityType, rows, fileName } = session

  const mappedRows = rows.map((row) => mapRowToObject(row, mapping))
  let successRows = 0
  let errorRows = 0
  let duplicateRows = 0
  let warningRows = 0

  const hasSupplierCol = mapping.some((m) => m.field === "supplier")
  const supplierCache = new Map<string, string>()

  if (hasSupplierCol) {
    const allSupplierNames = [
      ...new Set(mappedRows.map((r) => r["supplier"]?.trim()).filter(Boolean)),
    ]
    if (allSupplierNames.length > 0) {
      const { data: existing } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("partner_id", partnerId)
        .in("name", allSupplierNames)
      for (const s of existing || []) {
        supplierCache.set(s.name.trim().toLowerCase(), s.id)
      }
    }
  }

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
    }
  }

  const hasBrandCol = mapping.some((m) => m.field === "brand")
  const brandCache = new Map<string, string>()

  if (hasBrandCol) {
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
    }
  }

  let errorMessages: string[] = []

  for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
    const batch = mappedRows.slice(i, i + BATCH_SIZE)
    const startIndex = i

    const toProcess = batch.filter((_r, idx) => {
      const rowNum = startIndex + idx + 1
      if (options.skipErrors && hasErrors) return false
      return true
    })

    if (entityType === "products") {
      const result = await importProductBatch(
        admin,
        supabase,
        partnerId,
        storeId,
        batch,
        startIndex,
        supplierCache,
        categoryCache,
        brandCache,
        options,
      )
      successRows += result.success
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      if (result.errorMessage) {
        errorMessages.push(result.errorMessage)
      }
    } else if (entityType === "customers") {
      const result = await importCustomerBatch(
        supabase,
        partnerId,
        batch,
        startIndex,
        options,
      )
      successRows += result.success
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      if (result.errorMessage) {
        errorMessages.push(result.errorMessage)
      }
    } else if (entityType === "services") {
      const result = await importServiceBatch(
        supabase,
        partnerId,
        storeId,
        batch,
        startIndex,
        categoryCache,
        options,
      )
      successRows += result.success
      errorRows += result.errors
      duplicateRows += result.duplicates
      warningRows += result.warnings
      if (result.errorMessage) {
        errorMessages.push(result.errorMessage)
      }
    }
  }

  const durationMs = Date.now() - startTime

  return {
    importId: "",
    successRows,
    errorRows,
    duplicateRows,
    warningRows,
    durationMs,
    errorMessage: errorMessages.length > 0 ? errorMessages.join(" | ") : undefined,
  }
}

const hasErrors = false

async function importProductBatch(
  admin: any,
  supabase: any,
  partnerId: string,
  storeId: string,
  batch: Record<string, string>[],
  startIndex: number,
  supplierCache: Map<string, string>,
  categoryCache: Map<string, string>,
  brandCache: Map<string, string>,
  options: { skipDuplicates: boolean; skipErrors: boolean },
): Promise<{ success: number; errors: number; duplicates: number; warnings: number; errorMessage?: string }> {
  let success = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  let errorMessage: string | undefined = undefined

  const skus = batch.map((r) => r["sku"]?.trim()).filter(Boolean) as string[]
  let existingSkus = new Set<string>()

  if (skus.length > 0) {
    const { data: existing } = await supabase
      .from("products")
      .select("sku")
      .eq("partner_id", partnerId)
      .in("sku", skus)
    existingSkus = new Set((existing || []).map((p: any) => p.sku))
  }

  const toInsert: any[] = []
  const productProfiles: Record<string, { fiscal: any; logistics: any }> = {}

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]

    if (row["sku"] && existingSkus.has(row["sku"].trim())) {
      duplicates++
      continue
    }

    const name = row["name"]?.trim()
    if (!name) {
      errors++
      continue
    }

    const sku = row["sku"]?.trim() || generateSKUBase(name)
    let finalSku = sku
    if (existingSkus.has(finalSku)) {
      finalSku = generateSKUWithSuffix(sku, 1)
    }

    const price = cleanNumber(row["price"] ?? "0") ?? 0

    const specs: Record<string, string> = {}
    const productData: any = {
      partner_id: partnerId,
      store_id: storeId,
      name,
      sku: finalSku,
      description: row["description"] || null,
      price,
      stock_quantity: cleanNumber(row["stock_quantity"] ?? "0") ?? 0,
      cost_price: cleanNumber(row["cost_price"] ?? ""),
      min_stock: cleanNumber(row["min_stock"] ?? ""),
      max_stock: cleanNumber(row["max_stock"] ?? ""),
      unit: row["unit"] || "UN",
      gtin: row["gtin"] || null,
      product_type: row["product_type"] || null,
      condition: row["condition"] || null,
      promotional_price: cleanNumber(row["promotional_price"] ?? ""),
      is_active: true,
      show_in_marketplace: true,
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
      productData.tags = row["tags"].split(",").map(t => t.trim()).filter(Boolean)
    }

    const knownFields = new Set([
      "name", "sku", "description", "price", "stock_quantity", "cost_price",
      "unit", "gtin", "product_type", "condition", "min_stock", "max_stock",
      "promotional_price", "ncm", "cest", "origin", "weight_gross", "weight_net",
      "width", "height", "length", "category", "brand", "supplier", "tags",
      "fci_code", "packaging_type", "preparation_days",
    ])

    for (const [key, value] of Object.entries(row)) {
      if (!knownFields.has(key) && value) {
        specs[key] = value
      }
    }

    if (Object.keys(specs).length > 0) {
      productData.technical_specs = specs
    }

    productProfiles[finalSku] = {
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
        weight_gross: cleanNumber(row["weight_gross"] ?? "") ?? 0,
        weight_net: cleanNumber(row["weight_net"] ?? "") ?? 0,
        width: cleanNumber(row["width"] ?? "") ?? 0,
        height: cleanNumber(row["height"] ?? "") ?? 0,
        length: cleanNumber(row["length"] ?? "") ?? 0,
        packaging_type: "package",
        preparation_days: 0,
      }
    }

    toInsert.push(productData)
  }

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
      success = inserted?.length ?? 0

      // Now insert profiles!
      const fiscalToInsert: any[] = []
      const logisticsToInsert: any[] = []

      for (const item of inserted || []) {
        if (item.sku && item.id) {
          const profiles = productProfiles[item.sku]
          if (profiles) {
            fiscalToInsert.push({
              product_id: item.id,
              ...profiles.fiscal
            })
            logisticsToInsert.push({
              product_id: item.id,
              ...profiles.logistics
            })
          }
        }
      }

      if (fiscalToInsert.length > 0) {
        const { error: fiscalError } = await supabase
          .from("product_fiscal_profiles")
          .insert(fiscalToInsert)
        if (fiscalError) {
          console.error("[BatchImport] Erro ao inserir perfis fiscais:", fiscalError)
          errorMessage = fiscalError.message
        }
      }

      if (logisticsToInsert.length > 0) {
        const { error: logisticsError } = await supabase
          .from("product_logistics")
          .insert(logisticsToInsert)
        if (logisticsError) {
          console.error("[BatchImport] Erro ao inserir perfis logísticos:", logisticsError)
          errorMessage = logisticsError.message
        }
      }
    }
  }

  return { success, errors, duplicates, warnings, errorMessage }
}

async function importCustomerBatch(
  supabase: any,
  partnerId: string,
  batch: Record<string, string>[],
  startIndex: number,
  options: { skipDuplicates: boolean; skipErrors: boolean },
): Promise<{ success: number; errors: number; duplicates: number; warnings: number; errorMessage?: string }> {
  let success = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  let errorMessage: string | undefined = undefined

  // Collect all unique emails and CPFs to check in bulk
  const emails = [...new Set(batch.map((r) => r["email"]?.trim()).filter(Boolean))] as string[]
  const rawCpfs = [...new Set(batch.map((r) => r["cpf"]?.replace(/\D/g, "")).filter((c): c is string => !!c && c.length === 11))]

  const existingEmails = new Set<string>()
  if (emails.length > 0) {
    const { data: existing } = await supabase
      .from("customers")
      .select("email")
      .eq("partner_id", partnerId)
      .in("email", emails)
    for (const e of existing || []) {
      if (e.email) existingEmails.add(e.email)
    }
  }

  const existingCpfs = new Set<string>()
  if (rawCpfs.length > 0) {
    const { data: allCpfs } = await supabase
      .from("customers")
      .select("cpf")
      .eq("partner_id", partnerId)
      .not("cpf", "is", null)

    if (allCpfs?.length) {
      const { decryptCPF } = await import("@/lib/crypto")
      for (const row of allCpfs) {
        try {
          const decrypted = await decryptCPF(row.cpf)
          if (rawCpfs.includes(decrypted)) {
            existingCpfs.add(decrypted)
          }
        } catch {
          continue
        }
      }
    }
  }

  const toInsert: any[] = []
  const addressBatch: { customer_name: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zip_code: string }[] = []

  for (const row of batch) {
    const name = row["name"]?.trim()
    if (!name) {
      errors++
      continue
    }

    let email = row["email"]?.trim() || null
    if (email) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
      if (!emailRegex.test(email)) {
        email = null
      }
    }

    if (email && existingEmails.has(email)) {
      duplicates++
      continue
    }

    const rawCpf = row["cpf"]?.replace(/\D/g, "")
    if (rawCpf && rawCpf.length === 11 && existingCpfs.has(rawCpf)) {
      duplicates++
      continue
    }

    let cpfEncrypted = null
    if (rawCpf && rawCpf.length === 11) {
      try {
        cpfEncrypted = await encryptCPF(rawCpf)
      } catch {
        // continue without CPF
      }
    }

    let cnpj = row["cnpj"]?.replace(/\D/g, "") || null
    if (cnpj && cnpj.length !== 14) {
      cnpj = null
    }
    const personType = rawCpf && rawCpf.length === 11 ? "pf" : cnpj ? "pj" : "pf"

    const customerData: any = {
      partner_id: partnerId,
      name,
      email: email,
      phone: row["phone"]?.trim() || null,
      phone_fixed: row["phone_fixed"]?.trim() || null,
      person_type: personType,
      cpf: cpfEncrypted,
      cnpj,
      birth_date: row["birth_date"] || null,
      notes: row["notes"] || null,
      status: "ativo",
    }

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
      success = inserted?.length ?? 0

      for (let i = 0; i < inserted.length; i++) {
        const addr = addressBatch[i]
        if (addr.street || addr.city) {
          try {
            await supabase.from("addresses").insert({
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
          } catch {
            // non-critical error for address
          }
        }
      }
    }
  }

  return { success, errors, duplicates, warnings, errorMessage }
}

async function importServiceBatch(
  supabase: any,
  partnerId: string,
  storeId: string,
  batch: Record<string, string>[],
  startIndex: number,
  categoryCache: Map<string, string>,
  options: { skipDuplicates: boolean; skipErrors: boolean },
): Promise<{ success: number; errors: number; duplicates: number; warnings: number; errorMessage?: string }> {
  let success = 0
  let errors = 0
  let duplicates = 0
  let warnings = 0
  let errorMessage: string | undefined = undefined

  const skus = batch.map((r) => r["sku"]?.trim()).filter(Boolean) as string[]
  let existingSkus = new Set<string>()
  if (skus.length > 0) {
    const { data: existing } = await supabase
      .from("services")
      .select("sku")
      .eq("partner_id", partnerId)
      .in("sku", skus)
    existingSkus = new Set((existing || []).map((s: any) => s.sku))
  }

  const toInsert: any[] = []

  for (const row of batch) {
    const name = row["name"]?.trim()
    if (!name) {
      errors++
      continue
    }

    const sku = row["sku"]?.trim()
    if (sku && existingSkus.has(sku)) {
      duplicates++
      continue
    }

    const serviceData: any = {
      partner_id: partnerId,
      store_id: storeId,
      name,
      description: row["description"] || null,
      price: cleanNumber(row["price"] ?? "0") ?? 0,
      cost_price: cleanNumber(row["cost_price"] ?? ""),
      duration_minutes: cleanNumber(row["duration_minutes"] ?? "60") ?? 60,
      sku: sku || null,
      unit: row["unit"] || "Serviço",
      is_active: true,
    }

    if (row["category"]) {
      const catKey = row["category"].trim().toLowerCase()
      if (categoryCache.has(catKey)) {
        serviceData.category_id = categoryCache.get(catKey)
      }
    }

    toInsert.push(serviceData)
  }

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
      success = inserted?.length ?? 0
    }
  }

  return { success, errors, duplicates, warnings, errorMessage }
}
