"use server"

import { revalidateTag, unstable_cache } from "next/cache"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { calculateCommission } from "@/lib/services/commission.service"

export type ProductivityOverview = {
  totalSold: number
  totalSalesCount: number
  averageTicket: number
  generalGoal: number
  goalAchievedPercent: number
  estimatedCommission: number
  paidCommission: number
  pendingCommission: number
}

export type ProductivityRankingRow = {
  userId: string
  partnerUserId: string
  name: string
  avatarUrl: string | null
  totalSold: number
  salesCount: number
  averageTicket: number
  goalAchievedPercent: number
  commissionGenerated: number
  position: number
}

export type CommissionOverview = {
  totalPending: number
  totalPaid: number
  totalGeneral: number
  goalBonuses: number
  estimatedCommission: number
  sellers: SellerCommissionRow[]
}

export type SellerCommissionRow = {
  partnerUserId: string
  userId: string
  name: string
  avatarUrl: string | null
  commissionType: string
  commissionValue: number
  pendingAmount: number
  paidAmount: number
  bonusAmount: number
  totalAccumulated: number
}

export type CommissionHistoryRow = {
  id: string
  description: string
  amount: number
  status: string
  paymentDate: string | null
  createdAt: string
  orderNumber: string | null
  referenceNote: string | null
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export async function getProductivityOverviewAction(partnerId: string): Promise<{ success: boolean } & Partial<ProductivityOverview>> {
  await requireUser()

  const admin = getAdminClient()
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [ordersResult, commissionsResult, goalsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id, total_amount, created_at, seller_partner_user_id", { count: "exact" })
      .eq("partner_id", partnerId)
      .gte("created_at", firstOfMonth)
      .neq("situation", "cancelled"),
    admin
      .from("transactions")
      .select("id, amount, status, seller_partner_user_id")
      .eq("partner_id", partnerId)
      .eq("category", "Comissões")
      .gte("created_at", firstOfMonth),
    admin
      .from("sales_goals")
      .select("id, target_amount")
      .eq("partner_id", partnerId),
  ])

  const orders = ordersResult.data || []
  const totalSold = orders.reduce((sum: number, o: any) => sum + money(Number(o.total_amount || 0)), 0)
  const totalSalesCount = orders.length
  const averageTicket = totalSalesCount > 0 ? money(totalSold / totalSalesCount) : 0

  const commissions = commissionsResult.data || []
  const paidCommission = commissions
    .filter((t: any) => t.status === "paid")
    .reduce((sum: number, t: any) => sum + money(Number(t.amount || 0)), 0)

  const goals = goalsResult.data || []
  const generalGoal = goals.reduce((sum: number, g: any) => sum + money(Number(g.target_amount || 0)), 0)

  let goalAchievedPercent = 0
  if (generalGoal > 0) {
    const { data: progress } = await admin
      .from("sales_goal_progress")
      .select("current_amount")
      .in("goal_id", goals.map((g: any) => g.id))
    const achieved = (progress || []).reduce((sum: number, p: any) => sum + money(Number(p.current_amount || 0)), 0)
    goalAchievedPercent = Math.min(100, money((achieved / generalGoal) * 100))
  }

  const estimatedCommission = await calculateEstimatedCommission(admin, partnerId, orders)

  return {
    success: true,
    totalSold,
    totalSalesCount,
    averageTicket,
    generalGoal,
    goalAchievedPercent,
    estimatedCommission: money(estimatedCommission),
    paidCommission,
    pendingCommission: money(Math.max(0, estimatedCommission - paidCommission)),
  }
}

async function calculateEstimatedCommission(admin: any, partnerId: string, orders: any[]): Promise<number> {
  const { data: configs } = await admin
    .from("employee_commissions")
    .select("user_id, commission_type, value")
    .eq("partner_id", partnerId)
    .eq("role", "seller")
    .neq("commission_type", "none")

  if (!configs || configs.length === 0) return 0
  const configMap = new Map<string, any>(configs.map((c: any) => [c.user_id, c]))

  let total = 0
  for (const order of orders) {
    const sellerId = order.seller_partner_user_id
    if (!sellerId) continue
    const config = configMap.get(sellerId)
    if (!config) continue
    total += calculateCommission({
      userId: sellerId,
      role: "seller",
      commissionType: config.commission_type,
      value: Number(config.value || 0),
      saleAmount: Number(order.total_amount || 0),
    })
  }
  return total
}

