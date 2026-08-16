"use server"

import { revalidateTag, unstable_cache } from "next/cache"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireMinimumPlan, requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getAdminClient } from "@/lib/supabase/admin"
import { sanitizeInput } from "@/lib/input-validator"

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
  assignedUserIds?: string[]
  autoLaunchBonus?: boolean
  bonusAccountId?: string | null
  bonusDistribution?: "equal" | "proportional"
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

async function _fetchSellerNameMap(partnerId: string) {
  const admin = getAdminClient()
  const { data: partnerUsers } = await admin
    .from("partner_users")
    .select("user_id, role")
    .eq("partner_id", partnerId)

  const sellerIds = Array.from(
    new Set(
      (partnerUsers || [])
        .filter((row: any) => String(row.role || "").toUpperCase() !== "DELIVERY")
        .map((row: any) => row.user_id),
    ),
  )
  if (sellerIds.length === 0) return {} as Record<string, string>

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", sellerIds)
  return Object.fromEntries((profiles || []).map((p: any) => [String(p.user_id), String(p.full_name || "Vendedor")]))
}

/**
 * Cached seller name resolver - avoids 2 DB queries per call.
 * TTL: 5 minutes, scoped by partner_id.
 * Invalidated when goals are revalidated.
 */
async function resolveSellerNameMap(partnerId: string): Promise<Map<string, string>> {
  const cached = await unstable_cache(
    () => _fetchSellerNameMap(partnerId),
    ["seller-names", partnerId],
    { revalidate: 300, tags: [`sales-goals-ranking:${partnerId}`] }
  )()
  return new Map(Object.entries(cached || {}))
}

export async function getSalesGoalsModuleAction(partnerId: string): Promise<{ success: true; goals: any; sellers: { id: string; name: string }[] } | { success: false; error: string }> {
  try {
    await requireUser()
    await requirePermission(partnerId, "goals", "view")
    const supabase = await getSupabaseServerClient()
    const nowDate = new Date().toISOString().slice(0, 10)

    const { data: goals } = await supabase
      .from("sales_goals")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })

    const goalIds = (goals || []).map((g: any) => g.id)

    const [progressRowsRes, sellerNameMap] = await Promise.all([
      goalIds.length > 0
        ? supabase
          .from("sales_goal_progress")
          .select("id, goal_id, user_id, current_amount, achieved, achieved_at")
          .in("goal_id", goalIds)
        : Promise.resolve({ data: [] }),
      resolveSellerNameMap(partnerId),
    ])
    const progressRows = progressRowsRes.data


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
        assigned_user_names: Array.isArray(goal.assigned_user_ids)
          ? goal.assigned_user_ids
            .map((id: string) => sellerNameMap.get(String(id)))
            .filter(Boolean)
          : [],
      }
    })

    return { success: true as const, goals: goalsWithProgress, sellers: Array.from(sellerNameMap.entries()).map(([id, name]) => ({ id, name })) }
  } catch (error: any) {
    return { success: false, error: error.message || "Erro ao carregar metas." }
  }
}

export async function upsertSalesGoalAction(input: GoalInput) {
  await requireUser()
  await requireMinimumPlan(input.partnerId, "crescer")
  await requirePermission(input.partnerId, "goals", input.id ? "edit" : "create")
  const supabase = await getSupabaseServerClient()

  const payload = {
    partner_id: input.partnerId,
    name: sanitizeInput(String(input.name || ""), 150).trim(),
    period_type: input.periodType,
    start_date: input.startDate,
    end_date: input.endDate,
    target_amount: money(Number(input.targetAmount || 0)),
    bonus_type: input.bonusType,
    bonus_value: money(Number(input.bonusValue || 0)),
    applies_to: input.appliesTo,
    user_id: input.appliesTo === "user" ? (input.userId || null) : null,
    assigned_user_ids:
      input.appliesTo === "user"
        ? Array.from(new Set((input.assignedUserIds || []).filter(Boolean)))
        : [],
    goal_type: "sales",
    auto_launch_bonus: Boolean(input.autoLaunchBonus),
    bonus_account_id: input.autoLaunchBonus ? input.bonusAccountId || null : null,
    bonus_distribution: input.bonusDistribution || "equal",
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
  await requireMinimumPlan(partnerId, "crescer")
  await requirePermission(partnerId, "goals", "delete")
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

  const [{ data: sales }, sellerNameMap, { data: activeGoals }] = await Promise.all([
    salesQuery,
    resolveSellerNameMap(partnerId),
    goalsQuery,
  ])

  // Fetch progress only for retrieved goals (avoids full-table scan on sales_goal_progress)
  const goalIds = (activeGoals || []).map((g: any) => String(g.id))
  const goalProgress = goalIds.length > 0
    ? (await admin
      .from("sales_goal_progress")
      .select("goal_id, user_id, current_amount")
      .in("goal_id", goalIds)
    ).data
    : []

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
  await requirePermission(partnerId, "goals", "view")
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
  await requirePermission(partnerId, "goals", "view")
  const supabase = await getSupabaseServerClient()

  // Try RPC first (single server-side aggregation - much faster)
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc("get_sales_goals_summary", {
      p_partner_id: partnerId,
    })

    if (!rpcError && rpcResult) {
      return {
        success: true as const,
        summary: {
          total_sold: money(Number(rpcResult.total_sold || 0)),
          total_commissions: money(Number(rpcResult.total_commissions || 0)),
          total_bonus_paid: money(Number(rpcResult.total_bonus_paid || 0)),
          active_goals: Number(rpcResult.active_goals || 0),
          achieved_goals: Number(rpcResult.achieved_goals || 0),
        },
      }
    }
  } catch {
    // RPC not deployed yet - fall through to legacy multi-query
  }

  // Fallback: original multi-query approach (removed once RPC is deployed)
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: sales }, { data: commissions }, { data: bonusPaid }, { data: goals }] = await Promise.all([
    supabase.from("sales").select("final_amount").eq("partner_id", partnerId).in("payment_status", ["paid", "partially_paid"]),
    supabase.from("transactions").select("amount").eq("partner_id", partnerId).eq("category", "Comissões").eq("transaction_type", "expense"),
    supabase
      .from("transactions")
      .select("amount, description")
      .eq("partner_id", partnerId)
      .eq("transaction_type", "expense")
      .eq("category", "Metas e Bônus")
      .ilike("description", "%Bônus por meta atingida%"),
    supabase.from("sales_goals").select("id, start_date, end_date").eq("partner_id", partnerId),
  ])

  const goalIds = (goals || []).map((g: any) => String(g.id))
  const progress = goalIds.length > 0
    ? (await supabase.from("sales_goal_progress").select("goal_id, achieved").in("goal_id", goalIds)).data
    : []

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

