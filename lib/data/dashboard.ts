import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"

export const DASHBOARD_TAGS = {
  general: (partnerId: string) => `dashboard-general:${partnerId}`,
  metrics: (partnerId: string) => `dashboard-metrics:${partnerId}`,
  alerts: (partnerId: string) => `dashboard-alerts:${partnerId}`,
  revenue: (partnerId: string) => `dashboard-revenue:${partnerId}`,
  revenueOrigin: (partnerId: string) => `dashboard-revenue-origin:${partnerId}`,
  activity: (partnerId: string) => `dashboard-activity:${partnerId}`,
  categories: (partnerId: string) => `dashboard-categories:${partnerId}`,
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
}

export type ServicesDashboardData = {
  metrics: Metric[]
  todayAppointments: DashboardListItem[]
  staffRows: DashboardListItem[]
  categoryRows: DashboardListItem[]
  serviceRows: DashboardListItem[]
}

export type FinancialDashboardData = {
  metrics: Metric[]
  revenue: ChartPoint[]
  cashflow: ChartPoint[]
  expensesByCategory: ChartPoint[]
  distribution: ChartPoint[]
  latestMovements: DashboardListItem[]
  overdueAccounts: DashboardListItem[]
  largestExpenses: DashboardListItem[]
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

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

const dateLabel = (value?: string | null) => {
  if (!value) return "-"
  const ymd = value.slice(0, 10)
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
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
  const today = getTodayYmdSaoPaulo()
  const map = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) map.set(addDays(today, -i), 0)
  for (const row of rows) {
    const key = String(row?.[dateKey] || row?.created_at || "").slice(0, 10)
    if (!map.has(key)) continue
    map.set(key, (map.get(key) || 0) + money(row?.[valueKey]))
  }
  return Array.from(map.entries()).map(([date, value]) => ({ label: dateLabel(date), value }))
}

const topFromMap = (map: Map<string, number>, limit = 6) =>
  Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))

async function getCachedGeneral(partnerId: string): Promise<GeneralDashboardData> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const previousFrom = addDays(today, -59)
      const next7 = addDays(today, 7)

      const [orders, appointments, transactions, products] = await Promise.all([
        supabase.from("orders").select("id, order_number, customer_name, total_amount, situation, created_at").eq("partner_id", partnerId).gte("created_at", `${previousFrom}T00:00:00`).order("created_at", { ascending: false }).limit(120),
        supabase.from("appointments").select("id, customer_name, service_name, start_date, start_time, duration_minutes, status, price, staff_name, source").eq("partner_id", partnerId).gte("start_date", today).lte("start_date", next7).order("start_date").order("start_time").limit(60),
        supabase.from("transactions").select("id, description, amount, due_date, payment_date, created_at, status, category, transaction_type").eq("partner_id", partnerId).or(`created_at.gte.${from}T00:00:00,due_date.gte.${today}`).order("created_at", { ascending: false }).limit(400),
        supabase.from("products").select("id, name, stock_quantity, is_active, category_id, category:product_categories!category_id(name)").eq("partner_id", partnerId).eq("is_active", true).order("stock_quantity").limit(80),
      ])

      if (orders.error) throw orders.error
      if (appointments.error) throw appointments.error
      if (transactions.error) throw transactions.error
      if (products.error) throw products.error

      const orderRows = orders.data || []
      const txRows = transactions.data || []
      const appointmentRows = (appointments.data || []).filter((item: any) => item.source !== "unavailable")
      const periodOrders = orderRows.filter((item: any) => String(item.created_at).slice(0, 10) >= from)
      const previousOrders = orderRows.filter((item: any) => String(item.created_at).slice(0, 10) < from)
      const paidIncome = txRows.filter((tx: any) => tx.transaction_type === "income" && isPaid(tx.status))
      const revenue = paidIncome.reduce((acc: number, tx: any) => acc + money(tx.amount), 0)
      const previousRevenue = previousOrders.reduce((acc: number, order: any) => acc + money(order.total_amount), 0)
      const pendingAccounts = txRows.filter((tx: any) => statusPending(tx.status) && tx.due_date && tx.due_date <= next7)

      const productRowsMapped = (products.data || []).map((p: any) => ({
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
          value: `${p.stock_quantity || 0} un.`,
          tone: Number(p.stock_quantity || 0) <= 0 ? "red" : "orange",
        })),
      }
    },
    ["dashboard-general", partnerId],
    { tags: [DASHBOARD_TAGS.general(partnerId)], revalidate: 120 },
  )()
}

