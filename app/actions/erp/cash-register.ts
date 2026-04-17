"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { revalidatePath } from "next/cache"

export type CountedPaymentMethodEntry = {
  paymentMethodId?: string | null
  amount: number
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

async function resolveDefaultCashFinanceAccountId(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("finance_accounts")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("type", "cash")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

function isMovementActive(row: { reversed_at?: string | null }) {
  return row.reversed_at == null
}

/** Cash drawer balance: initial + cash sales + deposits − withdrawals − refunds (active movements only). */
export function computeDrawerBalanceCents(params: {
  initialAmount: number
  movements: Array<{
    type: string
    amount: number | string
    reversed_at?: string | null
    payment_method_id?: string | null
    payment_method_type?: string | null
  }>
}) {
  const initial = money(Number(params.initialAmount || 0))
  let cashSales = 0
  let deposits = 0
  let withdrawals = 0
  let refunds = 0

  for (const m of params.movements || []) {
    if (!isMovementActive(m)) continue
    const amt = money(Number(m.amount || 0))
    if (!(amt > 0)) continue
    if (m.type === "deposit") deposits += amt
    else if (m.type === "withdrawal") withdrawals += amt
    else if (m.type === "refund") refunds += amt
    else if (m.type === "sale") {
      const pmType = m.payment_method_type
      const isCash = !m.payment_method_id || pmType === "cash"
      if (isCash) cashSales += amt
    }
  }

  const total = money(initial + cashSales + deposits - withdrawals - refunds)
  return {
    initial,
    cashSales,
    deposits,
    withdrawals,
    refunds,
    total,
  }
}

async function loadMovementsForSession(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  cashSessionId: string,
) {
  const { data: movements, error } = await supabase
    .from("cash_movements")
    .select("id, type, description, payment_method_id, amount, created_at, reference_id, reversed_at, reversed_by_user_id, created_by_user_id, financial_transaction_id")
    .eq("partner_id", partnerId)
    .eq("cash_session_id", cashSessionId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)

  const pmIds = Array.from(
    new Set((movements || []).map((m: { payment_method_id: string | null }) => m.payment_method_id).filter(Boolean),
  ) as string[]

  const pmMap = new Map<string, { name: string; type: string }>()
  if (pmIds.length > 0) {
    const { data: methods } = await supabase
      .from("payment_methods")
      .select("id, name, type")
      .eq("partner_id", partnerId)
      .in("id", pmIds)
    for (const row of methods || []) {
      pmMap.set(row.id, { name: row.name || "—", type: row.type || "other" })
    }
  }

  const enriched = (movements || []).map((m: any) => ({
    ...m,
    payment_method_name: m.payment_method_id ? pmMap.get(m.payment_method_id)?.name || "Método removido" : "Dinheiro (não informado)",
    payment_method_type: m.payment_method_id ? pmMap.get(m.payment_method_id)?.type || null : "cash",
  }))

  return enriched
}

async function getOpenSessionForUser(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "open")
    .eq("opened_by_user_id", userId)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function getActiveCashSessionAction(partnerId: string) {
  const user = await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  const supabase = await getSupabaseServerClient()
  const session = await getOpenSessionForUser(supabase, partnerId, user.id)
  return { success: true as const, data: session || null }
}

export async function openCashSessionAction(input: {
  partnerId: string
  /** Troco inicial / fundo de caixa — valor de controle (não gera lançamento financeiro). */
  initialAmount: number
  notes?: string
}) {
  const user = await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const raw = Number(input.initialAmount ?? 0)
  if (!Number.isFinite(raw)) return { success: false as const, error: "Valor inicial inválido." }
  const initialAmount = money(Math.max(0, raw))

  const existing = await getOpenSessionForUser(supabase, input.partnerId, user.id)
  if (existing?.id) {
    return { success: false as const, error: "Você já possui um caixa aberto." }
  }

  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({
      partner_id: input.partnerId,
      opened_by_user_id: user.id,
      initial_amount: initialAmount,
      status: "open",
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { success: false as const, error: "Você já possui um caixa aberto." }
    }
    return { success: false as const, error: error.message }
  }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "cash_session",
    entityId: data.id,
    actionType: "cash_opened",
    changeLines: [`abriu o caixa com troco inicial de R$ ${initialAmount.toFixed(2)}.`],
    source: "manual",
  })
  await revalidateEntityTimeline("cash_session", data.id)
  revalidatePath("/erp/cash-register")
  revalidatePath("/erp/pos")

  return { success: true as const, data }
}

export async function createCashMovementAction(input: {
  partnerId: string
  cashSessionId?: string
  type: "withdrawal" | "deposit"
  description: string
  amount: number
  /** Conta financeira tipo caixa; se omitido, usa a primeira conta caixa ativa do parceiro. */
  cashFinanceAccountId?: string | null
}) {
  const user = await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  let sessionId = input.cashSessionId || null
  if (!sessionId) {
    const s = await getOpenSessionForUser(supabase, input.partnerId, user.id)
    sessionId = s?.id || null
  } else {
    const { data: s } = await supabase
      .from("cash_sessions")
      .select("id, status, opened_by_user_id")
      .eq("id", sessionId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()
    if (!s?.id || s.status !== "open") {
      return { success: false as const, error: "Sessão inválida ou caixa fechado." }
    }
  }

  if (!sessionId) return { success: false as const, error: "Não existe caixa aberto para esta operação." }

  const rawAmount = Number(input.amount || 0)
  if (!Number.isFinite(rawAmount) || !(rawAmount > 0)) {
    return { success: false as const, error: "Informe um valor maior que zero." }
  }
  if (!String(input.description || "").trim()) {
    return { success: false as const, error: "Descrição é obrigatória." }
  }

  const cashAccountId =
    input.cashFinanceAccountId?.trim() || (await resolveDefaultCashFinanceAccountId(supabase, input.partnerId))
  if (!cashAccountId) {
    return { success: false as const, error: "Cadastre uma conta financeira do tipo caixa para registrar sangrias e reforços." }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("erp_create_cash_manual_movement", {
    p_partner_id: input.partnerId,
    p_cash_session_id: sessionId,
    p_movement_type: input.type,
    p_amount: money(rawAmount),
    p_description: input.description.trim(),
    p_cash_account_id: cashAccountId,
  })

  if (rpcError) {
    return { success: false as const, error: rpcError.message || "Falha ao registrar movimentação." }
  }

  const movementId = (rpcData as any)?.movement_id as string | undefined
  const typeLabel = input.type === "withdrawal" ? "Sangria" : "Reforço"
  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "cash_session",
    entityId: sessionId,
    actionType: input.type === "withdrawal" ? "withdrawal_created" : "deposit_created",
    changeLines: [`registrou ${typeLabel.toLowerCase()} de R$ ${money(rawAmount).toFixed(2)} — ${input.description.trim()}`],
    metadata: movementId ? { movement_id: movementId } : null,
    source: "manual",
  })
  await revalidateEntityTimeline("cash_session", sessionId)
  revalidatePath("/erp/cash-register")
  revalidatePath("/erp/transactions")

  const { data: movement } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("id", movementId || "")
    .maybeSingle()

  return { success: true as const, data: movement || rpcData }
}

export async function reverseCashMovementAction(input: {
  partnerId: string
  movementId: string
}) {
  const user = await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const { data: rpcData, error: rpcError } = await supabase.rpc("erp_reverse_cash_manual_movement", {
    p_partner_id: input.partnerId,
    p_movement_id: input.movementId,
  })

  if (rpcError) {
    return { success: false as const, error: rpcError.message || "Não foi possível estornar a movimentação." }
  }

  const { data: movement } = await supabase
    .from("cash_movements")
    .select("cash_session_id, description, amount, type")
    .eq("id", input.movementId)
    .maybeSingle()

  if (movement?.cash_session_id) {
    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      entityType: "cash_session",
      entityId: movement.cash_session_id,
      actionType: "movement_reversed",
      changeLines: [
        `estornou ${movement.type === "withdrawal" ? "sangria" : "reforço"} de R$ ${money(Number(movement.amount || 0)).toFixed(2)} — ${String(movement.description || "").slice(0, 120)}`,
      ],
      source: "manual",
    })
    await revalidateEntityTimeline("cash_session", movement.cash_session_id)
  }

  revalidatePath("/erp/cash-register")
  revalidatePath("/erp/transactions")

  return { success: true as const, data: rpcData }
}