export async function getProductivityRankingAction(
  partnerId: string,
  period?: { startDate?: string; endDate?: string },
): Promise<{ success: boolean; ranking: ProductivityRankingRow[] }> {
  await requireUser()

  const admin = getAdminClient()
  const now = new Date()
  const startDate = period?.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endDate = period?.endDate || now.toISOString()

  const { data: partnerUsers } = await admin
    .from("partner_users")
    .select("id, user_id, role")
    .eq("partner_id", partnerId)

  const sellers = (partnerUsers || []).filter(
    (pu: any) => String(pu.role || "").toUpperCase() !== "DELIVERY",
  )

  if (sellers.length === 0) return { success: true, ranking: [] }

  const userIds = sellers.map((s: any) => s.user_id)
  const partnerUserIds = sellers.map((s: any) => s.id)

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", userIds)

  const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]))

  const { data: ordersData } = await admin
    .from("orders")
    .select("id, total_amount, seller_partner_user_id")
    .eq("partner_id", partnerId)
    .in("seller_partner_user_id", partnerUserIds)
    .gte("created_at", startDate)
    .lte("created_at", endDate)
    .neq("situation", "cancelled")

  const { data: commissionData } = await admin
    .from("transactions")
    .select("amount, seller_partner_user_id")
    .eq("partner_id", partnerId)
    .eq("category", "Comissões")
    .eq("status", "paid")
    .in("seller_partner_user_id", partnerUserIds)
    .gte("created_at", startDate)
    .lte("created_at", endDate)

  const { data: configs } = await admin
    .from("employee_commissions")
    .select("user_id, commission_type, value")
    .eq("partner_id", partnerId)
    .eq("role", "seller")

  const configMap = new Map<string, any>((configs || []).map((c: any) => [c.user_id, c]))

  const sellerOrders = new Map<string, { total: number; count: number }>()
  for (const order of ordersData || []) {
    const sid = order.seller_partner_user_id
    if (!sid) continue
    const existing = sellerOrders.get(sid) || { total: 0, count: 0 }
    existing.total += money(Number(order.total_amount || 0))
    existing.count++
    sellerOrders.set(sid, existing)
  }

  const sellerCommissions = new Map<string, number>()
  for (const tx of commissionData || []) {
    const sid = tx.seller_partner_user_id
    if (!sid) continue
    sellerCommissions.set(sid, money((sellerCommissions.get(sid) || 0) + Number(tx.amount || 0)))
  }

  const { data: progressData } = await admin
    .from("sales_goal_progress")
    .select("user_id, current_amount, goal_id")

  const sellerGoalMap = new Map<string, number>()
  for (const p of progressData || []) {
    const key = p.user_id
    sellerGoalMap.set(key, money((sellerGoalMap.get(key) || 0) + Number(p.current_amount || 0)))
  }

  const ranking: ProductivityRankingRow[] = sellers.map((seller: any, index: number) => {
    const profile = profileMap.get(seller.user_id)
    const orders = sellerOrders.get(seller.id) || { total: 0, count: 0 }
    const commission = sellerCommissions.get(seller.id) || 0
    const config = configMap.get(seller.id)
    let estimatedComm = 0
    if (config && config.commission_type !== "none") {
      estimatedComm = calculateCommission({
        userId: seller.id,
        role: "seller",
        commissionType: config.commission_type,
        value: Number(config.value || 0),
        saleAmount: orders.total,
      })
    }

    const goalAmount = sellerGoalMap.get(seller.user_id) || 0

    return {
      userId: seller.user_id,
      partnerUserId: seller.id,
      name: profile?.full_name || "Vendedor",
      avatarUrl: null,
      totalSold: orders.total,
      salesCount: orders.count,
      averageTicket: orders.count > 0 ? money(orders.total / orders.count) : 0,
      goalAchievedPercent: goalAmount,
      commissionGenerated: money(Math.max(commission, estimatedComm)),
      position: 0,
    }
  })

  ranking.sort((a, b) => b.totalSold - a.totalSold)
  ranking.forEach((r, i) => { r.position = i + 1 })

  return { success: true, ranking }
}

