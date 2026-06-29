"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { createAdminClient } from "@/lib/supabase/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { createManualTransactionAction } from "@/app/actions/erp/transactions"
import { startOfDay } from "@/lib/date"

import { 
  type FinanceAccountType, 
  pickDefaultAccountIdForType, 
  pickPreferredDefaultAccountId 
} from "@/lib/finance-utils"


const NON_MP_FINANCE_ACCOUNTS = "integration_source.is.null,integration_source.neq.mercadopago"

/**
 * Pedidos do marketplace (comprador): use admin/service client (RLS do comprador não lê finance_accounts).
 * Mercado Pago → conta da integração MP; demais → banco padrão → qualquer banco → caixa padrão → qualquer caixa.
 */
export async function resolveMarketplaceOrderFinanceAccountId(
  supabase: SupabaseClient,
  partnerId: string,
  useMercadoPago: boolean,
): Promise<string | null> {
  if (useMercadoPago) {
    const { data: bySource } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .eq("integration_source", "mercadopago")
      .limit(1)
      .maybeSingle()
    if (bySource?.id) return bySource.id
    const { data: byName } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .ilike("name", "%Mercado Pago%")
      .limit(1)
      .maybeSingle()
    return byName?.id ?? null
  }

  // PERF: Single query replaces 4 sequential queries (bank default → any bank → cash default → any cash).
  // Priority selection is done in JS on the result set, preserving identical behavior.
  const { data: accounts } = await supabase
    .from("finance_accounts")
    .select("id, type, is_default")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .or(NON_MP_FINANCE_ACCOUNTS)
    .order("created_at", { ascending: true })

  if (!accounts || accounts.length === 0) return null

  // Same priority as the old 4-query waterfall:
  // 1. Bank + default
  const bankDef = accounts.find((a: { type: string; is_default: boolean }) => a.type === "bank" && a.is_default)
  if (bankDef) return bankDef.id
  // 2. Any bank (already sorted by created_at ASC, so first match = oldest)
  const anyBank = accounts.find((a: { type: string }) => a.type === "bank")
  if (anyBank) return anyBank.id
  // 3. Cash + default
  const cashDef = accounts.find((a: { type: string; is_default: boolean }) => a.type === "cash" && a.is_default)
  if (cashDef) return cashDef.id
  // 4. Any cash
  const anyCash = accounts.find((a: { type: string }) => a.type === "cash")
  if (anyCash) return anyCash.id
  // 5. Fallback: any remaining account (wallet, etc.)
  return accounts[0]?.id ?? null
}

export async function getFinanceAccountsAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "financial", "view")

    // Use admin client after authz check so invited ERP users can read accounts.
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("finance_accounts")
      .select(
        "id, name, type, initial_balance, current_balance, is_active, is_default, created_at, updated_at, is_system_managed, integration_source",
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
  initialBalance: number
  currentBalance?: number | null
  isSystemManaged?: boolean
  integrationSource?: string | null
  isDefault?: boolean
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(data.partnerId, "financial", "create")
    const supabase = createAdminClient()

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
        initial_balance: initial,
        current_balance: 0,
        is_system_managed: data.isSystemManaged ?? false,
        integration_source: data.integrationSource ?? null,
        is_default: Boolean(data.isDefault),
      })
      .select(
        "id, name, type, initial_balance, current_balance, is_active, is_default, created_at, updated_at, is_system_managed, integration_source",
      )
      .single()

    if (error) throw error

    if (!inserted.integration_source || inserted.integration_source !== "mercadopago") {
      if (Boolean(data.isDefault)) {
        await supabase
          .from("finance_accounts")
          .update({ is_default: false })
          .eq("partner_id", data.partnerId)
          .eq("type", data.type)
          .neq("id", inserted.id)
          .or("integration_source.is.null,integration_source.neq.mercadopago")
      } else {
        const { count } = await supabase
          .from("finance_accounts")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", data.partnerId)
          .eq("type", data.type)
          .eq("is_default", true)
          .neq("id", inserted.id)
          .or("integration_source.is.null,integration_source.neq.mercadopago")

        if (!count) {
          await supabase
            .from("finance_accounts")
            .update({ is_default: true })
            .eq("id", inserted.id)
            .eq("partner_id", data.partnerId)
        }
      }
    }

    if (Math.abs(targetCurrent) >= 0.005) {
      const today = new Date().toISOString().slice(0, 10)
      const transactionTs = startOfDay(today).toISOString()
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
      .select("id, name, type, initial_balance, current_balance, is_active, is_default, created_at, updated_at, is_system_managed, integration_source")
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
    initialBalance?: number
    isActive?: boolean
    isDefault?: boolean
  },
) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(partnerId, "financial", "edit")
    const supabase = createAdminClient()

    const { data: account, error: accErr } = await supabase
      .from("finance_accounts")
      .select("id, is_system_managed, integration_source, type, is_default")
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
    if (data.initialBalance !== undefined) payload.initial_balance = parseBalance(data.initialBalance)
    if (data.isActive !== undefined) payload.is_active = data.isActive
    if (data.isDefault !== undefined) payload.is_default = data.isDefault

    const targetType = (data.type ?? account.type) as string
    const willBeDefault =
      data.isDefault === true || (data.isDefault === undefined && account.is_default === true)

    if (account.integration_source !== "mercadopago" && willBeDefault && ["cash", "bank", "wallet"].includes(targetType)) {
      await supabase
        .from("finance_accounts")
        .update({ is_default: false })
        .eq("partner_id", partnerId)
        .eq("type", targetType)
        .neq("id", id)
        .or("integration_source.is.null,integration_source.neq.mercadopago")
    }

    const { data: updated, error } = await supabase
      .from("finance_accounts")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select(
        "id, name, type, initial_balance, current_balance, is_active, is_default, created_at, updated_at, is_system_managed, integration_source",
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
    await requirePermission(partnerId, "financial", "edit")
    const supabase = createAdminClient()

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
