"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission, requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"

type CountedEntry = {
  paymentMethodId?: string | null
  amount: number
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

async function getOpenSession(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  userId?: string
) {
  let query = supabase
    .from("cash_sessions")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)

  if (userId) query = query.eq("user_id", userId)
  const { data } = await query.maybeSingle()
  return data
}

export async function getActiveCashSessionAction(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  const supabase = await getSupabaseServerClient()
  const session = await getOpenSession(supabase, partnerId)
  return { success: true as const, data: session || null }
}

export async function openCashSessionAction(input: {
  partnerId: string
  openingBalance: number
  notes?: string
}) {
  const user = await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const rawBalance = Number(input.openingBalance || 0)
  if (!Number.isFinite(rawBalance)) return { success: false as const, error: "Saldo de abertura inválido." }
  const openingBalance = money(Math.max(0, rawBalance))

  // Check for existing open session for this user within this partner
  // (DB unique partial index is the ultimate guard, this gives a better error message)
  const existing = await getOpenSession(supabase, input.partnerId, user.id)
  if (existing?.id) {
    return { success: false as const, error: "Você já possui um caixa aberto." }
  }

  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({
      partner_id: input.partnerId,
      user_id: user.id,
      opening_balance: openingBalance,
      status: "open",
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single()

  if (error) {
    // Handle unique constraint violation gracefully (race condition)
    if (error.code === "23505") {
      return { success: false as const, error: "Você já possui um caixa aberto." }
    }
    return { success: false as const, error: error.message }
  }

  console.info("[cash_register] session_opened", JSON.stringify({
    sessionId: data.id, partnerId: input.partnerId, userId: user.id, openingBalance,
  }))

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "cash_session",
    entityId: data.id,
    actionType: "opened",
    changeLines: [`abriu o caixa com saldo inicial de R$ ${openingBalance.toFixed(2)}.`],
    source: "manual",
  })

  return { success: true as const, data }
}

export async function createCashMovementAction(input: {
  partnerId: string
  cashSessionId?: string
  type: "withdrawal" | "deposit" | "refund"
  description: string
  amount: number
  paymentMethodId?: string | null
  referenceId?: string | null
}) {
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()
  const session = input.cashSessionId
    ? await supabase
      .from("cash_sessions")
      .select("*")
      .eq("id", input.cashSessionId)
      .eq("partner_id", input.partnerId)
      .eq("status", "open")
      .maybeSingle()
    : { data: await getOpenSession(supabase, input.partnerId), error: null }

  const openSession = session.data
  if (!openSession?.id) {
    return { success: false as const, error: "Não existe caixa aberto para esta operação." }
  }

  const rawAmount = Number(input.amount || 0)
  if (!Number.isFinite(rawAmount)) return { success: false as const, error: "Valor inválido." }
  const parsedAmount = money(rawAmount)
  if (parsedAmount <= 0) return { success: false as const, error: "Informe um valor maior que zero." }
  if (!input.description?.trim()) return { success: false as const, error: "Descrição é obrigatória." }

  const signedAmount = input.type === "withdrawal"
    ? -Math.abs(parsedAmount)
    : input.type === "refund"
      ? -Math.abs(parsedAmount)
      : Math.abs(parsedAmount)

  const { data, error } = await supabase
    .from("cash_movements")
    .insert({
      partner_id: input.partnerId,
      cash_session_id: openSession.id,
      type: input.type,
      description: input.description.trim(),
      payment_method_id: input.paymentMethodId || null,
      amount: signedAmount,
      reference_id: input.referenceId || null,
    })
    .select("*")
    .single()

  if (error) return { success: false as const, error: error.message }

  console.info("[cash_register] movement_created", JSON.stringify({
    movementId: data.id, sessionId: openSession.id, type: input.type, amount: signedAmount,
  }))

  const typeLabel = input.type === "withdrawal" ? "sangria" : input.type === "refund" ? "reembolso" : "suprimento"
  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: null,
    entityType: "cash_session",
    entityId: openSession.id,
    actionType: "movement",
    changeLines: [`registrou ${typeLabel} de R$ ${Math.abs(signedAmount).toFixed(2)} — ${input.description.trim()}`],
    source: "manual",
  })

  return { success: true as const, data }
}

