import "server-only"

import { unstable_cache } from "next/cache"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"
import { formatQuantityWithUnit } from "@/lib/utils/formatters"
import { getDateComponents, startOfDay, getTodayYmd } from "@/lib/date"
import { getPartnerTimezone } from "@/lib/date/server"
import type { Period } from "@/lib/period-types"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"
import { normalizeOrderSource } from "@/lib/orders/order-utils"
import { cache } from "react"

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

// Per-request loaders to consolidate overlapping database queries during parallel renders
const loadRawOrdersGeneralTab = cache(async (partnerId: string, todayYmd: string, tz: string) => {
  return getCachedErpPage(
    ["raw-orders-general-tab", partnerId, todayYmd, tz],
    [TAGS.orders(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
      const fromYmd = addDays(todayYmd, -59)
      const supabase = createAdminClient()
      const fromIso = startOfDay(fromYmd, tz).toISOString()
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, order_number, customer_name, situation, created_at, order_source")
        .eq("partner_id", partnerId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data || []
    },
    60,
  )
})

const loadRawOrderItemsForAbc = cache(async (partnerId: string, todayYmd: string, tz: string) => {
  return getCachedErpPage(
    ["raw-order-items-abc", partnerId, todayYmd, tz],
    [TAGS.orders(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
      const fromYmd = addDays(todayYmd, -29)
      const supabase = createAdminClient()
      const fromIso = startOfDay(fromYmd, tz).toISOString()
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name, net_item_value, created_at, orders!inner(partner_id)")
        .eq("orders.partner_id", partnerId)
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data || []
    },
    60,
  )
})

const loadRawTransactionsGeneralTab = cache(async (partnerId: string, todayYmd: string, tz: string) => {
  return getCachedErpPage(
    ["raw-transactions-general-tab", partnerId, todayYmd, tz],
    [TAGS.transactions(partnerId), DASHBOARD_TAGS.general(partnerId), DASHBOARD_TAGS.financial(partnerId)],
    async () => {
      const fromYmd = addDays(todayYmd, -59)
      const supabase = createAdminClient()
      const fromIso = startOfDay(fromYmd, tz).toISOString()
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, due_date, payment_date, created_at, status, category, transaction_type, kind")
        .eq("partner_id", partnerId)
        .or("kind.is.null,kind.eq.settlement,kind.eq.refund,kind.eq.chargeback")
        .or(`created_at.gte.${fromIso},due_date.gte.${todayYmd}`)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data || []
    },
    60,
  )
})

const loadRawProductsGeneralTab = cache(async (partnerId: string) => {
  return getCachedErpPage(
    ["raw-products-general-tab", partnerId],
    [TAGS.products(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
      const supabase = createAdminClient()
      const { data, error } = await scopeActiveOnly(
        supabase
          .from("products")
          .select("id, name, stock_quantity, unit, is_active, category_id, category:product_categories!category_id(name)")
      )
        .eq("partner_id", partnerId)
        .eq("status", "ativo")
      if (error) throw error
      return data || []
    },
    60,
  )
})

const loadRawAppointmentsFuture = cache(async (partnerId: string, todayYmd: string) => {
  return getCachedErpPage(
    ["raw-appointments-future", partnerId, todayYmd],
    [TAGS.appointments(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
      const next7 = addDays(todayYmd, 7)
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from("appointments")
        .select("id, status, start_date, start_time, duration_minutes, staff_name, price, source, customer_name, service_name")
        .eq("partner_id", partnerId)
        .gte("start_date", todayYmd)
        .lte("start_date", next7)
        .order("start_date")
        .order("start_time")
      if (error) throw error
      return data || []
    },
    60,
  )
})

const loadRawAppointmentsPast = cache(async (partnerId: string, fromYmd: string, todayYmd: string) => {
  return getCachedErpPage(
    ["raw-appointments-past", partnerId, fromYmd, todayYmd],
    [TAGS.appointments(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from("appointments")
        .select("id, status, start_date, start_time, duration_minutes, staff_name, price, source, customer_name, service_name")
        .eq("partner_id", partnerId)
        .gte("start_date", fromYmd)
        .lte("start_date", todayYmd)
        .order("start_date")
        .order("start_time")
      if (error) throw error
      return data || []
    },
    60,
  )
})

// Shared dashboard cache tags and helpers

// Per-request timezone resolved from the partner's store configuration.
// Set by the exported getDashboard* functions before calling cached loaders.
let _requestTimezone = "America/Sao_Paulo"

/** Returns today's YYYY-MM-DD in the current request's timezone. */
const getTodayYmdInTz = () => getTodayYmd(_requestTimezone)

/** Converts a YYYY-MM-DD string to ISO start-of-day in the request timezone. */
const toStartOfDayIso = (ymd: string) => startOfDay(ymd, _requestTimezone).toISOString()


function getDateRangeForPeriod(period: Period, todayOverride?: string) {
  const today = todayOverride || getTodayYmdInTz()
  switch (period) {
    case "daily":
      return { today, from: today, previousFrom: addDays(today, -1) }
    case "weekly":
      return { today, from: addDays(today, -6), previousFrom: addDays(today, -13) }
    case "monthly":
      return { today, from: addDays(today, -29), previousFrom: addDays(today, -59) }
  }
}

export const DASHBOARD_TAGS = {
  general: (partnerId: string, period = "monthly") => `dashboard-general:${partnerId}:${period}`,
  metrics: (partnerId: string, period = "monthly") => `dashboard-metrics:${partnerId}:${period}`,
  alerts: (partnerId: string) => `dashboard-alerts:${partnerId}`,
  revenue: (partnerId: string, period = "monthly") => `dashboard-revenue:${partnerId}:${period}`,
  revenueOrigin: (partnerId: string, period = "monthly") => `dashboard-revenue-origin:${partnerId}:${period}`,
  activity: (partnerId: string) => `dashboard-activity:${partnerId}`,
  categories: (partnerId: string, period = "monthly") => `dashboard-categories:${partnerId}:${period}`,
  abcCurve: (partnerId: string, period = "monthly") => `dashboard-abc-curve:${partnerId}:${period}`,
  ordersChart: (partnerId: string, period = "monthly") => `dashboard-orders-chart:${partnerId}:${period}`,
  products: (partnerId: string) => `dashboard-products:${partnerId}`,
  services: (partnerId: string) => `dashboard-services:${partnerId}`,
  financial: (partnerId: string) => `dashboard-financial:${partnerId}`,
  operations: (partnerId: string) => `dashboard-operations:${partnerId}`,
}

export type DashboardTab = "geral" | "produtos" | "servicos" | "financeiro" | "operacao"

export type Metric = {
  title: string
  value: string
  detail?: string
  trend?: string
  tone?: "default" | "green" | "red" | "orange" | "blue"
}

export type DashboardListItem = {
  id: string
  title: string
  subtitle?: string
  meta?: string
  value?: string
  tone?: "default" | "green" | "red" | "orange" | "blue"
}

export type ChartPoint = Record<string, string | number>

export type AbcCurvePoint = {
  label: string
  value: number
  cumulative: number
  category: "A" | "B" | "C"
}

export type GeneralDashboardData = {
  metrics: Metric[]
  revenue: ChartPoint[]
  distribution: ChartPoint[]
  revenueSplit: ChartPoint[]
  latestOrders: DashboardListItem[]
  nextAppointments: DashboardListItem[]
  dueAccounts: DashboardListItem[]
  criticalStock: DashboardListItem[]
}

export type AlertItem = {
  id: string
  message: string
  count: number
  tone: "red" | "orange" | "blue"
  icon: string
}

export type ActivityItem = {
  id: string
  title: string
  description: string
  time: string
  icon: string
  tone: "green" | "blue" | "orange" | "red" | "default"
  user?: string
  date?: string
  entityId?: string
  entityType?: string
  entityLabel?: string
  entityRef?: string
}

export type ProductsDashboardData = {
  metrics: Metric[]
  topProducts: DashboardListItem[]
  idleProducts: DashboardListItem[]
  criticalStock: DashboardListItem[]
  bestSellers: ChartPoint[]
  categorySales: ChartPoint[]
  salesEvolution: ChartPoint[]
  busyHours: ChartPoint[]
  inventoryRows: Array<{ id: string; name: string; category: string; sku: string; brand: string; stock: number; unit: string; price: number; active: boolean }>
}

export type ServicesDashboardData = {
  metrics: Metric[]
  todayAppointments: DashboardListItem[]
  staffRows: DashboardListItem[]
  categoryRows: DashboardListItem[]
  serviceRows: DashboardListItem[]
}

export type FinancialAlertItem = {
  id: string
  title: string
  subtitle: string
  meta?: string
  value: string
  tone: "red" | "orange"
  statusLabel: "Vencido" | "Próximo" | "Vence hoje"
  dueDate?: string
}

export type FinancialDashboardData = {
  metrics: Metric[]
  revenue: ChartPoint[]
  cashflow: ChartPoint[]
  expensesByCategory: ChartPoint[]
  distribution: ChartPoint[]
  latestMovements: DashboardListItem[]
  overdueAccounts: DashboardListItem[]
  alertsAndPendings?: FinancialAlertItem[]
  largestExpenses: DashboardListItem[]
  dailyMovements?: Record<string, { income: number; expense: number; net: number }>
  transactionRows: Array<{ id: string; description: string; category: string; type: string; status: string; dueDate: string; paymentDate: string; createdAt: string; amount: number }>
}

export type OperationsDashboardData = {
  metrics: Metric[]
  deliveriesToday: DashboardListItem[]
  serviceOrders: DashboardListItem[]
}

export const money = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

export const brl = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(money(value))

const compact = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(money(value))

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

const stripUuids = (text: string) =>
  text.replace(UUID_PATTERN, " ").replace(/\s{2,}/g, " ").trim()

const dateLabel = (value?: string | null) => {
  if (!value) return "-"
  const ymd = value.slice(0, 10)
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: _requestTimezone,
  })
}

const statusPending = (status?: string | null) => {
  const s = String(status || "").toLowerCase()
  return !["paid", "pago", "recebido", "confirmed", "confirmado", "cancelled", "cancelado", "completed", "concluído", "concluido"].includes(s)
}

const isPaid = (status?: string | null) => {
  const s = String(status || "").toLowerCase()
  return ["paid", "pago", "recebido", "confirmed", "confirmado", "completed", "concluído", "concluido"].includes(s)
}

const percentTrend = (current: number, previous: number) => {
  if (previous <= 0 && current <= 0) return "estável"
  if (previous <= 0) return "+100%"
  const delta = ((current - previous) / previous) * 100
  return `${delta >= 0 ? "+" : ""}${Math.round(delta)}%`
}

const bucketByDate = (rows: any[], dateKey: string, valueKey: string, days = 14) => {
  const today = getTodayYmdInTz()
  const map = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    map.set(dateLabel(addDays(today, -i)), 0)
  }
  for (const row of rows) {
    const label = dateLabel(row[dateKey])
    if (map.has(label)) {
      map.set(label, map.get(label)! + money(row[valueKey]))
    }
  }
  return Array.from(map.entries())
    .reverse()
    .map(([label, value]) => ({ label, value }))
}

const bucketCashflowByDate = (rows: any[], days = 14) => {
  const today = getTodayYmdInTz()
  const map = new Map<string, { label: string; value: number; secondary: number }>()
  for (let i = 0; i < days; i++) {
    const dStr = addDays(today, -i)
    const label = dateLabel(dStr)
    map.set(label, { label, value: 0, secondary: 0 })
  }
  for (const row of rows) {
    const dateVal = String(row.payment_date || row.created_at || row.due_date || "").slice(0, 10)
    const label = dateLabel(dateVal)
    if (map.has(label)) {
      const entry = map.get(label)!
      const amt = Math.abs(money(row.amount))
      if (row.transaction_type === "income") {
        entry.value += amt
      } else if (row.transaction_type === "expense") {
        entry.secondary += amt
      }
    }
  }
  return Array.from(map.values()).reverse()
}

const topFromMap = (map: Map<string, number>, limit = 5) => {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

async function getCachedGeneral(partnerId: string, storeId = "", tz?: string): Promise<GeneralDashboardData> {
  const resolvedTz = tz || "America/Sao_Paulo"
  return getCachedErpPage(
    ["dashboard-general", partnerId, storeId],
    [DASHBOARD_TAGS.general(partnerId)],
    async () => {
        const today = getTodayYmdInTz()
        const from = addDays(today, -29)
        const previousFrom = addDays(today, -59)
        const next7 = addDays(today, 7)

        const [allOrders, allAppointments, allTransactions, allProducts] = await Promise.all([
          loadRawOrdersGeneralTab(partnerId, today, resolvedTz),
          loadRawAppointmentsFuture(partnerId, today),
          loadRawTransactionsGeneralTab(partnerId, today, resolvedTz),
          loadRawProductsGeneralTab(partnerId),
        ])

        const orderRows = allOrders.slice(0, 120)
        const txRows = allTransactions.filter((tx: any) => String(tx.created_at).slice(0, 10) >= from || (tx.due_date && tx.due_date >= today)).slice(0, 400)
        const appointmentRows = allAppointments.filter((item: any) => item.source !== "unavailable" && item.start_date >= today && item.start_date <= next7).slice(0, 60)
        const periodOrders = orderRows.filter((item: any) => String(item.created_at).slice(0, 10) >= from)
        const previousOrders = orderRows.filter((item: any) => String(item.created_at).slice(0, 10) < from)
        const paidIncome = txRows.filter((tx: any) => tx.transaction_type === "income" && isPaid(tx.status))
        const revenue = paidIncome.reduce((acc: number, tx: any) => acc + money(tx.amount), 0)
        const previousRevenue = previousOrders.reduce((acc: number, order: any) => acc + money(order.total_amount), 0)
        const pendingAccounts = txRows.filter((tx: any) => statusPending(tx.status) && tx.due_date && tx.due_date <= next7)

        const productRowsMapped = allProducts.slice(0, 80).map((p: any) => ({
          ...p,
          category: p.category?.name || null
        }))
        const lowStock = productRowsMapped.filter((p: any) => Number(p.stock_quantity || 0) <= 5)

        const distribution = new Map<string, number>()
        for (const tx of paidIncome) distribution.set(tx.category || "Outros", (distribution.get(tx.category || "Outros") || 0) + money(tx.amount))

        const productRevenue = periodOrders.reduce((acc: number, order: any) => acc + money(order.total_amount), 0)
        const serviceRevenue = appointmentRows.filter((a: any) => isPaid(a.status)).reduce((acc: number, a: any) => acc + money(a.price), 0)

        return {
          metrics: [
            { title: "Receita do período", value: brl(revenue || productRevenue + serviceRevenue), trend: `${percentTrend(revenue || productRevenue, previousRevenue)} vs período anterior`, tone: "green" },
            { title: "Pedidos do período", value: String(periodOrders.length), trend: `${percentTrend(periodOrders.length, previousOrders.length)} vs período anterior`, tone: "blue" },
            { title: "Agendamentos do período", value: String(appointmentRows.length), detail: `${appointmentRows.filter((a: any) => String(a.start_date).slice(0, 10) === today).length} hoje`, tone: "default" },
            { title: "Contas pendentes", value: String(pendingAccounts.length), detail: brl(pendingAccounts.reduce((acc: number, tx: any) => acc + Math.abs(money(tx.amount)), 0)), tone: "orange" },
            { title: "Produtos com estoque baixo", value: String(lowStock.length), detail: "até 5 unidades", tone: lowStock.length ? "red" : "green" },
            { title: "Ordens de serviço abertas", value: "0", detail: "módulo de OS não localizado", tone: "default" },
          ] as Metric[],
          revenue: bucketByDate(paidIncome, "payment_date", "amount"),
          distribution: topFromMap(distribution),
          revenueSplit: [
            { label: "Produtos", value: productRevenue },
            { label: "Serviços", value: serviceRevenue },
          ],
          latestOrders: periodOrders.slice(0, 6).map((order: any) => ({
            id: order.id,
            title: order.order_number || "Pedido",
            subtitle: order.customer_name || "Cliente não informado",
            meta: dateLabel(order.created_at),
            value: brl(order.total_amount),
            tone: isPaid(order.situation) ? "green" : "orange",
          })),
          nextAppointments: appointmentRows.slice(0, 6).map((item: any) => ({
            id: item.id,
            title: item.customer_name,
            subtitle: item.service_name,
            meta: `${dateLabel(item.start_date)} · ${String(item.start_time).slice(0, 5)}`,
            value: item.staff_name,
            tone: "blue",
          })),
          dueAccounts: pendingAccounts.slice(0, 6).map((tx: any) => ({
            id: tx.id,
            title: tx.description || "Conta",
            subtitle: tx.category || "Sem categoria",
            meta: dateLabel(tx.due_date),
            value: brl(Math.abs(money(tx.amount))),
            tone: tx.transaction_type === "income" ? "green" : "red",
          })),
          criticalStock: lowStock.slice(0, 6).map((p: any) => ({
            id: p.id,
            title: p.name,
            subtitle: p.category || "Sem categoria",
            value: String(Number(p.stock_quantity || 0)),
            tone: Number(p.stock_quantity || 0) <= 0 ? "red" : "orange",
          })),
        }
    },
    120,
  )
}

async function getCachedProducts(partnerId: string, storeId = ""): Promise<ProductsDashboardData> {
  return getCachedErpPage(
    ["dashboard-products", partnerId, storeId],
    [DASHBOARD_TAGS.products(partnerId)],
    async () => {
        const supabase = createAdminClient()
        const [products, orders, items] = await Promise.all([
          scopeActiveOnly(supabase.from("products").select("id, name, sku, brand, stock_quantity, unit, category:product_categories!category_id(name), price, is_active").eq("partner_id", partnerId)).order("name", { ascending: true }).limit(300),
          supabase.from("orders").select("id, total_amount, situation, created_at").eq("partner_id", partnerId).gte("created_at", toStartOfDayIso(addDays(getTodayYmdInTz(), -29))).order("created_at", { ascending: false }).limit(400),
          supabase.from("order_items").select("product_name, quantity, net_item_value, created_at, orders!inner(partner_id)").eq("orders.partner_id", partnerId).gte("created_at", toStartOfDayIso(addDays(getTodayYmdInTz(), -29))).limit(600),
        ])
        if (products.error) throw products.error
        if (orders.error) throw orders.error
        const productRows = products.data || []
        const orderRows = orders.data || []
        const itemRows = items.error ? [] : items.data || []
        const revenue = orderRows.reduce((acc: number, order: any) => acc + money(order.total_amount), 0)
        const completed = orderRows.filter((order: any) => ["completed", "concluído", "concluido", "paid", "pago"].includes(String(order.situation).toLowerCase()))
        const out = productRows.filter((p: any) => Number(p.stock_quantity || 0) <= 0)
        const low = productRows.filter((p: any) => Number(p.stock_quantity || 0) > 0 && Number(p.stock_quantity || 0) <= 5)
        const sold = new Map<string, number>()
        const catRevenue = new Map<string, number>()
        const nameToProduct = new Map<string, any>()
        for (const p of productRows) nameToProduct.set(p.name, p)
        for (const item of itemRows) {
          const qty = Number(item.quantity || 0)
          sold.set(item.product_name || "Produto", (sold.get(item.product_name || "Produto") || 0) + qty)
          const rev = Number(item.net_item_value || 0)
          const prod = nameToProduct.get(item.product_name)
          const catName = (prod?.category as any)?.name || "Sem categoria"
          catRevenue.set(catName, (catRevenue.get(catName) || 0) + rev)
        }
        const hours = new Map<string, number>()
        for (const order of orderRows) {
          const { hour } = getDateComponents(order.created_at)
          const h = String(hour).padStart(2, "0")
          hours.set(`${h}h`, (hours.get(`${h}h`) || 0) + 1)
        }

        return {
          metrics: [
            { title: "Receita de produtos", value: brl(revenue), detail: "últimos 30 dias", tone: "green" },
            { title: "Pedidos concluídos", value: String(completed.length), detail: `${orderRows.length} pedidos no período`, tone: "blue" },
            { title: "Ticket médio", value: brl(orderRows.length ? revenue / orderRows.length : 0), tone: "default" },
            { title: "Produtos sem estoque", value: String(out.length), tone: out.length ? "red" : "green" },
            { title: "Produtos com estoque baixo", value: String(low.length), detail: "até 5 unidades", tone: low.length ? "orange" : "green" },
            { title: "Produtos ativos", value: String(productRows.filter((p: any) => p.is_active).length), tone: "default" },
          ] as Metric[],
          topProducts: topFromMap(sold).map((item, index) => ({ id: item.label, title: item.label, subtitle: `${index + 1}º em vendas`, value: String(item.value), tone: "blue" })) as DashboardListItem[],
          idleProducts: productRows.filter((p: any) => !sold.has(p.name)).slice(0, 6).map((p: any) => ({ id: p.id, title: p.name, subtitle: p.category || "Sem categoria", value: brl(Number(p.price || 0)), tone: "default" })),
          criticalStock: [...out, ...low].slice(0, 8).map((p: any) => ({ id: p.id, title: p.name, subtitle: p.category || "Sem categoria", value: String(Number(p.stock_quantity || 0)), tone: Number(p.stock_quantity || 0) <= 0 ? "red" : "orange" })) as DashboardListItem[],
          bestSellers: topFromMap(sold),
          categorySales: topFromMap(catRevenue),
          salesEvolution: bucketByDate(orderRows, "created_at", "total_amount"),
          busyHours: topFromMap(hours, 8),
          inventoryRows: productRows.map((p: any) => ({
            id: p.id,
            name: p.name || "Produto",
            category: p.category?.name || "Sem categoria",
            sku: p.sku || "-",
            brand: p.brand || "-",
            stock: Number(p.stock_quantity || 0),
            unit: p.unit || "UN",
            price: Number(p.price || 0),
            active: Boolean(p.is_active),
          })),
        }
    },
    120,
  )
}

async function getCachedServices(partnerId: string, storeId = ""): Promise<ServicesDashboardData> {
  return getCachedErpPage(
    ["dashboard-services", partnerId, storeId],
    [DASHBOARD_TAGS.services(partnerId)],
    async () => {
        const supabase = createAdminClient()
        const today = getTodayYmdInTz()
        const from = addDays(today, -29)
        const [appointments, services] = await Promise.all([
          supabase.from("appointments").select("id, customer_name, service_name, start_date, start_time, duration_minutes, staff_name, status, price, source").eq("partner_id", partnerId).gte("start_date", from).order("start_date", { ascending: false }).order("start_time").limit(400),
          scopeActiveOnly(supabase.from("services").select("id, name, category_id, price, duration_minutes, is_active, status, service_categories(name)").eq("partner_id", partnerId).eq("status", "ativo")).limit(300),
        ])
        if (appointments.error) throw appointments.error
        if (services.error) throw services.error
        const rows = (appointments.data || []).filter((item: any) => item.source !== "unavailable")
        const todayRows = rows.filter((item: any) => item.start_date === today)
        const cancelled = rows.filter((item: any) => String(item.status).toLowerCase().includes("cancel"))
        const attended = rows.filter((item: any) => isPaid(item.status) || String(item.status).toLowerCase().includes("conclu"))
        const revenue = rows.filter((item: any) => isPaid(item.status)).reduce((acc: number, item: any) => acc + money(item.price), 0)
        const byStaff = new Map<string, { count: number; revenue: number; minutes: number; cancelled: number }>()
        const byService = new Map<string, { count: number; revenue: number; minutes: number; cancelled: number }>()
        for (const row of rows) {
          for (const [map, key] of [[byStaff, row.staff_name || "Sem profissional"], [byService, row.service_name || "Serviço"]] as const) {
            const current = map.get(key) || { count: 0, revenue: 0, minutes: 0, cancelled: 0 }
            current.count += 1
            current.revenue += money(row.price)
            current.minutes += Number(row.duration_minutes || 0)
            current.cancelled += String(row.status).toLowerCase().includes("cancel") ? 1 : 0
            map.set(key, current)
          }
        }
        const svcCategoryMap = new Map<string, string>()
        for (const svc of services.data || []) {
          const catName = (svc as any).service_categories?.name || "Sem categoria"
          svcCategoryMap.set((svc as any).name || "", catName)
        }
        const categories = new Map<string, number>()
        for (const row of rows) {
          const catName = svcCategoryMap.get(row.service_name || "") || "Sem categoria"
          categories.set(catName, (categories.get(catName) || 0) + 1)
        }
        const rowFrom = ([name, value]: [string, { count: number; revenue: number; minutes: number; cancelled: number }]): DashboardListItem => ({
          id: name,
          title: name,
          subtitle: `${value.count} atendimentos · ${value.cancelled} cancelamentos`,
          meta: `tempo médio ${value.count ? Math.round(value.minutes / value.count) : 0}min`,
          value: brl(value.revenue),
          tone: "blue",
        })

        return {
          metrics: [
            { title: "Total de agendamentos", value: String(rows.length), detail: "últimos 30 dias", tone: "default" },
            { title: "Agendamentos hoje", value: String(todayRows.length), detail: `${todayRows.filter((i: any) => String(i.status).toLowerCase().includes("iniciado")).length} em andamento`, tone: "blue" },
            { title: "Aguardando confirmação", value: String(rows.filter((i: any) => String(i.status).toLowerCase().includes("aguard")).length), tone: "orange" },
            { title: "Cancelados", value: String(cancelled.length), tone: cancelled.length ? "red" : "green" },
            { title: "Comparecimento", value: `${rows.length ? Math.round((attended.length / rows.length) * 100) : 0}%`, detail: "últimos 30 dias", tone: "green" },
            { title: "Receita de serviços", value: brl(revenue), detail: "confirmados/pagos", tone: "green" },
          ] as Metric[],
          todayAppointments: todayRows.slice(0, 8).map((item: any) => ({
            id: item.id,
            title: item.customer_name,
            subtitle: item.service_name,
            meta: String(item.start_time).slice(0, 5),
            value: item.staff_name,
            tone: String(item.status).toLowerCase().includes("cancel") ? "red" : "blue",
          })),
          staffRows: Array.from(byStaff.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(rowFrom),
          categoryRows: topFromMap(categories, 8).map((item) => ({ id: item.label, title: item.label, subtitle: "serviços ativos", value: String(item.value), tone: "default" })) as DashboardListItem[],
          serviceRows: Array.from(byService.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(rowFrom),
        }
    },
    120,
  )
}

async function getCachedFinancial(partnerId: string, storeId = ""): Promise<FinancialDashboardData> {
  return getCachedErpPage(
    ["dashboard-financial", partnerId, storeId],
    [DASHBOARD_TAGS.financial(partnerId)],
    async () => {
        const supabase = createAdminClient()
        const today = getTodayYmdInTz()
        const from = addDays(today, -120)
        const [accounts, transactions] = await Promise.all([
          supabase.from("finance_accounts").select("id, current_balance, initial_balance, is_active").eq("partner_id", partnerId).eq("is_active", true),
          supabase.from("transactions").select("id, description, amount, due_date, payment_date, created_at, status, category, transaction_type, kind").eq("partner_id", partnerId).or("kind.is.null,kind.eq.settlement,kind.eq.refund,kind.eq.chargeback").or(`created_at.gte.${toStartOfDayIso(from)},due_date.gte.${from},payment_date.gte.${from}`).order("created_at", { ascending: false }).limit(1000),
        ])
        if (accounts.error) throw accounts.error
        if (transactions.error) throw transactions.error
        const rows = transactions.data || []
        const balance = (accounts.data || []).reduce((acc: number, a: any) => acc + money(a.current_balance ?? a.initial_balance), 0)

        // Month-level calculations
        const currentMonthStr = today.slice(0, 7) // "YYYY-MM"
        const [currY, currM] = currentMonthStr.split("-").map(Number)
        const prevMonthDate = new Date(Date.UTC(currY, currM - 2, 1))
        const prevMonthStr = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`

        let currentMonthIncome = 0
        let currentMonthExpense = 0
        let prevMonthIncome = 0
        let prevMonthExpense = 0

        const dailyMovements: Record<string, { income: number; expense: number; net: number }> = {}

        for (const tx of rows) {
          const dateVal = String(tx.payment_date || tx.created_at || tx.due_date || "").slice(0, 10)
          const amt = Math.abs(money(tx.amount))
          const isIncome = tx.transaction_type === "income"
          const isExpense = tx.transaction_type === "expense"

          if (dateVal && dateVal.length >= 10) {
            const txMonth = dateVal.slice(0, 7)
            if (txMonth === currentMonthStr) {
              if (isIncome) currentMonthIncome += amt
              if (isExpense) currentMonthExpense += amt
            } else if (txMonth === prevMonthStr) {
              if (isIncome) prevMonthIncome += amt
              if (isExpense) prevMonthExpense += amt
            }

            if (!dailyMovements[dateVal]) {
              dailyMovements[dateVal] = { income: 0, expense: 0, net: 0 }
            }
            if (isIncome) {
              dailyMovements[dateVal].income += amt
              dailyMovements[dateVal].net += amt
            } else if (isExpense) {
              dailyMovements[dateVal].expense += amt
              dailyMovements[dateVal].net -= amt
            }
          }
        }

        const currentMonthResult = currentMonthIncome - currentMonthExpense
        const prevMonthResult = prevMonthIncome - prevMonthExpense

        const income = rows.filter((tx: any) => tx.transaction_type === "income")
        const expenses = rows.filter((tx: any) => tx.transaction_type === "expense")
        const expenseCategories = new Map<string, number>()
        for (const tx of expenses) expenseCategories.set(tx.category || "Outros", (expenseCategories.get(tx.category || "Outros") || 0) + Math.abs(money(tx.amount)))

        // Pending and Overdue alerts
        const pendingTxs = rows.filter((tx: any) => statusPending(tx.status) && tx.due_date)
        const overdue = pendingTxs.filter((tx: any) => tx.due_date < today)
        const dueSoon = pendingTxs.filter((tx: any) => tx.due_date >= today && tx.due_date <= addDays(today, 7))

        const alertsAndPendings: FinancialAlertItem[] = [...overdue, ...dueSoon].slice(0, 8).map((tx: any) => {
          const isOverdue = tx.due_date < today
          const isToday = tx.due_date === today
          let daysDiff = 0
          if (tx.due_date) {
            const d1 = new Date(today).getTime()
            const d2 = new Date(tx.due_date).getTime()
            daysDiff = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24))
          }

          let subtitle = ""
          let statusLabel: "Vencido" | "Próximo" | "Vence hoje" = "Próximo"
          let tone: "red" | "orange" = "orange"

          if (isOverdue) {
            statusLabel = "Vencido"
            tone = "red"
            subtitle = `Pagamento vencido • ${brl(Math.abs(money(tx.amount)))}`
          } else if (isToday) {
            statusLabel = "Vence hoje"
            tone = "orange"
            subtitle = `Vence hoje • ${brl(Math.abs(money(tx.amount)))}`
          } else {
            statusLabel = "Próximo"
            tone = "orange"
            subtitle = `Vence em ${daysDiff} ${daysDiff === 1 ? "dia" : "dias"} • ${brl(Math.abs(money(tx.amount)))}`
          }

          return {
            id: tx.id,
            title: tx.description || (isOverdue ? "Conta vencida" : "Conta a pagar"),
            subtitle,
            meta: dateLabel(tx.due_date),
            value: brl(Math.abs(money(tx.amount))),
            tone,
            statusLabel,
            dueDate: tx.due_date,
          }
        })

        return {
          metrics: [
            {
              title: "Receitas do mês",
              value: brl(currentMonthIncome),
              trend: `${percentTrend(currentMonthIncome, prevMonthIncome)} vs mês anterior`,
              tone: "green",
            },
            {
              title: "Despesas do mês",
              value: brl(currentMonthExpense),
              trend: `${percentTrend(currentMonthExpense, prevMonthExpense)} vs mês anterior`,
              tone: "red",
            },
            {
              title: "Resultado do mês",
              value: brl(currentMonthResult),
              trend: `${percentTrend(currentMonthResult, prevMonthResult)} vs mês anterior`,
              tone: currentMonthResult >= 0 ? "green" : "red",
            },
            {
              title: "Saldo atual",
              value: brl(balance),
              trend: "",
              tone: balance >= 0 ? "green" : "red",
            },
          ] as Metric[],
          revenue: bucketByDate(income.filter((tx: any) => isPaid(tx.status)), "payment_date", "amount"),
          cashflow: bucketCashflowByDate(rows, 14),
          expensesByCategory: topFromMap(expenseCategories),
          dailyMovements,
          alertsAndPendings,
          distribution: [
            { label: "Entradas", value: income.reduce((acc: number, tx: any) => acc + Math.abs(money(tx.amount)), 0) },
            { label: "Saídas", value: expenses.reduce((acc: number, tx: any) => acc + Math.abs(money(tx.amount)), 0) },
          ],
          latestMovements: rows.slice(0, 8).map((tx: any) => ({
            id: tx.id,
            title: tx.description || "Movimentação",
            subtitle: tx.category || "Sem categoria",
            meta: dateLabel(tx.payment_date || tx.due_date || tx.created_at),
            value: brl(Math.abs(money(tx.amount))),
            tone: tx.transaction_type === "income" ? "green" : "red",
          })),
          overdueAccounts: rows.filter((tx: any) => statusPending(tx.status) && tx.due_date && tx.due_date < today).slice(0, 8).map((tx: any) => ({
            id: tx.id,
            title: tx.description || "Conta vencida",
            subtitle: tx.category || "Sem categoria",
            meta: dateLabel(tx.due_date),
            value: brl(Math.abs(money(tx.amount))),
            tone: tx.transaction_type === "income" ? "green" : "red",
          })),
          largestExpenses: expenses.sort((a: any, b: any) => Math.abs(money(b.amount)) - Math.abs(money(a.amount))).slice(0, 8).map((tx: any) => ({
            id: tx.id,
            title: tx.description || "Despesa",
            subtitle: tx.category || "Sem categoria",
            meta: dateLabel(tx.due_date || tx.created_at),
            value: brl(Math.abs(money(tx.amount))),
            tone: "red",
          })),
          transactionRows: rows.map((tx: any) => ({
            id: tx.id,
            description: tx.description || "Movimentação",
            category: tx.category || "Sem categoria",
            type: tx.transaction_type || "Não informado",
            status: tx.status || "Não informado",
            dueDate: tx.due_date || "",
            paymentDate: tx.payment_date || "",
            createdAt: tx.created_at || "",
            amount: Math.abs(money(tx.amount)),
          })),
        }
    },
    120,
  )
}

async function getCachedOperations(partnerId: string, storeId = ""): Promise<OperationsDashboardData> {
  return getCachedErpPage(
    ["dashboard-operations", partnerId, storeId],
    [DASHBOARD_TAGS.operations(partnerId)],
    async () => {
        const supabase = createAdminClient()
        const today = getTodayYmdInTz()
        const [deliveries, appointments] = await Promise.all([
          supabase.from("deliveries").select("id, status, started_at, delivered_at, estimated_duration_minutes, created_at").eq("partner_id", partnerId).gte("created_at", toStartOfDayIso(addDays(today, -7))).order("created_at", { ascending: false }).limit(120),
          supabase.from("appointments").select("id, customer_name, service_name, start_date, start_time, status, staff_name, duration_minutes, source").eq("partner_id", partnerId).gte("start_date", addDays(today, -7)).order("start_date", { ascending: false }).limit(120),
        ])
        if (deliveries.error) throw deliveries.error
        const deliveryRows = deliveries.data || []
        const appointmentRows = appointments.error ? [] : (appointments.data || []).filter((item: any) => item.source !== "unavailable")
        const pending = deliveryRows.filter((d: any) => ["pending", "not_sent", "preparing"].includes(String(d.status).toLowerCase()))
        const sent = deliveryRows.filter((d: any) => String(d.status).toLowerCase() === "sent")
        const late = deliveryRows.filter((d: any) => ["pending", "not_sent", "preparing", "sent"].includes(String(d.status).toLowerCase()) && String(d.created_at).slice(0, 10) < today)
        const done = deliveryRows.filter((d: any) => ["delivered", "completed"].includes(String(d.status).toLowerCase()))
        const activeOs = appointmentRows.filter((a: any) => ["iniciado", "aguardando", "reservado", "confirmado"].includes(String(a.status).toLowerCase()))
        const doneOs = appointmentRows.filter((a: any) => ["concluído", "concluido", "pago", "completed"].includes(String(a.status).toLowerCase()))
        const avg = doneOs.length ? Math.round(doneOs.reduce((acc: number, a: any) => acc + Number(a.duration_minutes || 0), 0) / doneOs.length) : 0

        return {
          metrics: [
            { title: "Entregas pendentes", value: String(pending.length), tone: pending.length ? "orange" : "green" },
            { title: "Saíram para entrega", value: String(sent.length), tone: "blue" },
            { title: "Atrasadas", value: String(late.length), tone: late.length ? "red" : "green" },
            { title: "OS abertas", value: String(activeOs.length), detail: "baseado em atendimentos", tone: "orange" },
            { title: "OS concluídas", value: String(doneOs.length), detail: "últimos 7 dias", tone: "green" },
            { title: "Tempo médio", value: `${avg}min`, detail: "atendimentos concluídos", tone: "default" },
          ] as Metric[],
          deliveriesToday: deliveryRows.filter((d: any) => String(d.created_at).slice(0, 10) === today).slice(0, 8).map((d: any) => ({
            id: d.id,
            title: `Entrega ${String(d.id).slice(0, 8)}`,
            subtitle: d.status || "Sem status",
            meta: dateLabel(d.started_at || d.created_at),
            value: d.estimated_duration_minutes ? `${d.estimated_duration_minutes}min` : undefined,
            tone: String(d.status).toLowerCase() === "delivered" ? "green" : "blue",
          })),
          serviceOrders: activeOs.slice(0, 8).map((a: any) => ({
            id: a.id,
            title: a.customer_name,
            subtitle: a.service_name,
            meta: `${dateLabel(a.start_date)} · ${String(a.start_time).slice(0, 5)}`,
            value: a.staff_name,
            tone: "orange",
          })),
        }
    },
    120,
  )
}

export async function getDashboardGeneralData(partnerId: string, storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneral(partnerId, storeId, tz)
}

export async function getDashboardProductsData(partnerId: string, storeId = "") {
  await requirePermission(partnerId, "products", "view")
  return getCachedProducts(partnerId, storeId)
}

export async function getDashboardServicesData(partnerId: string, storeId = "") {
  await requirePermission(partnerId, "appointments", "view")
  return getCachedServices(partnerId, storeId)
}

export async function getDashboardFinancialData(partnerId: string, storeId = "") {
  await requirePermission(partnerId, "financial", "view")
  return getCachedFinancial(partnerId, storeId)
}

export async function getDashboardOperationsData(partnerId: string, storeId = "") {
  await requirePermission(partnerId, "delivery", "view")
  return getCachedOperations(partnerId, storeId)
}

// ============================================================================
// MODULAR GENERAL TAB - independent queries with granular cache tags
// ============================================================================

async function getCachedGeneralMetrics(partnerId: string, storeId = "", period: Period = "monthly", todayOverride?: string): Promise<{ metrics: Metric[] }> {
  return getCachedErpPage(
    ["dashboard-metrics", partnerId, storeId, period, todayOverride || ""],
    [DASHBOARD_TAGS.metrics(partnerId, period), DASHBOARD_TAGS.general(partnerId, period)],
    async () => {
        const { today, from, previousFrom } = getDateRangeForPeriod(period, todayOverride)

        const [allOrders, allTransactions] = await Promise.all([
          loadRawOrdersGeneralTab(partnerId, today, _requestTimezone),
          loadRawTransactionsGeneralTab(partnerId, today, _requestTimezone),
        ])

        const orderRows = allOrders.filter((o: any) => String(o.created_at).slice(0, 10) >= previousFrom).slice(0, 300)
        const txRows = allTransactions.filter((tx: any) => tx.transaction_type === "income" && String(tx.created_at).slice(0, 10) >= from).slice(0, 400)
        const periodOrders = orderRows.filter((o: any) => String(o.created_at).slice(0, 10) >= from)
        const previousOrders = orderRows.filter((o: any) => String(o.created_at).slice(0, 10) < from)
        const paidIncome = txRows.filter((tx: any) => isPaid(tx.status))
        const revenue = paidIncome.reduce((acc: number, tx: any) => acc + money(tx.amount), 0)
        const previousRevenue = previousOrders.reduce((acc: number, o: any) => acc + money(o.total_amount), 0)
        const ticket = periodOrders.length ? revenue / periodOrders.length : 0
        const uniqueCustomers = new Set(periodOrders.map((o: any) => (o.customer_name || "").toLowerCase().trim()).filter(Boolean))

        return {
          metrics: [
            { title: "Desempenho de Vendas", value: brl(revenue), trend: `${percentTrend(revenue, previousRevenue)} vs período anterior`, tone: "green" as const },
            { title: "Vendas Totais", value: String(periodOrders.length), trend: `${percentTrend(periodOrders.length, previousOrders.length)} vs período anterior`, tone: "blue" as const },
            { title: "Ticket Médio", value: brl(ticket), trend: "0% vs período anterior", tone: "default" as const },
            { title: "Clientes Atendidos", value: String(uniqueCustomers.size), trend: "0% vs período anterior", tone: "default" as const },
          ],
        }
    },
    60,
  )
}

async function getCachedGeneralAlerts(partnerId: string, storeId = "", activeResources: string[] = ["products", "services"]): Promise<{ alerts: AlertItem[] }> {
  return getCachedErpPage(
    ["dashboard-alerts", partnerId, storeId, activeResources.sort().join(",")],
    [DASHBOARD_TAGS.alerts(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
        const supabase = createAdminClient()
        const today = getTodayYmdInTz()
        const next7 = addDays(today, 7)
        const alerts: AlertItem[] = []

        const [allTransactions, allOrders, allProducts, allAppointments, delRes] = await Promise.all([
          loadRawTransactionsGeneralTab(partnerId, today, _requestTimezone),
          loadRawOrdersGeneralTab(partnerId, today, _requestTimezone),
          loadRawProductsGeneralTab(partnerId),
          loadRawAppointmentsFuture(partnerId, today),
          supabase.from("deliveries").select("id, status, created_at").eq("partner_id", partnerId).in("status", ["pending", "not_sent", "preparing", "sent"]).lt("created_at", toStartOfDayIso(today)).limit(20)
        ])

        const pendingAccounts = allTransactions.filter((tx: any) => tx.due_date && tx.due_date >= today && tx.due_date <= next7 && statusPending(tx.status)).slice(0, 100)
        if (pendingAccounts.length > 0) {
          alerts.push({ id: "due-accounts", message: `${pendingAccounts.length} conta${pendingAccounts.length > 1 ? "s" : ""} vencendo esta semana`, count: pendingAccounts.length, tone: "orange", icon: "credit-card" })
        }

        const pendingOrders = allOrders.filter((o: any) => String(o.created_at).slice(0, 10) >= addDays(today, -7) && statusPending(o.situation)).slice(0, 200)
        if (pendingOrders.length > 0) {
          alerts.push({ id: "pending-orders", message: `${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} aguardando pagamento`, count: pendingOrders.length, tone: "blue", icon: "cart" })
        }

        if (activeResources.includes("products")) {
          const lowStock = allProducts.filter((p: any) => p.stock_quantity != null && Number(p.stock_quantity) <= 5).slice(0, 50)
          if (lowStock.length > 0) {
            alerts.push({ id: "low-stock", message: `${lowStock.length} produto${lowStock.length > 1 ? "s" : ""} com estoque baixo`, count: lowStock.length, tone: "red", icon: "package" })
          }
        }

        if (activeResources.includes("services")) {
          const pendingApts = allAppointments.filter((a: any) => String(a.start_date).slice(0, 10) === today && a.source !== "unavailable" && String(a.status || "").toLowerCase().includes("aguard")).slice(0, 50)
          if (pendingApts.length > 0) {
            alerts.push({ id: "pending-appointments", message: `${pendingApts.length} agendamento${pendingApts.length > 1 ? "s" : ""} pendente${pendingApts.length > 1 ? "s" : ""}`, count: pendingApts.length, tone: "orange", icon: "calendar" })
          }
        }

        const lateDeliveries = delRes.data || []
        if (lateDeliveries.length > 0) {
          alerts.push({ id: "late-deliveries", message: `${lateDeliveries.length} entrega${lateDeliveries.length > 1 ? "s" : ""} atrasada${lateDeliveries.length > 1 ? "s" : ""}`, count: lateDeliveries.length, tone: "red", icon: "truck" })
        }

        return { alerts }
    },
    60,
  )
}

async function getCachedGeneralRevenueChart(partnerId: string, storeId = "", period: Period = "monthly", todayOverride?: string): Promise<{ revenue: any[]; total: number; trend: string }> {
  return getCachedErpPage(
    ["dashboard-revenue", partnerId, storeId, period, todayOverride || ""],
    [DASHBOARD_TAGS.revenue(partnerId, period), DASHBOARD_TAGS.general(partnerId, period)],
    async () => {
        const { today, from } = getDateRangeForPeriod(period, todayOverride)
        const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
        const prevFrom = addDays(from, -daysInPeriod)

        const allTransactions = await loadRawTransactionsGeneralTab(partnerId, today, _requestTimezone)
        const data = allTransactions.filter((tx: any) => tx.transaction_type === "income" && String(tx.created_at).slice(0, 10) >= prevFrom).slice(0, 800)

        const paidIncome = data.filter((tx: any) => isPaid(tx.status))

        const currentRows = paidIncome.filter((tx: any) => String(tx.created_at).slice(0, 10) >= from)
        const previousRows = paidIncome.filter((tx: any) => String(tx.created_at).slice(0, 10) < from)

        const currentBucket = bucketByDate(currentRows, "payment_date", "amount", daysInPeriod)
        const previousBucket = bucketByDate(previousRows, "payment_date", "amount", daysInPeriod)

        const total = currentRows.reduce((acc: number, row: any) => acc + money(row.amount), 0)
        const prevTotal = previousRows.reduce((acc: number, row: any) => acc + money(row.amount), 0)
        const trend = percentTrend(total, prevTotal)

        const revenue = currentBucket.map((p, i) => ({
          label: p.label,
          value: p.value,
          secondary: previousBucket[i]?.value || 0
        }))

        return { revenue, total, trend }
    },
    120,
  )
}

async function getCachedGeneralRevenueOrigin(partnerId: string, storeId = "", period: Period = "monthly"): Promise<{ origins: ChartPoint[] }> {
  return getCachedErpPage(
    ["dashboard-revenue-origin", partnerId, storeId, period],
    [DASHBOARD_TAGS.revenueOrigin(partnerId, period), DASHBOARD_TAGS.general(partnerId, period)],
    async () => {
        const { today, from } = getDateRangeForPeriod(period)
        const allOrders = await loadRawOrdersGeneralTab(partnerId, today, _requestTimezone)
        const data = allOrders.filter((o: any) => String(o.created_at).slice(0, 10) >= from).slice(0, 300)

        const originMap = new Map<string, number>()
        for (const order of data || []) {
          const label = normalizeOrderSource((order as any).order_source)
          originMap.set(label, (originMap.get(label) || 0) + money(order.total_amount))
        }
        const origins = topFromMap(originMap).filter((p) => money(p.value) > 0)
        return { origins }
    },
    120,
  )
}

const bucketCountByDate = (rows: any[], dateKey: string, days = 30) => {
  const today = getTodayYmdInTz()
  const map = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    map.set(dateLabel(addDays(today, -i)), 0)
  }
  for (const row of rows) {
    const label = dateLabel(row[dateKey])
    if (map.has(label)) {
      map.set(label, map.get(label)! + 1)
    }
  }
  return Array.from(map.entries())
    .reverse()
    .map(([label, value]) => ({ label, value }))
}

async function getCachedGeneralOrdersChart(partnerId: string, storeId = "", period: Period = "monthly"): Promise<{ orders: ChartPoint[]; total: number }> {
  return getCachedErpPage(
    ["dashboard-orders-chart", partnerId, storeId, period],
    [DASHBOARD_TAGS.ordersChart(partnerId, period), DASHBOARD_TAGS.general(partnerId, period)],
    async () => {
        const { today, from } = getDateRangeForPeriod(period)
        const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
        const allOrders = await loadRawOrdersGeneralTab(partnerId, today, _requestTimezone)
        const current = (allOrders || []).filter((order: any) => String(order.created_at).slice(0, 10) >= from)

        return {
          orders: bucketCountByDate(current, "created_at", daysInPeriod),
          total: current.length,
        }
    },
    120,
  )
}


async function getCachedGeneralAbcCurve(partnerId: string, storeId = "", period: Period = "monthly"): Promise<{ abcCurve: AbcCurvePoint[] }> {
  return getCachedErpPage(
    ["dashboard-abc-curve", partnerId, storeId, period],
    [DASHBOARD_TAGS.abcCurve(partnerId, period), DASHBOARD_TAGS.general(partnerId, period)],
    async () => {
        const { today, from } = getDateRangeForPeriod(period)
        const items = await loadRawOrderItemsForAbc(partnerId, today, _requestTimezone)
        const data = (items || []).filter((item: any) => String(item.created_at).slice(0, 10) >= from).slice(0, 600)

        const prodRevenueMap = new Map<string, number>()
        for (const item of data) {
          const name = item.product_name || "Produto"
          prodRevenueMap.set(name, (prodRevenueMap.get(name) || 0) + money(item.net_item_value))
        }

        const sortedProducts = Array.from(prodRevenueMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)

        const totalValue = sortedProducts.reduce((a, [_, v]) => a + v, 0)
        let cumulative = 0
        const abcCurve = sortedProducts.map(([label, value]) => {
          cumulative += value
          const cumPct = totalValue > 0 ? Math.round((cumulative / totalValue) * 100) : 0
          let category: "A" | "B" | "C" = "C"
          if (cumPct <= 50) category = "A"
          else if (cumPct <= 80) category = "B"
          return { label, value, cumulative: cumPct, category }
        })

        return { abcCurve }
    },
    120,
  )
}

async function getCachedGeneralActivity(partnerId: string, storeId = ""): Promise<{ activity: ActivityItem[] }> {
  return getCachedErpPage(
    ["dashboard-activity", partnerId, storeId],
    [DASHBOARD_TAGS.activity(partnerId), DASHBOARD_TAGS.general(partnerId)],
    async () => {
        const supabase = createAdminClient()

        // Fetch logs
        const { data, error } = await supabase
          .from("audit_logs")
          .select(`
            id, 
            entity_type, 
            entity_id,
            action_type, 
            change_lines, 
            created_at, 
            user_id,
            actor_user_id
          `)
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(10)

        if (error || !data?.length) return { activity: [] }

        const userIds = Array.from(new Set(data.map((row: any) => row.actor_user_id || row.user_id).filter(Boolean))) as string[]
        const userNameById = new Map<string, string>()

        if (userIds.length > 0) {
          const { data: profileRows } = await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)

          for (const p of profileRows || []) {
            userNameById.set(String((p as any).user_id), String((p as any).full_name || "Sistema"))
          }
        }

        const entityMeta: Record<string, { label: string; gender: "m" | "f"; icon: string }> = {
          order: { label: "Pedido", gender: "m", icon: "cart" },
          transaction: { label: "Transação", gender: "f", icon: "money" },
          product: { label: "Produto", gender: "m", icon: "package" },
          appointment: { label: "Agendamento", gender: "m", icon: "calendar" },
          service: { label: "Serviço", gender: "m", icon: "wrench" },
          customer: { label: "Cliente", gender: "m", icon: "user" },
          delivery: { label: "Entrega", gender: "f", icon: "truck" },
          quote: { label: "Orçamento", gender: "m", icon: "file" },
          cash_session: { label: "Sessão de Caixa", gender: "f", icon: "money" },
          coupon: { label: "Cupom", gender: "m", icon: "tag" },
          return_request: { label: "Devolução", gender: "f", icon: "file" },
        }

        const actionLabels: Record<string, { m: string; f: string }> = {
          created: { m: "criado", f: "criada" },
          updated: { m: "atualizado", f: "atualizada" },
          paid: { m: "pago", f: "paga" },
          cancelled: { m: "cancelado", f: "cancelada" },
          received: { m: "recebido", f: "recebida" },
          deleted: { m: "removido", f: "removida" },
          refunded: { m: "reembolsado", f: "reembolsada" },
        }

        const entityTone: Record<string, ActivityItem["tone"]> = {
          created: "green", paid: "green", received: "green", sale_created: "green",
          cancelled: "red", deleted: "red", refunded: "orange",
          updated: "blue", cash_opened: "blue", cash_closed: "blue",
        }

        // Resolve human-readable references (order_number, description, name, ...)
        // so UUIDs are never exposed in the UI.
        const idsByType = new Map<string, string[]>()
        for (const row of data) {
          const type = String(row.entity_type || "").toLowerCase()
          const id = row.entity_id ? String(row.entity_id) : ""
          if (!id) continue
          const list = idsByType.get(type)
          if (list) list.push(id)
          else idsByType.set(type, [id])
        }

        const refByEntityId = new Map<string, string>()
        const collectRefs = (rows: any[] | null, makeRef: (row: any) => string) => {
          for (const row of rows || []) {
            const ref = makeRef(row)
            if (ref) refByEntityId.set(String(row.id), ref)
          }
        }

        const refJobs: Promise<void>[] = []
        const queueRefJob = (type: string, run: (ids: string[]) => PromiseLike<{ data: any }>, makeRef: (row: any) => string) => {
          const ids = idsByType.get(type)
          if (!ids || ids.length === 0) return
          refJobs.push(
            Promise.resolve(run(ids))
              .then(({ data: rows }) => collectRefs(rows, makeRef))
              .catch(() => undefined),
          )
        }

        queueRefJob("order", ids => supabase.from("orders").select("id, order_number").eq("partner_id", partnerId).in("id", ids), row =>
          row.order_number ? `Pedido #${row.order_number}` : "",
        )
        queueRefJob("transaction", ids => supabase.from("transactions").select("id, description").eq("partner_id", partnerId).in("id", ids), row =>
          row.description ? String(row.description) : "",
        )
        queueRefJob("return_request", ids => supabase.from("return_requests").select("id, order_number_snapshot, orders!order_id(order_number)").eq("partner_id", partnerId).in("id", ids), row => {
          const orderNumber = row.order_number_snapshot || row.orders?.order_number
          return orderNumber ? `Pedido #${orderNumber}` : ""
        })
        queueRefJob("product", ids => supabase.from("products").select("id, name").eq("partner_id", partnerId).in("id", ids), row => row.name || "")
        queueRefJob("service", ids => supabase.from("services").select("id, name").eq("partner_id", partnerId).in("id", ids), row => row.name || "")
        queueRefJob("customer", ids => supabase.from("customers").select("id, name").eq("partner_id", partnerId).in("id", ids), row => row.name || "")
        queueRefJob("appointment", ids => supabase.from("appointments").select("id, customer_name, service_name").eq("partner_id", partnerId).in("id", ids), row =>
          [row.customer_name, row.service_name].filter(Boolean).join(" · "),
        )
        queueRefJob("quote", ids => supabase.from("quotes").select("id, quote_number").eq("partner_id", partnerId).in("id", ids), row =>
          row.quote_number ? `Orçamento #${row.quote_number}` : "",
        )
        queueRefJob("coupon", ids => supabase.from("coupons").select("id, code").eq("partner_id", partnerId).in("id", ids), row => row.code || "")

        await Promise.all(refJobs)

        const activity: ActivityItem[] = data.map((row: any) => {
          const action = String(row.action_type || "").toLowerCase()
          const entity = String(row.entity_type || "").toLowerCase()
          const lines = Array.isArray(row.change_lines) ? row.change_lines : []

          let title = ""
          let icon = entityMeta[entity]?.icon || "file"

          // Special mapping for cash sessions as requested
          if (entity === "cash_session") {
            if (action === "cash_opened" || action === "opened") title = "Abertura de caixa"
            else if (action === "cash_closed" || action === "closed") title = "Fechamento de caixa"
            else title = "Sessão de caixa"
          } else if (action === "sale_created") {
            title = "Venda realizada"
          } else {
            const meta = entityMeta[entity]
            const actionLbl = actionLabels[action]
            if (meta && actionLbl) {
              title = `${meta.label} ${actionLbl[meta.gender]}`
            } else {
              title = `${entityMeta[entity]?.label || entity} ${action}`
            }
          }

          const desc = lines.length > 0 ? stripUuids(String(lines[0])).slice(0, 80) : ""
          const timeStr = (() => {
            try { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(row.created_at)) } catch { return "" }
          })()

          const userId = row.actor_user_id || row.user_id
          const userName = userNameById.get(String(userId)) || "Sistema"

          return {
            id: row.id,
            title,
            description: desc,
            time: timeStr,
            icon,
            tone: entityTone[action] || "default",
            user: userName.split(" ")[0], // First name for compact view
            date: row.created_at,
            entityId: row.entity_id ? String(row.entity_id) : undefined,
            entityType: entity,
            entityLabel: entityMeta[entity]?.label || entity,
            entityRef: refByEntityId.get(String(row.entity_id || "")) || undefined,
          }
        })

        return { activity }
    },
    60,
  )
}

async function getCachedGeneralTopCategories(partnerId: string, storeId = "", activeResources: string[] = ["products", "services"], period: Period = "monthly"): Promise<{ categories: ChartPoint[] }> {
  return getCachedErpPage(
    ["dashboard-categories", partnerId, storeId, activeResources.sort().join(","), period],
    [DASHBOARD_TAGS.categories(partnerId, period), DASHBOARD_TAGS.general(partnerId, period)],
    async () => {
        const supabase = createAdminClient()
        const { today, from } = getDateRangeForPeriod(period)
        const categoryMap = new Map<string, number>()

        if (activeResources.includes("products")) {
          const { data } = await supabase.from("order_items").select("product_name, quantity, created_at, orders!inner(partner_id)").eq("orders.partner_id", partnerId).gte("created_at", toStartOfDayIso(from)).limit(300)
          // Get product categories
          const productNames = [...new Set((data || []).map((i: any) => i.product_name).filter(Boolean))]
          if (productNames.length > 0) {
            const { data: products } = await supabase.from("products").select("name, category:product_categories!category_id(name)").eq("partner_id", partnerId).in("name", productNames.slice(0, 50)).limit(50)
            const nameToCategory = new Map<string, string>()
            for (const p of products || []) nameToCategory.set(p.name, p.category?.name || "Sem categoria")
            for (const item of data || []) {
              const cat = nameToCategory.get(item.product_name) || "Sem categoria"
              categoryMap.set(cat, (categoryMap.get(cat) || 0) + money(item.quantity))
            }
          }
        }

        if (activeResources.includes("services")) {
          const allAppointments = await loadRawAppointmentsPast(partnerId, from, today)
          const rows = allAppointments.filter((a: any) => a.start_date >= from && a.source !== "unavailable" && isPaid(a.status)).slice(0, 200)
          // Get service categories
          const serviceNames = [...new Set(rows.map((r: any) => r.service_name).filter(Boolean))]
          if (serviceNames.length > 0) {
            const { data: services } = await supabase.from("services").select("name, service_categories(name)").eq("partner_id", partnerId).in("name", serviceNames.slice(0, 50)).limit(50)
            const nameToCategory = new Map<string, string>()
            for (const s of services || []) nameToCategory.set(s.name, (s as any).service_categories?.name || "Sem categoria")
            for (const row of rows) {
              const cat = nameToCategory.get(row.service_name) || "Sem categoria"
              categoryMap.set(cat, (categoryMap.get(cat) || 0) + money(row.price))
            }
          }
        }

        return { categories: topFromMap(categoryMap) }
    },
    120,
  )
}

// ============================================================================
// PUBLIC EXPORTS - Modular General Tab
// ============================================================================

export async function getGeneralMetrics(partnerId: string, period: Period = "monthly", todayOverride?: string, storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralMetrics(partnerId, storeId, period, todayOverride)
}

export async function getGeneralAlerts(partnerId: string, activeResources: string[] = ["products", "services"], storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralAlerts(partnerId, storeId, activeResources)
}

export async function getGeneralRevenueChart(partnerId: string, period: Period = "monthly", todayOverride?: string, storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralRevenueChart(partnerId, storeId, period, todayOverride)
}

export async function getGeneralRevenueOrigin(partnerId: string, period: Period = "monthly", storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralRevenueOrigin(partnerId, storeId, period)
}

export async function getGeneralAbcCurve(partnerId: string, period: Period = "monthly", storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralAbcCurve(partnerId, storeId, period)
}

export async function getGeneralOrdersChart(partnerId: string, period: Period = "monthly", storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralOrdersChart(partnerId, storeId, period)
}

export async function getGeneralActivity(partnerId: string, storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralActivity(partnerId, storeId)
}

export async function getGeneralTopCategories(partnerId: string, activeResources: string[] = ["products", "services"], period: Period = "monthly", storeId = "") {
  await requirePermission(partnerId, "dashboard", "view")
  const tz = await getPartnerTimezone(partnerId)
  _requestTimezone = tz
  return getCachedGeneralTopCategories(partnerId, storeId, activeResources, period)
}
