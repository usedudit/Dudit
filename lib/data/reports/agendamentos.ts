import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"
import type { Metric, DashboardListItem } from "../dashboard"
import { scopeQueryToStores } from "@/lib/data/store-scope"

export interface AppointmentsReportData {
  metrics: Metric[]
  statusBreakdown: { label: string; value: number }[]
  dailyEvolution: { label: string; value: number; secondary: number }[]
  hourlyDistribution: { label: string; value: number }[]
  servicePopularity: { label: string; value: number }[]
  sourceBreakdown: { label: string; value: number }[]
  recentAppointments: DashboardListItem[]
  staffPerformance: { id: string; label: string; value: string; appointments: number; cancelled: number }[]
  appointmentDetails: { id: string; customer: string; service: string; staff: string; date: string; time: string; status: string; price: number; duration: number }[]
  repeatCustomerRate: number
  avgDuration: number
  attendanceRate: number
}

const getCachedAppointmentsData = cache(async (partnerId: string, period: Period = "monthly", storeId = ""): Promise<AppointmentsReportData> => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const currentQuery = supabase.from("appointments").select("id, customer_name, service_name, staff_name, price, duration_minutes, status, start_date, start_time, source").eq("partner_id", partnerId)
      const previousQuery = supabase.from("appointments").select("id, status, start_date, price").eq("partner_id", partnerId)
      if (storeId) {
        scopeQueryToStores(currentQuery, storeId)
        scopeQueryToStores(previousQuery, storeId)
      }
      const [currentResult, previousResult] = await Promise.all([
        currentQuery
          .gte("start_date", from)
          .neq("source", "unavailable")
          .order("start_date", { ascending: false })
          .order("start_time")
          .limit(600),
        previousQuery
          .gte("start_date", previousFrom)
          .lt("start_date", from)
          .neq("source", "unavailable")
          .limit(600),
      ])

      if (currentResult.error) throw currentResult.error
      if (previousResult.error) throw previousResult.error

      const rows = currentResult.data || []
      const prevRows = previousResult.data || []

      const normalizeStatus = (s: string): string => {
        const lower = s.toLowerCase()
        if (lower.includes("cancel")) return "Cancelado"
        if (lower.includes("ausên") || lower.includes("ausencia") || lower.includes("missed") || lower.includes("no_show") || lower.includes("faltou")) return "Ausência"
        if (lower.includes("pago") || lower.includes("paid") || lower.includes("conclu")) return "Concluído"
        if (lower.includes("andamento") || lower.includes("iniciado") || lower.includes("started")) return "Em andamento"
        if (lower.includes("confirm")) return "Confirmado"
        if (lower.includes("aguard")) return "Aguardando"
        if (lower.includes("reservado") || lower.includes("reserved")) return "Reservado"
        return "Agendado"
      }

      let completedCount = 0
      let cancelledCount = 0
      let noShowCount = 0
      let pendingCount = 0
      let inProgressCount = 0
      let totalRevenue = 0
      let durationSum = 0
      let durationCount = 0

      const statusCount = new Map<string, number>()
      const byHour = new Map<string, number>()
      const byService = new Map<string, number>()
      const bySource = new Map<string, number>()
      const byStaff = new Map<string, { count: number; cancelled: number }>()
      const customerCount = new Map<string, number>()

      for (const a of rows) {
        const status = normalizeStatus(String(a.status || ""))
        statusCount.set(status, (statusCount.get(status) || 0) + 1)

        if (status === "Concluído") {
          completedCount++
          totalRevenue += money(a.price)
          if (a.duration_minutes) {
            durationSum += Number(a.duration_minutes)
            durationCount++
          }
        } else if (status === "Cancelado") {
          cancelledCount++
        } else if (status === "Ausência") {
          noShowCount++
        } else if (["Aguardando", "Confirmado", "Reservado", "Agendado"].includes(status)) {
          pendingCount++
        } else if (status === "Em andamento") {
          inProgressCount++
        }

        const hour = String(a.start_time || "").slice(0, 2)
        if (hour) byHour.set(`${hour}h`, (byHour.get(`${hour}h`) || 0) + 1)

        byService.set(a.service_name || "Sem serviço", (byService.get(a.service_name || "Sem serviço") || 0) + 1)

        const source = String(a.source || "Direto").trim() || "Direto"
        bySource.set(source, (bySource.get(source) || 0) + 1)

        const staffName = a.staff_name || "Sem profissional"
        const staffData = byStaff.get(staffName) || { count: 0, cancelled: 0 }
        staffData.count += 1
        if (status === "Cancelado") staffData.cancelled += 1
        byStaff.set(staffName, staffData)

        if (a.customer_name) {
          customerCount.set(a.customer_name.toLowerCase().trim(), (customerCount.get(a.customer_name.toLowerCase().trim()) || 0) + 1)
        }
      }

      const prevCompleted = prevRows.filter((a: any) => {
        const s = String(a.status || "").toLowerCase()
        return ["paid", "pago", "completed", "concluído", "concluido"].includes(s)
      }).length
      const prevCancelled = prevRows.filter((a: any) => String(a.status || "").toLowerCase().includes("cancel")).length

      const totalAppointments = rows.length
      const attendanceRate = totalAppointments > 0
        ? Math.round(((completedCount + pendingCount + inProgressCount) / totalAppointments) * 100)
        : 0
      const repeatCustomers = Array.from(customerCount.values()).filter(c => c > 1).length
      const repeatCustomerRate = customerCount.size > 0
        ? Math.round((repeatCustomers / customerCount.size) * 100)
        : 0

      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")
      const dateCountMap = new Map<string, number>()
      const prevDateCountMap = new Map<string, number>()
      for (const a of rows) {
        const k = String(a.start_date || "").slice(0, 10)
        dateCountMap.set(k, (dateCountMap.get(k) || 0) + 1)
      }
      for (const a of prevRows) {
        const k = String(a.start_date || "").slice(0, 10)
        prevDateCountMap.set(k, (prevDateCountMap.get(k) || 0) + 1)
      }

      const dailyEvolution = Array.from({ length: daysInPeriod }, (_, i) => {
        const date = new Date(todayDate)
        date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
        const key = date.toISOString().slice(0, 10)
        return {
          label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          value: dateCountMap.get(key) || 0,
          secondary: prevDateCountMap.get(key) || 0,
        }
      })

      const sortedHours = Array.from(byHour.entries())
        .sort((a, b) => {
          const ha = parseInt(a[0])
          const hb = parseInt(b[0])
          return ha - hb
        })

      const todayRows = rows.filter((a: any) => a.start_date === today)

      return {
        metrics: [
          { title: "Total de agendamentos", value: String(totalAppointments), trend: `${totalAppointments >= prevRows.length ? "+" : ""}${totalAppointments - prevRows.length} vs período anterior`, tone: "default" },
          { title: "Agendamentos hoje", value: String(todayRows.length), detail: `${inProgressCount} em andamento`, tone: "blue" },
          { title: "Concluídos", value: String(completedCount), detail: `${attendanceRate}% comparecimento`, tone: "green" },
          { title: "Cancelados", value: String(cancelledCount), detail: `${totalAppointments ? Math.round((cancelledCount / totalAppointments) * 100) : 0}% do total`, tone: cancelledCount > 0 ? "red" : "green" },
          { title: "Ausências", value: String(noShowCount), detail: "clientes não compareceram", tone: noShowCount > 0 ? "orange" : "green" },
          { title: "Receita total", value: brl(totalRevenue), detail: `${completedCount} atendimentos`, tone: "green" },
        ] as Metric[],
        statusBreakdown: Array.from(statusCount.entries()).map(([label, value]) => ({ label, value })),
        dailyEvolution,
        hourlyDistribution: sortedHours.map(([label, value]) => ({ label, value })),
        servicePopularity: Array.from(byService.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([label, value]) => ({ label, value })),
        sourceBreakdown: Array.from(bySource.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        recentAppointments: rows.slice(0, 10).map((a: any) => ({
          id: a.id,
          title: a.customer_name || "Cliente",
          subtitle: a.service_name || "Serviço",
          meta: `${String(a.start_date || "").slice(8, 10)}/${String(a.start_date || "").slice(5, 7)} · ${String(a.start_time || "").slice(0, 5)}`,
          value: a.staff_name || "",
          tone: normalizeStatus(String(a.status || "")) === "Cancelado" ? "red"
            : normalizeStatus(String(a.status || "")) === "Concluído" ? "green"
            : "blue",
        })),
        staffPerformance: Array.from(byStaff.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 8)
          .map(([name, data]) => ({
            id: name,
            label: name,
            value: `${data.count} atendimentos`,
            appointments: data.count,
            cancelled: data.cancelled,
          })),
        appointmentDetails: rows.map((a: any) => ({
          id: a.id,
          customer: a.customer_name || "Cliente não identificado",
          service: a.service_name || "Serviço não informado",
          staff: a.staff_name || "Sem profissional",
          date: String(a.start_date || ""),
          time: String(a.start_time || "").slice(0, 5),
          status: normalizeStatus(String(a.status || "")),
          price: money(a.price),
          duration: Number(a.duration_minutes || 0),
        })),
        repeatCustomerRate,
        avgDuration: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
        attendanceRate,
      }
    },
    [`report-appointments-${partnerId}-${period}-${storeId || "all"}`],
    { tags: [REPORT_TAGS.agendamentos(partnerId, period)], revalidate: 120 }
  )()
})

export async function getAppointmentsReportData(partnerId: string, period: Period = "monthly", storeId = "") {
  return getCachedAppointmentsData(partnerId, period, storeId)
}