export async function registerSaleCashMovementsAction(input: {
  partnerId: string
  saleId: string
  cashSessionId: string
  paymentBreakdown: Array<{ amount: number; paymentMethodId?: string | null; method?: string }>
}) {
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
  const supabase = await getSupabaseServerClient()

  const entries = (input.paymentBreakdown || [])
    .map((entry) => ({
      amount: money(Number(entry.amount || 0)),
      paymentMethodId: entry.paymentMethodId || null,
      method: entry.method || "Venda PDV",
    }))
    .filter((entry) => entry.amount > 0)

  if (entries.length === 0) return { success: true as const, data: [] }

  const payload = entries.map((entry) => ({
    partner_id: input.partnerId,
    cash_session_id: input.cashSessionId,
    type: "sale",
    description: `Venda PDV ${input.saleId.slice(0, 8).toUpperCase()} - ${entry.method}`,
    payment_method_id: entry.paymentMethodId,
    amount: Math.abs(entry.amount),
    reference_id: input.saleId,
  }))

  const { data, error } = await supabase.from("cash_movements").insert(payload).select("*")
  if (error) return { success: false as const, error: error.message }
  return { success: true as const, data: data || [] }
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

  const { data: movements, error: movementsError } = await supabase
    .from("cash_movements")
    .select("id, type, amount, payment_method_id, created_at")
    .eq("partner_id", partnerId)
    .eq("cash_session_id", cashSessionId)
  if (movementsError) return { success: false as const, error: movementsError.message }

  const paymentMethodIds = Array.from(new Set((movements || []).map((m: any) => m.payment_method_id).filter(Boolean))) as string[]
  const methodsMap = new Map<string, string>()
  if (paymentMethodIds.length > 0) {
    const { data: methods } = await supabase
      .from("payment_methods")
      .select("id, name")
      .eq("partner_id", partnerId)
      .in("id", paymentMethodIds)
    for (const method of methods || []) methodsMap.set(method.id, method.name)
  }

  const grouped = new Map<string, { paymentMethodId: string | null; label: string; total: number }>()
  for (const movement of movements || []) {
    const id = movement.payment_method_id || "__none__"
    const label = movement.payment_method_id ? (methodsMap.get(movement.payment_method_id) || "Método removido") : "Não informado"
    const current = grouped.get(id)
    if (current) {
      current.total = money(current.total + Number(movement.amount || 0))
    } else {
      grouped.set(id, {
        paymentMethodId: movement.payment_method_id || null,
        label,
        total: money(Number(movement.amount || 0)),
      })
    }
  }

  const groupedByMethod = Array.from(grouped.values()).sort((a, b) => b.total - a.total)
  const movementsTotal = money((movements || []).reduce((acc: number, m: any) => acc + Number(m.amount || 0), 0))
  const expectedBalance = money(Number(session.opening_balance || 0) + movementsTotal)

  return {
    success: true as const,
    data: {
      session,
      groupedByMethod,
      movementsTotal,
      expectedBalance,
    },
  }
}

