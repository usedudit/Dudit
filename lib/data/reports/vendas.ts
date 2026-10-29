import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { getDateComponents } from "@/lib/date/convert"
import { money, brl } from "@/lib/data/dashboard"
import { normalizeOrderSource } from "@/lib/orders/order-utils"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"
import { scopeQueryToStores } from "@/lib/data/store-scope"

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
    itemsSold: number
    cancellationRate: number
    cancellationRateFormatted: string
    netRevenue: number
    netRevenueFormatted: string
    estimatedGrossProfit: number
    estimatedGrossProfitFormatted: string
    grossMargin: number
    grossMarginFormatted: string
    costCoveragePct: number
    previousRevenue: number
    previousOrderCount: number
    previousTicketMedio: number
  }
  bySource: { label: string; value: number }[]
  ordersBySource: { label: string; value: number }[]
  byPaymentMethod: { label: string; value: number }[]
  evolution: { label: string; value: number; secondary: number }[]
  topProducts: { id: string; label: string; value: number; subtitle?: string }[]
  ordersByHour: { label: string; value: number }[]
  ordersByDayOfWeek: { label: string; value: number }[]
  abcCurve: { label: string; value: number; cumulative: number; category: "A" | "B" | "C" }[]
  leastSoldProducts: { id: string; label: string; value: number }[]
  productTurnover: number
  topServices: { id: string; label: string; value: number; count: number }[]
  topMarginProducts: { id: string; label: string; value: number; margin: number }[]
  detailedOrders: { id: string; orderNumber: string; customer: string; source: string; paymentMethod: string; status: string; date: string; total: number }[]
}

