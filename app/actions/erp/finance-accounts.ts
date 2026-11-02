"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requirePermission } from "@/lib/permissions/access"
import { requireStorePermission } from "@/lib/auth/authorization"
import { createAdminClient } from "@/lib/supabase/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { startOfDay } from "@/lib/date"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { findMercadoPagoIntegration, isMercadoPagoConnected } from "@/lib/services/payments/mercadopago-integration"

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
    if (byName?.id) return byName.id

    // Auto-heal: reactivate existing MP account if it was deactivated
    const { data: inactiveMp } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", partnerId)
      .or("integration_source.eq.mercadopago,name.ilike.%Mercado Pago%")
      .limit(1)
      .maybeSingle()
    if (inactiveMp?.id) {
      await supabase.from("finance_accounts").update({ is_active: true }).eq("id", inactiveMp.id)
      return inactiveMp.id
    }

    return null
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

export async function getFinanceAccountsAction(partnerId: string, storeId?: string | null) {
  try {
    const user = await requireUser()
    const context = await getCurrentPartnerContext(user)
    if (!context?.partnerId || context.partnerId !== partnerId) {
      throw new Error("O parceiro informado não corresponde ao contexto ativo")
    }
    await requirePermission(partnerId, "financial", "view", user)
    const effectiveStoreId = storeId === undefined ? context.activeStoreId : storeId
    if (effectiveStoreId) {
      await requireStorePermission(effectiveStoreId, partnerId, "financial", "view")
    }

    // Use admin client after authz check so invited ERP users can read accounts.
    const { data, error } = await getCachedErpPage(
      ["erp-finance-accounts", partnerId, effectiveStoreId || "none"],
      [TAGS.financeAccounts(partnerId)],
      async () => {
        const supabase = createAdminClient()
        const select = "id, name, type, initial_balance, current_balance, is_active, is_default, created_at, updated_at, is_system_managed, integration_source"
        if (!effectiveStoreId) {
          return supabase
            .from("finance_accounts")
            .select(select)
            .eq("partner_id", partnerId)
            .is("store_id", null)
            .order("name")
        }
        const [storeAccounts, sharedAccounts] = await Promise.all([
          supabase
            .from("finance_accounts")
            .select(select)
            .eq("partner_id", partnerId)
            .eq("store_id", effectiveStoreId)
            .order("name"),
          supabase
            .from("finance_accounts")
            .select(select)
            .eq("partner_id", partnerId)
            .is("store_id", null)
            .order("name"),
        ])
        if (storeAccounts.error) return { data: null, error: storeAccounts.error }
        if (sharedAccounts.error) return { data: null, error: sharedAccounts.error }
        return {
          data: [...(sharedAccounts.data || []), ...(storeAccounts.data || [])]
            .sort((a, b) => a.name.localeCompare(b.name)),
          error: null,
        }
      },
      30,
    )
    if (error) throw error
    return { success: true, data: { accounts: data || [] } }
  } catch (error: any) {
    console.error("Error fetching finance accounts:", error)
    return { success: false, error: error.message }
  }
}

function parseBalance(v: unknown): number {
  if (v === null || v === undefined || v === "") throw new Error("Informe um saldo válido.")
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  if (!Number.isFinite(n) || Math.abs(n) > 999_999_999_999.99) {
    throw new Error("Saldo fora do limite permitido.")
  }
  return Math.round(n * 100) / 100
}

function parseOptionalBalance(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  return parseBalance(v)
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").substring(0, 150)
}