async function getCachedProducts(partnerId: string): Promise<ProductsDashboardData> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const [products, orders, items] = await Promise.all([
        supabase.from("products").select("id, name, stock_quantity, price, is_active, created_at, category_id, category:product_categories!category_id(name)").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(300),
        supabase.from("orders").select("id, total_amount, situation, created_at").eq("partner_id", partnerId).gte("created_at", `${from}T00:00:00`).order("created_at", { ascending: false }).limit(300),
        supabase.from("order_items").select("product_name, quantity, total_price, created_at").eq("partner_id", partnerId).gte("created_at", `${from}T00:00:00`).limit(600),
      ])
      if (products.error) throw products.error
      if (orders.error) throw orders.error

      const productRows = (products.data || []).map((p: any) => ({
        ...p,
        category: p.category?.name || null
      }))
      const orderRows = orders.data || []
      const itemRows = items.error ? [] : items.data || []
      const revenue = orderRows.reduce((acc: number, order: any) => acc + money(order.total_amount), 0)
      const completed = orderRows.filter((order: any) => ["completed", "concluído", "concluido", "paid", "pago"].includes(String(order.situation).toLowerCase()))
      const out = productRows.filter((p: any) => Number(p.stock_quantity || 0) <= 0)
      const low = productRows.filter((p: any) => Number(p.stock_quantity || 0) > 0 && Number(p.stock_quantity || 0) <= 5)
      const sold = new Map<string, number>()
      for (const item of itemRows) sold.set(item.product_name || "Produto", (sold.get(item.product_name || "Produto") || 0) + money(item.quantity || 0))
      const category = new Map<string, number>()
      for (const p of productRows) category.set(p.category || "Sem categoria", (category.get(p.category || "Sem categoria") || 0) + 1)
      const hours = new Map<string, number>()
      for (const order of orderRows) {
        const h = new Date(order.created_at).getHours().toString().padStart(2, "0")
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
        topProducts: topFromMap(sold).map((item, index) => ({ id: item.label, title: item.label, subtitle: `${index + 1}º em vendas`, value: `${item.value} un.`, tone: "blue" })) as DashboardListItem[],
        idleProducts: productRows.filter((p: any) => !sold.has(p.name)).slice(0, 6).map((p: any) => ({ id: p.id, title: p.name, subtitle: p.category || "Sem categoria", value: brl(p.price), tone: "default" })),
        criticalStock: [...out, ...low].slice(0, 8).map((p: any) => ({ id: p.id, title: p.name, subtitle: p.category || "Sem categoria", value: `${p.stock_quantity || 0} un.`, tone: Number(p.stock_quantity || 0) <= 0 ? "red" : "orange" })) as DashboardListItem[],
        bestSellers: topFromMap(sold),
        categorySales: topFromMap(category),
        salesEvolution: bucketByDate(orderRows, "created_at", "total_amount"),
        busyHours: topFromMap(hours, 8),
      }
    },
    ["dashboard-products", partnerId],
    { tags: [DASHBOARD_TAGS.products(partnerId)], revalidate: 120 },
  )()
}