export async function closeCashSessionAction(input: {
  partnerId: string
  cashSessionId: string
  countedByMethod?: CountedEntry[]
  notes?: string
}) {
  await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const summary = await getCashSessionCloseSummaryAction(input.partnerId, input.cashSessionId)
  if (!summary.success) return summary

  if (summary.data.session.status !== "open") {
    return { success: false as const, error: "Este caixa já foi fechado." }
  }

  const countedTotal = money(
    (input.countedByMethod || []).reduce((acc, entry) => {
      const val = Number(entry.amount || 0)
      return acc + (Number.isFinite(val) ? Math.max(0, val) : 0)
    }, 0)
  )
  const finalClosing = countedTotal > 0 ? countedTotal : summary.data.expectedBalance

  const { data, error } = await supabase
    .from("cash_sessions")
    .update({
      closing_balance: finalClosing,
      closed_at: new Date().toISOString(),
      status: "closed",
      notes: input.notes?.trim() || summary.data.session.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.cashSessionId)
    .eq("partner_id", input.partnerId)
    .eq("status", "open")
    .select("*")
    .single()

  if (error) return { success: false as const, error: error.message }

  const difference = money(finalClosing - summary.data.expectedBalance)
  console.info("[cash_register] session_closed", JSON.stringify({
    sessionId: input.cashSessionId, partnerId: input.partnerId,
    expectedBalance: summary.data.expectedBalance, countedTotal: finalClosing, difference,
  }))

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: null,
    entityType: "cash_session",
    entityId: input.cashSessionId,
    actionType: "closed",
    changeLines: [
      `fechou o caixa com saldo contado de R$ ${finalClosing.toFixed(2)}.`,
      ...(Math.abs(difference) > 0.009 ? [`diferença de R$ ${difference.toFixed(2)} em relação ao esperado.`] : []),
    ],
    source: "manual",
  })

  return {
    success: true as const,
    data: {
      ...data,
      expectedBalance: summary.data.expectedBalance,
      countedTotal: finalClosing,
      difference,
      groupedByMethod: summary.data.groupedByMethod,
    },
  }
}

export async function getCashSessionsHistoryAction(partnerId: string) {
  await requirePartnerAccessWithPermission(partnerId, "financial", "view")
  const supabase = await getSupabaseServerClient()

  const { data: sessions, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("id, user_id, opened_at, closed_at, opening_balance, closing_balance, status, notes, created_at")
    .eq("partner_id", partnerId)
    .order("opened_at", { ascending: false })
    .limit(400)
  if (sessionError) return { success: false as const, error: sessionError.message }

  const sessionIds = (sessions || []).map((session: any) => session.id)
  const { data: movementRows } = sessionIds.length > 0
    ? await supabase
      .from("cash_movements")
      .select("cash_session_id, amount")
      .eq("partner_id", partnerId)
      .in("cash_session_id", sessionIds)
    : { data: [] as any[] }

  const userIds = Array.from(new Set((sessions || []).map((session: any) => session.user_id).filter(Boolean)))
  const { data: users } = userIds.length > 0
    ? await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)
    : { data: [] as any[] }

  const userMap = new Map<string, string>((users || []).map((user: any) => [user.user_id, user.full_name || "Usuário"]))
  const movementBySession = new Map<string, number>()
  for (const row of movementRows || []) {
    movementBySession.set(
      row.cash_session_id,
      money((movementBySession.get(row.cash_session_id) || 0) + Number(row.amount || 0))
    )
  }

  const mapped = (sessions || []).map((session: any) => ({
    ...session,
    user_name: userMap.get(session.user_id) || "Usuário",
    total_received: movementBySession.get(session.id) || 0,
  }))

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

  const { data: movements, error: movementError } = await supabase
    .from("cash_movements")
    .select("id, type, description, payment_method_id, amount, created_at, reference_id")
    .eq("partner_id", partnerId)
    .eq("cash_session_id", cashSessionId)
    .order("created_at", { ascending: false })
  if (movementError) return { success: false as const, error: movementError.message }

  const paymentMethodIds = Array.from(new Set((movements || []).map((movement: any) => movement.payment_method_id).filter(Boolean))) as string[]
  const { data: methods } = paymentMethodIds.length > 0
    ? await supabase
      .from("payment_methods")
      .select("id, name")
      .eq("partner_id", partnerId)
      .in("id", paymentMethodIds)
    : { data: [] as any[] }
  const methodsMap = new Map<string, string>((methods || []).map((method: any) => [method.id, method.name || "Sem nome"]))

  const detailMovements = (movements || []).map((movement: any) => ({
    ...movement,
    payment_method_name: movement.payment_method_id ? (methodsMap.get(movement.payment_method_id) || "Método removido") : "Não informado",
  }))

  return { success: true as const, data: { session, movements: detailMovements } }
}