export async function getProductivityChartsAction(
  partnerId: string,
): Promise<{ success: boolean; chartData: ProductivityRankingRow[] }> {
  const ranking = await getProductivityRankingAction(partnerId)
  return { success: ranking.success, chartData: ranking.ranking }
}

export async function getSellersCommissionOverviewAction(partnerId: string): Promise<{
  success: boolean
  overview: CommissionOverview | null
}> {
  await requireUser()

  const admin = getAdminClient()
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: partnerUsers } = await admin
    .from("partner_users")
    .select("id, user_id, role")
    .eq("partner_id", partnerId)

  const sellers = (partnerUsers || []).filter(
    (pu: any) => String(pu.role || "").toUpperCase() !== "DELIVERY",
  )

  if (sellers.length === 0) {
    return { success: true, overview: { totalPending: 0, totalPaid: 0, totalGeneral: 0, goalBonuses: 0, estimatedCommission: 0, sellers: [] } }
  }

  const userIds = sellers.map((s: any) => s.user_id)
  const partnerUserIds = sellers.map((s: any) => s.id)

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", userIds)

  const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]))

  const { data: configs } = await admin
    .from("employee_commissions")
    .select("user_id, commission_type, value")
    .eq("partner_id", partnerId)
    .eq("role", "seller")

  const configMap = new Map<string, any>((configs || []).map((c: any) => [c.user_id, c]))

  const { data: allCommissions } = await admin
    .from("transactions")
    .select("id, amount, status, seller_partner_user_id, created_at")
    .eq("partner_id", partnerId)
    .eq("category", "Comissões")
    .in("seller_partner_user_id", partnerUserIds)

  const { data: goalBonuses } = await admin
    .from("transactions")
    .select("amount")
    .eq("partner_id", partnerId)
    .eq("category", "Metas e Bônus")
    .gte("created_at", firstOfMonth)

  const { data: ordersData } = await admin
    .from("orders")
    .select("id, total_amount, seller_partner_user_id")
    .eq("partner_id", partnerId)
    .in("seller_partner_user_id", partnerUserIds)
    .neq("situation", "cancelled")
    .gte("created_at", firstOfMonth)

  const totalGoalBonuses = (goalBonuses || []).reduce((s: number, t: any) => s + money(Number(t.amount || 0)), 0)

  const sellerCommissions = new Map<string, { pending: number; paid: number }>()
  for (const tx of allCommissions || []) {
    const sid = tx.seller_partner_user_id
    if (!sid) continue
    const existing = sellerCommissions.get(sid) || { pending: 0, paid: 0 }
    if (tx.status === "paid") existing.paid += money(Number(tx.amount || 0))
    else existing.pending += money(Number(tx.amount || 0))
    sellerCommissions.set(sid, existing)
  }

  const sellerOrders = new Map<string, number>()
  for (const order of ordersData || []) {
    const sid = order.seller_partner_user_id
    if (!sid) continue
    sellerOrders.set(sid, money((sellerOrders.get(sid) || 0) + Number(order.total_amount || 0)))
  }

  const sellerRows: SellerCommissionRow[] = sellers.map((seller: any) => {
    const profile = profileMap.get(seller.user_id)
    const config = configMap.get(seller.id)
    const comm = sellerCommissions.get(seller.id) || { pending: 0, paid: 0 }
    const orderTotal = sellerOrders.get(seller.id) || 0

    let estimatedComm = 0
    if (config && config.commission_type !== "none") {
      estimatedComm = calculateCommission({
        userId: seller.id,
        role: "seller",
        commissionType: config.commission_type,
        value: Number(config.value || 0),
        saleAmount: orderTotal,
      })
    }

    return {
      partnerUserId: seller.id,
      userId: seller.user_id,
      name: profile?.full_name || "Vendedor",
      avatarUrl: null,
      commissionType: config?.commission_type || "none",
      commissionValue: Number(config?.value || 0),
      pendingAmount: money(Math.max(0, estimatedComm - comm.paid)),
      paidAmount: comm.paid,
      bonusAmount: 0,
      totalAccumulated: money(comm.paid + estimatedComm),
    }
  })

  sellerRows.sort((a, b) => b.totalAccumulated - a.totalAccumulated)

  const totalPaid = sellerRows.reduce((s, r) => s + r.paidAmount, 0)
  const totalPending = sellerRows.reduce((s, r) => s + r.pendingAmount, 0)
  const totalEstimated = sellerRows.reduce((s, r) => s + r.totalAccumulated, 0)

  return {
    success: true,
    overview: {
      totalPending: money(totalPending),
      totalPaid: money(totalPaid),
      totalGeneral: money(totalPaid + totalPending),
      goalBonuses: money(totalGoalBonuses),
      estimatedCommission: money(totalEstimated),
      sellers: sellerRows,
    },
  }
}

