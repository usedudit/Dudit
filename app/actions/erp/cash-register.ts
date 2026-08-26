"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requireStoreAccess } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { createAdminClient } from "@/lib/supabase/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { sanitizeNotes } from "@/lib/input-validator"
import { revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { revalidatePath } from "next/cache"
import type { RoleId } from "@/lib/permissions/rbac-types"

export type CountedPaymentMethodEntry = {
  paymentMethodId?: string | null
  amount: number
}

type CashMovementFallbackInput = {
  partnerId: string
  storeId?: string | null
  cashSessionId: string
  type: "withdrawal" | "deposit"
  description: string
  amount: number
  cashFinanceAccountId?: string | null
  userId: string
}

function isManagementRole(roleId: RoleId | string | null | undefined) {
  const v = String(roleId || "").toLowerCase()
  return v === "owner" || v === "admin" || v === "manager"
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

async function insertCashTransactionWithSchemaFallback(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  payload: Record<string, any>,
) {
  const tryCustomerPayload = { ...payload, customer_id: null, contact_type: null }
  const { data: txWithCustomer, error: customerErr } = await supabase
    .from("transactions")
    .insert(tryCustomerPayload)
    .select("id")
    .single()

  if (!customerErr && txWithCustomer?.id) {
    return { data: txWithCustomer, error: null as any }
  }

  const tryContactPayload = { ...payload, contact_id: null, contact_type: null }
  const { data: txWithContact, error: contactErr } = await supabase
    .from("transactions")
    .insert(tryContactPayload)
    .select("id")
    .single()

  if (!contactErr && txWithContact?.id) {
    return { data: txWithContact, error: null as any }
  }

  return { data: null, error: contactErr || customerErr || new Error("Falha ao inserir transação financeira.") }
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

async function getActiveSessionForPartner(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  storeId?: string | null,
) {
  let query = supabase
    .from("cash_sessions")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "open")
  if (storeId) {
    query = query.eq("store_id", storeId)
  }
  const { data } = await query.order("opened_at", { ascending: false }).limit(1).maybeSingle()
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

  if (!input.cashFinanceAccountId) {
    await supabase.from("cash_movements").delete().eq("id", movement.id)
    return {
      success: false as const,
      error: "Cadastre uma conta financeira do tipo caixa para registrar sangrias e reforços (e vê-las em Transações).",
    }
  }

  const transactionType = input.type === "withdrawal" ? "expense" : "income"
  const transactionNote =
    input.type === "withdrawal" ? "Sangria de caixa registrada no PDV." : "Reforço de caixa registrado no PDV."

  const { data: transaction, error: transactionError } = await insertCashTransactionWithSchemaFallback(supabase, {
    partner_id: input.partnerId,
    store_id: input.storeId || null,
    description: input.type === "withdrawal" ? "Sangria de caixa" : "Reforço de caixa",
    category: "Caixa PDV",
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
  input: { partnerId: string; storeId?: string | null; movementId: string; userId: string },
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

  let accountId: string | null = null

  if (movement.financial_transaction_id) {
    const { data: originalTransaction, error: originalTransactionError } = await supabase
      .from("transactions")
      .select("id, account_id")
      .eq("id", movement.financial_transaction_id)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

    if (originalTransactionError) {
      return { success: false as const, error: originalTransactionError.message }
    }
    accountId = originalTransaction?.account_id ?? null
  }

  const hasFinancialLink = !!movement.financial_transaction_id

  if (hasFinancialLink && !accountId) {
    accountId = await resolveDefaultCashFinanceAccountId(supabase, input.partnerId)
  }

  const amount = money(Number(movement.amount || 0))

  if (!hasFinancialLink) {
    console.warn("[cash-register] reverseCashMovementFallback: movement without financial_transaction_id - reversing drawer only", {
      movementId: movement.id,
      partnerId: input.partnerId,
    })
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

    return {
      success: true as const,
      data: {
        movement_id: movement.id,
        reversal_transaction_id: null as unknown as string,
      },
    }
  }

  if (!accountId) {
    return { success: false as const, error: "Conta financeira da movimentação não encontrada." }
  }

  const reverseTransactionType = movement.type === "withdrawal" ? "income" : "expense"
  const reverseNotes = movement.type === "withdrawal" ? "Estorno de sangria registrada no PDV." : "Estorno de reforço registrado no PDV."

  const { data: reversalTransaction, error: reversalError } = await insertCashTransactionWithSchemaFallback(supabase, {
    partner_id: input.partnerId,
    store_id: input.storeId || null,
    description: movement.type === "withdrawal" ? "Estorno de sangria" : "Estorno de reforço",
    category: "Caixa PDV",
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
    account_id: accountId,
    payment_method_id: null,
    created_by_user_id: input.userId,
  })

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
    p_account_id: accountId,
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

export async function getActiveCashSessionAction(partnerId: string, storeId?: string | null) {
  await requireUser()
  await requirePermission(partnerId, "pdv", "view")
  // Read with admin client after authz so invited users can load session data.
  const supabase = createAdminClient()
  const session = await getActiveSessionForPartner(supabase, partnerId, storeId)

  // Enrich with opener name when a session exists
  if (session) {
    const openerUserId = session.opened_by_user_id || session.user_id
    if (openerUserId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", openerUserId)
        .maybeSingle()
      session.opener_name = profile?.full_name || "Usuário"
    } else {
      session.opener_name = "Usuário"
    }
  }

  return { success: true as const, data: session || null }
}

export async function openCashSessionAction(input: {
  partnerId: string
  /** Troco inicial / fundo de caixa - valor de controle (não gera lançamento financeiro). */
  initialAmount: number
  notes?: string
  storeId?: string | null
}) {
  const user = await requireUser()
  await requirePermission(input.partnerId, "pdv", "open_pdv")
  if (input.storeId) {
    await requireStoreAccess(input.storeId, input.partnerId)
  }

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = createAdminClient()

  const raw = Number(input.initialAmount ?? 0)
  if (!Number.isFinite(raw)) return { success: false as const, error: "Valor inicial inválido." }
  const initialAmount = money(Math.max(0, raw))

  // Resolve a valid store for the partner. If the incoming storeId is missing or
  // does not belong to the partner (e.g. stale cookie after a store was deleted),
  // fall back to the partner's default store to avoid FK violations.
  let storeId = input.storeId || null
  if (storeId) {
    const { data: validStore } = await supabase
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()
    if (!validStore) {
      storeId = null
    }
  }
  if (!storeId) {
    const { data: defaultStore } = await supabase
      .from("stores")
      .select("id")
      .eq("partner_id", input.partnerId)
      .order("is_headquarters", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    storeId = defaultStore?.id ?? null
  }

  const existing = await getActiveSessionForPartner(supabase, input.partnerId, storeId)
  if (existing?.id) {
    return { success: false as const, error: "Já existe um caixa aberto para esta loja. Utilize o caixa atual ou feche-o primeiro." }
  }

  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({
      partner_id: input.partnerId,
      store_id: storeId,
      opened_by_user_id: user.id,
      initial_amount: initialAmount,
      status: "open",
      notes: sanitizeNotes(input.notes),
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { success: false as const, error: "Já existe um caixa aberto para esta loja. Utilize o caixa atual ou feche-o primeiro." }
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
  revalidatePath("/erp/caixa")
  revalidatePath("/erp/pdv")

  return { success: true as const, data }
}

export async function createCashMovementAction(input: {
  partnerId: string
  storeId?: string | null
  cashSessionId?: string
  type: "withdrawal" | "deposit"
  description: string
  amount: number
  /** Conta financeira tipo caixa; se omitido, usa a primeira conta caixa ativa do parceiro. */
  cashFinanceAccountId?: string | null
}) {
  const user = await requireUser()
  await requirePermission(input.partnerId, "pdv", "view")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = createAdminClient()

  let sessionId = input.cashSessionId || null
  if (!sessionId) {
    const s = await getActiveSessionForPartner(supabase, input.partnerId, input.storeId)
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
  const normalizedDescription = normalizeCashMovementDescription(input.type, input.description)

  const cashAccountId =
    input.cashFinanceAccountId?.trim() || (await resolveDefaultCashFinanceAccountId(supabase, input.partnerId))

  if (!cashAccountId) {
    return {
      success: false as const,
      error:
        "Nenhuma conta financeira do tipo caixa ativa encontrada. Cadastre uma em Financeiro para registrar sangrias/reforços e sincronizar com Transações.",
    }
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
    const fallbackResult = await createCashMovementFallback(supabase, {
      partnerId: input.partnerId,
      storeId: input.storeId || null,
      cashSessionId: sessionId,
      type: input.type,
      description: normalizedDescription,
      amount: money(rawAmount),
      cashFinanceAccountId: cashAccountId,
      userId: user.id,
    })

    if (!fallbackResult.success) return fallbackResult

    const fallbackMovementId = (fallbackResult.data as any)?.id as string | undefined
    const fallbackTypeLabel = input.type === "withdrawal" ? "Sangria" : "Reforço"
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
    revalidatePath("/erp/caixa")
    revalidatePath("/erp/transacoes")

    console.log("[cash-register] createCashMovementAction OK (fallback path)", {
      partnerId: input.partnerId,
      sessionId,
      movementId: fallbackMovementId,
      financial_transaction_id: (fallbackResult.data as any)?.financial_transaction_id ?? null,
    })

    return fallbackResult
  }

  const movementId = (rpcData as any)?.movement_id as string | undefined
  const typeLabel = input.type === "withdrawal" ? "Sangria" : "Reforço"
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
  revalidatePath("/erp/caixa")
  revalidatePath("/erp/transacoes")

  const { data: movement } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("id", movementId || "")
    .maybeSingle()

  const txId = (rpcData as any)?.transaction_id as string | undefined
  console.log("[cash-register] createCashMovementAction OK (rpc)", {
    partnerId: input.partnerId,
    sessionId,
    movementId,
    transactionId: txId ?? movement?.financial_transaction_id ?? null,
  })

  return { success: true as const, data: movement || rpcData }
}

export async function reverseCashMovementAction(input: {
  partnerId: string
  storeId?: string | null
  movementId: string
}) {
  const user = await requireUser()
  const supabase = createAdminClient()

  // Fetch movement first to know the type for permission check
  const { data: movementInfo, error: movementInfoError } = await supabase
    .from("cash_movements")
    .select("type")
    .eq("id", input.movementId)
    .eq("partner_id", input.partnerId)
    .maybeSingle()

  if (movementInfoError || !movementInfo) {
    return { success: false as const, error: movementInfoError?.message || "Movimentação não encontrada." }
  }

  await requirePermission(input.partnerId, "pdv", movementInfo.type === "withdrawal" ? "sangria" : "reforco")

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const { data: rpcData, error: rpcError } = await supabase.rpc("erp_reverse_cash_manual_movement", {
    p_partner_id: input.partnerId,
    p_movement_id: input.movementId,
  })

  if (rpcError) {
    const fallbackResult = await reverseCashMovementFallback(supabase, {
      partnerId: input.partnerId,
      storeId: input.storeId || null,
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
          `estornou ${fallbackMovement.type === "withdrawal" ? "sangria" : "reforço"} de R$ ${money(Number(fallbackMovement.amount || 0)).toFixed(2)} - ${String(fallbackMovement.description || "").slice(0, 120)}`,
        ],
        source: "manual",
      })
      await revalidateEntityTimeline("cash_session", fallbackMovement.cash_session_id)
    }

    revalidatePath("/erp/caixa")
    revalidatePath("/erp/transacoes")

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
        `estornou ${movement.type === "withdrawal" ? "sangria" : "reforço"} de R$ ${money(Number(movement.amount || 0)).toFixed(2)} - ${String(movement.description || "").slice(0, 120)}`,
      ],
      source: "manual",
    })
    await revalidateEntityTimeline("cash_session", movement.cash_session_id)
  }

  revalidatePath("/erp/caixa")
  revalidatePath("/erp/transacoes")

  return { success: true as const, data: rpcData }
}

export async function getCashSessionCloseSummaryAction(partnerId: string, cashSessionId: string) {
  await requirePermission(partnerId, "pdv", "view")
  const supabase = createAdminClient()

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

  const supabase = createAdminClient()

  const summary = await getCashSessionCloseSummaryAction(input.partnerId, input.cashSessionId)
  if (!summary.success) return summary

  const session = summary.data.session as any
  if (session.status !== "open") {
    return { success: false as const, error: "Este caixa já foi fechado." }
  }

  // The opener needs basic pdv access; non-openers need close_pdv permission.
  const openedBy = session.opened_by_user_id || session.user_id
  if (openedBy !== user.id) {
    await requirePermission(input.partnerId, "pdv", "close_pdv")
  } else {
    await requirePermission(input.partnerId, "pdv", "view")
  }

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

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
    metadata: {
      oldStatus: "Aberto",
      newStatus: "Fechado",
    },
    source: "manual",
  })
  await revalidateEntityTimeline("cash_session", input.cashSessionId)
  revalidatePath("/erp/caixa")
  revalidatePath("/erp/pdv")

  // Build operator-grouped summary for the close response
  const opGroups = new Map<string, { operatorName: string; byMethod: Map<string, { label: string; amount: number }> }>()
  const nameById = new Map<string, string>()
  const allUserIds = new Set((summary.data.movements || []).map((m: any) => m.created_by_user_id).filter(Boolean))
  if (allUserIds.size > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", Array.from(allUserIds))
    for (const p of profiles || []) nameById.set(p.user_id, p.full_name || "Usuário")
  }
  for (const m of summary.data.movements || []) {
    if (m.reversed_at || m.type !== "sale") continue
    const opUserId = m.created_by_user_id || "unknown"
    if (!opGroups.has(opUserId)) {
      opGroups.set(opUserId, { operatorName: nameById.get(opUserId) || "Usuário", byMethod: new Map() })
    }
    const group = opGroups.get(opUserId)!
    const pmKey = m.payment_method_id || "__cash__"
    const amt = money(Number(m.amount || 0))
    const cur = group.byMethod.get(pmKey)
    if (cur) cur.amount = money(cur.amount + amt)
    else group.byMethod.set(pmKey, { label: m.payment_method_name || "Dinheiro", amount: amt })
  }
  const groupedByOperator = Array.from(opGroups.entries()).map(([userId, g]) => ({
    userId,
    operatorName: g.operatorName,
    byMethod: Array.from(g.byMethod.entries()).map(([pmKey, row]) => ({
      paymentMethodId: pmKey === "__cash__" ? null : pmKey,
      label: row.label,
      amount: row.amount,
    })),
  }))

  return {
    success: true as const,
    data: {
      ...data,
      calculated_amount: calculated,
      closing_amount: informedTotal,
      difference_amount: difference,
      groupedByMethod: summary.data.groupedByMethod,
      groupedByOperator,
    },
  }
}

export async function getCashSessionsHistoryAction(partnerId: string, storeId?: string | null) {
  await requirePermission(partnerId, "pdv", "view")
  const supabase = createAdminClient()

  let sessionsQuery = supabase
    .from("cash_sessions")
    .select("id, opened_by_user_id, closed_by_user_id, opened_at, closed_at, initial_amount, closing_amount, calculated_amount, difference_amount, status, notes, created_at")
    .eq("partner_id", partnerId)
  if (storeId) {
    sessionsQuery = sessionsQuery.eq("store_id", storeId)
  }
  const { data: sessions, error: sessionError } = await sessionsQuery
    .order("opened_at", { ascending: false })
    .limit(400)
  if (sessionError) return { success: false as const, error: sessionError.message }

  const sessionIds = (sessions || []).map((s: { id: string }) => s.id)
  const movementQuery = supabase
    .from("cash_movements")
    .select("cash_session_id, type, amount, reversed_at, payment_method_id")
    .eq("partner_id", partnerId)
    .in("cash_session_id", sessionIds)
  if (storeId) {
    movementQuery.eq("store_id", storeId)
  }
  const { data: movementRows } = sessionIds.length > 0
    ? await movementQuery
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
  options?: { cursor?: ERPCashSessionListCursor | null; limit?: number; storeId?: string | null },
) {
  await requirePermission(partnerId, "pdv", "view")
  // Read with admin client after authz so invited users can load history.
  const cursor = options?.cursor ?? null
  const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_CASH_SESSIONS_PAGE_SIZE))))
  const fetchLimit = limit + 1
  const storeId = options?.storeId
  const { data: sessions, error: sessionError } = await getCachedErpPage(
    ["erp-cash-sessions-page", partnerId, storeId || "all-stores", cursor ? `${cursor.openedAt}:${cursor.id}` : "first", String(limit)],
    [TAGS.cashSessions(partnerId)],
    async () => {
      const cachedSupabase = createAdminClient()
      let q = cachedSupabase
        .from("cash_sessions")
        .select("id, opened_by_user_id, closed_by_user_id, opened_at, closed_at, initial_amount, closing_amount, calculated_amount, difference_amount, status, notes, created_at")
        .eq("partner_id", partnerId)
      if (storeId) q = q.eq("store_id", storeId)
      if (cursor) q = q.or(buildCashSessionsKeysetOrFilter(cursor))
      return q.order("opened_at", { ascending: false }).order("id", { ascending: false }).limit(fetchLimit)
    },
    15,
  )

  if (sessionError) return { success: false as const, error: sessionError.message }

  const supabase = createAdminClient()

  const rows = sessions || []
  const hasMore = rows.length > limit
  const pageItems = hasMore ? rows.slice(0, limit) : rows

  const sessionIds = pageItems.map((s: { id: string }) => s.id)
  let movementQ = supabase
    .from("cash_movements")
    .select("cash_session_id, type, amount, reversed_at, payment_method_id")
    .eq("partner_id", partnerId)
    .in("cash_session_id", sessionIds)
  if (storeId) {
    movementQ = movementQ.eq("store_id", storeId)
  }
  const { data: movementRows } = sessionIds.length > 0
    ? await movementQ
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
  await requirePermission(partnerId, "pdv", "view")
  const supabase = createAdminClient()

  const { data: session, error: sessionError } = await getCachedErpPage(
    ["erp-cash-session-detail", partnerId, cashSessionId],
    [TAGS.cashSessions(partnerId), TAGS.transactions(partnerId), TAGS.entityTimeline("cash_session", cashSessionId), `cash-session-${cashSessionId}`],
    async () => createAdminClient()
      .from("cash_sessions")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("id", cashSessionId)
      .single(),
    10,
  )
  if (sessionError || !session) return { success: false as const, error: sessionError?.message || "Caixa não encontrado." }

  const movements = await getCachedErpPage(
    ["erp-cash-session-movements", partnerId, cashSessionId],
    [TAGS.cashSessions(partnerId), TAGS.transactions(partnerId), TAGS.entityTimeline("cash_session", cashSessionId), `cash-session-${cashSessionId}`],
    () => loadMovementsForSession(createAdminClient(), partnerId, cashSessionId),
    10,
  )

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
      groupedByOperator: (() => {
        const opGroups = new Map<string, { operatorName: string; byMethod: Map<string, { label: string; amount: number }> }>()
        for (const m of movements) {
          if (!isMovementActive(m) || m.type !== "sale") continue
          const opUserId = m.created_by_user_id || "unknown"
          if (!opGroups.has(opUserId)) {
            opGroups.set(opUserId, { operatorName: nameById.get(opUserId) || "Usuário", byMethod: new Map() })
          }
          const group = opGroups.get(opUserId)!
          const pmKey = m.payment_method_id || "__cash__"
          const pmLabel = m.payment_method_name || "Dinheiro"
          const amt = money(Number(m.amount || 0))
          const cur = group.byMethod.get(pmKey)
          if (cur) cur.amount = money(cur.amount + amt)
          else group.byMethod.set(pmKey, { label: pmLabel, amount: amt })
        }
        return Array.from(opGroups.entries()).map(([userId, g]) => ({
          userId,
          operatorName: g.operatorName,
          byMethod: Array.from(g.byMethod.entries()).map(([pmKey, row]) => ({
            paymentMethodId: pmKey === "__cash__" ? null : pmKey,
            label: row.label,
            amount: row.amount,
          })),
        }))
      })(),
      totals: {
        initial,
        totalCashSales: drawer.cashSales,
        totalSalesAllMethods: summaryByPaymentMethod.reduce((acc, row) => money(acc + Number(row.calculated || 0)), 0),
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
