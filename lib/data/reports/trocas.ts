import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface ReturnsReportData {
  returnCount: number
  returnRate: number
  previousReturnRate: number
  totalRefunded: number
  totalRefundedFormatted: string
  byReason: { label: string; value: number }[]
  byStatus: { label: string; value: number }[]
  recentReturns: { id: string; customer: string; reason: string; amount: string; status: string; date: string }[]
  returnEvolution: { label: string; value: number }[]
  topReturnedProducts: { productName: string; count: number; totalQuantity: number }[]
}

const fetchReturnsDataStatic = unstable_cache(
  async (partnerId: string, period: Period) => {
    const supabase = createAdminClient()
    const { today, from, previousFrom } = getDateRangeWithPrevious(period)

    const [periodReturnsResult, prevReturnsResult, ordersResult, prevOrdersResult] = await Promise.all([
      supabase
        .from("return_requests")
        .select("id, customer_name_snapshot, reason, customer_reason, status, refund_amount, order_total_snapshot, created_at")
        .eq("partner_id", partnerId)
        .gte("created_at", `${from}T00:00:00`)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("return_requests")
        .select("id, customer_name_snapshot, reason, customer_reason, status, refund_amount, order_total_snapshot, created_at")
        .eq("partner_id", partnerId)
        .gte("created_at", `${previousFrom}T00:00:00`)
        .lt("created_at", `${from}T00:00:00`)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .gte("created_at", `${from}T00:00:00`),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .gte("created_at", `${previousFrom}T00:00:00`)
        .lt("created_at", `${from}T00:00:00`),
    ])

    if (periodReturnsResult.error) throw periodReturnsResult.error

    const periodReturns = periodReturnsResult.data || []
    const prevReturns = prevReturnsResult.data || []

    const totalOrders = ordersResult.count || 0
    const prevOrdersCount = prevOrdersResult.count || 0

    const returnCount = periodReturns.length
    const returnRate = totalOrders > 0 ? Math.round((returnCount / totalOrders) * 100) : 0
    const previousReturnRate = prevOrdersCount > 0 ? Math.round((prevReturns.length / prevOrdersCount) * 100) : 0

    const totalRefunded = periodReturns.reduce((a: number, r: any) => a + money(r.refund_amount ?? r.order_total_snapshot), 0)

    const byReason = new Map<string, number>()
    for (const r of periodReturns) {
      const reason = r.reason || r.customer_reason || "Outro"
      byReason.set(reason, (byReason.get(reason) || 0) + 1)
    }

    const byStatus = new Map<string, number>()
    for (const r of periodReturns) {
      byStatus.set(r.status || "pending", (byStatus.get(r.status || "pending") || 0) + 1)
    }

    const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
    const todayDate = new Date(today + "T12:00:00Z")
    const returnDateMap = new Map<string, number>()
    for (const r of periodReturns) {
      const k = String(r.created_at || "").slice(0, 10)
      returnDateMap.set(k, (returnDateMap.get(k) || 0) + 1)
    }
    const returnEvolution = Array.from({ length: daysInPeriod }, (_, i) => {
      const date = new Date(todayDate)
      date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
      const key = date.toISOString().slice(0, 10)
      return {
        label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        value: returnDateMap.get(key) || 0,
      }
    })

    const returnIds = periodReturns.map((r: any) => r.id)
    let topReturnedProducts: { productName: string; count: number; totalQuantity: number }[] = []
    if (returnIds.length > 0) {
      const { data: items } = await supabase
        .from("return_items")
        .select("product_name_snapshot, quantity")
        .in("return_request_id", returnIds)
      if (items) {
        const prodMap = new Map<string, { count: number; totalQuantity: number }>()
        for (const item of items) {
          const name = item.product_name_snapshot || "Produto"
          const cur = prodMap.get(name) || { count: 0, totalQuantity: 0 }
          prodMap.set(name, { count: cur.count + 1, totalQuantity: cur.totalQuantity + (item.quantity || 1) })
        }
        topReturnedProducts = Array.from(prodMap.entries())
          .map(([productName, data]) => ({ productName, ...data }))
          .sort((a, b) => b.totalQuantity - a.totalQuantity)
          .slice(0, 5)
      }
    }

    const reasonLabels: Record<string, string> = {
      defective: "Defeito / Avaria",
      wrong_item: "Item Errado",
      regret: "Arrependimento",
      size_fit: "Tamanho / Caimento",
      other: "Outro",
    }

    const statusLabels: Record<string, string> = {
      pending: "Pendente",
      approved: "Aprovado",
      rejected: "Recusado",
      completed: "Concluído",
      cancelled: "Cancelado",
    }

    return {
      returnCount,
      returnRate,
      previousReturnRate,
      totalRefunded,
      totalRefundedFormatted: brl(totalRefunded),
      byReason: Array.from(byReason.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => ({ label: reasonLabels[key] || key, value })),
      byStatus: Array.from(byStatus.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => ({ label: statusLabels[key] || key, value })),
      recentReturns: periodReturns.slice(0, 8).map((r: any) => ({
        id: r.id,
        customer: r.customer_name_snapshot || "Cliente",
        reason: reasonLabels[r.reason] || r.reason || r.customer_reason || "Outro",
        amount: brl(money(r.refund_amount ?? r.order_total_snapshot)),
        status: statusLabels[r.status] || r.status,
        date: new Date(r.created_at).toLocaleDateString("pt-BR"),
      })),
      returnEvolution,
      topReturnedProducts,
    }
  },
  ["report-returns-static"],
  { tags: ["reports"], revalidate: 120 }
)

const getCachedReturnsData = cache(async (partnerId: string, period: Period = "monthly") => {
  return fetchReturnsDataStatic(partnerId, period)
})

export async function getReturnsReportData(partnerId: string, period: Period = "monthly") {
  return getCachedReturnsData(partnerId, period)
}
