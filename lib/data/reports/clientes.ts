import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface CustomerReportData {
  totalCustomers: number
  newCustomers: number
  activeCustomers: number
  recurringCustomers: number
  inactiveCustomers: number
  avgTicket: number
  avgTicketFormatted: string
  previousAvgTicket: number
  purchaseFrequency: number
  avgDaysBetweenPurchases: number
  topCustomers: { id: string; label: string; value: string; subtitle?: string; orders: number }[]
  vipCustomers: { id: string; label: string; value: string; orders: number }[]
  inactiveCustomerList: { id: string; label: string; value: string; subtitle: string; orders: number }[]
  customerEvolution: { label: string; ativos: number; novos: number }[]
  customerRanking: { id: string; label: string; orders: number; revenue: number; lastOrderDate: string }[]
}

const getCachedCustomerData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const [customersResult, periodOrdersResult, prevOrdersResult, allCustomersResult] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, created_at")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("orders")
          .select("id, customer_name, customer_id, total_amount, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("orders")
          .select("id, customer_name, customer_id, total_amount, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${previousFrom}T00:00:00`)
          .lt("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("orders")
          .select("id, customer_name, customer_id, total_amount, created_at")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(1000),
      ])

      if (customersResult.error) throw customersResult.error

      const customers = customersResult.data || []
      const periodOrders = periodOrdersResult.data || []
      const prevOrders = prevOrdersResult.data || []
      const allOrders = allCustomersResult.data || []

      const totalCustomers = customers.length
      const newCustomers = customers.filter((c: any) => {
        const d = String(c.created_at || "").slice(0, 10)
        return d >= from
      }).length

      const periodCustomerSet = new Set<string>()
      const periodCustomerMap = new Map<string, { name: string; total: number; count: number; lastOrderDate: string }>()
      for (const o of periodOrders) {
        const key = o.customer_id || o.customer_name || "anon"
        periodCustomerSet.add(key)
        const current = periodCustomerMap.get(key) || { name: o.customer_name || "Cliente", total: 0, count: 0, lastOrderDate: "" }
        current.total += money(o.total_amount)
        current.count += 1
        const orderDate = String(o.created_at || "").slice(0, 10)
        if (orderDate > current.lastOrderDate) current.lastOrderDate = orderDate
        periodCustomerMap.set(key, current)
      }

      const activeCustomers = periodCustomerSet.size
      const totalRevenue = Array.from(periodCustomerMap.values()).reduce((a, c) => a + c.total, 0)
      const avgTicket = activeCustomers > 0 ? totalRevenue / activeCustomers : 0

      // Previous period
      const prevCustomerSet = new Set<string>()
      let prevRevenue = 0
      for (const o of prevOrders) {
        prevCustomerSet.add(o.customer_id || o.customer_name || "anon")
        prevRevenue += money(o.total_amount)
      }
      const prevActive = prevCustomerSet.size
      const previousAvgTicket = prevActive > 0 ? prevRevenue / prevActive : 0

      // ─── Recurring customers (bought in both current AND previous period) ───
      const recurringCustomers = [...periodCustomerSet].filter(c => prevCustomerSet.has(c)).length

      // ─── Inactive customers (have orders but last order > 90 days ago) ───
      const allCustomerIds = new Set<string>()
      for (const o of allOrders) {
        allCustomerIds.add(o.customer_id || o.customer_name || "anon")
      }
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 90)
      const customerLastOrder = new Map<string, string>()
      for (const o of allOrders) {
        const key = o.customer_id || o.customer_name || "anon"
        const orderDate = String(o.created_at || "").slice(0, 10)
        const existing = customerLastOrder.get(key)
        if (!existing || orderDate > existing) customerLastOrder.set(key, orderDate)
      }
      const inactiveCustomers = [...customerLastOrder.entries()]
        .filter(([_, date]) => date < cutoffDate.toISOString().slice(0, 10))
        .length

      // ─── Inactive customer list (top 6 by order count) ───
      const inactiveCustomerList = [...customerLastOrder.entries()]
        .filter(([_, date]) => date < cutoffDate.toISOString().slice(0, 10))
        .map(([key, lastOrder]) => {
          const data = lifetimeMap.get(key) || { name: key, total: 0, count: 0 }
          return { id: key, label: data.name, value: brl(data.total), subtitle: `Último pedido: ${lastOrder}`, orders: data.count }
        })
        .sort((a, b) => b.orders - a.orders)
        .slice(0, 6)

      // ─── Purchase frequency (avg orders per active customer in period) ───
      const totalOrdersInPeriod = periodOrders.length
      const purchaseFrequency = activeCustomers > 0
        ? Math.round((totalOrdersInPeriod / activeCustomers) * 10) / 10
        : 0

      // ─── Avg days between purchases ───
      const customerDates = new Map<string, string[]>()
      for (const o of allOrders) {
        const key = o.customer_id || o.customer_name || "anon"
        const prev = customerDates.get(key) || []
        prev.push(String(o.created_at || "").slice(0, 10))
        customerDates.set(key, prev)
      }
      let totalGaps = 0
      let gapCount = 0
      for (const [_, dates] of customerDates) {
        if (dates.length < 2) continue
        const sorted = dates.sort()
        for (let i = 1; i < sorted.length; i++) {
          totalGaps += (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000
          gapCount++
        }
      }
      const avgDaysBetweenPurchases = gapCount > 0 ? Math.round(totalGaps / gapCount) : 0

      // Top customers (current period)
      const topCustomers = Array.from(periodCustomerMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8)
        .map(([id, data]) => ({
          id,
          label: data.name,
          value: brl(data.total),
          subtitle: `${data.count} pedido${data.count > 1 ? "s" : ""}`,
          orders: data.count,
        }))

      // ─── VIP customers (top 5 by lifetime value) ───
      const lifetimeMap = new Map<string, { name: string; total: number; count: number }>()
      for (const o of allOrders) {
        const key = o.customer_id || o.customer_name || "anon"
        const current = lifetimeMap.get(key) || { name: o.customer_name || "Cliente", total: 0, count: 0 }
        current.total += money(o.total_amount)
        current.count += 1
        lifetimeMap.set(key, current)
      }
      const vipCustomers = Array.from(lifetimeMap.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([id, data]) => ({
          id,
          label: data.name,
          value: brl(data.total),
          orders: data.count,
        }))

      // Evolution
      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")

      const ativosByDate = new Map<string, Set<string>>()
      const novosByDate = new Map<string, number>()
      for (const o of periodOrders) {
        const k = String(o.created_at || "").slice(0, 10)
        if (!ativosByDate.has(k)) ativosByDate.set(k, new Set())
        ativosByDate.get(k)!.add(o.customer_id || o.customer_name || "anon")
      }
      for (const c of customers) {
        const k = String(c.created_at || "").slice(0, 10)
        novosByDate.set(k, (novosByDate.get(k) || 0) + 1)
      }

      const customerEvolution = Array.from({ length: daysInPeriod }, (_, i) => {
        const date = new Date(todayDate)
        date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
        const key = date.toISOString().slice(0, 10)
        return {
          label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          ativos: ativosByDate.get(key)?.size || 0,
          novos: novosByDate.get(key) || 0,
        }
      })

      return {
        totalCustomers,
        newCustomers,
        activeCustomers,
        recurringCustomers,
        inactiveCustomers,
        avgTicket,
        avgTicketFormatted: brl(avgTicket),
        previousAvgTicket,
        purchaseFrequency,
        avgDaysBetweenPurchases,
        topCustomers,
        vipCustomers,
        inactiveCustomerList,
        customerEvolution,
        customerRanking: Array.from(periodCustomerMap.entries())
          .map(([id, data]) => ({ id, label: data.name, orders: data.count, revenue: data.total, lastOrderDate: data.lastOrderDate }))
          .sort((a, b) => b.revenue - a.revenue),
      }
    },
    [`report-customers-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.clientes(partnerId, period)], revalidate: 120 }
  )()
})

export async function getCustomerReportData(partnerId: string, period: Period = "monthly") {
  return getCachedCustomerData(partnerId, period)
}
