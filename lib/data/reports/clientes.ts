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
  avgTicket: number
  avgTicketFormatted: string
  previousAvgTicket: number
  topCustomers: { id: string; label: string; value: string; subtitle?: string; orders: number }[]
  customerEvolution: { label: string; ativos: number; novos: number }[]
}

const getCachedCustomerData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const [customersResult, periodOrdersResult, prevOrdersResult] = await Promise.all([
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
      ])

      if (customersResult.error) throw customersResult.error
      if (periodOrdersResult.error) throw periodOrdersResult.error

      const customers = customersResult.data || []
      const periodOrders = periodOrdersResult.data || []
      const prevOrders = prevOrdersResult.data || []

      const totalCustomers = customers.length
      const newCustomers = customers.filter((c: any) => {
        const d = String(c.created_at || "").slice(0, 10)
        return d >= from
      }).length

      const periodCustomers = new Set<string>()
      const customerRevenue = new Map<string, { name: string; total: number; count: number }>()
      for (const o of periodOrders) {
        const key = o.customer_id || o.customer_name || "anon"
        periodCustomers.add(key)
        const current = customerRevenue.get(key) || { name: o.customer_name || "Cliente", total: 0, count: 0 }
        current.total += money(o.total_amount)
        current.count += 1
        customerRevenue.set(key, current)
      }

      const activeCustomers = periodCustomers.size
      const totalRevenue = Array.from(customerRevenue.values()).reduce((a, c) => a + c.total, 0)
      const avgTicket = activeCustomers > 0 ? totalRevenue / activeCustomers : 0

      const prevPeriodCustomers = new Set<string>()
      let prevRevenue = 0
      for (const o of prevOrders) {
        prevPeriodCustomers.add(o.customer_id || o.customer_name || "anon")
        prevRevenue += money(o.total_amount)
      }
      const prevActive = prevPeriodCustomers.size
      const previousAvgTicket = prevActive > 0 ? prevRevenue / prevActive : 0

      const topCustomers = Array.from(customerRevenue.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8)
        .map(([id, data]) => ({
          id,
          label: data.name,
          value: brl(data.total),
          subtitle: `${data.count} pedido${data.count > 1 ? "s" : ""}`,
          orders: data.count,
        }))

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
        avgTicket,
        avgTicketFormatted: brl(avgTicket),
        previousAvgTicket,
        topCustomers,
        customerEvolution,
      }
    },
    [`report-customers-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.clientes(partnerId, period)], revalidate: 120 }
  )()
})

export async function getCustomerReportData(partnerId: string, period: Period = "monthly") {
  return getCachedCustomerData(partnerId, period)
}
