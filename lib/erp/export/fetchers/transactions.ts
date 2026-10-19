import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm, resolveExportDateBounds } from "../filters"
import { fetchAllPages } from "../paginate"
import { resolveStandardPaymentMethod } from "@/lib/finance-utils"
import {
  mapTransactionRow,
  TRANSACTION_EXPORT_ALL_COLUMNS,
  TRANSACTION_EXPORT_COLUMNS,
} from "../mappers"
import type { TransactionsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const TRANSACTION_SELECT = `
  id, description, category, amount, status, due_date, payment_date,
  payment_type, transaction_type, created_at,
  financial_categories!category_id(name),
finance_accounts(name),
   payment_methods(name)
`

const TRANSACTION_SELECT_ALL = `
  id, description, category, amount, discount_amount, paid_amount, status,
  due_date, payment_date, payment_type, transaction_type, notes, origin,
  reference_note, contact_type, customer_id, installment_number,
  total_installments, created_at, updated_at,
  financial_categories!category_id(name),
finance_accounts(name),
   payment_methods(name),
   customers:customer_id(name),
  transaction_contacts:contact_id(name)
`

export async function fetchTransactionsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: TransactionsExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const selectedIds = (filters.selectedIds || []).filter(Boolean)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? TRANSACTION_SELECT_ALL : TRANSACTION_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("transactions")
        .select(select)
        .eq("partner_id", partnerId)

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (selectedIds.length > 0) {
        query = query.in("id", selectedIds)
      }

      if (filters.activeTab && filters.activeTab !== "Transações") {
        const typeMap: Record<string, string[]> = {
          "A pagar": ["expense", "transfer"],
          "A receber": ["income"],
          "Saídas": ["expense", "transfer"],
          "Entradas": ["income"],
        }
        const types = typeMap[filters.activeTab]
        if (types?.length) query = query.in("transaction_type", types)
      }

      const statuses = (filters.status || []).filter(Boolean)
      if (statuses.length > 0) query = query.in("status", statuses)

      const categories = (filters.category || []).filter(Boolean)
      if (categories.length > 0) query = query.in("category", categories)

      // Meio de pagamento é filtrado em JS após mapeamento (rótulos padrão vs. métodos customizados)

      const { startIso, endIso } = resolveExportDateBounds(filters.datePeriod, filters.timezone)
      if (startIso) query = query.gte("created_at", startIso)
      if (endIso) query = query.lte("created_at", endIso)

      if (search) {
        query = query.or(
          `description.ilike.%${search}%,category.ilike.%${search}%`,
        )
      }

      if (cursor?.createdAt && cursor?.id) {
        query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(EXPORT_CHUNK_SIZE)

      if (error) throw error
      const rows = data || []
      const last = rows[rows.length - 1]
      return {
        rows,
        nextCursor: last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
      }
    },
  })

  let rows = rawRows.map((r) => mapTransactionRow(r, includeAllColumns))

  const paymentFilters = (filters.paymentType || []).filter(Boolean)
  if (paymentFilters.length > 0) {
    rows = rows.filter((row) => paymentFilters.includes(resolveStandardPaymentMethod(String((row as any).paymentType || ""))))
  }

  const columns = includeAllColumns ? TRANSACTION_EXPORT_ALL_COLUMNS : TRANSACTION_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
