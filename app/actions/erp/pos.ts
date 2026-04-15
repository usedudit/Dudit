"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { revalidateOrders, revalidateTransactions, revalidateStockMovements } from "@/lib/utils/revalidation"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

type DraftItemInput = {
  productId?: string | null
  variantId?: string | null
  variantName?: string | null
  name: string
  qty: number
  price: number
  totalPrice?: number
  image?: string | null
}

type DraftUpsertInput = {
  partnerId: string
  preSaleId?: string | null
  customerId?: string | null
  notes?: string
  subtotal: number
  discountAmount: number
  totalAmount: number
  items: DraftItemInput[]
}

type FinalizePaymentEntry = {
  method: string
  amount: number
  paymentMethodId?: string | null
}

type FinalizePreSaleInput = {
  partnerId: string
  preSaleId: string
  financeAccountId?: string | null
  paidAmount: number
  paymentMethod?: string | null
  paymentBreakdown?: FinalizePaymentEntry[]
}

function safeMoney(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

function normalizeDraftItems(items: DraftItemInput[]) {
  const normalized = (items || []).map((item) => ({
    product_id: item.productId || null,
    variant_id: item.variantId || null,
    variant_name: item.variantName?.trim() || null,
    name: String(item.name || "").trim(),
    quantity: Math.max(0, Number(item.qty || 0)),
    unit_price: safeMoney(Number(item.price || 0)),
    total_price: safeMoney(
      Number(item.totalPrice || (Number(item.qty || 0) * Number(item.price || 0)))
    ),
    image: item.image || null,
  }))

  for (const item of normalized) {
    if (!item.name) return { error: "Todo item precisa ter nome." as const }
    if (item.quantity <= 0) return { error: `Quantidade inválida para "${item.name}".` as const }
    if (item.unit_price < 0) return { error: `Preço inválido para "${item.name}".` as const }
  }

  return { items: normalized }
}

function computeSubtotal(items: Array<{ quantity: number; unit_price: number }>) {
  return safeMoney(items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0))
}

export async function getPOSInitialDataAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const [productsRes, customersRes, accountsRes, draftsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, stock_available, allow_sell_without_stock, images, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("customers")
      .select("id, name")
      .eq("partner_id", partnerId)
      .order("name")
      .limit(120),
    supabase
      .from("finance_accounts")
      .select("id, name, is_default, is_active")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("is_default", { ascending: false }),
    supabase
      .from("pre_sales")
      .select("id, customer_id, subtotal, discount_amount, total_amount, notes, status, items, created_at, updated_at")
      .eq("partner_id", partnerId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (productsRes.error) return { success: false as const, error: productsRes.error.message }
  if (customersRes.error) return { success: false as const, error: customersRes.error.message }
  if (accountsRes.error) return { success: false as const, error: accountsRes.error.message }
  if (draftsRes.error) return { success: false as const, error: draftsRes.error.message }

  return {
    success: true as const,
    data: {
      products: productsRes.data || [],
      customers: customersRes.data || [],
      financeAccounts: accountsRes.data || [],
      preSales: draftsRes.data || [],
    },
  }
}

export async function upsertPreSaleDraftAction(input: DraftUpsertInput) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const normalizedItemsResult = normalizeDraftItems(input.items)
  if ("error" in normalizedItemsResult) return { success: false as const, error: normalizedItemsResult.error }
  const normalizedItems = normalizedItemsResult.items

  const subtotalFromItems = computeSubtotal(normalizedItems)
  const subtotal = safeMoney(input.subtotal)
  const discountAmount = safeMoney(Math.min(input.discountAmount, subtotalFromItems))
  const totalAmount = safeMoney(input.totalAmount)
  const expectedTotal = safeMoney(subtotalFromItems - discountAmount)

  if (normalizedItems.length === 0) return { success: false as const, error: "Não é possível salvar pré-venda sem itens." }
  if (subtotal < 0 || discountAmount < 0 || totalAmount < 0) {
    return { success: false as const, error: "Valores negativos não são permitidos." }
  }
  if (Math.abs(subtotal - subtotalFromItems) > 0.01) {
    return { success: false as const, error: "Subtotal da pré-venda não confere com os itens." }
  }
  if (Math.abs(totalAmount - expectedTotal) > 0.01) {
    return { success: false as const, error: "Total da pré-venda não confere com os itens e desconto." }
  }

  const payload = {
    partner_id: input.partnerId,
    customer_id: input.customerId || null,
    items: normalizedItems,
    subtotal,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    notes: input.notes?.trim() || null,
    status: "draft",
    updated_at: new Date().toISOString(),
  }

  if (input.preSaleId) {
    const { data, error } = await supabase
      .from("pre_sales")
      .update(payload)
      .eq("id", input.preSaleId)
      .eq("partner_id", input.partnerId)
      .eq("status", "draft")
      .select("*")
      .single()
    if (error) return { success: false as const, error: error.message }
    return { success: true as const, data }
  }

  const { data, error } = await supabase
    .from("pre_sales")
    .insert(payload)
    .select("*")
    .single()
  if (error) return { success: false as const, error: error.message }

  return { success: true as const, data }
}

