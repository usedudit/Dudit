import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface SalesReportData {
  metrics: {
    revenue: number
    revenueFormatted: string
    revenueTrend: string
    orderCount: number
    orderTrend: string
    ticketMedio: number
    ticketFormatted: string
    ticketTrend: string
  }
  bySource: { label: string; value: number }[]
  byPaymentMethod: { label: string; value: number }[]
  evolution: { label: string; value: number; secondary: number }[]
  topProducts: { id: string; label: string; value: number; subtitle?: string }[]
}

const getCachedSalesData = cache(async (partnerId: string, period: Period = "monthly"): Promise<SalesReportData> => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const [currentOrdersResult, prevOrdersResult, itemsResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total_amount, order_source, payment_method, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("orders")
          .select("id, total_amount, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${previousFrom}T00:00:00`)
          .lt("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("order_items")
          .select("product_name, quantity, created_at, orders!inner(partner_id, total_amount)")
          .eq("orders.partner_id", partnerId)
          .gte("created_at", `${from}T00:00:00`)
          .limit(500),
      ])

      if (currentOrdersResult.error) throw currentOrdersResult.error

      const periodOrders = currentOrdersResult.data || []
      const prevOrders = prevOrdersResult.data || []

      const revenue = periodOrders.reduce((a: number, o: any) => a + money(o.total_amount), 0)
      const prevRevenue = prevOrders.reduce((a: number, o: any) => a + money(o.total_amount), 0)
      const ticketMedio = periodOrders.length > 0 ? revenue / periodOrders.length : 0
      const prevTicket = prevOrders.length > 0 ? prevRevenue / prevOrders.length : 0

      const revenueTrend = prevRevenue > 0 ? `${Math.round(((revenue - prevRevenue) / prevRevenue) * 100)}%` : "nova"
      const orderTrend = prevOrders.length > 0
        ? `${Math.round(((periodOrders.length - prevOrders.length) / prevOrders.length) * 100)}%`
        : "nova"
      const ticketTrend = prevTicket > 0
        ? `${Math.round(((ticketMedio - prevTicket) / prevTicket) * 100)}%`
        : "nova"

      const bySource = new Map<string, number>()
      for (const o of periodOrders) {
        const src = String(o.order_source || "Manual")
        bySource.set(src, (bySource.get(src) || 0) + money(o.total_amount))
      }

      const byPayment = new Map<string, number>()
      for (const o of periodOrders) {
        const pm = String(o.payment_method || "Outro")
        byPayment.set(pm, (byPayment.get(pm) || 0) + money(o.total_amount))
      }

      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")

      const currentDateMap = new Map<string, number>()
      const prevDateMap = new Map<string, number>()
      for (const o of periodOrders) {
        const k = String(o.created_at || "").slice(0, 10)
        currentDateMap.set(k, (currentDateMap.get(k) || 0) + money(o.total_amount))
      }
      for (const o of prevOrders) {
        const k = String(o.created_at || "").slice(0, 10)
        prevDateMap.set(k, (prevDateMap.get(k) || 0) + money(o.total_amount))
      }

      const evolution = Array.from({ length: daysInPeriod }, (_, i) => {
        const date = new Date(todayDate)
        date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
        const key = date.toISOString().slice(0, 10)
        const prevKey = new Date(date.getTime() - daysInPeriod * 86400000).toISOString().slice(0, 10)
        return {
          label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          value: currentDateMap.get(key) || 0,
          secondary: prevDateMap.get(prevKey) || 0,
        }
      })

      const itemRows = itemsResult.data || []
      const prodMap = new Map<string, number>()
      for (const item of itemRows) {
        const name = item.product_name || "Produto"
        prodMap.set(name, (prodMap.get(name) || 0) + money(item.quantity))
      }
      const topProducts = Array.from(prodMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, value], i) => ({
          id: label,
          label,
          value,
          subtitle: `${i + 1}º em vendas`,
        }))

      return {
        metrics: {
          revenue,
          revenueFormatted: brl(revenue),
          revenueTrend,
          orderCount: periodOrders.length,
          orderTrend,
          ticketMedio,
          ticketFormatted: brl(ticketMedio),
          ticketTrend,
        },
        bySource: Array.from(bySource.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        byPaymentMethod: Array.from(byPayment.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        evolution,
        topProducts,
      }
    },
    [`report-sales-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.vendas(partnerId, period)], revalidate: 120 }
  )()
})

export async function getSalesReportData(partnerId: string, period: Period = "monthly") {
  return getCachedSalesData(partnerId, period)
}
