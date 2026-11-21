import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import type { ColumnMapping, PreviewSummary, ImportSession } from "./types"
import { validateRows } from "./validators"
import { resolveCategories } from "./category-resolver"
import { resolveSuppliers } from "./supplier-resolver"
import { consolidateProductRows } from "./product-grouper"

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
  const { rows, entityType, totalRows, partnerId } = session

  const rawMappedRows = rows.map((row) => mapRow(row, mapping))
  const mappedRows =
    entityType === "products"
      ? consolidateProductRows(rawMappedRows).map((item) => item.row)
      : rawMappedRows
  const effectiveTotalRows = mappedRows.length

  let defaultMarginPercent: number | null = null
  if (entityType === "products" || entityType === "services") {
    try {
      const admin = getAdminClient()
      const { data: partnerData } = await admin
        .from("partners")
        .select("business_info")
        .eq("id", partnerId)
        .single()
      const margin = partnerData?.business_info?.salesSettings?.defaultMarginPercent
      if (typeof margin === "number" && margin > 0) {
        defaultMarginPercent = margin
      }
    } catch {
      // ignore
    }
  }

  const { errors, warnings } = validateRows(mappedRows, entityType, { defaultMarginPercent })

  const errorRowIndices = new Set(errors.map((e) => e.row))
  const warningRowIndices = new Set(warnings.map((w) => w.row))

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

  const duplicateRowIndices = await detectDuplicates(session, mappedRows)
  const validRowsCount = Math.max(0, effectiveTotalRows - errorRowIndices.size - duplicateRowIndices.size)

  const sampleRows = mappedRows.slice(0, 10).map((row) => {
    const sample: Record<string, string> = {}
    for (const col of mapping) {
      if (col.field) {
        sample[col.fieldLabel ?? col.field] = row[col.field] ?? ""
      }
    }
    return sample
  })

  return {
    totalRows: effectiveTotalRows,
    validRows: validRowsCount,
    errorRows: errorRowIndices.size,
    warningRows: warningRowIndices.size,
    duplicateRows: duplicateRowIndices.size,
    errors,
    warnings,
    duplicates: [...duplicateRowIndices].map((rowNum) => {
      const mapped = mappedRows[rowNum - 1] || {}
      const field =
        entityType === "customers"
          ? (mapped["email"] ? "E-mail" : "CPF")
          : entityType === "appointments"
            ? "Data / Horário"
            : "SKU"
      const value =
        mapped["email"] ||
        mapped["cpf"] ||
        (entityType === "appointments"
          ? `${mapped["start_date"] || ""} ${mapped["start_time"] || ""} (${mapped["customer_name"] || ""})`
          : "") ||
        mapped["sku"] ||
        ""
      return { row: rowNum, field, value }
    }),
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

  if (session.entityType === "appointments") {
    // Collect unique dates from the spreadsheet to check existing DB appointments
    const dates = [
      ...new Set(
        mappedRows
          .map((r) => r["start_date"]?.trim())
          .filter(Boolean),
      ),
    ]

    if (dates.length > 0) {
      const chunkSize = 50
      for (let i = 0; i < dates.length; i += chunkSize) {
        const chunk = dates.slice(i, i + chunkSize)
        const { data: existing } = await supabase
          .from("appointments")
          .select("customer_name, start_date, start_time")
          .eq("partner_id", session.partnerId)
          .in("start_date", chunk)

        if (existing && existing.length > 0) {
          const existingKeySet = new Set(
            existing.map(
              (a: any) =>
                `${String(a.customer_name || "").trim().toLowerCase()}|${a.start_date}|${String(a.start_time || "").slice(0, 5)}`,
            ),
          )

          mappedRows.forEach((r, idx) => {
            const cName = String(r["customer_name"] || "").trim().toLowerCase()
            const sDate = String(r["start_date"] || "").trim()
            const sTime = String(r["start_time"] || "").trim().slice(0, 5)
            const key = `${cName}|${sDate}|${sTime}`
            if (cName && sDate && sTime && existingKeySet.has(key)) {
              duplicates.add(idx + 1)
            }
          })
        }
      }
    }
  }

  if (session.entityType === "products") {
    const skus = mappedRows
      .map((r, i) => ({ sku: r["sku"]?.trim(), index: i }))
      .filter((s): s is { sku: string; index: number } => !!s.sku)

    if (skus.length > 0) {
      const uniqueSkus = [...new Set(skus.map((s) => s.sku))]
      const chunkSize = 200

      for (let i = 0; i < uniqueSkus.length; i += chunkSize) {
        const chunk = uniqueSkus.slice(i, i + chunkSize)
        const { data: existing } = await supabase
          .from("products")
          .select("sku")
          .eq("partner_id", session.partnerId)
          .in("sku", chunk)

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
  }

  if (session.entityType === "customers") {
    const customerDb = getAdminClient()
    const emails = mappedRows
      .map((r, i) => ({ email: r["email"]?.trim().toLowerCase(), index: i }))
      .filter((e): e is { email: string; index: number } => !!e.email)

    if (emails.length > 0) {
      const uniqueEmails = [...new Set(emails.map((e) => e.email))]
      const chunkSize = 200

      for (let i = 0; i < uniqueEmails.length; i += chunkSize) {
        const chunk = uniqueEmails.slice(i, i + chunkSize)
        const { data: existing } = await customerDb
          .from("customers")
          .select("email")
          .eq("partner_id", session.partnerId)
          .in("email", chunk)

        if (existing && existing.length > 0) {
          const existingSet = new Set(existing.map((c: any) => c.email?.toLowerCase()))
          for (const e of emails) {
            if (e.email && existingSet.has(e.email)) {
              duplicates.add(e.index + 1)
            }
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
      const chunkSize = 200

      for (let i = 0; i < uniqueSkus.length; i += chunkSize) {
        const chunk = uniqueSkus.slice(i, i + chunkSize)
        const { data: existing } = await supabase
          .from("services")
          .select("sku")
          .eq("partner_id", session.partnerId)
          .in("sku", chunk)

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
  }

  return duplicates
}
