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

const getCachedReturnsData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const [periodReturnsResult, prevReturnsResult, ordersResult, prevOrdersResult] = await Promise.all([
        supabase
          .from("return_requests")
          .select("id, customer_name_snapshot, reason_code, status, refund_amount, total_amount, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("return_requests")
          .select("id, customer_name_snapshot, reason_code, status, refund_amount, total_amount, created_at")
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

      const totalRefunded = periodReturns.reduce((a: number, r: any) => a + money(r.refund_amount ?? r.total_amount), 0)

      const byReason = new Map<string, number>()
      for (const r of periodReturns) {
        const reason = r.reason_code || "Outro"
        byReason.set(reason, (byReason.get(reason) || 0) + 1)
      }

      const byStatus = new Map<string, number>()
      for (const r of periodReturns) {
        byStatus.set(r.status || "pending", (byStatus.get(r.status || "pending") || 0) + 1)
      }

      // ─── Return evolution (last daysInPeriod days) ───
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

      const periodReturnIds = periodReturns.map((r: any) => r.id)
      let topReturnedProducts: { productName: string; count: number; totalQuantity: number }[] = []
      if (periodReturnIds.length > 0) {
        const itemsResult = await supabase
          .from("return_items")
          .select("product_name_snapshot, quantity")
          .in("return_request_id", periodReturnIds)
        if (!itemsResult.error && itemsResult.data) {
          const prodMap = new Map<string, { count: number; qty: number }>()
          for (const item of itemsResult.data) {
            const name = item.product_name_snapshot || "Sem nome"
            const cur = prodMap.get(name) || { count: 0, qty: 0 }
            cur.count++
            cur.qty += Number(item.quantity || 0)
            prodMap.set(name, cur)
          }
          topReturnedProducts = Array.from(prodMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([productName, data]) => ({ productName, count: data.count, totalQuantity: data.qty }))
        }
      }

      const reasonLabels: Record<string, string> = {
        return_sla_violation: "Prazo excedido",
        return_denied_unfairly: "Recusa indevida",
        seller_abuse: "Abuso do vendedor",
        return_abuse: "Abuso na solicitação",
        scam_or_fraud: "Golpe/fraude",
        other: "Outro motivo",
      }

      const statusLabels: Record<string, string> = {
        pending: "Pendente",
        approved: "Aprovado",
        rejected: "Recusado",
        cancelled: "Cancelado",
        completed: "Concluído",
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
          reason: reasonLabels[r.reason_code] || r.reason_code,
          amount: brl(money(r.refund_amount ?? r.total_amount)),
          status: statusLabels[r.status] || r.status,
          date: new Date(r.created_at).toLocaleDateString("pt-BR"),
        })),
        returnEvolution,
        topReturnedProducts,
      }
    },
    [`report-returns-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.trocas(partnerId, period)], revalidate: 120 }
  )()
})

export async function getReturnsReportData(partnerId: string, period: Period = "monthly") {
  return getCachedReturnsData(partnerId, period)
}