async function getCachedServices(partnerId: string): Promise<ServicesDashboardData> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const [appointments, services] = await Promise.all([
        supabase.from("appointments").select("id, customer_name, service_name, start_date, start_time, duration_minutes, staff_name, status, price, source").eq("partner_id", partnerId).gte("start_date", from).order("start_date", { ascending: false }).order("start_time").limit(400),
        supabase.from("services").select("id, name, category_id, price, duration_minutes, is_active, service_categories(name)").eq("partner_id", partnerId).eq("is_active", true).limit(300),
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
      const categories = new Map<string, number>()
      for (const service of services.data || []) {
        const catName = (service as any).service_categories?.name || "Sem categoria"
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
          { title: "Agendamentos hoje", value: String(todayRows.length), detail: `${todayRows.filter((i: any) => String(i.status).toLowerCase().includes("iniciado")).length} em andamento`, tone: "blue" },
          { title: "Em andamento", value: String(todayRows.filter((i: any) => String(i.status).toLowerCase().includes("iniciado")).length), tone: "default" },
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
    ["dashboard-services", partnerId],
    { tags: [DASHBOARD_TAGS.services(partnerId)], revalidate: 120 },
  )()
}

async function getCachedFinancial(partnerId: string): Promise<FinancialDashboardData> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const [accounts, transactions] = await Promise.all([
        supabase.from("finance_accounts").select("id, current_balance, initial_balance, is_active").eq("partner_id", partnerId).eq("is_active", true),
        supabase.from("transactions").select("id, description, amount, due_date, payment_date, created_at, status, category, transaction_type").eq("partner_id", partnerId).or(`created_at.gte.${from}T00:00:00,due_date.gte.${today}`).order("created_at", { ascending: false }).limit(600),
      ])
      if (accounts.error) throw accounts.error
      if (transactions.error) throw transactions.error
      const rows = transactions.data || []
      const balance = (accounts.data || []).reduce((acc: number, a: any) => acc + money(a.current_balance ?? a.initial_balance), 0)
      const receivable = rows.filter((tx: any) => tx.transaction_type === "income" && statusPending(tx.status)).reduce((acc: number, tx: any) => acc + Math.abs(money(tx.amount)), 0)
      const payable = rows.filter((tx: any) => tx.transaction_type === "expense" && statusPending(tx.status)).reduce((acc: number, tx: any) => acc + Math.abs(money(tx.amount)), 0)
      const income = rows.filter((tx: any) => tx.transaction_type === "income")
      const expenses = rows.filter((tx: any) => tx.transaction_type === "expense")
      const expenseCategories = new Map<string, number>()
      for (const tx of expenses) expenseCategories.set(tx.category || "Outros", (expenseCategories.get(tx.category || "Outros") || 0) + Math.abs(money(tx.amount)))

      return {
        metrics: [
          { title: "Saldo atual", value: brl(balance), tone: balance >= 0 ? "green" : "red" },
          { title: "A receber", value: brl(receivable), tone: "green" },
          { title: "A pagar", value: brl(payable), tone: payable ? "orange" : "green" },
          { title: "Receita prevista", value: brl(receivable), detail: "contas em aberto", tone: "blue" },
          { title: "Despesas previstas", value: brl(payable), detail: "contas em aberto", tone: "red" },
        ] as Metric[],
        revenue: bucketByDate(income.filter((tx: any) => isPaid(tx.status)), "payment_date", "amount"),
        cashflow: bucketByDate(rows, "created_at", "amount").map((point) => ({ ...point, value: money(point.value) })),
        expensesByCategory: topFromMap(expenseCategories),
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
      }
    },
    ["dashboard-financial", partnerId],
    { tags: [DASHBOARD_TAGS.financial(partnerId)], revalidate: 120 },
  )()
}

async function getCachedOperations(partnerId: string): Promise<OperationsDashboardData> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const [deliveries, appointments] = await Promise.all([
        supabase.from("deliveries").select("id, status, started_at, delivered_at, estimated_duration_minutes, created_at").eq("partner_id", partnerId).gte("created_at", `${addDays(today, -7)}T00:00:00`).order("created_at", { ascending: false }).limit(120),
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
    ["dashboard-operations", partnerId],
    { tags: [DASHBOARD_TAGS.operations(partnerId)], revalidate: 120 },
  )()
}

export async function getDashboardGeneralData(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneral(partnerId)
}

export async function getDashboardProductsData(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "products", "view")
  return getCachedProducts(partnerId)
}

export async function getDashboardServicesData(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "appointments", "view")
  return getCachedServices(partnerId)
}

export async function getDashboardFinancialData(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  return getCachedFinancial(partnerId)
}

export async function getDashboardOperationsData(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "delivery", "view")
  return getCachedOperations(partnerId)
}

// ============================================================================
// MODULAR GENERAL TAB - independent queries with granular cache tags
// ============================================================================

async function getCachedGeneralMetrics(partnerId: string): Promise<{ metrics: Metric[] }> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const previousFrom = addDays(today, -59)

      const [orders, transactions] = await Promise.all([
        supabase.from("orders").select("id, total_amount, customer_name, situation, created_at").eq("partner_id", partnerId).gte("created_at", `${previousFrom}T00:00:00`).order("created_at", { ascending: false }).limit(300),
        supabase.from("transactions").select("id, amount, status, transaction_type, payment_date, created_at").eq("partner_id", partnerId).eq("transaction_type", "income").gte("created_at", `${from}T00:00:00`).limit(400),
      ])
      if (orders.error) throw orders.error
      if (transactions.error) throw transactions.error

      const orderRows = orders.data || []
      const txRows = transactions.data || []
      const periodOrders = orderRows.filter((o: any) => String(o.created_at).slice(0, 10) >= from)
      const previousOrders = orderRows.filter((o: any) => String(o.created_at).slice(0, 10) < from)
      const paidIncome = txRows.filter((tx: any) => isPaid(tx.status))
      const revenue = paidIncome.reduce((acc: number, tx: any) => acc + money(tx.amount), 0)
      const previousRevenue = previousOrders.reduce((acc: number, o: any) => acc + money(o.total_amount), 0)
      const ticket = periodOrders.length ? revenue / periodOrders.length : 0
      const uniqueCustomers = new Set(periodOrders.map((o: any) => (o.customer_name || "").toLowerCase().trim()).filter(Boolean))

      return {
        metrics: [
          { title: "Desempenho de Vendas", value: brl(revenue), trend: `${percentTrend(revenue, previousRevenue)} vs mês passado`, tone: "green" as const },
          { title: "Vendas Totais", value: String(periodOrders.length), trend: `${percentTrend(periodOrders.length, previousOrders.length)} vs mês passado`, tone: "blue" as const },
          { title: "Pedido Médio", value: brl(ticket), trend: "0% vs mês passado", tone: "default" as const },
          { title: "Clientes Atendidos", value: String(uniqueCustomers.size), trend: "0% vs mês passado", tone: "default" as const },
        ],
      }
    },
    ["dashboard-metrics", partnerId],
    { tags: [DASHBOARD_TAGS.metrics(partnerId), DASHBOARD_TAGS.general(partnerId)], revalidate: 60 },
  )()
}

