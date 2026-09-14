import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { MODULE_SHEET_NAMES, formatExportFilename } from "./constants"
import { fetchOrdersExport, fetchSalesExport } from "./fetchers/orders"
import { fetchProductsExport } from "./fetchers/products"
import { fetchCustomersExport } from "./fetchers/customers"
import { fetchServicesExport } from "./fetchers/services"
import { fetchAppointmentsExport } from "./fetchers/appointments"
import { fetchSubscriptionsExport } from "./fetchers/subscriptions"
import { fetchReturnsExport } from "./fetchers/returns"
import { fetchStockMovementsExport } from "./fetchers/stock-movements"
import { fetchTransactionsExport } from "./fetchers/transactions"
import { fetchSuppliersExport } from "./fetchers/suppliers"
import { fetchServiceOrdersExport } from "./fetchers/service-orders"
import { fetchCashRegisterExport } from "./fetchers/cash-register"
import { fetchXmlImportExport } from "./fetchers/xml-import"
import { fetchQuotesExport } from "./fetchers/quotes"
import { buildExportFile } from "./workbook"
import type {
  AppointmentsExportFilters,
  CashRegisterExportFilters,
  CustomersExportFilters,
  ErpExportFormat,
  ErpExportModule,
  OrdersExportFilters,
  ProductsExportFilters,
  ReturnsExportFilters,
  ServiceOrdersExportFilters,
  ServicesExportFilters,
  StockMovementsExportFilters,
  SubscriptionsExportFilters,
  SuppliersExportFilters,
  TransactionsExportFilters,
  XmlImportExportFilters,
  QuotesExportFilters,
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
    case "returns":
      result = await fetchReturnsExport(supabase, partnerId, filters as ReturnsExportFilters)
      break
    case "stock-movements":
      result = await fetchStockMovementsExport(supabase, partnerId, filters as StockMovementsExportFilters)
      break
    case "transactions":
      result = await fetchTransactionsExport(supabase, partnerId, filters as TransactionsExportFilters)
      break
    case "suppliers":
      result = await fetchSuppliersExport(supabase, partnerId, filters as SuppliersExportFilters)
      break
    case "service-orders":
      result = await fetchServiceOrdersExport(supabase, partnerId, filters as ServiceOrdersExportFilters)
      break
    case "cash-register":
      result = await fetchCashRegisterExport(supabase, partnerId, filters as CashRegisterExportFilters)
      break
    case "xml-import":
      result = await fetchXmlImportExport(supabase, partnerId, filters as XmlImportExportFilters)
      break
    case "quotes":
      result = await fetchQuotesExport(supabase, partnerId, filters as QuotesExportFilters)
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

  const filename = await formatExportFilename(module, file.extension, partnerId)

  return {
    filename,
    mimeType: file.mimeType,
    base64: file.buffer.toString("base64"),
    rowCount: result.rowCount,
  }
}
