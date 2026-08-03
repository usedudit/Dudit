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

export type BaseExportFilters = {
  storeId?: string | null
  selectedIds?: string[]
}

export type QuotesExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  status?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type ErpExportFormat = "xlsx" | "csv"

export type OrdersExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: "Todos" | "Pendente" | "Pago" | "Enviado" | "Cancelado"
  status?: string[]
  paymentStatus?: string[]
  paymentMethods?: string[]
  channels?: string[]
  customerId?: string | null
  datePeriod?: DatePeriodFilterValue
}

export type ProductsExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: "all" | "normal" | "low" | "out_of_stock"
  status?: string[]
  categories?: string[]
  stockStatus?: string[]
  brands?: string[]
  productTypes?: string[]
  hasCostPrice?: boolean
  isOnPromotion?: boolean
}

export type CustomersExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: "Todos" | "Ativo" | "Inativo" | "Bloqueado"
  status?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type ServicesExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: "all" | "active" | "inactive"
  status?: string[]
  categories?: string[]
  hasCostPrice?: boolean
  minDuration?: string
  maxDuration?: string
}

export type AppointmentsExportFilters = BaseExportFilters & {
  startDate: string
  endDate: string
  staffIds?: string[]
  statuses?: string[]
  serviceName?: string
  customerId?: string | null
  search?: string
}

export type SubscriptionsExportFilters = BaseExportFilters & {
  status?: RecurringSubscriptionStatus | "all"
  search?: string
}

export type ReturnsExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  status?: string[]
  source?: string[]
}

export type StockMovementsExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  movementType?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type TransactionsExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  status?: string[]
  category?: string[]
  paymentType?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type SuppliersExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  status?: string[]
}

export type ServiceOrdersExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  status?: string[]
}

export type CashRegisterExportFilters = BaseExportFilters & {
  search?: string
  status?: string[]
  datePeriod?: DatePeriodFilterValue
}

export type XmlImportExportFilters = BaseExportFilters & {
  search?: string
  activeTab?: string
  status?: string[]
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