async function getCachedGeneralAlerts(partnerId: string, sells: string[]): Promise<{ alerts: AlertItem[] }> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const next7 = addDays(today, 7)
      const alerts: AlertItem[] = []

      // Always check: overdue accounts
      const { data: txData } = await supabase.from("transactions").select("id, status, due_date, amount, transaction_type").eq("partner_id", partnerId).lte("due_date", next7).gte("due_date", today).limit(100)
      const pendingAccounts = (txData || []).filter((tx: any) => statusPending(tx.status))
      if (pendingAccounts.length > 0) {
        alerts.push({ id: "due-accounts", message: `${pendingAccounts.length} conta${pendingAccounts.length > 1 ? "s" : ""} vencendo esta semana`, count: pendingAccounts.length, tone: "orange", icon: "credit-card" })
      }

      // Always check: pending orders
      const { data: orderData } = await supabase.from("orders").select("id, situation").eq("partner_id", partnerId).gte("created_at", `${addDays(today, -7)}T00:00:00`).limit(200)
      const pendingOrders = (orderData || []).filter((o: any) => statusPending(o.situation))
      if (pendingOrders.length > 0) {
        alerts.push({ id: "pending-orders", message: `${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} aguardando pagamento`, count: pendingOrders.length, tone: "blue", icon: "cart" })
      }

      // Conditional: low stock (only if sells products)
      if (sells.includes("products")) {
        const { data: prodData } = await supabase.from("products").select("id, stock_quantity").eq("partner_id", partnerId).eq("is_active", true).lte("stock_quantity", 5).limit(50)
        const lowStock = (prodData || []).filter((p: any) => p.stock_quantity != null)
        if (lowStock.length > 0) {
          alerts.push({ id: "low-stock", message: `${lowStock.length} produto${lowStock.length > 1 ? "s" : ""} com estoque baixo`, count: lowStock.length, tone: "red", icon: "package" })
        }
      }

      // Conditional: pending appointments (only if sells services)
      if (sells.includes("services")) {
        const { data: aptData } = await supabase.from("appointments").select("id, status, source").eq("partner_id", partnerId).eq("start_date", today).limit(50)
        const pendingApts = (aptData || []).filter((a: any) => a.source !== "unavailable" && String(a.status || "").toLowerCase().includes("aguard"))
        if (pendingApts.length > 0) {
          alerts.push({ id: "pending-appointments", message: `${pendingApts.length} agendamento${pendingApts.length > 1 ? "s" : ""} pendente${pendingApts.length > 1 ? "s" : ""}`, count: pendingApts.length, tone: "orange", icon: "calendar" })
        }
      }

      // Conditional: late deliveries
      const { data: delData } = await supabase.from("deliveries").select("id, status, created_at").eq("partner_id", partnerId).in("status", ["pending", "not_sent", "preparing", "sent"]).lt("created_at", `${today}T00:00:00`).limit(20)
      const lateDeliveries = delData || []
      if (lateDeliveries.length > 0) {
        alerts.push({ id: "late-deliveries", message: `${lateDeliveries.length} entrega${lateDeliveries.length > 1 ? "s" : ""} atrasada${lateDeliveries.length > 1 ? "s" : ""}`, count: lateDeliveries.length, tone: "red", icon: "truck" })
      }

      return { alerts }
    },
    ["dashboard-alerts", partnerId, sells.sort().join(",")],
    { tags: [DASHBOARD_TAGS.alerts(partnerId), DASHBOARD_TAGS.general(partnerId)], revalidate: 60 },
  )()
}

