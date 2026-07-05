import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface ProductivityReportData {
  staffRanking: { id: string; label: string; value: string; appointments: number; revenue: number; cancelled: number; ticketMedio?: number }[]
  serviceRanking: { id: string; label: string; value: string; count: number }[]
  dailyEvolution: { label: string; atendimentos: number; receita: number }[]
  metrics: {
    totalAppointments: number
    totalRevenue: number
    totalRevenueFormatted: string
    avgDuration: number
    attendanceRate: number
    avgTicketPerStaff: number
  }
}

const getCachedProductivityData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from } = getDateRangeWithPrevious(period)

      const appointmentsResult = await supabase
        .from("appointments")
        .select("id, customer_name, service_name, staff_name, price, duration_minutes, status, start_date, source")
        .eq("partner_id", partnerId)
        .gte("start_date", from)
        .neq("source", "unavailable")
        .order("start_date", { ascending: false })
        .limit(500)

      if (appointmentsResult.error) throw appointmentsResult.error

      const rows = appointmentsResult.data || []
      let completedCount = 0, cancelledCount = 0, totalRevenue = 0, durationSum = 0, durationCount = 0
      const byStaff = new Map<string, { appointments: number; revenue: number; cancelled: number }>()
      const byService = new Map<string, { count: number; revenue: number }>()

      for (const a of rows) {
        const status = String(a.status || "").toLowerCase()
        const isCompleted = ["paid", "pago", "completed", "concluído", "concluido", "confirmed", "confirmado"].includes(status)
        const isCancelled = status.includes("cancel")

        if (isCompleted) {
          completedCount++
          totalRevenue += money(a.price)
          if (a.duration_minutes) {
            durationSum += Number(a.duration_minutes)
            durationCount++
          }

          const staffName = a.staff_name || "Sem profissional"
          const staffData = byStaff.get(staffName) || { appointments: 0, revenue: 0, cancelled: 0 }
          staffData.appointments += 1
          staffData.revenue += money(a.price)
          byStaff.set(staffName, staffData)

          const svcName = a.service_name || "Serviço"
          const svcData = byService.get(svcName) || { count: 0, revenue: 0 }
          svcData.count += 1
          svcData.revenue += money(a.price)
          byService.set(svcName, svcData)
        }

        if (isCancelled) {
          cancelledCount++
          const staffName = a.staff_name || "Sem profissional"
          const staffData = byStaff.get(staffName) || { appointments: 0, revenue: 0, cancelled: 0 }
          staffData.cancelled += 1
          byStaff.set(staffName, staffData)
        }
      }

      const totalAppointments = rows.length
      const attendanceRate = totalAppointments > 0
        ? Math.round(((totalAppointments - cancelledCount) / totalAppointments) * 100)
        : 0
      const avgDuration = durationCount > 0 ? Math.round(durationSum / durationCount) : 0

      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")

      const evoCountMap = new Map<string, number>()
      const evoRevenueMap = new Map<string, number>()
      const paidStatuses = ["paid", "pago", "completed", "concluído", "concluido"]
      for (const a of rows) {
        const k = String(a.start_date || "").slice(0, 10)
        evoCountMap.set(k, (evoCountMap.get(k) || 0) + 1)
        const status = String(a.status || "").toLowerCase()
        if (paidStatuses.includes(status)) {
          evoRevenueMap.set(k, (evoRevenueMap.get(k) || 0) + money(a.price))
        }
      }

      const dailyEvolution = Array.from({ length: daysInPeriod }, (_, i) => {
        const date = new Date(todayDate)
        date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
        const key = date.toISOString().slice(0, 10)
        return {
          label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          atendimentos: evoCountMap.get(key) || 0,
          receita: evoRevenueMap.get(key) || 0,
        }
      })

      return {
        staffRanking: Array.from(byStaff.entries())
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, 8)
          .map(([name, data]) => ({
            id: name,
            label: name,
            value: brl(data.revenue),
            appointments: data.appointments,
            revenue: data.revenue,
            cancelled: data.cancelled,
            ticketMedio: data.appointments > 0 ? Math.round(data.revenue / data.appointments) : 0,
          })),
        serviceRanking: Array.from(byService.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 8)
          .map(([name, data]) => ({
            id: name,
            label: name,
            value: `${data.count} atendimento${data.count > 1 ? "s" : ""}`,
            count: data.count,
          })),
        dailyEvolution,
        metrics: {
          totalAppointments,
          totalRevenue,
          totalRevenueFormatted: brl(totalRevenue),
          avgDuration,
          attendanceRate,
          avgTicketPerStaff: completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0,
        },
      }
    },
    [`report-productivity-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.produtividade(partnerId, period)], revalidate: 120 }
  )()
})

export async function getProductivityReportData(partnerId: string, period: Period = "monthly") {
  return getCachedProductivityData(partnerId, period)
}
