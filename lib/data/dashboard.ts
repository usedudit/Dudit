import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"

export const DASHBOARD_TAGS = {
  general: (partnerId: string) => `dashboard-general:${partnerId}`,
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

const money = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(String(value ?? 0).replace(",", "."))
  return Number.isFinite(number) ? number : 0
}

const brl = (value: unknown) =>
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
        supabase.from("orders").select("id, order_number, customer_name, total_amount, payment_status, order_status, created_at").eq("partner_id", partnerId).gte("created_at", `${previousFrom}T00:00:00`).order("created_at", { ascending: false }).limit(120),
        supabase.from("appointments").select("id, customer_name, service_name, start_date, start_time, duration_minutes, status, price, staff_name, source").eq("partner_id", partnerId).gte("start_date", today).lte("start_date", next7).order("start_date").order("start_time").limit(60),
        supabase.from("transactions").select("id, description, amount, due_date, payment_date, created_at, status, category, transaction_type").eq("partner_id", partnerId).or(`created_at.gte.${from}T00:00:00,due_date.gte.${today}`).order("created_at", { ascending: false }).limit(400),
        supabase.from("products").select("id, name, stock_quantity, category, is_active").eq("partner_id", partnerId).eq("is_active", true).order("stock_quantity").limit(80),
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
      const lowStock = (products.data || []).filter((p: any) => Number(p.stock_quantity || 0) <= 5)

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
          tone: isPaid(order.payment_status) ? "green" : "orange",
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
        supabase.from("products").select("id, name, stock_quantity, category, price, is_active, created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(300),
        supabase.from("orders").select("id, total_amount, order_status, payment_status, created_at").eq("partner_id", partnerId).gte("created_at", `${from}T00:00:00`).order("created_at", { ascending: false }).limit(300),
        supabase.from("order_items").select("product_name, quantity, total_price, created_at").eq("partner_id", partnerId).gte("created_at", `${from}T00:00:00`).limit(600),
      ])
      if (products.error) throw products.error
      if (orders.error) throw orders.error

      const productRows = products.data || []
      const orderRows = orders.data || []
      const itemRows = items.error ? [] : items.data || []
      const revenue = orderRows.reduce((acc: number, order: any) => acc + money(order.total_amount), 0)
      const completed = orderRows.filter((order: any) => ["completed", "concluído", "concluido", "paid", "pago"].includes(String(order.order_status || order.payment_status).toLowerCase()))
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
        supabase.from("services").select("id, name, category, price, duration_minutes, is_active").eq("partner_id", partnerId).eq("is_active", true).limit(300),
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
      for (const service of services.data || []) categories.set(service.category || "Sem categoria", (categories.get(service.category || "Sem categoria") || 0) + 1)
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