export async function createFinanceAccountAction(data: {
  partnerId: string
  name: string
  type: FinanceAccountType
  initialBalance: number
  currentBalance?: number | null
  isDefault?: boolean
  storeId?: string | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    const user = await requireUser()
    await requirePermission(data.partnerId, "financial", "create", user)
    const supabase = createAdminClient()

    if (data.storeId) {
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("id")
        .eq("id", data.storeId)
        .eq("partner_id", data.partnerId)
        .maybeSingle()
      if (storeError || !store) throw new Error("Loja não encontrada para este parceiro.")
      await requireStorePermission(data.storeId, data.partnerId, "financial", "create")
    }

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")
    if (!["cash", "bank", "wallet"].includes(data.type)) throw new Error("Tipo de conta inválido.")
    const normalizedName = normalizeName(data.name)

    const initial = parseBalance(data.initialBalance)
    const explicitCurrent =
      data.currentBalance === undefined ? null : parseOptionalBalance(data.currentBalance)
    const targetCurrent =
      explicitCurrent !== null && explicitCurrent !== undefined ? explicitCurrent : initial
    const today = new Date().toISOString().slice(0, 10)
    const openingTransactionDate = startOfDay(today).toISOString()
    if (data.isDefault !== undefined && typeof data.isDefault !== "boolean") {
      throw new Error("Valor de conta padrão inválido.")
    }
    const { data: created, error } = await supabase.rpc("create_finance_account_with_opening_balance_atomic", {
      p_partner_id: data.partnerId,
      p_user_id: user.id,
      p_store_id: data.storeId || null,
      p_name: normalizedName,
      p_type: data.type,
      p_initial_balance: initial,
      p_current_balance: targetCurrent,
      p_is_default: data.isDefault ?? false,
      p_opening_transaction_date: openingTransactionDate,
    })
    if (error) throw error
    const account = created?.account
    if (!account?.id) throw new Error("A RPC não retornou a conta criada.")

    await safeRevalidateTag(TAGS.financeAccounts(data.partnerId))
    return { success: true, data: account }
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
      .select("id, is_system_managed, integration_source, type, is_default, store_id")
      .eq("id", id)
      .eq("partner_id", partnerId)
      .single()
    if (accErr || !account) throw new Error("Conta não encontrada.")
    if (account.store_id) await requireStorePermission(account.store_id, partnerId, "financial", "edit")

    if (account.is_system_managed && account.integration_source === "mercadopago") {
      const integration = await findMercadoPagoIntegration(supabase, partnerId)
      if (isMercadoPagoConnected(integration)) {
        throw new Error("A conta Mercado Pago não pode ser editada enquanto a integração estiver conectada.")
      }
    }

    const payload: Record<string, unknown> = {}
    if (data.name !== undefined) {
      const normalizedName = normalizeName(data.name)
      if (!normalizedName) throw new Error("O nome é obrigatório.")
      payload.name = normalizedName
    }
    if (data.type !== undefined) {
      if (!["cash", "bank", "wallet"].includes(data.type)) throw new Error("Tipo de conta inválido.")
      payload.type = data.type
    }
    if (data.initialBalance !== undefined) payload.initial_balance = parseBalance(data.initialBalance)
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== "boolean") throw new Error("Status da conta inválido.")
      payload.is_active = data.isActive
    }
    if (data.isDefault !== undefined) {
      if (typeof data.isDefault !== "boolean") throw new Error("Valor de conta padrão inválido.")
      payload.is_default = data.isDefault
    }

    const { data: result, error } = await supabase.rpc("update_finance_account_atomic", {
      p_partner_id: partnerId,
      p_account_id: id,
      p_patch: payload,
    })
    if (error) throw error
    const updated = result?.account
    if (!updated?.id) throw new Error("A RPC não retornou a conta atualizada.")

    await safeRevalidateTag(TAGS.financeAccounts(partnerId))
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
      .select("id, is_system_managed, integration_source, store_id")
      .eq("id", id)
      .eq("partner_id", partnerId)
      .single()
    if (accErr || !account) throw new Error("Conta não encontrada.")
    if (account.store_id) await requireStorePermission(account.store_id, partnerId, "financial", "edit")

    if (account.is_system_managed && account.integration_source === "mercadopago") {
      const integration = await findMercadoPagoIntegration(supabase, partnerId)
      if (isMercadoPagoConnected(integration)) {
        throw new Error("A conta Mercado Pago não pode ser excluída enquanto a integração estiver conectada.")
      }
    }

    const { error } = await supabase.from("finance_accounts").delete().eq("id", id).eq("partner_id", partnerId)

    if (error) throw error
    await safeRevalidateTag(TAGS.financeAccounts(partnerId))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
