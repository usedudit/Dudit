import type { SupabaseClient } from "@supabase/supabase-js"
import { calculateCommission, type CommissionRole } from "@/lib/services/commission.service"

type CommissionConfigRow = {
  commission_type: string
  value: number
  metadata: Record<string, unknown> | null
}

async function getCommissionConfig(params: {
  supabase: SupabaseClient
  partnerId: string
  partnerUserId: string
  role: CommissionRole
}): Promise<CommissionConfigRow | null> {
  const { data } = await params.supabase
    .from("employee_commissions")
    .select("commission_type, value, metadata")
    .eq("partner_id", params.partnerId)
    .eq("user_id", params.partnerUserId)
    .eq("role", params.role)
    .limit(1)
    .maybeSingle()

  return (data as CommissionConfigRow | null) || null
}

export async function createCommissionExpenseForEntity(params: {
  supabase: SupabaseClient
  partnerId: string
  partnerUserId: string
  role: CommissionRole
  saleAmount?: number
  deliveryFee?: number
  entityType: "sale" | "delivery"
  entityId: string
  accountId?: string | null
  createdByUserId?: string | null
}) {
  const config = await getCommissionConfig({
    supabase: params.supabase,
    partnerId: params.partnerId,
    partnerUserId: params.partnerUserId,
    role: params.role,
  })
  if (!config) return { success: true as const, amount: 0 }

  const amount = calculateCommission({
    userId: params.partnerUserId,
    role: params.role,
    commissionType: config.commission_type as any,
    value: Number(config.value || 0),
    saleAmount: Number(params.saleAmount || 0),
    deliveryFee: Number(params.deliveryFee || 0),
  })

  if (amount <= 0.009) return { success: true as const, amount: 0 }

  const referenceNote = `commission:${params.entityType}:${params.entityId}:${params.partnerUserId}`
  const { data: existing } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", referenceNote)
    .eq("transaction_type", "expense")
    .limit(1)
    .maybeSingle()

  if (existing?.id) return { success: true as const, amount, transactionId: existing.id }

  const now = new Date().toISOString()
  const description = params.entityType === "sale" ? "Comissão venda" : "Comissão entrega"

  const payload: Record<string, unknown> = {
    partner_id: params.partnerId,
    description,
    category: "Comissões",
    amount,
    original_amount: amount,
    fee_amount: 0,
    status: "paid",
    payment_date: now,
    transaction_date: now,
    payment_type: "Comissão",
    transaction_type: "expense",
    origin: "system",
    notes: `Comissão automática para ${params.role}.`,
    reference_note: referenceNote,
    account_id: params.accountId || null,
    created_by_user_id: params.createdByUserId || null,
    seller_partner_user_id: params.partnerUserId,
  }

  let insertResult = await params.supabase
    .from("transactions")
    .insert(payload)
    .select("id")
    .maybeSingle()

  if (insertResult.error) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.created_by_user_id
    insertResult = await params.supabase.from("transactions").insert(fallbackPayload).select("id").maybeSingle()
  }

  if (insertResult.error || !insertResult.data?.id) {
    return { success: false as const, error: insertResult.error?.message || "Erro ao lançar comissão." }
  }

  return { success: true as const, amount, transactionId: insertResult.data.id }
}

export async function reverseCommissionForEntity(params: {
  supabase: SupabaseClient
  partnerId: string
  entityType: "sale" | "delivery"
  entityId: string
  partnerUserId: string
  accountId?: string | null
  createdByUserId?: string | null
}) {
  const referenceNote = `commission:${params.entityType}:${params.entityId}:${params.partnerUserId}`
  const { data: original } = await params.supabase
    .from("transactions")
    .select("id, amount")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", referenceNote)
    .eq("transaction_type", "expense")
    .limit(1)
    .maybeSingle()

  if (!original?.id) return { success: true as const }

  const reversalReference = `commission-reversal:${original.id}`
  const { data: existingReversal } = await params.supabase
    .from("transactions")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("reference_note", reversalReference)
    .eq("transaction_type", "refund")
    .limit(1)
    .maybeSingle()

  if (existingReversal?.id) return { success: true as const, reversed: true }

  const now = new Date().toISOString()
  const reversalAmount = Math.abs(Number(original.amount || 0))
  if (reversalAmount <= 0.009) return { success: true as const }

  const payload: Record<string, unknown> = {
    partner_id: params.partnerId,
    description: params.entityType === "sale" ? "Estorno comissão venda" : "Estorno comissão entrega",
    category: "Comissões",
    amount: reversalAmount,
    original_amount: reversalAmount,
    fee_amount: 0,
    status: "paid",
    payment_date: now,
    transaction_date: now,
    payment_type: "Comissão",
    transaction_type: "refund",
    refund_kind: "expense_refund",
    origin: "system",
    notes: "Estorno automático de comissão.",
    reference_note: reversalReference,
    account_id: params.accountId || null,
    created_by_user_id: params.createdByUserId || null,
  }

  let insertResult = await params.supabase
    .from("transactions")
    .insert(payload)
    .select("id")
    .maybeSingle()

  if (insertResult.error) {
    const fallbackPayload = { ...payload }
    delete fallbackPayload.created_by_user_id
    insertResult = await params.supabase.from("transactions").insert(fallbackPayload).select("id").maybeSingle()
  }

  if (insertResult.error || !insertResult.data?.id) {
    return { success: false as const, error: insertResult.error?.message || "Erro ao estornar comissão." }
  }

  return { success: true as const, reversed: true }
}
