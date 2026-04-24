"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { createManualTransactionAction } from "@/app/actions/erp/transactions"

export type FinanceAccountType = "cash" | "bank" | "wallet"

/** Conta padrão do tipo (caixa, banco ou carteira) entre contas ativas. */
export function pickDefaultAccountIdForType(
  accounts: { id: string; type: string; is_active?: boolean | null; is_default?: boolean | null }[],
  accountType: FinanceAccountType,
): string | undefined {
  const rows = accounts.filter((a) => a.is_active !== false)
  return rows.find((a) => a.type === accountType && a.is_default)?.id ?? rows.find((a) => a.type === accountType)?.id
}

/** Para formulários genéricos: prioriza padrão caixa, depois banco, depois carteira. */
export function pickPreferredDefaultAccountId(
  accounts: { id: string; type: string; is_active?: boolean | null; is_default?: boolean | null }[],
): string | undefined {
  for (const t of ["cash", "bank", "wallet"] as const) {
    const id = pickDefaultAccountIdForType(accounts, t)
    if (id) return id
  }
  return undefined
}

/** Pedidos ERP (não-PDV): padrão banco → caixa. PDV continua escolhendo só caixa na UI. */
export function pickBankThenCashDefaultFinanceAccountId(
  accounts: { id: string; type: string; is_active?: boolean | null; is_default?: boolean | null }[],
): string | undefined {
  return pickDefaultAccountIdForType(accounts, "bank") ?? pickDefaultAccountIdForType(accounts, "cash")
}

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

  const { data: bankDef } = await supabase
    .from("finance_accounts")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("type", "bank")
    .eq("is_default", true)
    .or(NON_MP_FINANCE_ACCOUNTS)
    .limit(1)
    .maybeSingle()
  if (bankDef?.id) return bankDef.id

  const { data: anyBank } = await supabase
    .from("finance_accounts")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("type", "bank")
    .or(NON_MP_FINANCE_ACCOUNTS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (anyBank?.id) return anyBank.id

  const { data: cashDef } = await supabase
    .from("finance_accounts")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("type", "cash")
    .eq("is_default", true)
    .or(NON_MP_FINANCE_ACCOUNTS)
    .limit(1)
    .maybeSingle()
  if (cashDef?.id) return cashDef.id

  const { data: anyCash } = await supabase
    .from("finance_accounts")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("type", "cash")
    .or(NON_MP_FINANCE_ACCOUNTS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return anyCash?.id ?? null
}

export async function getFinanceAccountsAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")

    const supabase = await getSupabaseServerClient()
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

    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

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
