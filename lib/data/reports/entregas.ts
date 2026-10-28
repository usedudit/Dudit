import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"
import { scopeQueryToStores } from "@/lib/data/store-scope"

export interface DeliveryReportData {
  metrics: {
    total: number
    pending: number
    sent: number
    delivered: number
    late: number
    onTimeRate: number
    avgTimeMinutes: number
    previousAvgTimeMinutes: number
  }
  byStatus: { label: string; value: number }[]
  evolution: { label: string; value: number; secondary: number }[]
  recentDeliveries: { id: string; status: string; statusKey?: string; date: string; duration?: string; deliveryPerson?: string }[]
  deliveryPersonRanking: { id: string; name: string; deliveries: number; status: string }[]
}

const getCachedDeliveryData = cache(async (partnerId: string, period: Period = "monthly", storeId = "") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const periodQuery = supabase.from("deliveries").select("id, status, started_at, delivered_at, estimated_duration_minutes, created_at, delivery_person_id, orders!inner(store_id)").eq("partner_id", partnerId)
      const previousQuery = supabase.from("deliveries").select("id, status, started_at, delivered_at, created_at, orders!inner(store_id)").eq("partner_id", partnerId)
      if (storeId) {
        scopeQueryToStores(periodQuery, storeId, "orders.store_id")
        scopeQueryToStores(previousQuery, storeId, "orders.store_id")
      }
      const [periodDeliveriesResult, prevDeliveriesResult] = await Promise.all([
        periodQuery
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        previousQuery
          .gte("created_at", `${previousFrom}T00:00:00`)
          .lt("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
      ])

      if (periodDeliveriesResult.error) throw periodDeliveriesResult.error

      const periodDeliveries = periodDeliveriesResult.data || []
      const prevDeliveries = prevDeliveriesResult.data || []

      let pending = 0, sent = 0, delivered = 0, late = 0
      let completedTimeSum = 0, completedCount = 0
      for (const d of periodDeliveries) {
        const status = String(d.status || "").toLowerCase()
        if (["pending", "not_sent", "preparing"].includes(status)) {
          pending++
          if (String(d.created_at || "").slice(0, 10) < today) late++
        } else if (status === "sent") {
          sent++
          if (String(d.created_at || "").slice(0, 10) < today) late++
        } else if (["delivered", "completed"].includes(status)) {
          delivered++
        }
        if (d.started_at && d.delivered_at) {
          const start = new Date(d.started_at).getTime()
          const end = new Date(d.delivered_at).getTime()
          completedTimeSum += Math.round((end - start) / 60000)
          completedCount++
        }
      }

      let prevTimeSum = 0, prevCompletedCount = 0
      for (const d of prevDeliveries) {
        if (d.started_at && d.delivered_at) {
          const start = new Date(d.started_at).getTime()
          const end = new Date(d.delivered_at).getTime()
          prevTimeSum += Math.round((end - start) / 60000)
          prevCompletedCount++
        }
      }

      const avgTimeMinutes = completedCount > 0 ? Math.round(completedTimeSum / completedCount) : 0
      const previousAvgTimeMinutes = prevCompletedCount > 0 ? Math.round(prevTimeSum / prevCompletedCount) : 0
      const onTimeRate = periodDeliveries.length > 0
        ? Math.round(((periodDeliveries.length - late) / periodDeliveries.length) * 100)
        : 0

      const statusLabels: Record<string, string> = {
        pending: "Pendente",
        not_sent: "Não enviado",
        preparing: "Preparando",
        sent: "Saiu p/ entrega",
        delivered: "Entregue",
        completed: "Concluído",
        cancelled: "Cancelado",
        returning: "Em devolução",
        returned: "Devolvido",
        delivery_failed: "Falha na entrega",
        failed: "Falhou",
        rescheduled: "Reagendado",
        in_transit: "Em trânsito",
        out_for_delivery: "Saiu para entrega",
      }

      const byStatus = new Map<string, number>()
      for (const d of periodDeliveries) {
        const s = statusLabels[String(d.status || "").toLowerCase()] || d.status || "Outro"
        byStatus.set(s, (byStatus.get(s) || 0) + 1)
      }

      const personIds = [...new Set(periodDeliveries.map((d: any) => d.delivery_person_id).filter(Boolean))]
      let personNameMap = new Map<string, string>()
      if (personIds.length > 0) {
        const puResult = await supabase.from("partner_users").select("id, user_id").in("id", personIds)
        if (!puResult.error && puResult.data) {
          const userIds = [...new Set(puResult.data.map((pu: any) => pu.user_id).filter(Boolean))]
          if (userIds.length > 0) {
            const upResult = await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
            if (!upResult.error && upResult.data) {
              const userIdToName = new Map(upResult.data.map((u: any) => [u.user_id, u.full_name]))
              for (const pu of puResult.data) {
                const name = userIdToName.get(pu.user_id)
                if (name) personNameMap.set(pu.id, name as string)
              }
            }
          }
        }
      }
      const personDeliveryCount = new Map<string, number>()
      for (const d of periodDeliveries) {
        if (d.delivery_person_id) {
          personDeliveryCount.set(d.delivery_person_id, (personDeliveryCount.get(d.delivery_person_id) || 0) + 1)
        }
      }
      const deliveryPersonRanking = Array.from(personDeliveryCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, count]) => ({
          id,
          name: personNameMap.get(id) || "Entregador",
          deliveries: count,
          status: (count > 1 && personDeliveryCount.size > 1) ? "Ativo" : "Único",
        }))

      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")

      const currentDateMap = new Map<string, number>()
      const prevDateMap = new Map<string, number>()
      for (const d of periodDeliveries) {
        const k = String(d.created_at || "").slice(0, 10)
        currentDateMap.set(k, (currentDateMap.get(k) || 0) + 1)
      }
      for (const d of prevDeliveries) {
        const k = String(d.created_at || "").slice(0, 10)
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
          total: periodDeliveries.length,
          pending,
          sent,
          delivered,
          late,
          onTimeRate,
          avgTimeMinutes,
          previousAvgTimeMinutes,
        },
        byStatus: Array.from(byStatus.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        evolution,
        recentDeliveries: periodDeliveries.map((d: any) => ({
          id: d.id,
          status: statusLabels[String(d.status || "").toLowerCase()] || d.status || "-",
          statusKey: String(d.status || "").toLowerCase(),
          date: new Date(d.created_at).toLocaleDateString("pt-BR"),
          duration: d.estimated_duration_minutes ? `${d.estimated_duration_minutes}min` : undefined,
          deliveryPerson: d.delivery_person_id ? personNameMap.get(d.delivery_person_id) || "Sem nome" : "Não atribuído",
        })),
        deliveryPersonRanking,
      }
    },
    [`report-deliveries-${partnerId}-${period}-${storeId || "all"}`],
    { tags: [REPORT_TAGS.entregas(partnerId, period)], revalidate: 120 }
  )()
})

export async function getDeliveryReportData(partnerId: string, period: Period = "monthly", storeId = "") {
  return getCachedDeliveryData(partnerId, period, storeId)
}
