import type { SupabaseClient } from "@supabase/supabase-js"

type GoalRow = {
  id: string
  partner_id: string
  period_type: "monthly" | "weekly"
  start_date: string
  end_date: string
  target_amount: number
  bonus_type: "fixed" | "percentage"
  bonus_value: number
  applies_to: "all" | "user"
  user_id: string | null
  assigned_user_ids?: string[] | null
  goal_type?: "sales" | "service_orders" | "both"
  auto_launch_bonus?: boolean | null
  bonus_account_id?: string | null
  name?: string | null
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

async function createGoalBonusExpense(params: {
  supabase: SupabaseClient
  partnerId: string
  goalId: string
  userId: string
  amount: number
  createdByUserId?: string | null
  accountId?: string | null
}) {
  const bonusAmount = money(Math.max(0, Number(params.amount || 0)))
  if (bonusAmount <= 0.009) return

  const referenceNote = `goal-bonus:${params.goalId}:${params.userId}`
  const { data: existing } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", referenceNote)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    partner_id: params.partnerId,
    description: "Bônus por meta atingida",
    category: "Metas e Bônus",
    amount: bonusAmount,
    original_amount: bonusAmount,
    status: "paid",
    payment_date: now,
    transaction_date: now,
    payment_type: "Bônus meta",
    transaction_type: "expense",
    origin: "system",
    notes: null,
    reference_note: referenceNote,
    account_id: params.accountId || null,
    created_by_user_id: params.createdByUserId || null,
  }

  let insertRes = await params.supabase.from("transactions").insert(payload)
  if (insertRes.error && String(insertRes.error.message || "").includes("created_by_user_id")) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.created_by_user_id
    insertRes = await params.supabase.from("transactions").insert(fallbackPayload)
  }
}

async function reverseGoalBonusExpense(params: {
  supabase: SupabaseClient
  partnerId: string
  goalId: string
  userId: string
  createdByUserId?: string | null
  accountId?: string | null
}) {
  const referenceNote = `goal-bonus:${params.goalId}:${params.userId}`
  const { data: original } = await params.supabase
    .from("transactions")
    .select("id, amount")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", referenceNote)
    .eq("transaction_type", "expense")
    .limit(1)
    .maybeSingle()
  if (!original?.id) return

  const reverseReference = `goal-bonus-reversal:${original.id}`
  const { data: existingReverse } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", reverseReference)
    .limit(1)
    .maybeSingle()
  if (existingReverse?.id) return

  const amount = money(Math.abs(Number(original.amount || 0)))
  if (amount <= 0.009) return
  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    partner_id: params.partnerId,
    description: "Estorno bônus por meta",
    category: "Metas e Bônus",
    amount,
    original_amount: amount,
    status: "paid",
    payment_date: now,
    transaction_date: now,
    payment_type: "Bônus meta",
    transaction_type: "refund",
    refund_kind: "expense_refund",
    origin: "system",
    notes: null,
    reference_note: reverseReference,
    account_id: params.accountId || null,
    created_by_user_id: params.createdByUserId || null,
  }

  let insertRes = await params.supabase.from("transactions").insert(payload)
  if (insertRes.error && String(insertRes.error.message || "").includes("created_by_user_id")) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.created_by_user_id
    insertRes = await params.supabase.from("transactions").insert(fallbackPayload)
  }
}

async function getActiveGoalsForSeller(params: {
  supabase: SupabaseClient
  partnerId: string
  sellerUserId: string
  saleDateIso?: string
  activityType: "sales" | "service_orders"
}) {
  if (!params.sellerUserId || params.sellerUserId === "null") return []
  
  const day = new Date(params.saleDateIso || new Date().toISOString()).toISOString().slice(0, 10)
  
  let query = params.supabase
    .from("sales_goals")
    .select("*")
    .eq("partner_id", params.partnerId)
    .lte("start_date", day)
    .gte("end_date", day)
    .or(`applies_to.eq.all,user_id.eq.${params.sellerUserId},assigned_user_ids.cs.{${params.sellerUserId}}`)

  if (params.activityType === "sales") {
    query = query.in("goal_type", ["sales", "both"])
  } else if (params.activityType === "service_orders") {
    query = query.in("goal_type", ["service_orders", "both"])
  }

  const { data } = await query
  return (data || []) as GoalRow[]
}

