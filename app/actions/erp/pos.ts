"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { revalidateOrders, revalidateTransactions, revalidateStockMovements } from "@/lib/utils/revalidation"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"

type DraftItemInput = {
  productId?: string | null
  variantId?: string | null
  variantName?: string | null
  name: string
  qty: number
  price: number
  totalPrice?: number
  image?: string | null
  listUnitPrice?: number | null
  lineDiscountType?: "fixed" | "percentage" | null
  lineDiscountValue?: number | null
}

type DraftUpsertInput = {
  partnerId: string
  preSaleId?: string | null
  customerId?: string | null
  notes?: string
  subtotal: number
  discountAmount: number
  totalAmount: number
  shippingFee?: number
  otherCosts?: number
  items: DraftItemInput[]
  couponId?: string | null
  couponCode?: string | null
  couponDiscountAmount?: number
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
    list_unit_price:
      item.listUnitPrice != null && Number.isFinite(Number(item.listUnitPrice))
        ? safeMoney(Number(item.listUnitPrice))
        : null,
    line_discount_type: item.lineDiscountType === "fixed" || item.lineDiscountType === "percentage"
      ? item.lineDiscountType
      : null,
    line_discount_value:
      item.lineDiscountValue != null && Number.isFinite(Number(item.lineDiscountValue))
        ? item.lineDiscountType === "percentage"
          ? Math.max(0, Math.min(100, Math.round(Number(item.lineDiscountValue) * 100) / 100))
          : safeMoney(Number(item.lineDiscountValue))
        : null,
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

/**
 * Mirrors POS `sales` into `orders` so the ERP pedidos list shows PDV checkout.
 * Uses the service-role client: partner RLS often allows only marketplace buyers to INSERT orders.
 */
async function syncPosSaleToOrders(params: {
  partnerId: string
  saleId: string
  preSaleId: string
  financeAccountId?: string | null
  defaultPaymentMethod: string
  actorUserId: string
}): Promise<string | null> {
  const admin = createAdminClient()
  const derivedOrderNumber = `PDV-${String(params.saleId).replace(/-/g, "").slice(0, 8).toUpperCase()}`
  const { data: existingOrder } = await admin
    .from("orders")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("order_number", derivedOrderNumber)
    .limit(1)
    .maybeSingle()

  if (existingOrder?.id) return existingOrder.id

  const [{ data: sale }, { data: saleItems }, { data: draft }] = await Promise.all([
    admin
      .from("sales")
      .select("id, sale_number, customer_id, notes, payment_status, final_amount, paid_amount, discount_amount, created_at")
      .eq("id", params.saleId)
      .eq("partner_id", params.partnerId)
      .single(),
    admin
      .from("sale_items")
      .select("product_id, variant_id, product_name, unit_price, quantity, subtotal")
      .eq("sale_id", params.saleId)
      .eq("partner_id", params.partnerId),
    admin
      .from("pre_sales")
      .select("shipping_fee, other_costs")
      .eq("id", params.preSaleId)
      .eq("partner_id", params.partnerId)
      .maybeSingle(),
  ])

  if (!sale) return null

  let customerName: string | null = null
  if (sale.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("name")
      .eq("id", sale.customer_id)
      .eq("partner_id", params.partnerId)
      .maybeSingle()
    customerName = cust?.name?.trim() || null
  }
  if (!customerName) {
    customerName = "Cliente balcão (PDV)"
  }

  const shippingFee = safeMoney(Number(draft?.shipping_fee || 0))
  const otherCosts = safeMoney(Number(draft?.other_costs || 0))
  const deliveryType = shippingFee > 0 ? "delivery" : "pickup"
  const deliveryStatus = shippingFee > 0 ? "preparing" : "delivered"
  const paymentSituation = sale.payment_status === "paid"
    ? "paid"
    : sale.payment_status === "partially_paid"
      ? "partially_paid"
      : "pending"

  const orderPayload: Record<string, unknown> = {
    partner_id: params.partnerId,
    buyer_id: sale.customer_id || null,
    customer_name: customerName,
    order_source: "Presencial",
    delivery_type: deliveryType,
    delivery_status: deliveryStatus,
    situation: paymentSituation,
    total_amount: safeMoney(Number(sale.final_amount || 0)),
    paid_amount: safeMoney(Number(sale.paid_amount || 0)),
    discount_value: safeMoney(Number(sale.discount_amount || 0)),
    discount_type: "fixed",
    discount_amount: safeMoney(Number(sale.discount_amount || 0)),
    shipping_cost: shippingFee,
    additional_costs: otherCosts,
    notes: sale.notes || null,
    payment_method: inputPaymentMethodLabel(params.defaultPaymentMethod),
    payment_breakdown: [],
    finance_account_id: params.financeAccountId || null,
    created_by: params.actorUserId,
    inventory_deducted: true,
    order_number: derivedOrderNumber,
    order_date: sale.created_at || new Date().toISOString(),
  }

  const insertWithPosFlag = { ...orderPayload, is_pos_sale: true }
  let createdOrderId: string | null = null
  const { data: insertedWithPosFlag, error: insertError } = await admin
    .from("orders")
    .insert(insertWithPosFlag)
    .select("id")
    .single()

  if (insertError) {
    const missingPosFlagColumn = String(insertError.message || "").toLowerCase().includes("is_pos_sale")
    if (!missingPosFlagColumn) {
      console.error("[syncPosSaleToOrders] orders insert failed:", insertError.message, insertError)
      return null
    }

    const { data: insertedWithoutPosFlag, error: insertError2 } = await admin
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single()
    if (insertError2) {
      console.error("[syncPosSaleToOrders] orders insert (no is_pos_sale) failed:", insertError2.message, insertError2)
      return null
    }
    createdOrderId = insertedWithoutPosFlag?.id || null
  } else {
    createdOrderId = insertedWithPosFlag?.id || null
  }

  if (!createdOrderId) return null

  const orderItems = (saleItems || []).map((item: any, index: number) => ({
    order_id: createdOrderId,
    product_id: item.product_id || null,
    variant_id: item.variant_id || null,
    product_name: item.product_name || "Item",
    product_price: safeMoney(Number(item.unit_price || 0)),
    quantity: Number(item.quantity || 0),
    subtotal: safeMoney(Number(item.subtotal || 0)),
    sort_order: index,
  }))

  if (orderItems.length > 0) {
    const { error: itemsErr } = await admin.from("order_items").insert(orderItems)
    if (itemsErr) {
      console.error("[syncPosSaleToOrders] order_items insert failed:", itemsErr.message, itemsErr)
      await admin.from("orders").delete().eq("id", createdOrderId).eq("partner_id", params.partnerId)
      return null
    }
  }

  return createdOrderId
}

function inputPaymentMethodLabel(paymentMethod?: string | null) {
  return String(paymentMethod || "").trim() || "PDV"
}

export async function getPOSInitialDataAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()

  const [productsRes, customersRes, accountsRes, draftsRes, paymentMethodsRes] = await Promise.all([
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
      .select("id, customer_id, subtotal, discount_amount, total_amount, shipping_fee, other_costs, notes, status, items, created_at, updated_at")
      .eq("partner_id", partnerId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("payment_methods")
      .select("id, name, type, is_default, is_active")
      .eq("partner_id", partnerId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name"),
  ])

  if (productsRes.error) return { success: false as const, error: productsRes.error.message }

  return {
    success: true as const,
    data: {
      products: productsRes.data || [],
      customers: customersRes.error ? [] : (customersRes.data || []),
      financeAccounts: accountsRes.error ? [] : (accountsRes.data || []),
      preSales: draftsRes.error ? [] : (draftsRes.data || []),
      paymentMethods: paymentMethodsRes.error ? [] : (paymentMethodsRes.data || []),
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
  const subtotal = subtotalFromItems
  const discountAmount = safeMoney(Math.min(Math.max(0, input.discountAmount), subtotalFromItems))
  const shippingFee = safeMoney(input.shippingFee ?? 0)
  const otherCosts = safeMoney(input.otherCosts ?? 0)
  const totalAmount = safeMoney(subtotalFromItems - discountAmount + shippingFee + otherCosts)

  if (normalizedItems.length === 0) return { success: false as const, error: "Não é possível salvar pré-venda sem itens." }
  if (discountAmount < 0 || totalAmount < 0 || shippingFee < 0 || otherCosts < 0) {
    return { success: false as const, error: "Valores negativos não são permitidos." }
  }

  const payload: Record<string, unknown> = {
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

  payload.shipping_fee = shippingFee
  payload.other_costs = otherCosts
  payload.coupon_id = input.couponId || null
  payload.coupon_code = input.couponCode || null
  payload.coupon_discount_amount = safeMoney(input.couponDiscountAmount ?? 0)

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
 * Finalize a POS pre-sale using an atomic PostgreSQL RPC
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
      payment_method_id: entry.paymentMethodId || null,
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
    return { success: false as const, error: "Falha ao finalizar venda - nenhum ID retornado." }
  }

  const { data: finalizedPreSale } = await supabase
    .from("pre_sales")
    .select("shipping_fee, coupon_id, coupon_code, coupon_discount_amount, customer_id")
    .eq("id", input.preSaleId)
    .eq("partner_id", input.partnerId)
    .limit(1)
    .maybeSingle()

  const hasShipping = Number(finalizedPreSale?.shipping_fee || 0) > 0
  await supabase
    .from("sales")
    .update({ delivery_status: hasShipping ? "preparing" : "delivered" })
    .eq("id", saleId)
    .eq("partner_id", input.partnerId)

  const syncedOrderId = await syncPosSaleToOrders({
    partnerId: input.partnerId,
    saleId,
    preSaleId: input.preSaleId,
    financeAccountId: input.financeAccountId || null,
    defaultPaymentMethod: input.paymentMethod || "PDV",
    actorUserId: user.id,
  })

  // Invalidate caches (non-blocking - sale is already safely committed)
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

  await logAuditEvent({
    partnerId: input.partnerId,
    actorUserId: user.id,
    entityType: "sale",
    entityId: saleId,
    actionType: "created",
    changeLines: [`finalizou venda PDV no valor de R$ ${paidAmount.toFixed(2)}.`],
    source: "manual",
  })

  // ── Record coupon usage if coupon was applied ─────────────────────────
  if (finalizedPreSale?.coupon_id && syncedOrderId) {
    const adminForCoupon = createAdminClient()
    await adminForCoupon.from("coupon_usages").upsert(
      {
        coupon_id: finalizedPreSale.coupon_id,
        customer_id: finalizedPreSale.customer_id || null,
        order_id: syncedOrderId,
      },
      { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
    )
  }

  return { success: true as const, data: { saleId } }
}

export async function createPOSQuickProductAction(input: {
  partnerId: string
  name: string
  price: number
  stockQuantity: number
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const name = String(input.name || "").trim()
  const price = safeMoney(Number(input.price || 0))
  const stockQuantity = Math.max(0, Math.floor(Number(input.stockQuantity || 0)))

  if (!name) return { success: false as const, error: "Informe o nome do produto." }
  if (price < 0) return { success: false as const, error: "Preço inválido." }
  if (stockQuantity < 0) return { success: false as const, error: "Estoque inválido." }

  const supabase = await getSupabaseServerClient()
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("partner_id", input.partnerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!store?.id) {
    return { success: false as const, error: "Nenhuma loja encontrada para cadastrar o produto." }
  }

  const skuBase = generateSKUBase(name)
  const sku = `${skuBase}-${Date.now().toString().slice(-5)}`

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      partner_id: input.partnerId,
      store_id: store.id,
      name,
      sku,
      price,
      stock_quantity: stockQuantity,
      is_active: true,
      allow_sell_without_stock: false,
    })
    .select("id, name, category, sku, price, stock_available, allow_sell_without_stock, images, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
    .single()

  if (error) return { success: false as const, error: error.message }
  return { success: true as const, data: product }
}

export async function createPOSCustomerQuickAction(input: {
  partnerId: string
  name: string
  email?: string
  phone?: string
  cpf?: string
  address?: {
    zipCode?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
  }
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const name = String(input.name || "").trim()
  const email = String(input.email || "").trim().toLowerCase()
  const phone = String(input.phone || "").trim()
  const cpfDigits = String(input.cpf || "").replace(/\D/g, "")

  if (!name) return { success: false as const, error: "Informe o nome do cliente." }

  const supabase = await getSupabaseServerClient()

  if (email) {
    const { data: existingEmail } = await supabase
      .from("customers")
      .select("id")
      .eq("partner_id", input.partnerId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()
    if (existingEmail?.id) {
      return { success: false as const, error: "Já existe cliente com este email." }
    }
  }

  let encryptedCpf: string | null = null
  if (cpfDigits) {
    const { encryptCPF } = await import("@/lib/crypto")
    encryptedCpf = await encryptCPF(cpfDigits)
    const { data: existingCpf } = await supabase
      .from("customers")
      .select("id")
      .eq("partner_id", input.partnerId)
      .eq("cpf", encryptedCpf)
      .limit(1)
      .maybeSingle()
    if (existingCpf?.id) {
      return { success: false as const, error: "Já existe cliente com este CPF." }
    }
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      partner_id: input.partnerId,
      name,
      email: email || null,
      phone: phone || null,
      person_type: "pf",
      cpf: encryptedCpf,
      status: "ativo",
    })
    .select("id, name, email, phone")
    .single()

  if (error) return { success: false as const, error: error.message }

  const address = input.address || {}
  const hasAddress = !!(address.street || address.city || address.zipCode)
  if (hasAddress) {
    await supabase.from("addresses").insert({
      customer_id: customer.id,
      address_type: "primary",
      zip_code: address.zipCode || null,
      street: address.street || null,
      number: address.number || null,
      complement: address.complement || null,
      neighborhood: address.neighborhood || null,
      city: address.city || null,
      state: address.state || null,
      country: "BR",
      is_default: true,
    })
  }

  return {
    success: true as const,
    data: {
      id: customer.id,
      name: customer.name,
      email: customer.email || null,
      phone: customer.phone || null,
      cpf: cpfDigits || null,
      address: hasAddress ? {
        zipCode: address.zipCode || "",
        street: address.street || "",
        number: address.number || "",
        complement: address.complement || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || "",
      } : null,
    },
  }
}

export async function getPOSCustomerDetailsAction(input: {
  partnerId: string
  customerId: string
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const supabase = await getSupabaseServerClient()
  const [{ data: customer, error: customerError }, { data: address }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, cpf")
      .eq("partner_id", input.partnerId)
      .eq("id", input.customerId)
      .single(),
    supabase
      .from("addresses")
      .select("zip_code, street, number, complement, neighborhood, city, state, country")
      .eq("customer_id", input.customerId)
      .eq("address_type", "primary")
      .limit(1)
      .maybeSingle(),
  ])

  if (customerError || !customer) {
    return { success: false as const, error: customerError?.message || "Cliente não encontrado." }
  }

  let plainCpf: string | null = null
  if (customer.cpf) {
    try {
      const { decryptCPF } = await import("@/lib/crypto")
      plainCpf = await decryptCPF(customer.cpf)
    } catch {
      plainCpf = null
    }
  }

  return {
    success: true as const,
    data: {
      id: customer.id,
      name: customer.name,
      email: customer.email || null,
      phone: customer.phone || null,
      cpf: plainCpf,
      address: address ? {
        zipCode: address.zip_code || "",
        street: address.street || "",
        number: address.number || "",
        complement: address.complement || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || "",
        country: address.country || "BR",
      } : null,
    },
  }
}

export async function createPOSCustomerAddressAction(input: {
  partnerId: string
  customerId: string
  address: {
    zipCode?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
  }
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const supabase = await getSupabaseServerClient()

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("partner_id", input.partnerId)
    .eq("id", input.customerId)
    .maybeSingle()

  if (customerError || !customer?.id) {
    return { success: false as const, error: customerError?.message || "Cliente não encontrado." }
  }

  const address = input.address || {}
  const hasAddress = !!(address.street || address.city || address.zipCode)
  if (!hasAddress) {
    return { success: false as const, error: "Informe um endereço válido." }
  }

  const basePayload = {
    customer_id: customer.id,
    address_type: "primary",
    zip_code: address.zipCode || null,
    street: address.street || null,
    number: address.number || null,
    complement: address.complement || null,
    neighborhood: address.neighborhood || null,
    city: address.city || null,
    state: address.state || null,
    country: "BR",
    is_default: true,
  }

  const { data: existingPrimary } = await supabase
    .from("addresses")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("address_type", "primary")
    .limit(1)
    .maybeSingle()

  if (existingPrimary?.id) {
    const { error } = await supabase
      .from("addresses")
      .update(basePayload)
      .eq("id", existingPrimary.id)
      .eq("customer_id", customer.id)

    if (error) return { success: false as const, error: error.message }
  } else {
    const { error } = await supabase.from("addresses").insert(basePayload)
    if (error) return { success: false as const, error: error.message }
  }

  return {
    success: true as const,
    data: {
      address: {
        zipCode: address.zipCode || "",
        street: address.street || "",
        number: address.number || "",
        complement: address.complement || "",
        neighborhood: address.neighborhood || "",
        city: address.city || "",
        state: address.state || "",
        country: "BR",
      },
    },
  }
}

// ============================================================================
// POS COUPON ACTIONS
// ============================================================================

export async function applyCouponToPreSaleAction(input: {
  partnerId: string
  preSaleId: string
  couponCode: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

  const result = await validateCoupon({
    partnerId: input.partnerId,
    code: input.couponCode,
    customerId: input.customerId,
    subtotal: input.subtotal,
    shippingCost: input.shippingCost,
    items: input.items,
  })

  if (!result.valid) {
    return { success: false as const, error: result.errorMessage || "Cupom inválido." }
  }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from("pre_sales")
    .update({
      coupon_id: result.couponId || null,
      coupon_code: result.couponCode || input.couponCode.trim().toUpperCase(),
      coupon_discount_amount: safeMoney(result.discountAmount),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.preSaleId)
    .eq("partner_id", input.partnerId)
    .eq("status", "draft")

  if (error) return { success: false as const, error: error.message }

  return {
    success: true as const,
    data: {
      couponId: result.couponId || null,
      couponCode: result.couponCode || input.couponCode.trim().toUpperCase(),
      discountAmount: result.discountAmount,
      pricingCoupon: result.pricingCoupon || null,
      freeShipping: result.freeShipping || false,
    },
  }
}

export async function removeCouponFromPreSaleAction(input: {
  partnerId: string
  preSaleId: string
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from("pre_sales")
    .update({
      coupon_id: null,
      coupon_code: null,
      coupon_discount_amount: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.preSaleId)
    .eq("partner_id", input.partnerId)
    .eq("status", "draft")

  if (error) return { success: false as const, error: error.message }
  return { success: true as const }
}

export async function findAutomaticCouponForPOSAction(input: {
  partnerId: string
  customerId?: string | null
  subtotal: number
  shippingCost?: number
  items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)

  const result = await findBestAutomaticCoupon({
    partnerId: input.partnerId,
    customerId: input.customerId,
    subtotal: input.subtotal,
    shippingCost: input.shippingCost,
    items: input.items,
  })

  if (!result.valid) {
    return { success: false as const }
  }

  return {
    success: true as const,
    data: {
      couponId: result.couponId || null,
      couponCode: result.couponCode || null,
      discountAmount: result.discountAmount,
      pricingCoupon: result.pricingCoupon || null,
      freeShipping: result.freeShipping || false,
    },
  }
}