export async function getCashSessionCloseSummaryAction(partnerId: string, cashSessionId: string) {
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  const supabase = await getSupabaseServerClient()

  const { data: session, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("id", cashSessionId)
    .eq("partner_id", partnerId)
    .single()
  if (sessionError || !session) return { success: false as const, error: sessionError?.message || "Caixa não encontrado." }

  const movements = await loadMovementsForSession(supabase, partnerId, cashSessionId)
  const drawer = computeDrawerBalanceCents({
    initialAmount: Number(session.initial_amount ?? session.opening_balance ?? 0),
    movements: movements as any[],
  })

  const grouped = new Map<string, { paymentMethodId: string | null; label: string; calculated: number }>()
  for (const m of movements) {
    if (!isMovementActive(m)) continue
    if (m.type !== "sale") continue
    const isCash = !m.payment_method_id || m.payment_method_type === "cash"
    if (!isCash) continue
    const key = m.payment_method_id || "__cash__"
    const label = m.payment_method_name || "Dinheiro"
    const amt = money(Number(m.amount || 0))
    const cur = grouped.get(key)
    if (cur) cur.calculated = money(cur.calculated + amt)
    else grouped.set(key, { paymentMethodId: m.payment_method_id || null, label, calculated: amt })
  }

  const groupedByMethod = Array.from(grouped.values()).sort((a, b) => b.calculated - a.calculated)

  return {
    success: true as const,
    data: {
      session,
      movements,
      groupedByMethod,
      drawer,
      expectedDrawerTotal: drawer.total,
    },
  }
}

export async function closeCashSessionAction(input: {
  partnerId: string
  cashSessionId: string
  countedByMethod?: CountedPaymentMethodEntry[]
  notes?: string
}) {
  const user = await requireUser()
  const access = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const summary = await getCashSessionCloseSummaryAction(input.partnerId, input.cashSessionId)
  if (!summary.success) return summary

  const session = summary.data.session as any
  if (session.status !== "open") {
    return { success: false as const, error: "Este caixa já foi fechado." }
  }

  const role = String(access.role || "").toUpperCase()
  const isAdminRole = role === "OWNER" || role === "ADMIN"
  const openedBy = session.opened_by_user_id || session.user_id
  if (openedBy !== user.id && !isAdminRole) {
    return { success: false as const, error: "Apenas o operador que abriu o caixa ou um administrador podem fechar." }
  }

  const countedRows = (input.countedByMethod || []).map((row) => ({
    paymentMethodId: row.paymentMethodId ?? null,
    amount: money(Math.max(0, Number(row.amount || 0))),
  }))
  const countedTotal = money(countedRows.reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0))

  const calculated = summary.data.expectedDrawerTotal
  if (!Number.isFinite(calculated)) {
    return { success: false as const, error: "Não foi possível calcular o saldo esperado do caixa." }
  }

  const hasExplicitCounts = (input.countedByMethod || []).length > 0
  const informedTotal = hasExplicitCounts ? countedTotal : calculated
  const difference = money(informedTotal - calculated)

  const closingPayload = {
    closing_amount: informedTotal,
    calculated_amount: calculated,
    difference_amount: difference,
    closed_at: new Date().toISOString(),
    closed_by_user_id: user.id,
    status: "closed",
    notes: input.notes?.trim() || session.notes || null,
    updated_at: new Date().toISOString(),
    closing_method_counts: countedRows.length > 0 ? countedRows : null,
  }

  const { data, error } = await supabase
    .from("cash_sessions")
    .update(closingPayload)
    .eq("id", input.cashSessionId)
    .eq("partner_id", input.partnerId)
    .eq("status", "open")
    .select("*")
    .single()

  if (error) return { success: false as const, error: error.message }

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "cash_session",
    entityId: input.cashSessionId,
    actionType: "cash_closed",
    changeLines: [
      `fechou o caixa. Valor informado (contagem): R$ ${informedTotal.toFixed(2)}; calculado: R$ ${calculated.toFixed(2)}; diferença: R$ ${difference.toFixed(2)}.`,
    ],
    source: "manual",
  })
  await revalidateEntityTimeline("cash_session", input.cashSessionId)
  revalidatePath("/erp/cash-register")
  revalidatePath("/erp/pos")

  return {
    success: true as const,
    data: {
      ...data,
      calculated_amount: calculated,
      closing_amount: informedTotal,
      difference_amount: difference,
      groupedByMethod: summary.data.groupedByMethod,
    },
  }
}