const getCachedSalesData = cache(async (partnerId: string, period: Period = "monthly", storeId = ""): Promise<SalesReportData> => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from, previousFrom } = getDateRangeWithPrevious(period)

      const currentOrdersQuery = supabase
          .from("orders")
          .select("id, order_number, customer_name, total_amount, order_source, payment_method, situation, created_at, discount_total, delivery_fee, amount_paid")
          .eq("partner_id", partnerId)
      const prevOrdersQuery = supabase.from("orders").select("id, total_amount, created_at").eq("partner_id", partnerId)
      const itemsQuery = supabase.from("order_items").select("product_id, product_name, quantity, net_item_value, created_at, orders!inner(partner_id)").eq("orders.partner_id", partnerId)
      const allItemsQuery = supabase.from("order_items").select("product_id, product_name, quantity, net_item_value, created_at, orders!inner(partner_id)").eq("orders.partner_id", partnerId)
      const serviceItemsQuery = supabase.from("order_items").select("product_name, quantity, net_item_value, line_type, created_at, orders!inner(partner_id)").eq("orders.partner_id", partnerId)
      if (storeId) {
        scopeQueryToStores(currentOrdersQuery, storeId)
        scopeQueryToStores(prevOrdersQuery, storeId)
        scopeQueryToStores(itemsQuery, storeId, "orders.store_id")
        scopeQueryToStores(allItemsQuery, storeId, "orders.store_id")
        scopeQueryToStores(serviceItemsQuery, storeId, "orders.store_id")
      }
      const [currentOrdersResult, prevOrdersResult, itemsResult, allItemsResult, serviceItemsResult] = await Promise.all([
        currentOrdersQuery
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        prevOrdersQuery
          .gte("created_at", `${previousFrom}T00:00:00`)
          .lt("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        itemsQuery
          .gte("created_at", `${from}T00:00:00`)
          .limit(500),
        allItemsQuery
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(300),
        serviceItemsQuery
          .in("line_type", ["service_booking"])
          .gte("created_at", `${from}T00:00:00`)
          .limit(200),
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
      const ordersBySource = new Map<string, number>()
      for (const o of periodOrders) {
        const src = normalizeOrderSource(o.order_source)
        bySource.set(src, (bySource.get(src) || 0) + money(o.total_amount))
        ordersBySource.set(src, (ordersBySource.get(src) || 0) + 1)
      }

      const normalizePaymentMethod = (raw: string): string => {
        const lower = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        if (lower.includes("pix")) return "Pix"
        if (lower.includes("credito")) return "Cartão de Crédito"
        if (lower.includes("debito")) return "Cartão de Débito"
        if (lower.includes("dinheiro") || lower.includes("cash")) return "Dinheiro"
        if (lower.includes("boleto")) return "Boleto"
        if (lower.includes("transfer")) return "Transferência"
        if (lower.includes("vale")) return "Vale"
        if (lower.includes("nao definido") || lower.includes("pendente") || lower.includes("outro")) return "Não Definido"
        return raw || "Não Definido"
      }
      const byPayment = new Map<string, number>()
      for (const o of periodOrders) {
        const pm = normalizePaymentMethod(String(o.payment_method || ""))
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
        prodMap.set(name, (prodMap.get(name) || 0) + (Number(item.quantity) || 0))
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

      // ─── Items sold ───
      const totalItemsSold = itemRows.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0)

      // ─── Cancellation rate ───
      // currentOrdersResult already has the same partner/store/date scope,
      // ordering, limit, and the `situation` column needed for this metric.
      const cancelRows = periodOrders
      const cancelledCount = cancelRows.filter((o: any) => {
        const s = String(o.situation || "").toLowerCase()
        return ["cancelled", "cancelado", "cancelada"].includes(s)
      }).length
      const cancellationRate = cancelRows.length > 0 ? Math.round((cancelledCount / cancelRows.length) * 100) : 0

      // ─── Net revenue ───
      const totalDiscount = periodOrders.reduce((a: number, o: any) => a + money(o.discount_total || 0), 0)
      const totalDeliveryFee = periodOrders.reduce((a: number, o: any) => a + money(o.delivery_fee || 0), 0)
      const netRevenue = revenue - totalDiscount + totalDeliveryFee

      // ─── Gross profit (cost_price lookup) ───
      const prodIds = [...new Set(itemRows.map((i: any) => i.product_id).filter(Boolean))]
      let costPriceMap = new Map<string, number>()
      if (prodIds.length > 0) {
        const prodResult = await supabase.from("products").select("id, cost_price").in("id", prodIds)
        if (!prodResult.error && prodResult.data) {
          for (const p of prodResult.data) {
            if (p.cost_price) costPriceMap.set(p.id, money(p.cost_price))
          }
        }
      }
      let totalCost = 0
      let itemsWithCost = 0
      let totalItemsWithCost = 0
      for (const item of itemRows) {
        const pid = item.product_id
        const qty = Number(item.quantity || 0)
        if (pid && costPriceMap.has(pid)) {
          totalCost += qty * costPriceMap.get(pid)!
          itemsWithCost++
        }
        if (pid) totalItemsWithCost++
      }
      const costCoveragePct = totalItemsWithCost > 0 ? Math.round((itemsWithCost / totalItemsWithCost) * 100) : 0
      const estimatedGrossProfit = costCoveragePct >= 50 ? revenue - totalCost : 0
      const grossMargin = revenue > 0 && estimatedGrossProfit > 0 ? Math.round((estimatedGrossProfit / revenue) * 100) : 0

      // ─── Top margin products ───
      const prodRevenueMap = new Map<string, { revenue: number; cost: number; qty: number }>()
      for (const item of itemRows) {
        const name = item.product_name || "Produto"
        const cur = prodRevenueMap.get(name) || { revenue: 0, cost: 0, qty: 0 }
        const qty = Number(item.quantity || 0)
        const rev = money(item.net_item_value || 0)
        cur.revenue += rev
        cur.qty += qty
        const pid = item.product_id
        if (pid && costPriceMap.has(pid)) cur.cost += qty * costPriceMap.get(pid)!
        prodRevenueMap.set(name, cur)
      }
      const topMarginProducts = Array.from(prodRevenueMap.entries())
        .filter(([_, d]) => d.cost > 0)
        .map(([label, d]) => ({ id: label, label, value: d.revenue, margin: Math.round(((d.revenue - d.cost) / d.revenue) * 100) }))
        .sort((a, b) => b.margin - a.margin)
        .slice(0, 5)

      // ─── Top services ───
      const serviceRows = serviceItemsResult.data || []
      const svcMap = new Map<string, { count: number; revenue: number }>()
      for (const item of serviceRows) {
        const name = item.product_name || "Serviço"
        const cur = svcMap.get(name) || { count: 0, revenue: 0 }
        cur.count += Number(item.quantity || 1)
        cur.revenue += money(item.net_item_value || 0)
        svcMap.set(name, cur)
      }
      const topServices = Array.from(svcMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 8)
        .map(([label, d]) => ({ id: label, label, value: d.revenue, count: d.count }))

      // ─── Orders by hour (timezone-aware) ───
      const hourBuckets = new Array(24).fill(0)
      for (const o of periodOrders) {
        const { hour } = getDateComponents(o.created_at)
        hourBuckets[hour]++
      }
      const ordersByHour = hourBuckets.map((count, h) => ({
        label: `${String(h).padStart(2, "0")}h`,
        value: count,
      }))

      // ─── Orders by day of week (timezone-aware) ───
      const dowNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
      const dowBuckets = new Array(7).fill(0)
      for (const o of periodOrders) {
        const { dayOfWeek } = getDateComponents(o.created_at)
        dowBuckets[dayOfWeek]++
      }
      const ordersByDayOfWeek = dowBuckets.map((count, i) => ({
        label: dowNames[i],
        value: count,
      }))

      // ─── ABC Curve (by revenue, not quantity) ───
      const allItemRows = allItemsResult.data || []
      const abcProdMap = new Map<string, number>()
      for (const item of allItemRows) {
        const name = item.product_name || "Produto"
        abcProdMap.set(name, (abcProdMap.get(name) || 0) + (Number(item.net_item_value) || 0))
      }
      const sortedProducts = Array.from(abcProdMap.entries()).sort((a, b) => b[1] - a[1])
      const totalValue = sortedProducts.reduce((a, [_, v]) => a + v, 0)
      let cumulative = 0
      const abcCurve = sortedProducts.map(([label, value]) => {
        cumulative += value
        const cumPct = totalValue > 0 ? Math.round((cumulative / totalValue) * 100) : 0
        let category: "A" | "B" | "C" = "C"
        if (cumPct <= 50) category = "A"
        else if (cumPct <= 80) category = "B"
        return { label, value, cumulative: cumPct, category }
      })

      // ─── Least sold products ───
      const leastSoldProducts = Array.from(prodMap.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5)
        .map(([label, value]) => ({ id: label, label, value }))

      // ─── Product turnover (giro) ───
      const monthsInPeriod = Math.max(daysInPeriod / 30, 1)
      const productTurnover = prodMap.size > 0
        ? Math.round((totalItemsSold / prodMap.size) / monthsInPeriod)
        : 0

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
          itemsSold: totalItemsSold,
          cancellationRate,
          cancellationRateFormatted: `${cancellationRate}%`,
          netRevenue,
          netRevenueFormatted: brl(netRevenue),
          estimatedGrossProfit,
          estimatedGrossProfitFormatted: brl(estimatedGrossProfit),
          grossMargin,
          grossMarginFormatted: `${grossMargin}%`,
          costCoveragePct,
          previousRevenue: prevRevenue,
          previousOrderCount: prevOrders.length,
          previousTicketMedio: prevTicket,
        },
        bySource: Array.from(bySource.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        ordersBySource: Array.from(ordersBySource.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        byPaymentMethod: Array.from(byPayment.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({ label, value })),
        evolution,
        topProducts,
        ordersByHour,
        ordersByDayOfWeek,
        abcCurve,
        leastSoldProducts,
        productTurnover,
        topServices,
        topMarginProducts,
        detailedOrders: periodOrders.map((order: any) => ({
          id: order.id,
          orderNumber: String(order.order_number || order.id).slice(0, 12),
          customer: order.customer_name || "Cliente não identificado",
          source: normalizeOrderSource(order.order_source),
          paymentMethod: normalizePaymentMethod(String(order.payment_method || "")),
          status: String(order.situation || "Não informado"),
          date: String(order.created_at || "").slice(0, 16),
          total: money(order.total_amount),
        })),
      }
    },
    [`report-sales-${partnerId}-${period}-${storeId || "all"}`],
    { tags: [REPORT_TAGS.vendas(partnerId, period)], revalidate: 120 }
  )()
})

export async function getSalesReportData(partnerId: string, period: Period = "monthly", storeId = "") {
  return getCachedSalesData(partnerId, period, storeId)
}
