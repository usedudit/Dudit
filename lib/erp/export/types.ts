import type { DatePeriodFilterValue } from "@/lib/utils/filter-date-period"
import type { RecurringSubscriptionStatus } from "@/lib/types/recurring"

export type ErpExportModule =
  | "orders"
  | "sales"
  | "products"
  | "customers"
  | "services"
  | "appointments"
  | "subscriptions"
  | "returns"
  | "stock-movements"
  | "transactions"
  | "suppliers"
  | "service-orders"
  | "cash-register"
  | "xml-import"
  | "quotes"

export type QuotesExportFilters = {
  search?: string
  activeTab?: string
  status?: string[]
  datePeriod?: DatePeriodFilterValue
  selectedIds?: string[]
}

export type ErpExportFormat = "xlsx" | "csv"

export type OrdersExportFilters = {
  search?: string
  activeTab?: "Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado"
  status?: string[]
  paymentStatus?: string[]
  paymentMethods?: string[]
  channels?: string[]
  customerId?: string | null
  datePeriod?: DatePeriodFilterValue
}

export type ProductsExportFilters = {
  search?: string
  activeTab?: "all" | "normal" | "low" | "out_of_stock"
  status?: string[]
  categories?: string[]
  stockStatus?: string[]
}

export type CustomersExportFilters = {
  search?: string
  activeTab?: "Todos" | "Ativo" | "Inativo" | "Bloqueado"
  status?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type ServicesExportFilters = {
  search?: string
  activeTab?: "all" | "active" | "inactive"
  status?: string[]
  categories?: string[]
}

export type AppointmentsExportFilters = {
  startDate: string
  endDate: string
  staffIds?: string[]
  statuses?: string[]
  serviceName?: string
  customerId?: string | null
  search?: string
}

export type SubscriptionsExportFilters = {
  status?: RecurringSubscriptionStatus | "all"
  search?: string
}

export type ReturnsExportFilters = {
  search?: string
  activeTab?: string
  status?: string[]
  source?: string[]
}

export type StockMovementsExportFilters = {
  search?: string
  activeTab?: string
  movementType?: string[]
  datePeriod?: DatePeriodFilterValue
  selectedIds?: string[]
}

export type TransactionsExportFilters = {
  search?: string
  activeTab?: string
  status?: string[]
  category?: string[]
  paymentType?: string[]
  datePeriod?: DatePeriodFilterValue
  selectedIds?: string[]
}

export type SuppliersExportFilters = {
  search?: string
  activeTab?: string
  status?: string[]
  selectedIds?: string[]
}

export type ServiceOrdersExportFilters = {
  search?: string
  activeTab?: string
  status?: string[]
  selectedIds?: string[]
}

export type CashRegisterExportFilters = {
  search?: string
  status?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type XmlImportExportFilters = {
  search?: string
  activeTab?: string
  status?: string[]
  selectedIds?: string[]
}

export type ErpExportFilters =
  | OrdersExportFilters
  | ProductsExportFilters
  | CustomersExportFilters
  | ServicesExportFilters
  | AppointmentsExportFilters
  | SubscriptionsExportFilters
  | ReturnsExportFilters
  | StockMovementsExportFilters
  | TransactionsExportFilters
  | SuppliersExportFilters
  | ServiceOrdersExportFilters
  | CashRegisterExportFilters
  | XmlImportExportFilters
  | QuotesExportFilters

export type ExportColumnDef = {
  header: string
  key: string
  width?: number
}

export type ExportRow = Record<string, string | number | null | undefined>

export type ExportResult = {
  columns: ExportColumnDef[]
  rows: ExportRow[]
  rowCount: number
}
