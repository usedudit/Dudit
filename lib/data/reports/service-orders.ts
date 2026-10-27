import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface ServiceOrderReportData {
  metrics: {
    total: number
    open: number
    inProgress: number
    completed: number
    cancelled: number
    totalRevenue: number
    totalRevenueFormatted: string
  }
  byStatus: { label: string; value: number }[]
  evolution: { label: string; value: number; secondary: number }[]
  assigneeRanking: { id: string; name: string; count: number; revenue: number }[]
  recentOrders: { id: string; orderNumber: string; title: string; status: string; statusKey?: string; total: string; date: string }[]
}

const STATUS_LABELS: Record<string, string> = {
  aberta: "Aberta",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovada: "Aprovada",
  em_andamento: "Em Andamento",
  aguardando_peca: "Aguardando Peça",
  concluida: "Concluída",
  entregue: "Entregue",
  cancelada: "Cancelada",
  pausada: "Pausada",
  em_revisao: "Em Revisão",
  aprovacao_pendente: "Aprovação Pendente",
  orcamento: "Orçamento",
  em_execucao: "Em Execução",
  aguardando_retirada: "Aguardando Retirada",
}

const getCachedServiceOrdersData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const [periodResult, prevResult] = await Promise.all([
        supabase
          .from("service_orders")
          .select("id, order_number, title, status, total_amount, assigned_user_id, created_at, completed_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("service_orders")
          .select("id, total_amount, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${previousFrom}T00:00:00`)
          .lt("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
      ])

      if (periodResult.error) throw periodResult.error

      const periodData = periodResult.data || []
      const prevData = prevResult.data || []

      let open = 0, inProgress = 0, completed = 0, cancelled = 0, totalRevenue = 0
      const statusCounter = new Map<string, number>()
      const assigneeMap = new Map<string, { count: number; revenue: number }>()

      for (const o of periodData) {
        const status = String(o.status || "").toLowerCase()
        statusCounter.set(status, (statusCounter.get(status) || 0) + 1)

        if (status === "aberta" || status === "aguardando_aprovacao" || status === "aprovada") open++
        else if (status === "em_andamento" || status === "aguardando_peca") inProgress++
        else if (status === "concluida" || status === "entregue") { completed++; totalRevenue += money(o.total_amount) }
        else if (status === "cancelada") cancelled++

        if (o.assigned_user_id) {
          const cur = assigneeMap.get(o.assigned_user_id) || { count: 0, revenue: 0 }
          cur.count++
          cur.revenue += money(o.total_amount)
          assigneeMap.set(o.assigned_user_id, cur)
        }
      }

      const userIds = [...new Set(periodData.map((o: any) => o.assigned_user_id).filter(Boolean))]
      let userNameMap = new Map<string, string>()
      if (userIds.length > 0) {
        const upResult = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
        if (!upResult.error && upResult.data) {
          userNameMap = new Map(upResult.data.map((u: any) => [u.user_id, u.full_name]))
        }
      }

      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")

      const currentDateMap = new Map<string, number>()
      const prevDateMap = new Map<string, number>()
      for (const o of periodData) {
        const k = String(o.created_at || "").slice(0, 10)
        currentDateMap.set(k, (currentDateMap.get(k) || 0) + 1)
      }
      for (const o of prevData) {
        const k = String(o.created_at || "").slice(0, 10)
        prevDateMap.set(k, (prevDateMap.get(k) || 0) + 1)
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

      return {
        metrics: {
          total: periodData.length,
          open,
          inProgress,
          completed,
          cancelled,
          totalRevenue,
          totalRevenueFormatted: brl(totalRevenue),
        },
        byStatus: Array.from(statusCounter.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([key, value]) => ({ label: STATUS_LABELS[key] || key, value })),
        evolution,
        assigneeRanking: Array.from(assigneeMap.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 8)
          .map(([userId, data]) => ({
            id: userId,
            name: userNameMap.get(userId) || "Sem nome",
            count: data.count,
            revenue: data.revenue,
          })),
        recentOrders: periodData.map((o: any) => ({
          id: o.id,
          orderNumber: o.order_number || "-",
          title: o.title || "Sem título",
          status: STATUS_LABELS[String(o.status || "").toLowerCase()] || o.status || "-",
          statusKey: String(o.status || "").toLowerCase(),
          total: brl(money(o.total_amount)),
          date: new Date(o.created_at).toLocaleDateString("pt-BR"),
        })),
      }
    },
    [`report-service-orders-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.ordensServico(partnerId, period)], revalidate: 120 }
  )()
})

export async function getServiceOrderReportData(partnerId: string, period: Period = "monthly") {
  return getCachedServiceOrdersData(partnerId, period)
}
