"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { revalidateOrders, revalidateTransactions, revalidateStockMovements } from "@/lib/utils/revalidation"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { getActiveCashSessionAction, registerSaleCashMovementsAction } from "@/app/actions/erp/cash-register"

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

function sumBreakdown(entries: FinalizePaymentEntry[] | undefined) {
  return safeMoney(
    (entries || []).reduce((acc, entry) => acc + Math.max(0, Number(entry.amount || 0)), 0)
  )
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
  const supabase = await getSupabaseServerClient()

  const normalizedItemsResult = normalizeDraftItems(input.items)
  if ("error" in normalizedItemsResult) return { success: false as const, error: normalizedItemsResult.error }
  const normalizedItems = normalizedItemsResult.items

  const subtotalFromItems = computeSubtotal(normalizedItems)
  const subtotal = safeMoney(input.subtotal)
  const discountAmount = safeMoney(input.discountAmount)
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

async function validateStockForFinalize(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  items: Array<{ product_id: string | null; variant_id: string | null; quantity: number; name: string }>
) {
  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean))) as string[]
  const variantIds = Array.from(new Set(items.map((item) => item.variant_id).filter(Boolean))) as string[]

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, stock_available, allow_sell_without_stock, product_variants(id)")
    .eq("partner_id", partnerId)
    .in("id", productIds)

  if (productsError) return productsError.message

  const productMap = new Map<string, any>((products || []).map((product: any) => [product.id, product]))
  const variantMap = new Map<string, any>()

  if (variantIds.length > 0) {
    const { data: variants, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, variant_name, stock_available")
      .in("id", variantIds)
    if (variantsError) return variantsError.message
    for (const variant of variants || []) variantMap.set(variant.id, variant)
  }

  const aggregated = new Map<string, { qty: number; productId: string; variantId: string | null; displayName: string }>()
  for (const item of items) {
    if (!item.product_id) continue
    const key = item.variant_id ? `v:${item.variant_id}` : `p:${item.product_id}`
    const cur = aggregated.get(key)
    if (cur) {
      cur.qty += item.quantity
      continue
    }
    aggregated.set(key, {
      qty: item.quantity,
      productId: item.product_id,
      variantId: item.variant_id || null,
      displayName: item.name,
    })
  }

  for (const agg of aggregated.values()) {
    const product = productMap.get(agg.productId)
    if (!product) return `Produto não encontrado para "${agg.displayName}".`

    const productHasVariants = Array.isArray(product.product_variants) && product.product_variants.length > 0
    if (productHasVariants && !agg.variantId) {
      return `Variação não informada para o item ${agg.displayName}`
    }
    if (product.allow_sell_without_stock) continue

    const available = agg.variantId
      ? Number(variantMap.get(agg.variantId)?.stock_available ?? -1)
      : Number(product.stock_available ?? -1)
    if (agg.variantId) {
      const variant = variantMap.get(agg.variantId)
      if (!variant) return `A variação do item ${agg.displayName} não existe mais.`
      if (variant.product_id !== agg.productId) {
        return `Combinação inválida de variação para o item ${agg.displayName}`
      }
    }
    if (available < 0) return `Estoque não encontrado para "${agg.displayName}".`
    if (available <= 0) return `Estoque insuficiente para o item ${agg.displayName}`
    if (agg.qty > available) return `Estoque insuficiente para o item ${agg.displayName}`
  }

  return null
}