export async function applySaleToGoals(params: {
  supabase: SupabaseClient
  partnerId: string
  sellerUserId: string
  saleAmount: number
  saleDateIso?: string
  createdByUserId?: string | null
  accountId?: string | null
}) {
  const amount = money(Math.max(0, Number(params.saleAmount || 0)))
  if (amount <= 0.009) return
  const goals = await getActiveGoalsForSeller({ ...params, activityType: "sales" })
  if (goals.length === 0) return

  // Batch-fetch all progress rows for this seller's active goals (eliminates N+1)
  const goalIds = goals.map(g => g.id)
  const { data: allProgress } = await params.supabase
    .from("sales_goal_progress")
    .select("id, goal_id, current_amount, achieved, achieved_at")
    .in("goal_id", goalIds)
    .eq("user_id", params.sellerUserId)

  const progressMap = new Map(
    (allProgress || []).map((p: any) => [String(p.goal_id), p])
  )

  for (const goal of goals) {

    const existingProgress = progressMap.get(goal.id) || null

    const currentAmount = money(Number(existingProgress?.current_amount || 0))
    const nextAmount = money(currentAmount + amount)
    const alreadyAchieved = Boolean(existingProgress?.achieved)
    const justAchieved = !alreadyAchieved && nextAmount >= Number(goal.target_amount || 0)
    const achievedAt = justAchieved ? new Date().toISOString() : null

    await params.supabase
      .from("sales_goal_progress")
      .upsert({
        goal_id: goal.id,
        user_id: params.sellerUserId,
        current_amount: nextAmount,
        achieved: alreadyAchieved || justAchieved,
        achieved_at: justAchieved ? achievedAt : (existingProgress as any)?.achieved_at || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "goal_id,user_id" })

    if (justAchieved) {
      const bonus =
        goal.bonus_type === "fixed"
          ? money(Number(goal.bonus_value || 0))
          : money((nextAmount * Number(goal.bonus_value || 0)) / 100)

      const shouldLaunchBonus = Boolean(goal.auto_launch_bonus)
      if (!shouldLaunchBonus) continue

      await createGoalBonusExpense({
        supabase: params.supabase,
        partnerId: params.partnerId,
        goalId: goal.id,
        userId: params.sellerUserId,
        amount: bonus,
        createdByUserId: params.createdByUserId || null,
        accountId: goal.bonus_account_id || params.accountId || null,
      })
    }
  }
}

export async function reverseSaleFromGoals(params: {
  supabase: SupabaseClient
  partnerId: string
  sellerUserId: string
  saleAmount: number
  saleDateIso?: string
  createdByUserId?: string | null
  accountId?: string | null
}) {
  const amount = money(Math.max(0, Number(params.saleAmount || 0)))
  if (amount <= 0.009) return
  const goals = await getActiveGoalsForSeller({ ...params, activityType: "sales" })
  if (goals.length === 0) return

  // Batch-fetch all progress rows for this seller's active goals (eliminates N+1)
  const goalIds = goals.map(g => g.id)
  const { data: allProgress } = await params.supabase
    .from("sales_goal_progress")
    .select("id, goal_id, current_amount, achieved, achieved_at")
    .in("goal_id", goalIds)
    .eq("user_id", params.sellerUserId)

  const progressMap = new Map(
    (allProgress || []).map((p: any) => [String(p.goal_id), p])
  )

  for (const goal of goals) {
    const progress = progressMap.get(goal.id) || null
    if (!progress?.id) continue

    const prevAmount = money(Number(progress.current_amount || 0))
    const nextAmount = money(Math.max(0, prevAmount - amount))
    const target = Number(goal.target_amount || 0)
    const wasAchieved = Boolean(progress.achieved)
    const stillAchieved = nextAmount >= target

    await params.supabase
      .from("sales_goal_progress")
      .update({
        current_amount: nextAmount,
        achieved: stillAchieved,
        achieved_at: stillAchieved ? (progress as any).achieved_at || null : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", progress.id)

    if (wasAchieved && !stillAchieved) {
      const shouldLaunchBonus = Boolean(goal.auto_launch_bonus)
      if (!shouldLaunchBonus) continue

      await reverseGoalBonusExpense({
        supabase: params.supabase,
        partnerId: params.partnerId,
        goalId: goal.id,
        userId: params.sellerUserId,
        createdByUserId: params.createdByUserId || null,
        accountId: goal.bonus_account_id || params.accountId || null,
      })
    }
  }
}
