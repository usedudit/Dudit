"use server"

import { revalidateTag, unstable_cache } from "next/cache"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"

type GoalInput = {
  id?: string
  partnerId: string
  name: string
  periodType: "monthly" | "weekly"
  startDate: string
  endDate: string
  targetAmount: number
  bonusType: "fixed" | "percentage"
  bonusValue: number
  appliesTo: "all" | "user"
  userId?: string | null
}

type RankingPeriodFilter = {
  mode?: "monthly" | "weekly" | "custom"
  startDate?: string | null
  endDate?: string | null
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

async function resolveSellerNameMap(partnerId: string) {
  const admin = getAdminClient()
  const { data: partnerUsers } = await admin
    .from("partner_users")
    .select("user_id, role")
    .eq("partner_id", partnerId)

  const sellerIds = Array.from(
    new Set(
      (partnerUsers || [])
        .filter((row: any) => String(row.role || "").toUpperCase() !== "DELIVERY" && String(row.role || "").toUpperCase() !== "VIEWER")
        .map((row: any) => row.user_id),
    ),
  )
  if (sellerIds.length === 0) return new Map<string, string>()

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", sellerIds)
  return new Map<string, string>((profiles || []).map((p: any) => [String(p.user_id), String(p.full_name || "Vendedor")]))
}

export async function getSalesGoalsModuleAction(partnerId: string): Promise<{ success: true; goals: any; sellers: { id: string; name: string }[] } | { success: false; error: string }> {
  try {
    await requireUser()
    await requirePartnerAccess(partnerId)
    const supabase = await getSupabaseServerClient()
    const nowDate = new Date().toISOString().slice(0, 10)

    const [{ data: goals }, { data: progressRows }, sellerNameMap] = await Promise.all([
      supabase
        .from("sales_goals")
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sales_goal_progress")
        .select("id, goal_id, user_id, current_amount, achieved, achieved_at"),
      resolveSellerNameMap(partnerId),
    ])

    const progressByGoal = new Map<string, any[]>()
    for (const row of progressRows || []) {
      const list = progressByGoal.get(String(row.goal_id)) || []
      list.push(row)
      progressByGoal.set(String(row.goal_id), list)
    }

    const goalsWithProgress = (goals || []).map((goal: any) => {
      const rows = progressByGoal.get(String(goal.id)) || []
      const currentAmount = money(rows.reduce((sum: number, row: any) => sum + Number(row.current_amount || 0), 0))
      const percent = Number(goal.target_amount || 0) > 0 ? Math.min(100, (currentAmount / Number(goal.target_amount || 0)) * 100) : 0
      const isAchieved = rows.some((row: any) => Boolean(row.achieved))
      const isExpired = !isAchieved && nowDate > String(goal.end_date)
      const status = isAchieved ? "Concluída" : isExpired ? "Expirada" : "Em andamento"

      return {
        ...goal,
        current_amount: currentAmount,
        progress_percent: Math.round(percent),
        status,
        scope_user_name: goal.user_id ? sellerNameMap.get(String(goal.user_id)) || "Vendedor" : null,
      }
    })

    return { success: true as const, goals: goalsWithProgress, sellers: Array.from(sellerNameMap.entries()).map(([id, name]) => ({ id, name })) }
  } catch (error: any) {
    return { success: false, error: error.message || "Erro ao carregar metas." }
  }
}

export async function upsertSalesGoalAction(input: GoalInput) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)
  const supabase = await getSupabaseServerClient()

  const payload = {
    partner_id: input.partnerId,
    name: String(input.name || "").trim(),
    period_type: input.periodType,
    start_date: input.startDate,
    end_date: input.endDate,
    target_amount: money(Number(input.targetAmount || 0)),
    bonus_type: input.bonusType,
    bonus_value: money(Number(input.bonusValue || 0)),
    applies_to: input.appliesTo,
    user_id: input.appliesTo === "user" ? (input.userId || null) : null,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { error } = await supabase.from("sales_goals").update(payload).eq("id", input.id).eq("partner_id", input.partnerId)
    if (error) return { success: false as const, error: error.message }
    revalidateTag(`sales-goals-ranking:${input.partnerId}`, "max")
    return { success: true as const }
  }

  const { error } = await supabase.from("sales_goals").insert(payload)
  if (error) return { success: false as const, error: error.message }
  revalidateTag(`sales-goals-ranking:${input.partnerId}`, "max")
  return { success: true as const }
}

export async function deleteSalesGoalAction(partnerId: string, goalId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase.from("sales_goals").delete().eq("partner_id", partnerId).eq("id", goalId)
  if (error) return { success: false as const, error: error.message }
  revalidateTag(`sales-goals-ranking:${partnerId}`, "max")
  return { success: true as const }
}

function resolveRankingRange(filter?: RankingPeriodFilter) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDay()
  const weekOffset = day === 0 ? 6 : day - 1

  if (filter?.mode === "custom" && filter.startDate && filter.endDate) {
    return {
      startDate: String(filter.startDate),
      endDate: String(filter.endDate),
      periodType: null as "monthly" | "weekly" | null,
    }
  }

  if (filter?.mode === "weekly") {
    const start = new Date(Date.UTC(year, month, now.getUTCDate() - weekOffset))
    const end = new Date(Date.UTC(year, month, now.getUTCDate() + (6 - weekOffset)))
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      periodType: "weekly" as const,
    }
  }

  const monthStart = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 0))
  return {
    startDate: monthStart.toISOString().slice(0, 10),
    endDate: monthEnd.toISOString().slice(0, 10),
    periodType: "monthly" as const,
  }
}

