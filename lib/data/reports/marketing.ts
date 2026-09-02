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
    ordersWithCoupon: number
    totalDiscount: number
    totalDiscountFormatted: string
  }
  evolution: { label: string; online: number; presencial: number; outros: number }[]
  topCoupons: { id: string; code: string; usageCount: number; discountValue: number; discountType: string }[]
  campaigns: { id: string; name: string; isActive: boolean; startsAt: string | null; endsAt: string | null }[]
}

const fetchMarketingDataStatic = unstable_cache(
  async (partnerId: string, period: Period) => {
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
      const src = o.order_source || "outros"
      revenueBySource.set(src, (revenueBySource.get(src) || 0) + money(o.total_amount))
    }

    const totalRevenue = Array.from(revenueBySource.values()).reduce((a, b) => a + b, 0)
    const sortedSources = Array.from(revenueBySource.entries()).sort((a, b) => b[1] - a[1])
    const topSourceEntry = sortedSources[0]
    const topSource = topSourceEntry ? topSourceEntry[0] : "N/A"
    const topSourcePercent = totalRevenue > 0 && topSourceEntry ? Math.round((topSourceEntry[1] / totalRevenue) * 100) : 0

    const coupons = couponsResult.data || []
    const couponUsages = couponUsagesResult.data || []

    const usageCountMap = new Map<string, number>()
    for (const u of couponUsages) {
      usageCountMap.set(u.coupon_id, (usageCountMap.get(u.coupon_id) || 0) + 1)
    }

    const topCoupons = coupons
      .map((c: any) => ({
        id: c.id,
        code: c.code,
        usageCount: usageCountMap.get(c.id) || 0,
        discountValue: money(c.discount_value),
        discountType: c.discount_type || "fixed",
      }))
      .sort((a: any, b: any) => b.usageCount - a.usageCount)
      .slice(0, 5)

    const totalCoupons = coupons.length
    const usedCoupons = Array.from(usageCountMap.keys()).length
    const ordersWithCoupon = new Set(couponUsages.map((u: any) => u.order_id)).size
    const orderCount = orders.length
    const usageRate = orderCount > 0 ? Math.round((ordersWithCoupon / orderCount) * 100) : 0

    const daysInPeriod = period === "daily" ? 1 : period === "weekly" ? 7 : 30
    const todayDate = new Date(today + "T12:00:00Z")
    const orderDateMap = new Map<string, { online: number; presencial: number; outros: number }>()

    for (const o of orders) {
      const k = String(o.created_at || "").slice(0, 10)
      const current = orderDateMap.get(k) || { online: 0, presencial: 0, outros: 0 }
      const src = (o.order_source || "").toLowerCase()
      if (src.includes("online") || src.includes("site") || src.includes("marketplace")) {
        current.online += money(o.total_amount)
      } else if (src.includes("pdv") || src.includes("presencial") || src.includes("balcao")) {
        current.presencial += money(o.total_amount)
      } else {
        current.outros += money(o.total_amount)
      }
      orderDateMap.set(k, current)
    }

    const evolution = Array.from({ length: daysInPeriod }, (_, i) => {
      const date = new Date(todayDate)
      date.setUTCDate(date.getUTCDate() - (daysInPeriod - 1 - i))
      const key = date.toISOString().slice(0, 10)
      const v = orderDateMap.get(key) || { online: 0, presencial: 0, outros: 0 }
      return {
        label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        ...v,
      }
    })

    const campaigns = (campaignsResult.data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      isActive: c.is_active,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
    }))

    const totalDiscount = topCoupons.reduce((sum: number, c: { usageCount: number; discountValue: number; discountType: string }) => {
      if (c.discountType === "percentage") return sum + (c.usageCount * (c.discountValue / 100))
      return sum + (c.usageCount * c.discountValue)
    }, 0)

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
        ordersWithCoupon,
        totalDiscount,
        totalDiscountFormatted: brl(totalDiscount),
      },
      evolution,
      topCoupons,
      campaigns,
    }
  },
  ["report-marketing"],
  { tags: ["reports"], revalidate: 120 }
)

const getCachedMarketingData = cache(async (partnerId: string, period: Period = "monthly") => {
  return fetchMarketingDataStatic(partnerId, period)
})

export async function getMarketingReportData(partnerId: string, period: Period = "monthly") {
  return getCachedMarketingData(partnerId, period)
}
