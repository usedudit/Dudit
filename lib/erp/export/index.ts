import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { MODULE_SHEET_NAMES } from "./constants"
import { fetchOrdersExport, fetchSalesExport } from "./fetchers/orders"
import { fetchProductsExport } from "./fetchers/products"
import { fetchCustomersExport } from "./fetchers/customers"
import { fetchServicesExport } from "./fetchers/services"
import { fetchAppointmentsExport } from "./fetchers/appointments"
import { fetchSubscriptionsExport } from "./fetchers/subscriptions"
import { buildExportFile } from "./workbook"
import type {
  AppointmentsExportFilters,
  CustomersExportFilters,
  ErpExportFormat,
  ErpExportModule,
  OrdersExportFilters,
  ProductsExportFilters,
  ServicesExportFilters,
  SubscriptionsExportFilters,
} from "./types"

export async function generateErpExport(params: {
  partnerId: string
  module: ErpExportModule
  format: ErpExportFormat
  filters?: Record<string, unknown>
}) {
  const supabase = createAdminClient()
  const { partnerId, module, format } = params
  const filters = params.filters || {}

  let result
  switch (module) {
    case "orders":
      result = await fetchOrdersExport(supabase, partnerId, filters as OrdersExportFilters, false)
      break
    case "sales":
      result = await fetchSalesExport(supabase, partnerId, filters as OrdersExportFilters)
      break
    case "products":
      result = await fetchProductsExport(supabase, partnerId, filters as ProductsExportFilters)
      break
    case "customers":
      result = await fetchCustomersExport(supabase, partnerId, filters as CustomersExportFilters)
      break
    case "services":
      result = await fetchServicesExport(supabase, partnerId, filters as ServicesExportFilters)
      break
    case "appointments":
      result = await fetchAppointmentsExport(supabase, partnerId, filters as AppointmentsExportFilters)
      break
    case "subscriptions":
      result = await fetchSubscriptionsExport(supabase, partnerId, filters as SubscriptionsExportFilters)
      break
    default:
      throw new Error("Módulo de exportação inválido")
  }

  const sheetName = MODULE_SHEET_NAMES[module] || module
  const file = await buildExportFile({
    sheetName,
    columns: result.columns,
    rows: result.rows,
    format,
  })

  const dateStamp = new Date().toISOString().slice(0, 10)
  const filename = `dudit-${module}-${dateStamp}.${file.extension}`

  return {
    filename,
    mimeType: file.mimeType,
    base64: file.buffer.toString("base64"),
    rowCount: result.rowCount,
  }
}