export async function getSellerCommissionHistoryAction(
  partnerId: string,
  sellerPartnerUserId: string,
): Promise<{ success: boolean; history: CommissionHistoryRow[] }> {
  await requireUser()

  const admin = getAdminClient()

  const { data: commissions } = await admin
    .from("transactions")
    .select("id, description, amount, status, payment_date, created_at, reference_note")
    .eq("partner_id", partnerId)
    .eq("seller_partner_user_id", sellerPartnerUserId)
    .eq("category", "Comissões")
    .order("created_at", { ascending: false })
    .limit(50)

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, seller_partner_user_id")
    .eq("partner_id", partnerId)
    .eq("seller_partner_user_id", sellerPartnerUserId)

  const orderMap = new Map((orders || []).map((o: any) => [o.seller_partner_user_id, o.order_number]))

  const history: CommissionHistoryRow[] = (commissions || []).map((tx: any) => ({
    id: tx.id,
    description: tx.description || "Comissão",
    amount: money(Number(tx.amount || 0)),
    status: tx.status,
    paymentDate: tx.payment_date,
    createdAt: tx.created_at,
    orderNumber: orderMap.get(sellerPartnerUserId) || null,
    referenceNote: tx.reference_note,
  }))

  return { success: true, history }
}

export async function recordCommissionPaymentAction(
  partnerId: string,
  sellerPartnerUserId: string,
  amount: number,
  accountId?: string | null,
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  await requireUser()

  const supabase = await getSupabaseServerClient()
  const admin = getAdminClient()

  const { data: seller } = await admin
    .from("partner_users")
    .select("id, user_id")
    .eq("id", sellerPartnerUserId)
    .eq("partner_id", partnerId)
    .single()

  if (!seller) return { success: false, error: "Vendedor não encontrado" }

  if (amount <= 0) return { success: false, error: "Valor inválido" }

  let resolvedAccountId = accountId
  if (!resolvedAccountId) {
    const { data: accounts } = await admin
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("type", "cash")
      .limit(1)

    if (accounts && accounts.length > 0) {
      resolvedAccountId = accounts[0].id
    }
  }

  const now = new Date().toISOString()
  const { data: txData, error: txError } = await admin
    .from("transactions")
    .insert({
      partner_id: partnerId,
      description: "Pagamento de comissão",
      category: "Comissões",
      amount: money(amount),
      original_amount: money(amount),
      fee_amount: 0,
      status: "paid",
      payment_date: now,
      transaction_date: now,
      payment_type: "Comissão",
      transaction_type: "expense",
      origin: "manual",
      notes: "Pagamento manual de comissão.",
      account_id: resolvedAccountId,
      seller_partner_user_id: sellerPartnerUserId,
    })
    .select("id")
    .single()

  if (txError || !txData) {
    return { success: false, error: txError?.message || "Erro ao registrar pagamento" }
  }

  try {
    await admin.rpc("apply_account_balance_delta", {
      p_account_id: resolvedAccountId,
      p_delta: -money(amount),
    })
  } catch { }

  revalidateTag(`productivity_${partnerId}`, "max")
  return { success: true, transactionId: txData.id }
}
