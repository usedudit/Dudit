"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { revalidatePath } from "next/cache"

export type CountedPaymentMethodEntry = {
  paymentMethodId?: string | null
  amount: number
}

type CashMovementFallbackInput = {
  partnerId: string
  cashSessionId: string
  type: "withdrawal" | "deposit"
  description: string
  amount: number
  cashFinanceAccountId: string
  userId: string
}

function money(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

function normalizeCashMovementDescription(type: "withdrawal" | "deposit", description?: string | null) {
  const trimmed = String(description || "").trim()
  if (trimmed) return trimmed.slice(0, 2000)
  return type === "withdrawal" ? "Sangria de caixa" : "Reforço de caixa"
}

function shouldFallbackCashMovementRpc(errorMessage?: string | null) {
  const message = String(errorMessage || "").toLowerCase()
  return message.includes("payment_date") && message.includes("timestamp with time zone") && message.includes("text")
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
function computeDrawerBalanceCents(params: {
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
    new Set((movements || []).map((m: { payment_method_id: string | null }) => m.payment_method_id).filter(Boolean))
  ) as string[]

  const pmMap = new Map<string, { name: string; type: string }>()
  if (pmIds.length > 0) {
    const { data: methods } = await supabase
      .from("payment_methods")
      .select("id, name, type")
      .eq("partner_id", partnerId)
      .in("id", pmIds)
    for (const row of methods || []) {
      pmMap.set(row.id, { name: row.name || "-", type: row.type || "other" })
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

async function createCashMovementFallback(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  input: CashMovementFallbackInput,
) {
  const nowIso = new Date().toISOString()
  const { data: session, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("id", input.cashSessionId)
    .eq("partner_id", input.partnerId)
    .single()

  if (sessionError || !session) {
    return { success: false as const, error: sessionError?.message || "Sessão de caixa não encontrada." }
  }

  if (session.status !== "open") {
    return { success: false as const, error: "O caixa não está aberto." }
  }

  if (input.type === "withdrawal") {
    const existingMovements = await loadMovementsForSession(supabase, input.partnerId, input.cashSessionId)
    const drawer = computeDrawerBalanceCents({
      initialAmount: Number(session.initial_amount ?? session.opening_balance ?? 0),
      movements: existingMovements as any[],
    })
    if (drawer.total + 0.0001 < input.amount) {
      return { success: false as const, error: "Saldo em dinheiro insuficiente para esta sangria." }
    }
  }

  const { data: movement, error: movementError } = await supabase
    .from("cash_movements")
    .insert({
      partner_id: input.partnerId,
      cash_session_id: input.cashSessionId,
      type: input.type,
      description: input.description,
      payment_method_id: null,
      amount: input.amount,
      reference_id: null,
      created_by_user_id: input.userId,
    })
    .select("*")
    .single()

  if (movementError || !movement) {
    return { success: false as const, error: movementError?.message || "Falha ao registrar movimentação." }
  }

  const transactionType = input.type === "withdrawal" ? "expense" : "income"
  const transactionNote =
    input.type === "withdrawal" ? "Sangria de caixa registrada no PDV." : "Reforço de caixa registrado no PDV."

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .insert({
      partner_id: input.partnerId,
      description: input.type === "withdrawal" ? "Sangria de caixa" : "Reforço de caixa",
      category: "Caixa PDV",
      contact_id: null,
      contact_type: null,
      amount: input.amount,
      due_date: null,
      payment_date: nowIso,
      transaction_date: nowIso,
      status: "paid",
      notes: transactionNote,
      payment_type: "Caixa",
      original_amount: input.amount,
      interest_amount: null,
      fee_amount: 0,
      transaction_type: transactionType,
      origin: "system",
      reference_note: `cash_mv:${movement.id}`,
      account_id: input.cashFinanceAccountId,
      payment_method_id: null,
      created_by_user_id: input.userId,
    })
    .select("id")
    .single()

  if (transactionError || !transaction) {
    await supabase.from("cash_movements").delete().eq("id", movement.id)
    return { success: false as const, error: transactionError?.message || "Falha ao registrar transação financeira." }
  }

  const { error: linkError } = await supabase
    .from("cash_movements")
    .update({ financial_transaction_id: transaction.id })
    .eq("id", movement.id)

  if (linkError) {
    return { success: false as const, error: linkError.message }
  }

  const delta = transactionType === "income" ? input.amount : -input.amount
  const { error: balanceError } = await supabase.rpc("apply_account_balance_delta", {
    p_account_id: input.cashFinanceAccountId,
    p_partner_id: input.partnerId,
    p_delta: delta,
  })

  if (balanceError) {
    return { success: false as const, error: balanceError.message || "Falha ao atualizar saldo da conta." }
  }

  return {
    success: true as const,
    data: {
      ...movement,
      financial_transaction_id: transaction.id,
    },
  }
}

async function reverseCashMovementFallback(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  input: { partnerId: string; movementId: string; userId: string },
) {
  const nowIso = new Date().toISOString()
  const { data: movement, error: movementError } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("id", input.movementId)
    .eq("partner_id", input.partnerId)
    .single()

  if (movementError || !movement) {
    return { success: false as const, error: movementError?.message || "Movimentação não encontrada." }
  }

  if (!["withdrawal", "deposit"].includes(String(movement.type))) {
    return { success: false as const, error: "Somente sangrias e reforços podem ser estornados." }
  }

  if (movement.reversed_at) {
    return { success: false as const, error: "Esta movimentação já foi estornada." }
  }

  const { data: session, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("id, status")
    .eq("id", movement.cash_session_id)
    .eq("partner_id", input.partnerId)
    .single()

  if (sessionError || !session) {
    return { success: false as const, error: sessionError?.message || "Sessão de caixa não encontrada." }
  }

  if (session.status !== "open") {
    return { success: false as const, error: "O caixa não está aberto." }
  }

  const { data: originalTransaction, error: originalTransactionError } = movement.financial_transaction_id
    ? await supabase
      .from("transactions")
      .select("id, account_id")
      .eq("id", movement.financial_transaction_id)
      .eq("partner_id", input.partnerId)
      .single()
    : { data: null, error: null }

  if (originalTransactionError || !originalTransaction?.account_id) {
    return { success: false as const, error: originalTransactionError?.message || "Conta financeira da movimentação não encontrada." }
  }

  const amount = money(Number(movement.amount || 0))
  const reverseTransactionType = movement.type === "withdrawal" ? "income" : "expense"
  const reverseNotes = movement.type === "withdrawal" ? "Estorno de sangria registrada no PDV." : "Estorno de reforço registrado no PDV."

  const { data: reversalTransaction, error: reversalError } = await supabase
    .from("transactions")
    .insert({
      partner_id: input.partnerId,
      description: movement.type === "withdrawal" ? "Estorno de sangria" : "Estorno de reforço",
      category: "Caixa PDV",
      contact_id: null,
      contact_type: null,
      amount,
      due_date: null,
      payment_date: nowIso,
      transaction_date: nowIso,
      status: "paid",
      notes: reverseNotes,
      payment_type: "Caixa",
      original_amount: amount,
      interest_amount: null,
      fee_amount: 0,
      transaction_type: reverseTransactionType,
      origin: "system",
      reference_note: `cash_mv_rev:${movement.id}`,
      account_id: originalTransaction.account_id,
      payment_method_id: null,
      created_by_user_id: input.userId,
    })
    .select("id")
    .single()

  if (reversalError || !reversalTransaction) {
    return { success: false as const, error: reversalError?.message || "Falha ao registrar estorno financeiro." }
  }

  const { error: reverseUpdateError } = await supabase
    .from("cash_movements")
    .update({
      reversed_at: nowIso,
      reversed_by_user_id: input.userId,
    })
    .eq("id", movement.id)

  if (reverseUpdateError) {
    return { success: false as const, error: reverseUpdateError.message }
  }

  const delta = reverseTransactionType === "income" ? amount : -amount
  const { error: balanceError } = await supabase.rpc("apply_account_balance_delta", {
    p_account_id: originalTransaction.account_id,
    p_partner_id: input.partnerId,
    p_delta: delta,
  })

  if (balanceError) {
    return { success: false as const, error: balanceError.message || "Falha ao atualizar saldo da conta." }
  }

  return {
    success: true as const,
    data: {
      movement_id: movement.id,
      reversal_transaction_id: reversalTransaction.id,
    },
  }
}

export async function getActiveCashSessionAction(partnerId: string) {
  const user = await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()
  const session = await getOpenSessionForUser(supabase, partnerId, user.id)
  return { success: true as const, data: session || null }
}

export async function openCashSessionAction(input: {
  partnerId: string
  /** Troco inicial / fundo de caixa - valor de controle (não gera lançamento financeiro). */
  initialAmount: number
  notes?: string
}) {
  const user = await requireUser()
  await requirePartnerAccess(input.partnerId)

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
  await requirePartnerAccess(input.partnerId)

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
      return { success: false as const, error: "SessÃ£o invÃ¡lida ou caixa fechado." }
    }
  }

  if (!sessionId) return { success: false as const, error: "NÃ£o existe caixa aberto para esta operaÃ§Ã£o." }

  const rawAmount = Number(input.amount || 0)
  if (!Number.isFinite(rawAmount) || !(rawAmount > 0)) {
    return { success: false as const, error: "Informe um valor maior que zero." }
  }
  const normalizedDescription = normalizeCashMovementDescription(input.type, input.description)

  const cashAccountId =
    input.cashFinanceAccountId?.trim() || (await resolveDefaultCashFinanceAccountId(supabase, input.partnerId))
  if (!cashAccountId) {
    return { success: false as const, error: "Cadastre uma conta financeira do tipo caixa para registrar sangrias e reforÃ§os." }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("erp_create_cash_manual_movement", {
    p_partner_id: input.partnerId,
    p_cash_session_id: sessionId,
    p_movement_type: input.type,
    p_amount: money(rawAmount),
    p_description: normalizedDescription,
    p_cash_account_id: cashAccountId,
  })

  if (rpcError) {
    if (!shouldFallbackCashMovementRpc(rpcError.message)) {
      return { success: false as const, error: rpcError.message || "Falha ao registrar movimentaÃ§Ã£o." }
    }

    const fallbackResult = await createCashMovementFallback(supabase, {
      partnerId: input.partnerId,
      cashSessionId: sessionId,
      type: input.type,
      description: normalizedDescription,
      amount: money(rawAmount),
      cashFinanceAccountId: cashAccountId,
      userId: user.id,
    })

    if (!fallbackResult.success) return fallbackResult

    const fallbackMovementId = (fallbackResult.data as any)?.id as string | undefined
    const fallbackTypeLabel = input.type === "withdrawal" ? "Sangria" : "ReforÃ§o"
    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      entityType: "cash_session",
      entityId: sessionId,
      actionType: input.type === "withdrawal" ? "withdrawal_created" : "deposit_created",
      changeLines: [`registrou ${fallbackTypeLabel.toLowerCase()} de R$ ${money(rawAmount).toFixed(2)} - ${normalizedDescription}`],
      metadata: fallbackMovementId ? { movement_id: fallbackMovementId } : null,
      source: "manual",
    })
    await revalidateEntityTimeline("cash_session", sessionId)
    revalidatePath("/erp/cash-register")
    revalidatePath("/erp/transactions")

    return fallbackResult
  }

  const movementId = (rpcData as any)?.movement_id as string | undefined
  const typeLabel = input.type === "withdrawal" ? "Sangria" : "ReforÃ§o"
  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "cash_session",
    entityId: sessionId,
    actionType: input.type === "withdrawal" ? "withdrawal_created" : "deposit_created",
    changeLines: [`registrou ${typeLabel.toLowerCase()} de R$ ${money(rawAmount).toFixed(2)} - ${normalizedDescription}`],
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
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const { data: rpcData, error: rpcError } = await supabase.rpc("erp_reverse_cash_manual_movement", {
    p_partner_id: input.partnerId,
    p_movement_id: input.movementId,
  })

  if (rpcError) {
    if (!shouldFallbackCashMovementRpc(rpcError.message)) {
      return { success: false as const, error: rpcError.message || "NÃ£o foi possÃ­vel estornar a movimentaÃ§Ã£o." }
    }

    const fallbackResult = await reverseCashMovementFallback(supabase, {
      partnerId: input.partnerId,
      movementId: input.movementId,
      userId: user.id,
    })
    if (!fallbackResult.success) return fallbackResult

    const { data: fallbackMovement } = await supabase
      .from("cash_movements")
      .select("cash_session_id, description, amount, type")
      .eq("id", input.movementId)
      .maybeSingle()

    if (fallbackMovement?.cash_session_id) {
      await logAuditEvent({
        partnerId: input.partnerId,
        actorUserId: user.id,
        entityType: "cash_session",
        entityId: fallbackMovement.cash_session_id,
        actionType: "movement_reversed",
        changeLines: [
          `estornou ${fallbackMovement.type === "withdrawal" ? "sangria" : "reforÃ§o"} de R$ ${money(Number(fallbackMovement.amount || 0)).toFixed(2)} - ${String(fallbackMovement.description || "").slice(0, 120)}`,
        ],
        source: "manual",
      })
      await revalidateEntityTimeline("cash_session", fallbackMovement.cash_session_id)
    }

    revalidatePath("/erp/cash-register")
    revalidatePath("/erp/transactions")

    return fallbackResult
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
        `estornou ${movement.type === "withdrawal" ? "sangria" : "reforÃ§o"} de R$ ${money(Number(movement.amount || 0)).toFixed(2)} - ${String(movement.description || "").slice(0, 120)}`,
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
  await requirePartnerAccess(partnerId)
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

  const grouped = new Map<string, { paymentMethodId: string | null; label: string; paymentMethodType: string | null; calculated: number }>()
  for (const m of movements) {
    if (!isMovementActive(m)) continue
    if (m.type !== "sale") continue
    const key = m.payment_method_id || "__cash__"
    const label = m.payment_method_name || "Dinheiro"
    const paymentMethodType = m.payment_method_type || (!m.payment_method_id ? "cash" : "other")
    const amt = money(Number(m.amount || 0))
    const cur = grouped.get(key)
    if (cur) cur.calculated = money(cur.calculated + amt)
    else grouped.set(key, { paymentMethodId: m.payment_method_id || null, label, paymentMethodType, calculated: amt })
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
  const access = await requirePartnerAccess(input.partnerId)

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

  const calculated = summary.data.expectedDrawerTotal
  if (!Number.isFinite(calculated)) {
    return { success: false as const, error: "Não foi possível calcular o saldo esperado do caixa." }
  }

  const methodTypeById = new Map<string, string>()
  for (const row of summary.data.groupedByMethod || []) {
    const key = row.paymentMethodId || "__cash__"
    methodTypeById.set(key, row.paymentMethodType || (row.paymentMethodId ? "other" : "cash"))
  }

  const countedCashSales = money(
    countedRows.reduce((acc, row) => {
      const key = row.paymentMethodId || "__cash__"
      const pmType = methodTypeById.get(key) || (row.paymentMethodId ? "other" : "cash")
      return pmType === "cash" ? acc + row.amount : acc
    }, 0),
  )

  const hasExplicitCounts = (input.countedByMethod || []).length > 0
  const informedTotal = hasExplicitCounts
    ? money(
      Number(summary.data.drawer?.initial || 0) +
      countedCashSales +
      Number(summary.data.drawer?.deposits || 0) -
      Number(summary.data.drawer?.withdrawals || 0) -
      Number(summary.data.drawer?.refunds || 0),
    )
    : calculated
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
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const { data: sessions, error: sessionError } = await supabase
    .from("cash_sessions")
    .select("id, opened_by_user_id, closed_by_user_id, opened_at, closed_at, initial_amount, closing_amount, calculated_amount, difference_amount, status, notes, created_at")
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
        .flatMap((s: any) => [s.opened_by_user_id, s.closed_by_user_id])
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
  const totalReceivedBySession = new Map<string, number>()
  for (const row of movementRows || []) {
    if (row.reversed_at) continue
    const sid = row.cash_session_id
    const amt = money(Number(row.amount || 0))
    if (!(amt > 0)) continue
    if (row.type === "sale") {
      totalReceivedBySession.set(sid, money((totalReceivedBySession.get(sid) || 0) + amt))
    }
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
      opened_by_name: userMap.get(s.opened_by_user_id) || "Usuário",
      closed_by_name: s.closed_by_user_id ? userMap.get(s.closed_by_user_id) || "Usuário" : null,
      drawer_movement_net: drawerDelta,
      expected_drawer_total: money(initial + drawerDelta),
      total_received_amount: totalReceivedBySession.get(s.id) || 0,
    }
  })

  return { success: true as const, data: mapped }
}

export type ERPCashSessionListCursor = { openedAt: string; id: string }

function buildCashSessionsKeysetOrFilter(cursor: ERPCashSessionListCursor): string {
  const ts = cursor.openedAt
  const id = cursor.id
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  // Page after (opened_at DESC, id DESC)
  return `opened_at.lt.${q(ts)},and(opened_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_CASH_SESSIONS_PAGE_SIZE = 100

export async function getCashSessionsHistoryPageAction(
  partnerId: string,
  options?: { cursor?: ERPCashSessionListCursor | null; limit?: number },
) {
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const cursor = options?.cursor ?? null
  const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_CASH_SESSIONS_PAGE_SIZE))))
  const fetchLimit = limit + 1

  let q = supabase
    .from("cash_sessions")
    .select("id, opened_by_user_id, closed_by_user_id, opened_at, closed_at, initial_amount, closing_amount, calculated_amount, difference_amount, status, notes, created_at")
    .eq("partner_id", partnerId)

  if (cursor) q = q.or(buildCashSessionsKeysetOrFilter(cursor))

  const { data: sessions, error: sessionError } = await q
    .order("opened_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(fetchLimit)

  if (sessionError) return { success: false as const, error: sessionError.message }

  const rows = sessions || []
  const hasMore = rows.length > limit
  const pageItems = hasMore ? rows.slice(0, limit) : rows

  const sessionIds = pageItems.map((s: { id: string }) => s.id)
  const { data: movementRows } = sessionIds.length > 0
    ? await supabase
      .from("cash_movements")
      .select("cash_session_id, type, amount, reversed_at, payment_method_id")
      .eq("partner_id", partnerId)
      .in("cash_session_id", sessionIds)
    : { data: [] as any[] }

  const userIds = Array.from(
    new Set(
      (pageItems || [])
        .flatMap((s: any) => [s.opened_by_user_id, s.closed_by_user_id])
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
  const totalReceivedBySession = new Map<string, number>()
  for (const row of movementRows || []) {
    if (row.reversed_at) continue
    const sid = row.cash_session_id
    const amt = money(Number(row.amount || 0))
    if (!(amt > 0)) continue
    if (row.type === "sale") {
      totalReceivedBySession.set(sid, money((totalReceivedBySession.get(sid) || 0) + amt))
    }
    let delta = 0
    if (row.type === "deposit") delta = amt
    else if (row.type === "withdrawal" || row.type === "refund") delta = -amt
    else if (row.type === "sale") {
      const isCash = !row.payment_method_id || pmType.get(row.payment_method_id) === "cash"
      if (isCash) delta = amt
    }
    drawerBySession.set(sid, money((drawerBySession.get(sid) || 0) + delta))
  }

  const items = (pageItems || []).map((s: any) => {
    const initial = money(Number(s.initial_amount ?? 0))
    const drawerDelta = drawerBySession.get(s.id) || 0
    return {
      ...s,
      initial_amount: initial,
      closing_amount: s.closing_amount ?? null,
      user_name: userMap.get(s.opened_by_user_id) || "Usuário",
      opened_by_name: userMap.get(s.opened_by_user_id) || "Usuário",
      closed_by_name: s.closed_by_user_id ? userMap.get(s.closed_by_user_id) || "Usuário" : null,
      drawer_movement_net: drawerDelta,
      expected_drawer_total: money(initial + drawerDelta),
      total_received_amount: totalReceivedBySession.get(s.id) || 0,
    }
  })

  const last = items[items.length - 1]
  const nextCursor: ERPCashSessionListCursor | null =
    hasMore && last?.opened_at && last?.id ? { openedAt: String(last.opened_at), id: String(last.id) } : null

  return { success: true as const, items, nextCursor, hasMore }
}

export async function getCashSessionDetailsAction(partnerId: string, cashSessionId: string) {
  await requirePartnerAccess(partnerId)
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
    creator_name: m.created_by_user_id ? nameById.get(m.created_by_user_id) || "-" : "-",
    reversed_by_name: m.reversed_by_user_id ? nameById.get(m.reversed_by_user_id) || "-" : null,
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
        open_name: nameById.get(session.opened_by_user_id || session.user_id) || "-",
        close_name: session.closed_by_user_id ? nameById.get(session.closed_by_user_id) || "-" : null,
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