export async function deletePreSaleDraftAction(partnerId: string, preSaleId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from("pre_sales")
    .delete()
    .eq("id", preSaleId)
    .eq("partner_id", partnerId)
    .eq("status", "draft")

  if (error) return { success: false as const, error: error.message }
  return { success: true as const }
}

/**
 * Finalize a POS pre-sale using an atomic PostgreSQL RPC.
 *
 * The RPC `finalize_pos_sale` runs inside a single DB transaction with
 * SELECT ... FOR UPDATE on product/variant rows, ensuring:
 * - No race conditions on stock
 * - All-or-nothing creation of sale + items + stock movement + transaction + cash movements
 * - Server-side total recalculation (never trusts frontend values)
 * - Idempotent: returns existing sale ID if already finalized
 */
export async function finalizePreSaleAction(input: FinalizePreSaleInput) {
  const user = await requireUser()
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  // Pre-validate inputs before calling RPC
  if (!input.preSaleId) return { success: false as const, error: "ID da pré-venda é obrigatório." }
  const paidAmount = safeMoney(Number(input.paidAmount || 0))

  // Validate finance account belongs to partner
  if (input.financeAccountId) {
    const { data: acc } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("id", input.financeAccountId)
      .eq("partner_id", input.partnerId)
      .eq("is_active", true)
      .maybeSingle()
    if (!acc?.id) return { success: false as const, error: "Conta financeira inválida ou inativa." }
  }

  // Require open cash session
  const activeSessionResult = await getActiveCashSessionAction(input.partnerId)
  if (!activeSessionResult.success) {
    return { success: false as const, error: "Não foi possível validar o caixa aberto." }
  }
  if (!activeSessionResult.data?.id) {
    return { success: false as const, error: "Abra um caixa para finalizar vendas no PDV." }
  }

  // Build payment breakdown for RPC
  const breakdownForRpc = (input.paymentBreakdown || [])
    .map((entry) => ({
      amount: safeMoney(Number(entry.amount || 0)),
      paymentMethodId: entry.paymentMethodId || null,
    }))
    .filter((entry) => entry.amount > 0)

  // Call atomic RPC
  const { data: saleId, error: rpcError } = await supabase.rpc("finalize_pos_sale", {
    p_partner_id: input.partnerId,
    p_pre_sale_id: input.preSaleId,
    p_finance_account_id: input.financeAccountId || null,
    p_cash_session_id: activeSessionResult.data.id,
    p_paid_amount: paidAmount,
    p_payment_method: input.paymentMethod || "PDV",
    p_payment_breakdown: breakdownForRpc.length > 0 ? breakdownForRpc : null,
    p_user_id: user.id,
  })

  if (rpcError) {
    // Surface clean error messages from RAISE EXCEPTION
    const msg = rpcError.message || "Falha ao finalizar venda."
    return { success: false as const, error: msg }
  }

  if (!saleId) {
    return { success: false as const, error: "Falha ao finalizar venda — nenhum ID retornado." }
  }

  // Invalidate caches (non-blocking — sale is already safely committed)
  const draftItems = await supabase
    .from("sale_items")
    .select("product_id")
    .eq("sale_id", saleId)
    .eq("partner_id", input.partnerId)

  const productIds = new Set<string>(
    ((draftItems.data || []) as Array<{ product_id: string | null }>)
      .map((item) => item.product_id)
      .filter(Boolean) as string[]
  )
  for (const productId of productIds) {
    await invalidateProductCache(productId, input.partnerId, "update", { silent: true })
  }

  await revalidateOrders(input.partnerId)
  await revalidateTransactions(input.partnerId)
  await revalidateStockMovements(input.partnerId)

  return { success: true as const, data: { saleId } }
}