async function fetchRanking(partnerId: string, filter?: RankingPeriodFilter) {
  const admin = getAdminClient()
  const { startDate, endDate, periodType } = resolveRankingRange(filter)

  const salesQuery = admin
      .from("sales")
      .select("finalized_by_user_id, final_amount, created_at")
      .eq("partner_id", partnerId)
      .in("payment_status", ["paid", "partially_paid"])
      .gte("created_at", `${startDate}T00:00:00.000Z`)
      .lte("created_at", `${endDate}T23:59:59.999Z`)

  let goalsQuery = admin
      .from("sales_goals")
      .select("id, target_amount, applies_to, user_id")
      .eq("partner_id", partnerId)
      .lte("start_date", endDate)
      .gte("end_date", startDate)
  if (periodType) goalsQuery = goalsQuery.eq("period_type", periodType)

  const [{ data: sales }, sellerNameMap, { data: activeGoals }, { data: goalProgress }] = await Promise.all([
    salesQuery,
    resolveSellerNameMap(partnerId),
    goalsQuery,
    admin
      .from("sales_goal_progress")
      .select("goal_id, user_id, current_amount"),
  ])

  const totalByUser = new Map<string, number>()
  for (const sale of sales || []) {
    const userId = String((sale as any).finalized_by_user_id || "")
    if (!userId) continue
    totalByUser.set(userId, money((totalByUser.get(userId) || 0) + Number((sale as any).final_amount || 0)))
  }

  const progressMap = new Map<string, { current: number; target: number }>()
  for (const goal of activeGoals || []) {
    for (const p of goalProgress || []) {
      if (String((p as any).goal_id) !== String((goal as any).id)) continue
      const userId = String((p as any).user_id || "")
      if (!userId) continue
      if ((goal as any).applies_to === "user" && String((goal as any).user_id || "") !== userId) continue
      const curr = progressMap.get(userId) || { current: 0, target: 0 }
      progressMap.set(userId, {
        current: money(curr.current + Number((p as any).current_amount || 0)),
        target: money(curr.target + Number((goal as any).target_amount || 0)),
      })
    }
  }

  const ranking = Array.from(totalByUser.entries())
    .map(([userId, totalAmount]) => {
      const progress = progressMap.get(userId)
      const progressPercent = progress && progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0
      return {
        user_id: userId,
        seller_name: sellerNameMap.get(userId) || "Vendedor",
        total_amount: money(totalAmount),
        progress_percent: progressPercent,
      }
    })
    .sort((a, b) => b.total_amount - a.total_amount)
    .map((row, idx) => ({ ...row, position: idx + 1 }))

  return ranking
}

export async function getSalesGoalsRankingAction(partnerId: string, filter?: RankingPeriodFilter) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const normalizedFilter: RankingPeriodFilter = {
    mode: filter?.mode || "monthly",
    startDate: filter?.startDate || null,
    endDate: filter?.endDate || null,
  }
  const filterKey = `${normalizedFilter.mode}:${normalizedFilter.startDate || "-"}:${normalizedFilter.endDate || "-"}`

  const ranking = await unstable_cache(
    async () => fetchRanking(partnerId, normalizedFilter),
    ["sales-goals-ranking", partnerId, filterKey],
    { revalidate: 60, tags: [`sales-goals-ranking:${partnerId}`] },
  )()

  return { success: true as const, ranking }
}

export async function getSalesGoalsSummaryAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: sales }, { data: commissions }, { data: bonusPaid }, { data: goals }, { data: progress }] = await Promise.all([
    supabase.from("sales").select("final_amount").eq("partner_id", partnerId).in("payment_status", ["paid", "partially_paid"]),
    supabase.from("transactions").select("amount").eq("partner_id", partnerId).eq("category", "Comissões").eq("transaction_type", "expense"),
    supabase.from("transactions").select("amount, description").eq("partner_id", partnerId).eq("transaction_type", "expense").ilike("description", "%Bônus por meta atingida%"),
    supabase.from("sales_goals").select("id, start_date, end_date").eq("partner_id", partnerId),
    supabase.from("sales_goal_progress").select("goal_id, achieved"),
  ])

  const totalSold = money((sales || []).reduce((sum: number, row: any) => sum + Number(row.final_amount || 0), 0))
  const totalCommissions = money((commissions || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0))
  const totalBonusPaid = money((bonusPaid || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0))
  const activeGoals = (goals || []).filter((g: any) => String(g.start_date) <= today && String(g.end_date) >= today).length
  const achievedGoalIds = new Set((progress || []).filter((p: any) => Boolean(p.achieved)).map((p: any) => String(p.goal_id)))

  return {
    success: true as const,
    summary: {
      total_sold: totalSold,
      total_commissions: totalCommissions,
      total_bonus_paid: totalBonusPaid,
      active_goals: activeGoals,
      achieved_goals: achievedGoalIds.size,
    },
  }
}
