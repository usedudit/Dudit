"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { createManualTransactionAction } from "@/app/actions/erp/transactions"

export type FinanceAccountType = "cash" | "bank" | "wallet"

export async function getFinanceAccountsAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("finance_accounts")
      .select(
        "id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at, is_system_managed, integration_source",
      )
      .eq("partner_id", partnerId)
      .order("name")

    if (error) throw error
    return { success: true, data: { accounts: data || [] } }
  } catch (error: any) {
    console.error("Error fetching finance accounts:", error)
    return { success: false, error: error.message }
  }
}

function parseBalance(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function parseOptionalBalance(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export async function createFinanceAccountAction(data: {
  partnerId: string
  name: string
  type: FinanceAccountType
  description?: string | null
  initialBalance: number
  currentBalance?: number | null
  isSystemManaged?: boolean
  integrationSource?: string | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(data.partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")
    if (!["cash", "bank", "wallet"].includes(data.type)) throw new Error("Tipo de conta inválido.")
    const normalizedName = normalizeName(data.name)

    const { data: duplicate } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", data.partnerId)
      .ilike("name", normalizedName)
      .limit(1)
      .maybeSingle()
    if (duplicate?.id) throw new Error("Já existe uma conta com esse nome.")

    const initial = parseBalance(data.initialBalance)
    const explicitCurrent =
      data.currentBalance === undefined ? null : parseOptionalBalance(data.currentBalance)
    const targetCurrent =
      explicitCurrent !== null && explicitCurrent !== undefined ? explicitCurrent : initial

    const { data: inserted, error } = await supabase
      .from("finance_accounts")
      .insert({
        partner_id: data.partnerId,
        name: normalizedName,
        type: data.type,
        description: data.description?.trim() || null,
        initial_balance: initial,
        current_balance: 0,
        is_system_managed: data.isSystemManaged ?? false,
        integration_source: data.integrationSource ?? null,
      })
      .select(
        "id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at, is_system_managed, integration_source",
      )
      .single()

    if (error) throw error

    if (Math.abs(targetCurrent) >= 0.005) {
      const today = new Date().toISOString().slice(0, 10)
      const transactionTs = new Date(`${today}T12:00:00`).toISOString()
      const adj = await createManualTransactionAction({
        partnerId: data.partnerId,
        transactionType: "adjustment",
        amount: targetCurrent,
        description: `Saldo inicial - ${data.name.trim()}`,
        category: "Ajuste de saldo",
        categoryId: null,
        subcategoryId: null,
        accountId: inserted.id,
        contactId: null,
        customerId: null,
        contactType: null,
        paymentType: "Ajuste",
        dueDate: today,
        paymentDate: transactionTs,
        transactionDate: transactionTs,
        status: "paid",
        notes: null,
        origin: "manual",
      })
      if (!adj.success) throw new Error(adj.error || "Erro ao registrar saldo inicial.")
    }

    const { data: refreshed } = await supabase
      .from("finance_accounts")
      .select("id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at, is_system_managed, integration_source")
      .eq("id", inserted.id)
      .single()

    return { success: true, data: refreshed || inserted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateFinanceAccountAction(
  id: string,
  partnerId: string,
  data: {
    name?: string
    type?: FinanceAccountType
    description?: string | null
    initialBalance?: number
    isActive?: boolean
  },
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    const { data: account, error: accErr } = await supabase
      .from("finance_accounts")
      .select("id, is_system_managed, integration_source")
      .eq("id", id)
      .eq("partner_id", partnerId)
      .single()
    if (accErr || !account) throw new Error("Conta não encontrada.")

    if (account.is_system_managed && account.integration_source === "mercadopago") {
      const { data: partner } = await supabase
        .from("partners")
        .select("mp_user_id")
        .eq("id", partnerId)
        .single()
      if (partner?.mp_user_id) {
        throw new Error("A conta Mercado Pago não pode ser editada enquanto a integração estiver conectada.")
      }
    }

    const payload: Record<string, unknown> = {}
    if (data.name !== undefined) {
      const normalizedName = normalizeName(data.name)
      const { data: duplicate } = await supabase
        .from("finance_accounts")
        .select("id")
        .eq("partner_id", partnerId)
        .ilike("name", normalizedName)
        .neq("id", id)
        .limit(1)
        .maybeSingle()
      if (duplicate?.id) throw new Error("Já existe uma conta com esse nome.")
      payload.name = normalizedName
    }
    if (data.type !== undefined) {
      if (!["cash", "bank", "wallet"].includes(data.type)) throw new Error("Tipo de conta inválido.")
      payload.type = data.type
    }
    if (data.description !== undefined) payload.description = data.description?.trim() || null
    if (data.initialBalance !== undefined) payload.initial_balance = parseBalance(data.initialBalance)
    if (data.isActive !== undefined) payload.is_active = data.isActive

    const { data: updated, error } = await supabase
      .from("finance_accounts")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select(
        "id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at, is_system_managed, integration_source",
      )
      .single()

    if (error) throw error
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteFinanceAccountAction(id: string, partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    const { data: account, error: accErr } = await supabase
      .from("finance_accounts")
      .select("id, is_system_managed, integration_source")
      .eq("id", id)
      .eq("partner_id", partnerId)
      .single()
    if (accErr || !account) throw new Error("Conta não encontrada.")

    if (account.is_system_managed && account.integration_source === "mercadopago") {
      const { data: partner } = await supabase
        .from("partners")
        .select("mp_user_id")
        .eq("id", partnerId)
        .single()
      if (partner?.mp_user_id) {
        throw new Error("A conta Mercado Pago não pode ser excluída enquanto a integração estiver conectada.")
      }
    }

    const { error } = await supabase.from("finance_accounts").delete().eq("id", id).eq("partner_id", partnerId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
