import "server-only"
import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getTodayYmdSaoPaulo } from "@/lib/utils/formatters"
import { getDateRangeWithPrevious } from "@/lib/period-types"
import { money, brl } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "./cache"
import type { Period } from "@/lib/period-types"

export interface MarketingReportData {
  revenueBySource: { label: string; value: number }[]
  totalRevenue: number
  totalRevenueFormatted: string
  topSource: string
  topSourcePercent: number
  couponStats: {
    total: number
    used: number
    usageRate: number
    totalDiscount: number
    totalDiscountFormatted: string
  }
  evolution: { label: string; online: number; presencial: number; outros: number }[]
  topCoupons: { id: string; code: string; usageCount: number; discountValue: number; discountType: string }[]
  campaigns: { id: string; name: string; isActive: boolean; startsAt: string | null; endsAt: string | null }[]
}

const getCachedMarketingData = cache(async (partnerId: string, period: Period = "monthly") => {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { today, from } = getDateRangeWithPrevious(period)

      const [ordersResult, couponsResult, couponUsagesResult, campaignsResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id, total_amount, order_source, created_at")
          .eq("partner_id", partnerId)
          .gte("created_at", `${from}T00:00:00`)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("coupons")
          .select("id, code, usage_limit, discount_type, discount_value, is_active")
          .eq("partner_id", partnerId)
          .eq("is_active", true)
          .limit(200),
        supabase
          .from("coupon_usages")
          .select("coupon_id, order_id, used_at")
          .gte("used_at", `${from}T00:00:00`)
          .limit(500),
        supabase
          .from("campaigns")
          .select("id, name, is_active, starts_at, ends_at")
          .eq("partner_id", partnerId)
          .order("created_at", { ascending: false })
          .limit(50),
      ])

      if (ordersResult.error) throw ordersResult.error
      if (couponsResult.error) throw couponsResult.error
      if (campaignsResult.error) throw campaignsResult.error

      const orders = ordersResult.data || []

      const revenueBySource = new Map<string, number>()
      for (const o of orders) {
        const src = String(o.order_source || "Manual").toLowerCase()
        let label = "Manual"
        if (src.includes("presencial") || src.includes("pdv") || src.includes("pos")) label = "PDV"
        else if (src.includes("online") || src.includes("web") || src.includes("ecommerce")) label = "Online"
        else if (src.includes("marketplace") || src.includes("vitrine")) label = "Marketplace"
        else if (src.includes("whatsapp") || src.includes("wpp")) label = "WhatsApp"
        else if (src.includes("delivery") || src.includes("entrega")) label = "Delivery"
        revenueBySource.set(label, (revenueBySource.get(label) || 0) + money(o.total_amount))
      }

      const sortedSources = Array.from(revenueBySource.entries()).sort((a, b) => b[1] - a[1])
      const totalRevenue = sortedSources.reduce((a, [_, v]) => a + v, 0)
      const topSource = sortedSources[0]?.[0] || "Nenhum"
      const topSourcePercent = totalRevenue > 0 ? Math.round(((sortedSources[0]?.[1] || 0) / totalRevenue) * 100) : 0

      const coupons = couponsResult.data || []
      const totalCoupons = coupons.length
      const usedCoupons = coupons.filter((c: any) => (usageByCoupon.get(c.id) || 0) > 0).length
      const usageRate = totalCoupons > 0 ? Math.round((usedCoupons / totalCoupons) * 100) : 0

      const couponUsages = couponUsagesResult.data || []
      const usageByCoupon = new Map<string, number>()
      for (const u of couponUsages) {
        usageByCoupon.set(u.coupon_id, (usageByCoupon.get(u.coupon_id) || 0) + 1)
      }
      const couponMap = new Map(coupons.map((c: any) => [c.id, c]))
      const topCoupons = Array.from(usageByCoupon.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([couponId, count]) => {
          const c: any = couponMap.get(couponId) || {}
          return { id: couponId, code: c.code || "Desconhecido", usageCount: count, discountValue: money(c.discount_value || 0), discountType: c.discount_type || "fixed" }
        })

      const campaignsData = campaignsResult.data || []
      const campaigns = campaignsData.map((c: any) => ({ id: c.id, name: c.name, isActive: c.is_active, startsAt: c.starts_at, endsAt: c.ends_at }))

      const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
      const todayDate = new Date(today + "T12:00:00Z")

      const sourceByDate = new Map<string, { online: number; presencial: number; outros: number }>()
      for (const o of orders) {
        const k = String(o.created_at || "").slice(0, 10)
        const src = String(o.order_source || "").toLowerCase()
        let category: "online" | "presencial" | "outros"
        if (src.includes("online") || src.includes("web")) category = "online"
        else if (src.includes("presencial") || src.includes("pdv")) category = "presencial"
        else category = "outros"
        if (!sourceByDate.has(k)) sourceByDate.set(k, { online: 0, presencial: 0, outros: 0 })
        const entry = sourceByDate.get(k)!
        entry[category] += money(o.total_amount)
      }

      const evolution = Array.from({ length: daysInPeriod }, (_, i) => {
        const date = new Date(todayDate)
        date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
        const key = date.toISOString().slice(0, 10)
        const d = sourceByDate.get(key) || { online: 0, presencial: 0, outros: 0 }
        return {
          label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
          online: d.online,
          presencial: d.presencial,
          outros: d.outros,
        }
      })

      return {
        revenueBySource: sortedSources.map(([label, value]) => ({ label, value })),
        totalRevenue,
        totalRevenueFormatted: brl(totalRevenue),
        topSource,
        topSourcePercent,
        couponStats: {
          total: totalCoupons,
          used: usedCoupons,
          usageRate,
          totalDiscount: 0,
          totalDiscountFormatted: brl(0),
        },
        evolution,
        topCoupons,
        campaigns,
      }
    },
    [`report-marketing-${partnerId}-${period}`],
    { tags: [REPORT_TAGS.marketing(partnerId, period)], revalidate: 120 }
  )()
})

export async function getMarketingReportData(partnerId: string, period: Period = "monthly") {
  return getCachedMarketingData(partnerId, period)
}