export async function getGoalFormOptionsAction(partnerId: string) {
  await requireUser()
  await requirePermission(partnerId, "goals", "view")
  const supabase = await getSupabaseServerClient()
  const sellerMap = await resolveSellerNameMap(partnerId)
  const { data: accounts } = await supabase
    .from("finance_accounts")
    .select("id, name, type")
    .eq("partner_id", partnerId)
    .order("name", { ascending: true })

  return {
    success: true as const,
    sellers: Array.from(sellerMap.entries()).map(([id, name]) => ({ id, name })),
    accounts: (accounts || []).map((a: any) => ({
      id: String(a.id),
      name: String(a.name || "Conta"),
      type: String(a.type || "cash"),
    })),
  }
}

export async function getSalesGoalByIdAction(partnerId: string, goalId: string) {
  await requireUser()
  await requirePermission(partnerId, "goals", "view")
  const supabase = await getSupabaseServerClient()

  const [goalRes, progressRes, sellerNameMap] = await Promise.all([
    supabase
      .from("sales_goals")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("id", goalId)
      .maybeSingle(),
    supabase
      .from("sales_goal_progress")
      .select("id, goal_id, user_id, current_amount, achieved, achieved_at")
      .eq("goal_id", goalId),
    resolveSellerNameMap(partnerId),
  ])

  if (goalRes.error || !goalRes.data) {
    return { success: false as const, error: goalRes.error?.message || "Meta não encontrada." }
  }

  const goal = goalRes.data as any
  const progressRows = progressRes.data || []

  let bonusAccountName: string | null = null
  if (goal.bonus_account_id) {
    const { data: acc } = await supabase
      .from("finance_accounts")
      .select("name")
      .eq("id", goal.bonus_account_id)
      .maybeSingle()
    if (acc) bonusAccountName = acc.name
  }

  const assignedUserIds: string[] = goal.assigned_user_ids || (goal.user_id ? [goal.user_id] : [])
  const assignedUserNames = assignedUserIds.map((id) => sellerNameMap.get(id) || "Vendedor")

  const progressDetail = progressRows.map((p: any) => ({
    id: p.id,
    user_id: p.user_id,
    seller_name: sellerNameMap.get(p.user_id) || "Vendedor",
    current_amount: money(Number(p.current_amount || 0)),
    achieved: Boolean(p.achieved),
    achieved_at: p.achieved_at,
  }))

  const totalCurrentAmount = progressDetail.reduce((sum, p) => sum + p.current_amount, 0)
  const targetAmount = money(Number(goal.target_amount || 0))
  const progressPercent = targetAmount > 0 ? Math.min(100, Math.round((totalCurrentAmount / targetAmount) * 100)) : 0

  const nowDate = new Date().toISOString().slice(0, 10)
  let computedStatus: "Em andamento" | "Concluída" | "Expirada" = "Em andamento"
  if (progressPercent >= 100) {
    computedStatus = "Concluída"
  } else if (goal.end_date && String(goal.end_date) < nowDate) {
    computedStatus = "Expirada"
  }

  return {
    success: true as const,
    goal: {
      ...goal,
      assigned_user_names: assignedUserNames,
      bonus_account_name: bonusAccountName,
      current_amount: totalCurrentAmount,
      progress_percent: progressPercent,
      status: computedStatus,
      progress_detail: progressDetail,
    },
  }
}

