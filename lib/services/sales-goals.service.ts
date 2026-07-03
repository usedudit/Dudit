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
  bonus_distribution?: string | null
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
  referenceNote?: string
  createdByUserId?: string | null
  accountId?: string | null
  status?: "paid" | "pending"
  sellerPartnerUserId?: string | null
}) {
  const bonusAmount = money(Math.max(0, Number(params.amount || 0)))
  if (bonusAmount <= 0.009) return

  const referenceNote = params.referenceNote || `goal-bonus:${params.goalId}:${params.userId}`
  const { data: existing } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", referenceNote)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return

  const status = params.status || "paid"
  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    partner_id: params.partnerId,
    description: "Bônus por meta atingida",
    category: "Metas e Bônus",
    amount: bonusAmount,
    original_amount: bonusAmount,
    status,
    payment_date: status === "paid" ? now : null,
    transaction_date: now,
    payment_type: "Bônus meta",
    transaction_type: "expense",
    origin: "system",
    notes: null,
    reference_note: referenceNote,
    account_id: params.accountId || null,
    created_by_user_id: params.createdByUserId || null,
    seller_partner_user_id: params.sellerPartnerUserId || null,
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
  const refPatterns = [
    `goal-bonus:${params.goalId}:${params.userId}`,
    `goal-bonus-team:${params.goalId}:${params.userId}`,
  ]

  for (const referenceNote of refPatterns) {
    const { data: original } = await params.supabase
      .from("transactions")
      .select("id, amount")
      .eq("partner_id", params.partnerId)
      .eq("reference_note", referenceNote)
      .eq("transaction_type", "expense")
      .limit(1)
      .maybeSingle()
    if (!original?.id) continue

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
    return
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

async function getUserToPartnerUserMap(supabase: SupabaseClient, partnerId: string, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>()
  const { data } = await supabase
    .from("partner_users")
    .select("id, user_id")
    .eq("partner_id", partnerId)
    .in("user_id", userIds)
  const map = new Map<string, string>()
  for (const row of data || []) {
    map.set(String(row.user_id), String(row.id))
  }
  return map
}

async function processGoalBonus(params: {
  supabase: SupabaseClient
  partnerId: string
  goal: GoalRow
  sellerUserId: string
  prevTotal: number
  newTotal: number
  createdByUserId?: string | null
  accountId?: string | null
}) {
  const target = Number(params.goal.target_amount || 0)
  const wasTotalAchieved = params.prevTotal >= target
  const isTotalJustAchieved = !wasTotalAchieved && params.newTotal >= target

  if (!isTotalJustAchieved) return

  const teamRefNote = `goal-bonus-team:${params.goal.id}`
  const { data: existingTeamBonus } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .ilike("reference_note", `${teamRefNote}:%`)
    .limit(1)
    .maybeSingle()
  if (existingTeamBonus?.id) return

  const totalBonus = params.goal.bonus_type === "fixed"
    ? money(Number(params.goal.bonus_value || 0))
    : money((target * Number(params.goal.bonus_value || 0)) / 100)

  if (totalBonus <= 0.009) return

  const { data: allProgress } = await params.supabase
    .from("sales_goal_progress")
    .select("user_id, current_amount")
    .eq("goal_id", params.goal.id)

  const eligible = new Map<string, number>()
  for (const p of allProgress || []) {
    const amt = Number(p.current_amount || 0)
    if (amt > 0) eligible.set(p.user_id, amt)
  }
  if (!eligible.has(params.sellerUserId)) {
    eligible.set(params.sellerUserId, params.newTotal)
  }

  const totalProgress = Array.from(eligible.values()).reduce((s, v) => s + v, 0)
  const distribution = params.goal.bonus_distribution || "equal"
  const autoLaunch = Boolean(params.goal.auto_launch_bonus)

  const userIds = Array.from(eligible.keys())
  const partnerUserMap = autoLaunch ? new Map<string, string>() : await getUserToPartnerUserMap(params.supabase, params.partnerId, userIds)

  const createFn = (uid: string, share: number) => {
    if (share <= 0.009) return
    return createGoalBonusExpense({
      supabase: params.supabase,
      partnerId: params.partnerId,
      goalId: params.goal.id,
      userId: uid,
      referenceNote: `${teamRefNote}:${uid}`,
      amount: share,
      createdByUserId: params.createdByUserId || null,
      accountId: params.goal.bonus_account_id || params.accountId || null,
      status: autoLaunch ? "paid" : "pending",
      sellerPartnerUserId: autoLaunch ? null : partnerUserMap.get(uid) || null,
    })
  }

  if (distribution === "equal") {
    const share = money(totalBonus / eligible.size)
    for (const [uid] of eligible) {
      await createFn(uid, share)
    }
  } else {
    for (const [uid, userAmount] of eligible) {
      const share = money((userAmount / totalProgress) * totalBonus)
      await createFn(uid, share)
    }
  }
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

  const goalIds = goals.map(g => g.id)
  const { data: allProgress } = await params.supabase
    .from("sales_goal_progress")
    .select("id, goal_id, user_id, current_amount, achieved, achieved_at")
    .in("goal_id", goalIds)

  const progressByGoal = new Map<string, any[]>()
  for (const p of allProgress || []) {
    const list = progressByGoal.get(String(p.goal_id)) || []
    list.push(p)
    progressByGoal.set(String(p.goal_id), list)
  }

  for (const goal of goals) {
    const goalProgress = progressByGoal.get(goal.id) || []
    const currentSellerProgress = goalProgress.find((p: any) => p.user_id === params.sellerUserId)

    const prevTotal = goalProgress.reduce((sum, p) => sum + money(Number(p.current_amount || 0)), 0)

    const currentAmount = money(Number(currentSellerProgress?.current_amount || 0))
    const nextAmount = money(currentAmount + amount)
    const alreadyAchieved = Boolean(currentSellerProgress?.achieved)
    const justAchieved = !alreadyAchieved && nextAmount >= Number(goal.target_amount || 0)

    await params.supabase
      .from("sales_goal_progress")
      .upsert({
        goal_id: goal.id,
        user_id: params.sellerUserId,
        current_amount: nextAmount,
        achieved: alreadyAchieved || justAchieved,
        achieved_at: justAchieved ? new Date().toISOString() : (currentSellerProgress as any)?.achieved_at || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "goal_id,user_id" })

    await processGoalBonus({
      supabase: params.supabase,
      partnerId: params.partnerId,
      goal,
      sellerUserId: params.sellerUserId,
      prevTotal,
      newTotal: prevTotal + amount,
      createdByUserId: params.createdByUserId || null,
      accountId: params.accountId || null,
    })
  }
}

export async function applyServiceOrderToGoals(params: {
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
  const goals = await getActiveGoalsForSeller({ ...params, activityType: "service_orders" })
  if (goals.length === 0) return

  const goalIds = goals.map(g => g.id)
  const { data: allProgress } = await params.supabase
    .from("sales_goal_progress")
    .select("id, goal_id, user_id, current_amount, achieved, achieved_at")
    .in("goal_id", goalIds)

  const progressByGoal = new Map<string, any[]>()
  for (const p of allProgress || []) {
    const list = progressByGoal.get(String(p.goal_id)) || []
    list.push(p)
    progressByGoal.set(String(p.goal_id), list)
  }

  for (const goal of goals) {
    const goalProgress = progressByGoal.get(goal.id) || []
    const currentSellerProgress = goalProgress.find((p: any) => p.user_id === params.sellerUserId)

    const prevTotal = goalProgress.reduce((sum, p) => sum + money(Number(p.current_amount || 0)), 0)

    const currentAmount = money(Number(currentSellerProgress?.current_amount || 0))
    const nextAmount = money(currentAmount + amount)
    const alreadyAchieved = Boolean(currentSellerProgress?.achieved)
    const justAchieved = !alreadyAchieved && nextAmount >= Number(goal.target_amount || 0)

    await params.supabase
      .from("sales_goal_progress")
      .upsert({
        goal_id: goal.id,
        user_id: params.sellerUserId,
        current_amount: nextAmount,
        achieved: alreadyAchieved || justAchieved,
        achieved_at: justAchieved ? new Date().toISOString() : (currentSellerProgress as any)?.achieved_at || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "goal_id,user_id" })

    await processGoalBonus({
      supabase: params.supabase,
      partnerId: params.partnerId,
      goal,
      sellerUserId: params.sellerUserId,
      prevTotal,
      newTotal: prevTotal + amount,
      createdByUserId: params.createdByUserId || null,
      accountId: params.accountId || null,
    })
  }
}

async function reverseAllTeamBonusExpenses(params: {
  supabase: SupabaseClient
  partnerId: string
  goalId: string
  createdByUserId?: string | null
  accountId?: string | null
}) {
  const teamRefPattern = `goal-bonus-team:${params.goalId}:%`
  const { data: bonuses } = await params.supabase
    .from("transactions")
    .select("id, amount")
    .eq("partner_id", params.partnerId)
    .eq("transaction_type", "expense")
    .ilike("reference_note", teamRefPattern)

  for (const bonus of bonuses || []) {
    const reverseRef = `goal-bonus-reversal:${bonus.id}`
    const { data: existing } = await params.supabase
      .from("transactions")
      .select("id")
      .eq("partner_id", params.partnerId)
      .eq("reference_note", reverseRef)
      .limit(1)
      .maybeSingle()
    if (existing?.id) continue

    const amount = money(Math.abs(Number(bonus.amount || 0)))
    if (amount <= 0.009) continue

    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {
      partner_id: params.partnerId,
      description: "Estorno bônus por meta (time)",
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
      reference_note: reverseRef,
      account_id: params.accountId || null,
      created_by_user_id: params.createdByUserId || null,
    }

    let insertRes = await params.supabase.from("transactions").insert(payload)
    if (insertRes.error && String(insertRes.error.message || "").includes("created_by_user_id")) {
      const fb = { ...payload }
      delete fb.created_by_user_id
      insertRes = await params.supabase.from("transactions").insert(fb)
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

  const goalIds = goals.map(g => g.id)
  const { data: allProgress } = await params.supabase
    .from("sales_goal_progress")
    .select("id, goal_id, user_id, current_amount, achieved, achieved_at")
    .in("goal_id", goalIds)

  const progressByGoal = new Map<string, any[]>()
  for (const p of allProgress || []) {
    const list = progressByGoal.get(String(p.goal_id)) || []
    list.push(p)
    progressByGoal.set(String(p.goal_id), list)
  }

  for (const goal of goals) {
    const goalProgress = progressByGoal.get(goal.id) || []
    const progress = goalProgress.find((p: any) => p.user_id === params.sellerUserId)
    if (!progress?.id) continue

    const prevAmount = money(Number(progress.current_amount || 0))
    const nextAmount = money(Math.max(0, prevAmount - amount))
    const target = Number(goal.target_amount || 0)
    const actualReduction = prevAmount - nextAmount
    const prevTeamTotal = goalProgress.reduce((sum, p) => sum + money(Number(p.current_amount || 0)), 0)
    const newTeamTotal = prevTeamTotal - actualReduction
    const teamWasAchieved = prevTeamTotal >= target
    const teamIsAchieved = newTeamTotal >= target

    await params.supabase
      .from("sales_goal_progress")
      .update({
        current_amount: nextAmount,
        achieved: nextAmount >= target,
        achieved_at: nextAmount >= target ? (progress as any).achieved_at || null : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", progress.id)

    if (!Boolean(goal.auto_launch_bonus)) continue

    if (teamWasAchieved && !teamIsAchieved) {
      await reverseAllTeamBonusExpenses({
        supabase: params.supabase,
        partnerId: params.partnerId,
        goalId: goal.id,
        createdByUserId: params.createdByUserId || null,
        accountId: goal.bonus_account_id || params.accountId || null,
      })
    }
  }
}