export async function finalizePreSaleAction(input: FinalizePreSaleInput) {
  const user = await requireUser()
  await requirePartnerAccess(input.partnerId)
  const supabase = await getSupabaseServerClient()

  const { data: draft, error: draftError } = await supabase
    .from("pre_sales")
    .select("*")
    .eq("id", input.preSaleId)
    .eq("partner_id", input.partnerId)
    .single()

  if (draftError || !draft) return { success: false as const, error: draftError?.message || "Pré-venda não encontrada." }
  if (draft.status !== "draft") return { success: false as const, error: "Esta pré-venda já foi finalizada." }

  const draftItems = Array.isArray(draft.items) ? draft.items : []
  if (draftItems.length === 0) return { success: false as const, error: "Não é possível finalizar venda sem itens." }

  const normalizedItemsResult = normalizeDraftItems(
    draftItems.map((item: any) => ({
      productId: item.product_id ?? item.productId ?? null,
      variantId: item.variant_id ?? item.variantId ?? null,
      variantName: item.variant_name ?? item.variantName ?? null,
      name: item.name,
      qty: item.quantity ?? item.qty ?? 0,
      price: item.unit_price ?? item.price ?? 0,
      totalPrice: item.total_price ?? item.totalPrice,
      image: item.image ?? null,
    }))
  )
  if ("error" in normalizedItemsResult) return { success: false as const, error: normalizedItemsResult.error }
  const items = normalizedItemsResult.items
  const subtotalFromItems = computeSubtotal(items)
  const subtotal = safeMoney(Number(draft.subtotal || 0))
  const discountAmount = safeMoney(Number(draft.discount_amount || 0))
  const finalAmount = safeMoney(Number(draft.total_amount || 0))

  if (Math.abs(subtotal - subtotalFromItems) > 0.01) {
    return { success: false as const, error: "Subtotal inconsistente. Atualize a pré-venda antes de finalizar." }
  }
  if (Math.abs(finalAmount - safeMoney(subtotalFromItems - discountAmount)) > 0.01) {
    return { success: false as const, error: "Total inconsistente. Atualize a pré-venda antes de finalizar." }
  }
  if (finalAmount <= 0) return { success: false as const, error: "A venda não pode ser finalizada com valor zerado." }

  const stockError = await validateStockForFinalize(
    supabase,
    input.partnerId,
    items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      name: item.name,
    }))
  )
  if (stockError) return { success: false as const, error: stockError }

  const paidAmountFromInput = safeMoney(Number(input.paidAmount || 0))
  const paidAmountFromBreakdown = sumBreakdown(input.paymentBreakdown)
  const paidAmount = safeMoney(
    paidAmountFromBreakdown > 0 ? paidAmountFromBreakdown : paidAmountFromInput
  )
  const clampedPaidAmount = Math.min(finalAmount, Math.max(0, paidAmount))

  const paymentStatus = clampedPaidAmount >= finalAmount - 0.01
    ? "paid"
    : clampedPaidAmount > 0
      ? "partially_paid"
      : "pending"

  const activeSessionResult = await getActiveCashSessionAction(input.partnerId)
  if (!activeSessionResult.success) {
    return { success: false as const, error: "Não foi possível validar o caixa aberto." }
  }
  if (!activeSessionResult.data?.id) {
    return { success: false as const, error: "Abra um caixa para finalizar vendas no PDV." }
  }

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      partner_id: input.partnerId,
      customer_id: draft.customer_id || null,
      pre_sale_id: draft.id,
      total_amount: subtotal,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      paid_amount: clampedPaidAmount,
      payment_status: paymentStatus,
      status: paymentStatus,
      finance_account_id: input.financeAccountId || null,
      cash_session_id: activeSessionResult.data.id,
      notes: draft.notes || null,
      finalized_by_user_id: user.id,
    })
    .select("*")
    .single()
  if (saleError || !sale) return { success: false as const, error: saleError?.message || "Falha ao criar venda." }

  const saleItemsPayload = items.map((item) => ({
    sale_id: sale.id,
    partner_id: input.partnerId,
    product_id: item.product_id,
    variant_id: item.variant_id,
    product_name: item.name,
    variant_name: item.variant_name,
    unit_price: item.unit_price,
    quantity: item.quantity,
    subtotal: safeMoney(item.quantity * item.unit_price),
    total_price: safeMoney(item.quantity * item.unit_price),
  }))

  const { error: saleItemsError } = await supabase.from("sale_items").insert(saleItemsPayload)
  if (saleItemsError) {
    await supabase.from("sales").delete().eq("id", sale.id).eq("partner_id", input.partnerId)
    return { success: false as const, error: saleItemsError.message }
  }

  const stockItems = items
    .filter((item) => item.product_id)
    .map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      quantity: item.quantity,
    }))

  if (stockItems.length > 0) {
    const { error: stockErrorCreate } = await supabase.rpc("create_batch_stock_movement", {
      p_partner_id: input.partnerId,
      p_movement_type: "out",
      p_reason: "Venda PDV",
      p_notes: `Baixa de estoque da venda ${sale.id}`,
      p_created_by: user.id,
      p_items: stockItems,
    })
    if (stockErrorCreate) {
      await supabase.from("sale_items").delete().eq("sale_id", sale.id)
      await supabase.from("sales").delete().eq("id", sale.id).eq("partner_id", input.partnerId)
      return { success: false as const, error: stockErrorCreate.message }
    }
  }

  if (clampedPaidAmount > 0) {
    const now = new Date().toISOString()
    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert({
        partner_id: input.partnerId,
        description: `PDV ${sale.id.slice(0, 8).toUpperCase()}`,
        category: "Vendas",
        customer_id: draft.customer_id || null,
        contact_type: "customer",
        amount: clampedPaidAmount,
        due_date: null,
        payment_date: now,
        transaction_date: now,
        status: "paid",
        notes: "Recebimento gerado pela finalização do PDV.",
        payment_type: input.paymentMethod || "Não informado",
        original_amount: clampedPaidAmount,
        interest_amount: null,
        fee_amount: 0,
        transaction_type: "income",
        origin: "system",
        reference_note: sale.id,
        account_id: input.financeAccountId || null,
        payment_method_id: null,
        created_by_user_id: user.id,
      })
      .select("id")
      .single()

    if (transactionError) {
      return { success: false as const, error: transactionError.message }
    }

    const paymentEntries = (input.paymentBreakdown || [])
      .map((entry) => ({
        amount: safeMoney(Number(entry.amount || 0)),
        paymentMethodId: entry.paymentMethodId || null,
      }))
      .filter((entry) => entry.amount > 0)

    if (transaction?.id && paymentEntries.length > 0) {
      const paymentsPayload = paymentEntries.map((entry) => ({
        partner_id: input.partnerId,
        transaction_id: transaction.id,
        amount: entry.amount,
        payment_method_id: entry.paymentMethodId,
        created_by_user_id: user.id,
      }))
      await supabase.from("transaction_payments").insert(paymentsPayload)
    }

    const movementResult = await registerSaleCashMovementsAction({
      partnerId: input.partnerId,
      saleId: sale.id,
      cashSessionId: activeSessionResult.data.id,
      paymentBreakdown: paymentEntries.length > 0
        ? paymentEntries.map((entry) => ({
          amount: entry.amount,
          paymentMethodId: entry.paymentMethodId,
          method: "PDV",
        }))
        : [{ amount: clampedPaidAmount, paymentMethodId: null, method: "PDV" }],
    })
    if (!movementResult.success) {
      return { success: false as const, error: movementResult.error || "Falha ao registrar movimento no caixa." }
    }
  }

  const { error: closeDraftError } = await supabase
    .from("pre_sales")
    .update({
      status: "completed",
      completed_sale_id: sale.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.id)
    .eq("partner_id", input.partnerId)
    .eq("status", "draft")

  if (closeDraftError) return { success: false as const, error: closeDraftError.message }

  for (const stockItem of stockItems) {
    await invalidateProductCache(stockItem.product_id, input.partnerId, "update", { silent: true })
  }
  await revalidateOrders(input.partnerId)
  await revalidateTransactions(input.partnerId)
  await revalidateStockMovements(input.partnerId)

  return { success: true as const, data: { saleId: sale.id } }
}