export async function getCashSessionsHistoryAction(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  const supabase = await getSupabaseServerClient()

  const { data: sessions, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("id, opened_by_user_id, opened_at, closed_at, initial_amount, closing_amount, calculated_amount, difference_amount, status, notes, created_at")
    .eq("partner_id", partnerId)
    .order("opened_at", { ascending: false })
    .limit(400)
  if (sessionError) return { success: false as const, error: sessionError.message }

  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  const { data: movementRows } = sessionIds.length > 0
    ? await supabase
      .from("cash_movements")
      .select("cash_session_id, type, amount, reversed_at, payment_method_id")
      .eq("partner_id", partnerId)
      .in("cash_session_id", sessionIds)
    : { data: [] as any[] }

  const userIds = Array.from(
    new Set(
      (sessions || [])
        .map((s: any) => s.opened_by_user_id)
        .filter(Boolean),
    ),
  ) as string[]

  const { data: users } = userIds.length > 0
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
    : { data: [] as any[] }

  const userMap = new Map<string, string>((users || []).map((u: any) => [u.user_id, u.full_name || "Usuário"]))

  const pmIds = Array.from(
    new Set((movementRows || []).map((r: any) => r.payment_method_id).filter(Boolean)),
  ) as string[]
  const pmType = new Map<string, string>()
  if (pmIds.length > 0) {
    const { data: pms } = await supabase.from("payment_methods").select("id, type").eq("partner_id", partnerId).in("id", pmIds)
    for (const pm of pms || []) pmType.set(pm.id, pm.type || "other")
  }

  const drawerBySession = new Map<string, number>()
  for (const row of movementRows || []) {
    if (row.reversed_at) continue
    const sid = row.cash_session_id
    const amt = money(Number(row.amount || 0))
    if (!(amt > 0)) continue
    let delta = 0
    if (row.type === "deposit") delta = amt
    else if (row.type === "withdrawal" || row.type === "refund") delta = -amt
    else if (row.type === "sale") {
      const isCash = !row.payment_method_id || pmType.get(row.payment_method_id) === "cash"
      if (isCash) delta = amt
    }
    drawerBySession.set(sid, money((drawerBySession.get(sid) || 0) + delta))
  }

  const mapped = (sessions || []).map((s: any) => {
    const initial = money(Number(s.initial_amount ?? 0))
    const drawerDelta = drawerBySession.get(s.id) || 0
    return {
      ...s,
      initial_amount: initial,
      closing_amount: s.closing_amount ?? null,
      user_name: userMap.get(s.opened_by_user_id) || "Usuário",
      drawer_movement_net: drawerDelta,
      expected_drawer_total: money(initial + drawerDelta),
    }
  })

  return { success: true as const, data: mapped }
}

export async function getCashSessionDetailsAction(partnerId: string, cashSessionId: string) {
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  const supabase = await getSupabaseServerClient()

  const { data: session, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("id", cashSessionId)
    .single()
  if (sessionError || !session) return { success: false as const, error: sessionError?.message || "Caixa não encontrado." }

  const movements = await loadMovementsForSession(supabase, partnerId, cashSessionId)

  const userIds = Array.from(
    new Set(
      [
        session.opened_by_user_id || session.user_id,
        session.closed_by_user_id,
        ...(movements || []).map((m: any) => m.created_by_user_id),
        ...(movements || []).map((m: any) => m.reversed_by_user_id),
      ].filter(Boolean),
    ),
  ) as string[]

  const { data: profiles } = userIds.length > 0
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
    : { data: [] as any[] }
  const nameById = new Map<string, string>((profiles || []).map((p: any) => [p.user_id, p.full_name || "Usuário"]))

  const initial = money(Number(session.initial_amount ?? session.opening_balance ?? 0))
  const drawer = computeDrawerBalanceCents({ initialAmount: initial, movements: movements as any[] })

  const summaryByPaymentMethod: Array<{
    paymentMethodId: string | null
    label: string
    calculated: number
    counted: number | null
    difference: number | null
  }> = []

  const countedMap = new Map<string | null, number>()
  const rawCounts = session.closing_method_counts as CountedPaymentMethodEntry[] | null
  if (Array.isArray(rawCounts)) {
    for (const c of rawCounts) {
      const k = c.paymentMethodId ?? null
      countedMap.set(k, money(Math.max(0, Number(c.amount || 0))))
    }
  }

  const saleGroups = new Map<string | null, { label: string; calculated: number }>()
  for (const m of movements) {
    if (!isMovementActive(m) || m.type !== "sale") continue
    const isCash = !m.payment_method_id || m.payment_method_type === "cash"
    if (!isCash) continue
    const key = m.payment_method_id || null
    const label = m.payment_method_name || "Dinheiro"
    const amt = money(Number(m.amount || 0))
    const cur = saleGroups.get(key)
    if (cur) cur.calculated = money(cur.calculated + amt)
    else saleGroups.set(key, { label, calculated: amt })
  }
  for (const [pmId, row] of saleGroups) {
    const countedVal = session.status === "closed" ? countedMap.get(pmId ?? null) ?? null : null
    summaryByPaymentMethod.push({
      paymentMethodId: pmId,
      label: row.label,
      calculated: row.calculated,
      counted: countedVal,
      difference: countedVal != null ? money(countedVal - row.calculated) : null,
    })
  }
  summaryByPaymentMethod.sort((a, b) => b.calculated - a.calculated)

  const adjustmentMovements = (movements || []).filter(
    (m: any) => (m.type === "withdrawal" || m.type === "deposit") && isMovementActive(m),
  )

  const enrichedMovements = (movements || []).map((m: any) => ({
    ...m,
    creator_name: m.created_by_user_id ? nameById.get(m.created_by_user_id) || "—" : "—",
    reversed_by_name: m.reversed_by_user_id ? nameById.get(m.reversed_by_user_id) || "—" : null,
  }))

  const calculatedTotal =
    session.status === "closed" && session.calculated_amount != null
      ? money(Number(session.calculated_amount))
      : drawer.total
  const informedTotal =
    session.status === "closed" && session.closing_amount != null
      ? money(Number(session.closing_amount))
      : null
  const storedDifference =
    session.status === "closed" && session.difference_amount != null ? money(Number(session.difference_amount)) : null

  return {
    success: true as const,
    data: {
      session: {
        ...session,
        initial_amount: initial,
        opened_by_user_id: session.opened_by_user_id || session.user_id,
      },
      movements: enrichedMovements,
      operators: {
        open_name: nameById.get(session.opened_by_user_id || session.user_id) || "—",
        close_name: session.closed_by_user_id ? nameById.get(session.closed_by_user_id) || "—" : null,
      },
      drawer,
      summaryByPaymentMethod,
      totals: {
        initial,
        totalCashSales: drawer.cashSales,
        totalWithdrawals: drawer.withdrawals,
        totalDeposits: drawer.deposits,
        totalRefunds: drawer.refunds,
        calculatedDrawerTotal: calculatedTotal,
        informedDrawerTotal: informedTotal,
        difference: storedDifference ?? (informedTotal != null ? money(informedTotal - calculatedTotal) : null),
      },
      adjustmentMovementCount: adjustmentMovements.length,
    },
  }
}