async function getCachedGeneralRevenueChart(partnerId: string): Promise<{ revenue: any[]; total: number; trend: string }> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const prevFrom = addDays(from, -30)

      const { data, error } = await supabase.from("transactions")
        .select("amount, payment_date, status, transaction_type, created_at")
        .eq("partner_id", partnerId)
        .eq("transaction_type", "income")
        .gte("created_at", `${prevFrom}T00:00:00`)
        .limit(800)

      if (error) throw error

      const paidIncome = (data || []).filter((tx: any) => isPaid(tx.status))

      const currentRows = paidIncome.filter((tx: any) => String(tx.created_at).slice(0, 10) >= from)
      const previousRows = paidIncome.filter((tx: any) => String(tx.created_at).slice(0, 10) < from)

      const currentBucket = bucketByDate(currentRows, "payment_date", "amount", 30)
      const previousBucket = bucketByDate(previousRows, "payment_date", "amount", 30)

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
    ["dashboard-revenue", partnerId],
    { tags: [DASHBOARD_TAGS.revenue(partnerId), DASHBOARD_TAGS.general(partnerId)], revalidate: 120 },
  )()
}

async function getCachedGeneralRevenueOrigin(partnerId: string): Promise<{ origins: ChartPoint[] }> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const { data, error } = await supabase.from("orders").select("id, total_amount, order_source").eq("partner_id", partnerId).gte("created_at", `${from}T00:00:00`).limit(300)
      if (error) throw error
      const originMap = new Map<string, number>()
      for (const order of data || []) {
        const src = String((order as any).order_source || "Manual").toLowerCase()
        let label = "Manual"
        if (src.includes("presencial") || src.includes("pdv") || src.includes("pos")) label = "PDV"
        else if (src.includes("online") || src.includes("web") || src.includes("ecommerce")) label = "Online"
        else if (src.includes("marketplace") || src.includes("vitrine")) label = "Marketplace"
        else if (src.includes("whatsapp") || src.includes("wpp")) label = "WhatsApp"
        else if (src.includes("delivery") || src.includes("entrega")) label = "Delivery"
        originMap.set(label, (originMap.get(label) || 0) + money(order.total_amount))
      }
      const origins = topFromMap(originMap).filter((p) => money(p.value) > 0)
      return { origins }
    },
    ["dashboard-revenue-origin", partnerId],
    { tags: [DASHBOARD_TAGS.revenueOrigin(partnerId), DASHBOARD_TAGS.general(partnerId)], revalidate: 120 },
  )()
}


async function getCachedGeneralActivity(partnerId: string): Promise<{ activity: ActivityItem[] }> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()

      // Fetch logs
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          id, 
          entity_type, 
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

        const desc = lines.length > 0 ? String(lines[0]).slice(0, 80) : ""
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
        }
      })

      return { activity }
    },
    ["dashboard-activity", partnerId],
    { tags: [DASHBOARD_TAGS.activity(partnerId), DASHBOARD_TAGS.general(partnerId)], revalidate: 60 },
  )()
}

async function getCachedGeneralTopCategories(partnerId: string, sells: string[]): Promise<{ categories: ChartPoint[] }> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const today = getTodayYmdSaoPaulo()
      const from = addDays(today, -29)
      const categoryMap = new Map<string, number>()

      if (sells.includes("products")) {
        const { data } = await supabase.from("order_items").select("product_name, quantity, created_at").eq("partner_id", partnerId).gte("created_at", `${from}T00:00:00`).limit(300)
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

      if (sells.includes("services")) {
        const { data } = await supabase.from("appointments").select("service_name, price, status, source").eq("partner_id", partnerId).gte("start_date", from).limit(200)
        const rows = (data || []).filter((a: any) => a.source !== "unavailable" && isPaid(a.status))
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
    ["dashboard-categories", partnerId, sells.sort().join(",")],
    { tags: [DASHBOARD_TAGS.categories(partnerId), DASHBOARD_TAGS.general(partnerId)], revalidate: 120 },
  )()
}

// ============================================================================
// PUBLIC EXPORTS - Modular General Tab
// ============================================================================

export async function getGeneralMetrics(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneralMetrics(partnerId)
}

export async function getGeneralAlerts(partnerId: string, sells: string[]) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneralAlerts(partnerId, sells)
}

export async function getGeneralRevenueChart(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneralRevenueChart(partnerId)
}

export async function getGeneralRevenueOrigin(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneralRevenueOrigin(partnerId)
}

export async function getGeneralActivity(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneralActivity(partnerId)
}

export async function getGeneralTopCategories(partnerId: string, sells: string[]) {
  await requirePartnerAccessWithPermission(partnerId, "dashboard", "view")
  return getCachedGeneralTopCategories(partnerId, sells)
}
