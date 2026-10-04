import { SupabaseClient } from "@supabase/supabase-js"
import { getAdminClient } from "@/lib/supabase/admin"

export interface SubscriptionReportData {
  activeCount: number
  pausedCount: number
  cancelledCount: number
  delinquentCount: number // status = 'awaiting_restock' or active subscriptions with unpaid cycle orders
  mrr: number
  arr: number
  churnRate: number
  ltv: number
  renewalRate: number
  projectedRevenue30Days: number
  projectedOrders30Days: number
  projectedProducts: Array<{ id: string; name: string; quantity: number }>
  creditsUsedCount: number
  creditsExpiredCount: number
  recentExecutions: any[]
}

export async function getSubscriptionReportData(
  partnerId: string,
  period: "daily" | "weekly" | "monthly" | "yearly" = "monthly"
): Promise<SubscriptionReportData> {
  const supabase = getAdminClient()

  // 1. Fetch all subscriptions for the partner
  const { data: subs, error: subsErr } = await supabase
    .from("recurring_subscriptions")
    .select(`
      id, status, started_at, cancelled_at, next_execution_at,
      recurring_plans(billing_mode, frequency_type, frequency_interval),
      recurring_subscription_items(item_type, quantity, unit_price, product_id, products(name))
    `)
    .eq("partner_id", partnerId)

  if (subsErr) throw subsErr

  const subscriptions = subs || []
  
  let activeCount = 0
  let pausedCount = 0
  let cancelledCount = 0
  let delinquentCount = 0
  let totalMonthlyRevenue = 0
  
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  let cancelledInLast30Days = 0
  let totalActiveMonths = 0
  let activeMonthsCount = 0

  for (const sub of subscriptions) {
    const status = sub.status
    if (status === "active") activeCount++
    else if (status === "paused") pausedCount++
    else if (status === "cancelled") {
      cancelledCount++
      if (sub.cancelled_at && new Date(sub.cancelled_at) >= thirtyDaysAgo) {
        cancelledInLast30Days++
      }
    } else if (status === "awaiting_restock") {
      delinquentCount++ // awaiting restock counts as stock-delinquent
    } else if (status === "past_due" || status === "payment_failed") {
      delinquentCount++ // payment delinquent (dunning em andamento ou esgotada)
    }

    // Calculate MRR contribution of this subscription if active or paused
    if (status === "active" || status === "paused") {
      const items = (sub.recurring_subscription_items || []) as any[]
      const subTotal = items.reduce((sum, item) => sum + (Number(item.unit_price || 0) * Number(item.quantity || 1)), 0)
      
      const plan = sub.recurring_plans as any
      const freq = plan?.frequency_type || "monthly"
      const interval = plan?.frequency_interval || 1

      let monthlyMultiplier = 1
      if (freq === "daily") {
        monthlyMultiplier = 30 / interval
      } else if (freq === "weekly") {
        monthlyMultiplier = 4.33 / interval
      } else if (freq === "monthly") {
        monthlyMultiplier = 1 / interval
      } else if (freq === "yearly") {
        monthlyMultiplier = 1 / (12 * interval)
      }

      totalMonthlyRevenue += subTotal * monthlyMultiplier
    }

    // Calculate subscription duration for LTV
    const started = new Date(sub.started_at)
    const ended = sub.cancelled_at ? new Date(sub.cancelled_at) : new Date()
    const diffTime = Math.abs(ended.getTime() - started.getTime())
    const diffMonths = Math.max(1, diffTime / (1000 * 60 * 60 * 24 * 30))
    
    totalActiveMonths += diffMonths
    activeMonthsCount++
  }

  // 2. Churn rate calculation
  const totalBaseForChurn = activeCount + cancelledInLast30Days
  const churnRate = totalBaseForChurn > 0 ? (cancelledInLast30Days / totalBaseForChurn) * 100 : 0

  // 3. Average subscription duration and LTV
  const averageDurationMonths = activeMonthsCount > 0 ? totalActiveMonths / activeMonthsCount : 0
  const arpu = activeCount > 0 ? totalMonthlyRevenue / activeCount : 0
  // LTV = ARPU * Average lifespan
  const ltv = arpu * averageDurationMonths

  // 4. Query credit ledger for usage statistics
  const { data: ledgerStats } = await supabase
    .from("subscription_item_credit_ledger")
    .select("transaction_type, quantity")
    .eq("partner_id", partnerId)

  let creditsUsedCount = 0
  let creditsExpiredCount = 0

  for (const entry of ledgerStats || []) {
    if (entry.transaction_type === "consume") {
      creditsUsedCount += Math.abs(entry.quantity)
    } else if (entry.transaction_type === "expire") {
      creditsExpiredCount += Math.abs(entry.quantity)
    }
  }

  // 5. Query execution history for renewal rate and upcoming cycles
  const { data: executions } = await supabase
    .from("recurring_executions")
    .select("id, status, scheduled_for, order_id, orders(situation)")
    .eq("partner_id", partnerId)
    .order("scheduled_for", { ascending: false })

  const recentExecs = executions || []
  const pastExecs = recentExecs.filter((e: any) => new Date(e.scheduled_for) <= new Date())
  
  const totalPastDue = pastExecs.length
  const totalPaidPastDue = pastExecs.filter((e: any) => e.status === "completed" && (e.orders as any)?.situation === "paid").length
  const renewalRate = totalPastDue > 0 ? (totalPaidPastDue / totalPastDue) * 100 : 100

  // 6. Projections for the next 30 days
  const next30Days = new Date()
  next30Days.setDate(next30Days.getDate() + 30)

  let projectedRevenue30Days = 0
  let projectedOrders30Days = 0
  const productDemands = new Map<string, { name: string; quantity: number }>()

  for (const sub of subscriptions) {
    if (sub.status !== "active") continue

    const nextRun = new Date(sub.next_execution_at)
    if (nextRun >= new Date() && nextRun <= next30Days) {
      projectedOrders30Days++
      
      const items = (sub.recurring_subscription_items || []) as any[]
      const subTotal = items.reduce((sum, item) => sum + (Number(item.unit_price || 0) * Number(item.quantity || 1)), 0)
      projectedRevenue30Days += subTotal

      // Track product demands
      for (const item of items) {
        if (item.item_type === "product" && item.product_id) {
          const prodName = item.products?.name || "Produto"
          const qty = Number(item.quantity || 1)
          const existing = productDemands.get(item.product_id)
          if (existing) {
            existing.quantity += qty
          } else {
            productDemands.set(item.product_id, { name: prodName, quantity: qty })
          }
        }
      }
    }
  }

  const projectedProducts = Array.from(productDemands.entries()).map(([id, val]) => ({
    id,
    name: val.name,
    quantity: val.quantity
  }))

  return {
    activeCount,
    pausedCount,
    cancelledCount,
    delinquentCount,
    mrr: totalMonthlyRevenue,
    arr: totalMonthlyRevenue * 12,
    churnRate,
    ltv,
    renewalRate,
    projectedRevenue30Days,
    projectedOrders30Days,
    projectedProducts,
    creditsUsedCount,
    creditsExpiredCount,
    recentExecutions: recentExecs.slice(0, 10)
  }
}
