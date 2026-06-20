import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import type { ColumnMapping, EntityType, PreviewSummary, ImportSession } from "./types"
import { validateRows } from "./validators"
import { resolveCategories } from "./category-resolver"
import { resolveSuppliers } from "./supplier-resolver"

function mapRow(
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

export async function generatePreview(
  session: ImportSession,
  mapping: ColumnMapping[],
): Promise<PreviewSummary> {
  const { rows, headers, entityType, totalRows, partnerId } = session

  const mappedRows = rows.map((row) => mapRow(row, mapping))

  const { errors, warnings } = validateRows(mappedRows, entityType)

  const errorRows = new Set(errors.map((e) => e.row))
  const warningRows = new Set(warnings.map((w) => w.row))

  let unknownCategories: string[] = []
  let unknownSuppliers: { name: string; rows: number[] }[] = []

  if (entityType === "products") {
    const categoryNames = mappedRows
      .map((r) => r["category"] ?? "")
      .filter(Boolean)
    if (categoryNames.length > 0) {
      const catResult = await resolveCategories(partnerId, categoryNames, "products")
      unknownCategories = catResult.unknown
    }

    const supplierNames = mappedRows
      .map((r) => r["supplier"] ?? "")
      .filter(Boolean)
    if (supplierNames.length > 0) {
      const supResult = await resolveSuppliers(partnerId, supplierNames)
      unknownSuppliers = supResult.unknown
    }
  }

  const duplicateRows = await detectDuplicates(session, mappedRows)

  const validRows = totalRows - errorRows.size - duplicateRows.size

  const sampleRows = mappedRows.slice(0, 5).map((row) => {
    const sample: Record<string, string> = {}
    for (const col of mapping) {
      if (col.field) {
        sample[col.fieldLabel ?? col.field] = row[col.field] ?? ""
      } else {
        sample[col.header] = ""
      }
    }
    return sample
  })

  return {
    totalRows,
    validRows,
    errorRows: errorRows.size,
    warningRows: warningRows.size,
    duplicateRows: duplicateRows.size,
    errors,
    warnings,
    duplicates: [...duplicateRows].map((row) => ({
      row,
      field: "SKU",
      value: mappedRows[row - 1]?.["sku"] ?? mappedRows[row - 1]?.["cpf"] ?? "",
    })),
    unknownCategories,
    unknownSuppliers,
    sampleRows,
  }
}

async function detectDuplicates(
  session: ImportSession,
  mappedRows: Record<string, string>[],
): Promise<Set<number>> {
  const duplicates = new Set<number>()
  const supabase = await getSupabaseServerClient()

  if (session.entityType === "products") {
    const skus = mappedRows
      .map((r, i) => ({ sku: r["sku"]?.trim(), index: i }))
      .filter((s): s is { sku: string; index: number } => !!s.sku)

    if (skus.length > 0) {
      const uniqueSkus = [...new Set(skus.map((s) => s.sku))]
      const { data: existing } = await supabase
        .from("products")
        .select("sku")
        .eq("partner_id", session.partnerId)
        .in("sku", uniqueSkus)

      if (existing && existing.length > 0) {
        const existingSet = new Set(existing.map((p: any) => p.sku))
        for (const s of skus) {
          if (existingSet.has(s.sku)) {
            duplicates.add(s.index + 1)
          }
        }
      }
    }
  }

  if (session.entityType === "customers") {
    const emails = mappedRows
      .map((r, i) => ({ email: r["email"]?.trim(), index: i }))
      .filter((e): e is { email: string; index: number } => !!e.email)

    if (emails.length > 0) {
      const uniqueEmails = [...new Set(emails.map((e) => e.email))]
      const { data: existing } = await supabase
        .from("customers")
        .select("email")
        .eq("partner_id", session.partnerId)
        .in("email", uniqueEmails)

      if (existing && existing.length > 0) {
        const existingSet = new Set(existing.map((c: any) => c.email))
        for (const e of emails) {
          if (e.email && existingSet.has(e.email)) {
            duplicates.add(e.index + 1)
          }
        }
      }
    }
  }

  if (session.entityType === "services") {
    const skus = mappedRows
      .map((r, i) => ({ sku: r["sku"]?.trim(), index: i }))
      .filter((s): s is { sku: string; index: number } => !!s.sku)

    if (skus.length > 0) {
      const uniqueSkus = [...new Set(skus.map((s) => s.sku))]
      const { data: existing } = await supabase
        .from("services")
        .select("sku")
        .eq("partner_id", session.partnerId)
        .in("sku", uniqueSkus)

      if (existing && existing.length > 0) {
        const existingSet = new Set(existing.map((s: any) => s.sku))
        for (const s of skus) {
          if (existingSet.has(s.sku)) {
            duplicates.add(s.index + 1)
          }
        }
      }
    }
  }

  return duplicates
}
