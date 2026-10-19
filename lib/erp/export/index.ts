import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { getPartnerTimezone } from "@/lib/date/server"
import { summarizeDatePeriodFilter, type DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
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
import { fetchCouponsExport } from "./fetchers/coupons"
import { fetchDeliveriesExport } from "./fetchers/deliveries"
import { fetchReviewsExport } from "./fetchers/reviews"
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
  CouponsExportFilters,
  DeliveriesExportFilters,
  ReviewsExportFilters,
} from "./types"

const FILTER_LABELS: Record<string, string> = {
  search: "Busca",
  status: "Status",
  paymentStatus: "Status de pagamento",
  statuses: "Status",
  paymentMethods: "Formas de pagamento",
  channels: "Canais",
  deliveryStatus: "Status de entrega",
  deliveryType: "Tipo de entrega",
  totalMin: "Total mínimo",
  totalMax: "Total máximo",
  categories: "Categorias",
  brands: "Marcas",
  stockStatus: "Estoque",
  productTypes: "Tipos de produto",
  productType: "Tipo de produto",
  hasCostPrice: "Com preço de custo",
  isOnPromotion: "Em promoção",
  minDuration: "Duração mínima",
  maxDuration: "Duração máxima",
  movementType: "Tipo de movimentação",
  category: "Categoria",
  paymentType: "Forma de pagamento",
  source: "Origem",
  staffIds: "Profissionais",
  serviceName: "Serviço",
  activeTab: "Aba",
  discountType: "Tipo de desconto",
  applyScope: "Escopo de aplicação",
  rating: "Nota",
  productId: "Produto",
}

function humanizeFilterKey(key: string): string {
  return FILTER_LABELS[key] || key
}

function buildExportLabels(filters: Record<string, unknown>): {
  periodLabel?: string
  filtersLabel?: string
} {
  let periodLabel: string | undefined

  const datePeriod = filters.datePeriod as DatePeriodFilterValue | undefined
  if (datePeriod && (datePeriod.presets?.length || datePeriod.from || datePeriod.to)) {
    periodLabel = summarizeDatePeriodFilter(datePeriod) || undefined
  }

  const start = filters.startDate
  const end = filters.endDate
  if (!periodLabel && typeof start === "string" && start && typeof end === "string" && end) {
    const fmt = (ymd: string) => ymd.split("-").reverse().join("/")
    periodLabel = `${fmt(start)} a ${fmt(end)}`
  }

  const skip = new Set([
    "storeId",
    "selectedIds",
    "includeAllColumns",
    "activeTab",
    "datePeriod",
    "startDate",
    "endDate",
    "customerId",
    "timezone",
    "detail",
  ])

  const labels: string[] = []
  for (const [key, value] of Object.entries(filters)) {
    if (skip.has(key)) continue
    if (value == null || value === "" || value === false) continue
    if (Array.isArray(value)) {
      if (value.length === 0) continue
      labels.push(`${humanizeFilterKey(key)}: ${value.join(", ")}`)
    } else if (typeof value === "object") {
      continue
    } else {
      labels.push(`${humanizeFilterKey(key)}: ${String(value)}`)
    }
  }

  return {
    periodLabel,
    filtersLabel: labels.length > 0 ? labels.join("  |  ") : undefined,
  }
}

export async function generateErpExport(params: {
  partnerId: string
  module: ErpExportModule
  format: ErpExportFormat
  filters?: Record<string, unknown>
}) {
  const supabase = createAdminClient()
  const { partnerId, module, format } = params
  const baseFilters = params.filters || {}
  const filters = baseFilters.datePeriod
    ? {
        ...baseFilters,
        timezone:
          (baseFilters.timezone as string | undefined) || (await getPartnerTimezone(partnerId)),
      }
    : baseFilters

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
    case "coupons":
      result = await fetchCouponsExport(supabase, partnerId, filters as CouponsExportFilters)
      break
    case "deliveries":
      result = await fetchDeliveriesExport(supabase, partnerId, filters as DeliveriesExportFilters)
      break
    case "reviews":
      result = await fetchReviewsExport(supabase, partnerId, filters as ReviewsExportFilters)
      break
    default:
      throw new Error("Módulo de exportação inválido")
  }

  const sheetName = MODULE_SHEET_NAMES[module] || module
  const labels = buildExportLabels(filters)
  const file = await buildExportFile({
    sheetName,
    columns: result.columns,
    rows: result.rows,
    format,
    meta: {
      title: `Relatório de ${sheetName}`,
      periodLabel: result.periodLabel ?? labels.periodLabel,
      filtersLabel: result.filtersLabel ?? labels.filtersLabel,
      generatedAt: new Date(),
    },
  })

  const filename = await formatExportFilename(module, file.extension, partnerId)

  return {
    filename,
    mimeType: file.mimeType,
    base64: file.buffer.toString("base64"),
    rowCount: result.rowCount,
  }
}
