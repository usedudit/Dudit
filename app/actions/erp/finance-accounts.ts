"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export type FinanceAccountType = "cash" | "bank" | "wallet"

export async function getFinanceAccountsAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("finance_accounts")
      .select(
        "id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at",
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

export async function createFinanceAccountAction(data: {
  partnerId: string
  name: string
  type: FinanceAccountType
  description?: string | null
  initialBalance: number
  currentBalance?: number | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(data.partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")
    if (!["cash", "bank", "wallet"].includes(data.type)) throw new Error("Tipo de conta inválido.")

    const initial = parseBalance(data.initialBalance)
    const current =
      data.currentBalance === undefined ? null : parseOptionalBalance(data.currentBalance)

    const { data: inserted, error } = await supabase
      .from("finance_accounts")
      .insert({
        partner_id: data.partnerId,
        name: data.name.trim(),
        type: data.type,
        description: data.description?.trim() || null,
        initial_balance: initial,
        current_balance: current,
      })
      .select(
        "id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at",
      )
      .single()

    if (error) throw error
    return { success: true, data: inserted }
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
    currentBalance?: number | null
    isActive?: boolean
  },
) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    const payload: Record<string, unknown> = {}
    if (data.name !== undefined) payload.name = data.name.trim()
    if (data.type !== undefined) {
      if (!["cash", "bank", "wallet"].includes(data.type)) throw new Error("Tipo de conta inválido.")
      payload.type = data.type
    }
    if (data.description !== undefined) payload.description = data.description?.trim() || null
    if (data.initialBalance !== undefined) payload.initial_balance = parseBalance(data.initialBalance)
    if (data.currentBalance !== undefined) payload.current_balance = parseOptionalBalance(data.currentBalance)
    if (data.isActive !== undefined) payload.is_active = data.isActive

    const { data: updated, error } = await supabase
      .from("finance_accounts")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select(
        "id, name, type, description, initial_balance, current_balance, is_active, created_at, updated_at",
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

    const { error } = await supabase.from("finance_accounts").delete().eq("id", id).eq("partner_id", partnerId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
