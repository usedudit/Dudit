import type { SupabaseClient } from "@supabase/supabase-js"
import { sanitizeSearchTerm } from "../filters"
import { fetchAllPages } from "../paginate"
import {
  APPOINTMENT_EXPORT_ALL_COLUMNS,
  APPOINTMENT_EXPORT_COLUMNS,
  mapAppointmentRow,
} from "../mappers"
import type { AppointmentsExportFilters } from "../types"
import { EXPORT_CHUNK_SIZE } from "../constants"

const APPOINTMENT_SELECT = `
  id, partner_id, customer_id, customer_name, service_name,
  start_date, start_time, staff_partner_user_id, staff_name, status,
  sales_channel, payment_status, fulfillment_mode, created_at
`

const APPOINTMENT_SELECT_ALL = `
  id, partner_id, customer_id, customer_name, service_name,
  start_date, start_time, end_date, end_time, duration_minutes,
  staff_partner_user_id, staff_name, status, price, pricing_unit,
  paid_amount, sales_channel, payment_status, fulfillment_mode, notes, created_at,
  customers:customer_id(phone, email)
`

export async function fetchAppointmentsExport(
  supabase: SupabaseClient,
  partnerId: string,
  filters: AppointmentsExportFilters,
): Promise<import("../types").ExportResult> {
  const search = sanitizeSearchTerm(filters.search)
  const staffIds = (filters.staffIds || []).filter(Boolean)
  const statuses = (filters.statuses || []).filter(Boolean)
  const includeAllColumns = filters.includeAllColumns === true
  const select = includeAllColumns ? APPOINTMENT_SELECT_ALL : APPOINTMENT_SELECT

  const rawRows = await fetchAllPages<any>({
    chunkSize: EXPORT_CHUNK_SIZE,
    fetchPage: async (cursor) => {
      let query: any = (supabase as any)
        .from("appointments")
        .select(select)
        .eq("partner_id", partnerId)
        .lte("start_date", filters.endDate)
        .gte("end_date", filters.startDate)
        .neq("source", "unavailable")

      if (filters.storeId) {
        query = query.eq("store_id", filters.storeId)
      }

      if (staffIds.length === 1) query = query.eq("staff_partner_user_id", staffIds[0])
      else if (staffIds.length > 1) query = query.in("staff_partner_user_id", staffIds)

      if (statuses.length) query = query.in("status", statuses)

      if (filters.customerId) query = query.eq("customer_id", filters.customerId)

      if (filters.serviceName) {
        query = query.ilike("service_name", `%${sanitizeSearchTerm(filters.serviceName)}%`)
      }

      if (search) {
        query = query.or(
          `customer_name.ilike.%${search}%,service_name.ilike.%${search}%,staff_name.ilike.%${search}%`,
        )
      }

      if (cursor?.createdAt && cursor?.id) {
        query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      }

      const { data, error } = await query
        .order("start_date", { ascending: true })
        .order("start_time", { ascending: true })
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

  const rows = rawRows.map((r) => mapAppointmentRow(r, includeAllColumns))
  const columns = includeAllColumns ? APPOINTMENT_EXPORT_ALL_COLUMNS : APPOINTMENT_EXPORT_COLUMNS
  return { columns, rows, rowCount: rows.length }
}
