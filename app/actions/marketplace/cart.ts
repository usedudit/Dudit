"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidateCart, revalidateOrders } from "@/lib/utils/revalidation"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { getUserSessionData } from "@/lib/data/user"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { toCanonicalPaymentType, formatPaymentMethodLabel } from "@/lib/payments/payment-method"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { listActivePromotionsInBatch } from "@/app/actions/shared/promotions"
import { cachedListActivePromotionsForMarketplaceAction } from "@/lib/cache/checkout-cache"
import {
  buildFulfillmentPayload,
} from "@/lib/services/marketplace-cart-resolver"
import { cachedResolveCheckoutCartLines } from "@/lib/cache/checkout-cache"
import { fulfillMarketplaceOrder } from "@/lib/services/marketplace-checkout-fulfillment"

export type MarketplaceCheckoutPricingSnapshot = {
  subtotal: number
  couponDiscount: number
  paymentMethodDiscount: number
  paymentMethodInterest: number
  paymentMethodFee: number
  paymentMethodFixedFee?: number
  deliveryFee: number
  finalTotal: number
}

const roundMoney = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const moneyOrZero = (value: unknown) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, roundMoney(n))
}

function normalizeCheckoutPricingSnapshot(input?: Partial<MarketplaceCheckoutPricingSnapshot> | null) {
  if (!input) return null
  const snapshot: MarketplaceCheckoutPricingSnapshot = {
    subtotal: moneyOrZero(input.subtotal),
    couponDiscount: moneyOrZero(input.couponDiscount),
    paymentMethodDiscount: moneyOrZero(input.paymentMethodDiscount),
    paymentMethodInterest: moneyOrZero(input.paymentMethodInterest),
    paymentMethodFee: moneyOrZero(input.paymentMethodFee),
    paymentMethodFixedFee: moneyOrZero(input.paymentMethodFixedFee),
    deliveryFee: moneyOrZero(input.deliveryFee),
    finalTotal: moneyOrZero(input.finalTotal),
  }
  const expected = roundMoney(
    snapshot.subtotal
    + snapshot.deliveryFee
    - snapshot.couponDiscount
    - snapshot.paymentMethodDiscount
    + snapshot.paymentMethodInterest
    + snapshot.paymentMethodFee
    + (snapshot.paymentMethodFixedFee || 0),
  )
  if (Math.abs(expected - snapshot.finalTotal) > 0.01) return null
  return snapshot
}

export async function getCartItemCountAction() {
  try {
    const user = await getCurrentUser()
    if (!user) return 0
    const sessionData = await getUserSessionData(user.id)
    return sessionData.cartCount || 0
  } catch {
    return 0
  }
}

// --- LEITURA DO CARRINHO (sem cache para garantir dados frescos) ---
export async function getCachedCart(userId: string) {
  const supabase = getAdminClient()

  // 1. Busca Itens do Carrinho e Dados Relacionados
  // Endereços são buscados separadamente para não quebrar a query principal
  const { data: cartItems, error } = await supabase
    .from("cart_items")
    .select(`
      id,
      item_type,
      product_id,
      variant_id,
      service_id,
      recurring_plan_id,
      booking_metadata,
      pay_deposit_only,
      partner_id,
      quantity,
      selected,
      created_at,
      products(id, name, price, promotional_price, images, stock_quantity, stock_available, availability_value, availability_unit),
      product_variants(id, variant_name, variant_type, variant_value, price_adjustment, stock_quantity, stock_available, variant_options),
      services(id, name, price, promotional_price, duration_minutes, scheduling_enabled),
      recurring_plans(
        id, name, status,
        recurring_plan_items(unit_price, quantity)
      ),
      partners(
        id, 
        store_name, 
        store_image_url,
        opening_hours,
        user_id, 
        mp_user_id, 
        mp_public_key
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Erro ao buscar sacola:", error)
    return {}
  }

  if (!cartItems || cartItems.length === 0) return {}

  // 2. Busca Métodos de Pagamento, Endereços, Configurações de Entrega e Promoções em Paralelo (Batching)
  const partnerIds = [...new Set(cartItems.map((item: any) => item.partner_id))] as string[]

  let paymentMethods: any[] | null = null
  let partnerAddresses: Record<string, any[]> = {}
  let partnerDeliverySettings: Record<string, any> = {}
  let partnerPromotions: Record<string, any[]> = {}

  try {
    const [pmResult, addrResult, delResult, promosBatch] = await Promise.all([
      supabase
        .from("payment_methods")
        .select("partner_id, payment_type, type, is_active")
        .in("partner_id", partnerIds)
        .eq("is_active", true),
      supabase
        .from("addresses")
        .select("id, partner_id, zip_code, street, number, complement, neighborhood, city, state, is_default")
        .in("partner_id", partnerIds),
      supabase
        .from("delivery_settings")
        .select("partner_id, base_fee, is_delivery_enabled")
        .in("partner_id", partnerIds),
      listActivePromotionsInBatch(partnerIds, userId),
    ])

    paymentMethods = pmResult.data
    partnerPromotions = promosBatch || {}

    if (addrResult.data) {
      partnerAddresses = addrResult.data.reduce((acc: any, addr: any) => {
        const key = addr.partner_id
        if (typeof key === "string" && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
          if (!acc[key]) acc[key] = []
          acc[key].push(addr)
        }
        return acc
      }, {})
    }

    if (delResult.data) {
      partnerDeliverySettings = delResult.data.reduce((acc: any, ds: any) => {
        const key = ds.partner_id
        if (typeof key === "string" && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
          acc[key] = ds
        }
        return acc
      }, {})
    }
  } catch (e) {
    console.error("Erro ao buscar dados complementares dos parceiros em paralelo (com batching):", e)
  }

  // 3. Agrupa os itens por Loja (Parceiro)
  const itemsByPartner = cartItems.reduce((acc: any, item: any) => {
    const partnerId = item.partner_id
    if (typeof partnerId === "string" && partnerId !== "__proto__" && partnerId !== "constructor" && partnerId !== "prototype") {
      if (!acc[partnerId]) {
        const partner = item.partners ? { ...item.partners } : null
        // Anexa endereços ao parceiro
        if (partner) {
          partner.addresses = partnerAddresses[partnerId] || []
        }
        acc[partnerId] = {
          partner,
          items: [],
          products: [],
          services: [],
          subscriptions: [],
          paymentMethods: Array.from(
            new Set(
              (paymentMethods || [])
                .filter((pm: any) => pm.partner_id === partnerId)
                .map((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type))
            )
          ),
          deliverySettings: partnerDeliverySettings[partnerId] || null,
          promotions: partnerPromotions[partnerId] || [],
        }
      }
      acc[partnerId].items.push(item)
      const type = item.item_type || "product"
      if (type === "product") acc[partnerId].products.push(item)
      else if (type === "service_booking") acc[partnerId].services.push(item)
      else if (type === "subscription") acc[partnerId].subscriptions.push(item)
    }
    return acc
  }, {})

  // 4. Busca variantes alternativas para itens com variante esgotada
  const outOfStockVariantProductIds: string[] = []
  const outOfStockVariantIds: string[] = []

  for (const partnerId of Object.keys(itemsByPartner)) {
    for (const item of (itemsByPartner as any)[partnerId].items) {
      if (item.variant_id && item.product_variants) {
        const stock = item.product_variants.stock_available ?? item.product_variants.stock_quantity ?? 0
        if (stock <= 0) {
          outOfStockVariantProductIds.push(item.product_id)
          outOfStockVariantIds.push(item.variant_id)
        }
      }
    }
  }

  if (outOfStockVariantProductIds.length > 0) {
    const uniqueProductIds = [...new Set(outOfStockVariantProductIds)]
    const { data: alternativeVariants } = await supabase
      .from("product_variants")
      .select("id, product_id, variant_name, variant_type, price_adjustment, stock_available, stock_quantity, variant_options, is_active")
      .in("product_id", uniqueProductIds)
      .eq("is_active", true)

    if (alternativeVariants) {
      const availableAlts = alternativeVariants.filter(
        (v: any) => (v.stock_available ?? v.stock_quantity ?? 0) > 0
      )

      for (const partnerId of Object.keys(itemsByPartner)) {
        for (const item of (itemsByPartner as any)[partnerId].items) {
          if (item.variant_id && outOfStockVariantIds.includes(item.variant_id)) {
            item.available_alternatives = availableAlts
              .filter((v: any) => v.product_id === item.product_id && v.id !== item.variant_id)
          }
        }
      }
    }
  }

  return itemsByPartner
}

// --- ACTIONS DE ESCRITA (Adicionar/Remover/Checkout) ---

export async function addToCartAction(productId: string, quantity = 1, csrf_token?: string, variantId?: string) {
  // 1. Otimização Primeira Fase: Paralelizar carregamentos estáticos e Auth
  const [{ requireCSRF }] = await Promise.all([
    import("@/lib/security/csrf-action-wrapper"),
    requireRateLimit(RateLimitCategory.CART)
  ])

  // A validação do CSRF precisa da promessa resolvida, mas podemos paralelizar a busca do usuário
  // e do cliente supabase que são chamadas de rede/db independentes.
  const [csrfValidation, supabase, user] = await Promise.all([
    requireCSRF(csrf_token),
    getSupabaseServerClient(),
    requireUser()
  ])

  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const adminClient = getAdminClient()

  // 2. Otimização Segunda Fase: Leituras no DB Paralelizadas
  // 2.A - Contagem para o limite LOW-04
  const cartCountPromise = supabase
    .from("cart_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)

  // 2.B - Verifica item existente usando a chave fornecida
  let existingQuery = supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("product_id", productId)

  if (variantId) {
    existingQuery = existingQuery.eq("variant_id", variantId)
  } else {
    existingQuery = existingQuery.is("variant_id", null)
  }
  const existingItemPromise = existingQuery.maybeSingle()

  // 2.C - Busca detalhes de quem é o dono do produto/variante
  let productPromise
  if (variantId) {
    productPromise = adminClient
      .from("product_variants")
      .select("id, product_id, products(partner_id, partners(user_id))")
      .eq("id", variantId)
      .single()
  } else {
    productPromise = adminClient
      .from("products")
      .select("partner_id, partners(user_id)")
      .eq("id", productId)
      .single()
  }

  const [
    { count: currentCartCount },
    { data: initialExistingItem },
    productResult
  ] = await Promise.all([
    cartCountPromise,
    existingItemPromise,
    productPromise
  ])

  // Verificações que dependem do resultado em paralelo
  if (currentCartCount && currentCartCount >= 50) {
    return { error: "O limite de itens na sua sacola foi atingido. Remova alguns itens para adicionar mais." }
  }

  const { data: entity, error: entityError } = productResult

  if (entityError || !entity) {
    return { error: variantId ? "Variante não encontrada" : "Produto não encontrado" }
  }

  let partnerId: string
  let partnerUserId: string | null = null
  let resolvedProductId = productId

  if (variantId) {
    resolvedProductId = entity.product_id
    const parentProduct = entity.products as any
    partnerId = parentProduct.partner_id
    partnerUserId = parentProduct.partners?.user_id
  } else {
    partnerId = entity.partner_id
    // @ts-ignore
    partnerUserId = entity.partners?.user_id
  }

  // 3. Segurança: Bloqueia compra da própria loja
  if (partnerUserId === user.id) {
    return { error: "Você não pode comprar produtos da sua própria loja" }
  }

  // Segurança: Membros da equipe não podem comprar
  if (partnerId) {
    const { data: teamMembership } = await supabase
      .from("partner_users")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (teamMembership) {
      return { error: "Você não pode comprar produtos de uma loja da qual faz parte da equipe" }
    }
  }

  // 4. Executa Inserção ou Atualização
  let existingItem = initialExistingItem

  // Condição Rara (Anti-Falsificação): Se o Front enviou um productId forjado e desatualizado comparado a variante real.
  // Pesquisamos novamente pelo verdadeiro dono pra não criar um item clonado fantasma.
  if (variantId && resolvedProductId !== productId) {
    const { data: retryExisting } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("product_id", resolvedProductId)
      .eq("variant_id", variantId)
      .maybeSingle()
    existingItem = retryExisting
  }

  let error
  if (existingItem) {
    const { error: e } = await supabase
      .from("cart_items")
      .update({
        quantity: existingItem.quantity + quantity,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingItem.id)
    error = e
  } else {
    const { error: e } = await supabase
      .from("cart_items")
      .insert({
        user_id: user.id,
        partner_id: partnerId,
        item_type: "product",
        product_id: resolvedProductId,
        variant_id: variantId || null,
        quantity,
        selected: true,
      })
    error = e
  }

  if (error) return { error: error.message }

  // REVALIDAÇÃO IMPORTANTE: Limpa o cache para o usuário ver o novo item
  await revalidateCart(user.id)

  return { success: true }
}

export async function updateCartQuantityAction(cartItemId: string, quantity: number, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.CART)
  // Validação CSRF
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) {
    return { error: "Quantidade inválida" }
  }

  // Verifica dono do item
  const { data: item } = await supabase
    .from("cart_items")
    .select("user_id")
    .eq("id", cartItemId)
    .single()

  if (!item || item.user_id !== user.id) return { error: "Sem permissão" }

  let error
  if (quantity <= 0) {
    const { error: e } = await supabase.from("cart_items").delete().eq("id", cartItemId)
    error = e
  } else {
    const { error: e } = await supabase
      .from("cart_items")
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq("id", cartItemId)
    error = e
  }

  if (error) return { error: error.message }

  await revalidateCart(user.id)
  return { success: true }
}

export async function removeFromCartAction(cartItemId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const { error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", cartItemId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  await revalidateCart(user.id)
  return { success: true }
}

export async function toggleCartSelectionAction(cartItemId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.CART)

  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const { data: item } = await supabase
    .from("cart_items")
    .select("selected, user_id")
    .eq("id", cartItemId)
    .single()

  if (!item || item.user_id !== user.id) return { error: "Sem permissão" }

  const { error } = await supabase
    .from("cart_items")
    .update({ selected: !item.selected })
    .eq("id", cartItemId)

  if (error) return { error: error.message }

  await revalidateCart(user.id)
  return { success: true }
} export async function toggleCartPartnerSelectionAction(partnerId: string, selected: boolean, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.CART)

  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const { error } = await supabase
    .from("cart_items")
    .update({ selected })
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }

  await revalidateCart(user.id)
  return { success: true }
}

export async function switchCartItemVariantAction(cartItemId: string, newVariantId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.CART)

  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  // Find the current cart item to get the product_id and quantity
  const { data: currentItem, error: fetchError } = await supabase
    .from("cart_items")
    .select("product_id, quantity")
    .eq("id", cartItemId)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !currentItem) {
    return { error: "Item não encontrado na sacola." }
  }

  // Check if an item with the new variant already exists in the cart
  const { data: existingItem } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("product_id", currentItem.product_id)
    .eq("variant_id", newVariantId)
    .maybeSingle()

  if (existingItem) {
    // If it already exists, merge/update quantity of the existing one and delete the old one
    const newQty = existingItem.quantity + currentItem.quantity

    // We should also check the stock limit for the new variant
    const { data: variantData } = await supabase
      .from("product_variants")
      .select("stock_available, stock_quantity")
      .eq("id", newVariantId)
      .single()

    const stock = variantData ? (variantData.stock_available ?? variantData.stock_quantity ?? 999) : 999
    const finalQty = Math.min(newQty, stock)

    const { error: updateError } = await supabase
      .from("cart_items")
      .update({ quantity: finalQty, selected: true, updated_at: new Date().toISOString() })
      .eq("id", existingItem.id)

    if (updateError) return { error: updateError.message }

    const { error: deleteError } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", cartItemId)

    if (deleteError) return { error: deleteError.message }
  } else {
    // Just update the variant ID on the current item
    // Verify stock of new variant
    const { data: variantData } = await supabase
      .from("product_variants")
      .select("stock_available, stock_quantity")
      .eq("id", newVariantId)
      .single()

    const stock = variantData ? (variantData.stock_available ?? variantData.stock_quantity ?? 999) : 999
    const finalQty = Math.min(currentItem.quantity, stock)

    const { error: updateError } = await supabase
      .from("cart_items")
      .update({ variant_id: newVariantId, quantity: finalQty, selected: true, updated_at: new Date().toISOString() })
      .eq("id", cartItemId)

    if (updateError) return { error: updateError.message }
  }

  await revalidateCart(user.id)
  return { success: true }
}

export async function checkoutCartAction(
  partnerItems: {
    cartItemId: string
    productId: string
    variantId?: string
    quantity: number
    fulfillmentMode?: string
  }[],
  deliveryType: "delivery" | "pickup",
  deliveryAddress: string,
  paymentMethod: string,
  installments = 1,
  notes?: string,
  couponCode?: string | null,
  useMercadoPago?: boolean,
  csrf_token?: string,
  wantsChange?: boolean,
  payWithAmount?: number,
  payDepositOnly?: boolean,
  checkoutPricingSnapshot?: MarketplaceCheckoutPricingSnapshot | null,
  isPickupPayment?: boolean,
) {
  await requireRateLimit(RateLimitCategory.ORDER_CREATE)

  // Validação CSRF
  // SECURITY: CSRF validation is mandatory - cannot be skipped
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const adminClient = getAdminClient()

  if (!partnerItems || partnerItems.length === 0) {
    return { error: "Por favor, selecione pelo menos um item para finalizar o pedido" }
  }

  const cartItemIds = partnerItems.map((item: any) => item.cartItemId).filter(Boolean)

  await adminClient
    .from("cart_items")
    .update({ pay_deposit_only: Boolean(payDepositOnly), updated_at: new Date().toISOString() })
    .in("id", cartItemIds)
    .eq("user_id", user.id)
    .eq("item_type", "service_booking")

  const defaultProductMode = deliveryType === "delivery" ? "delivery" : "pickup"
  const fulfillmentUpdates = new Map<string, string[]>()
  for (const item of partnerItems) {
    if (!item.cartItemId) continue
    const mode = item.fulfillmentMode || defaultProductMode
    fulfillmentUpdates.set(mode, [...(fulfillmentUpdates.get(mode) || []), item.cartItemId])
  }
  await Promise.all(
    [...fulfillmentUpdates.entries()].map(([mode, ids]) =>
      adminClient
        .from("cart_items")
        .update({ fulfillment_mode: mode, updated_at: new Date().toISOString() })
        .in("id", ids)
        .eq("user_id", user.id),
    ),
  )

  const resolved = await cachedResolveCheckoutCartLines(adminClient, user.id, cartItemIds)
  if (!resolved.success) return { error: resolved.error }

  const { lines: resolvedLines, partnerId, hasProducts, hasDeliveryLines } = resolved

  // Resolve customer_id for promotion tracking (must exist in customers table)
  let customerIdForPromo: string | null = null
  { const { data: existingCust } = await adminClient.from("customers").select("id").eq("marketplace_user_id", user.id).eq("partner_id", partnerId).maybeSingle(); if (existingCust) customerIdForPromo = existingCust.id }

  const lineContexts = (
    await import("@/lib/commerce/marketplace-checkout-lines")
  ).buildCheckoutLineContextsFromResolved(resolvedLines)
  const requirements = (
    await import("@/lib/commerce/checkout-requirements")
  ).aggregateCheckoutRequirements(lineContexts)

  if (requirements.showCustomerAddressSection && !deliveryAddress?.trim()) {
    return { error: "Informe o endereço para continuar." }
  }

  let totalAmount = resolvedLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const orderItems = resolvedLines.map((line) => line.orderItemRow)
  const pricingItems = resolvedLines.map((line) => line.pricingItem)
  const couponItems = resolvedLines.map((line) => ({
    productId: line.productId,
    serviceId: line.serviceId,
    recurringPlanId: line.recurringPlanId,
  }))

  const fulfillmentPayload = buildFulfillmentPayload(
    user.id,
    partnerId,
    resolvedLines,
    deliveryAddress,
  )
  const orderDelivery = fulfillmentPayload.deliveryType || deliveryType

  const productIds = resolvedLines
    .filter((l) => l.productId)
    .map((l) => l.productId as string)

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentMethod)

  // 1. Parallel independent reads block
  const [
    limitCheck,
    buyerProfileResult,
    productsResult,
    partnerResult,
    deliveryQuote,
    promotionsData,
    methodResult,
  ] = await Promise.all([
    checkLimit(partnerId, "monthly_orders"),
    supabase
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .single(),
    productIds.length
      ? adminClient.from("products").select("*").in("id", productIds)
      : Promise.resolve({ data: [] as any[] }),
    adminClient
      .from("partners")
      .select("opening_hours")
      .eq("id", partnerId)
      .maybeSingle(),
    hasDeliveryLines && deliveryAddress
      ? quoteDeliveryFeeAction({
        partnerId,
        destinationAddress: deliveryAddress,
        freeDeliveryCoupon: false,
        orderSubtotal: totalAmount,
      })
      : Promise.resolve({ success: true, fee: 0, distanceKm: null, breakdown: null }),
    cachedListActivePromotionsForMarketplaceAction(partnerId, user.id),
    (isUuid && !useMercadoPago)
      ? supabase
        .from("payment_methods")
        .select("*, payment_method_installment_fees(installment_number, fee_percent)")
        .eq("id", paymentMethod)
        .single()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (!limitCheck.allowed) {
    return { error: limitCheck.message || "A loja atingiu o limite mensal de pedidos." }
  }

  const buyerProfile = buyerProfileResult.data
  const products = productsResult.data
  const partner = partnerResult.data

  let deliveryFee = 0
  let distanceKm: number | null = null
  let deliveryBreakdown: Record<string, unknown> | null = null
  if (hasDeliveryLines && deliveryAddress) {
    if (!deliveryQuote.success) return { error: (deliveryQuote as any).error }
    deliveryFee = Number(deliveryQuote.fee || 0)
    distanceKm = Number(deliveryQuote.distanceKm || 0)
    deliveryBreakdown = deliveryQuote.breakdown
  }

  let couponIdToSave: string | null = null
  let couponDiscountAmount = 0
  let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null

  if (couponCode?.trim()) {
    const couponResult = await validateCoupon({
      partnerId,
      code: couponCode,
      customerId: customerIdForPromo,
      subtotal: totalAmount,
      shippingCost: deliveryFee,
      items: couponItems,
    }, adminClient)

    if (couponResult.valid) {
      couponIdToSave = couponResult.couponId || null
      couponDiscountAmount = couponResult.discountAmount
      couponPricingData = couponResult.pricingCoupon || null
    }
  } else {
    const autoResult = await findBestAutomaticCoupon({
      partnerId,
      customerId: customerIdForPromo,
      subtotal: totalAmount,
      shippingCost: deliveryFee,
      items: couponItems,
    }, adminClient)

    if (autoResult.valid) {
      couponIdToSave = autoResult.couponId || null
      couponDiscountAmount = autoResult.discountAmount
      couponPricingData = autoResult.pricingCoupon || null
    }
  }

  // Adjust delivery fee if the chosen coupon is free shipping
  const isFreeShippingCoupon = Boolean(couponPricingData?.freeShipping || couponPricingData?.discountType === "free_shipping")
  if (hasDeliveryLines && isFreeShippingCoupon) {
    deliveryFee = 0
    if (deliveryBreakdown) {
      deliveryBreakdown = { ...deliveryBreakdown, freeShippingApplied: true }
    }
  }
  // ── Resolve payment method first (before engine call) ──
  let bestMethod: any = methodResult.data
  const chosenType = toCanonicalPaymentType(bestMethod?.type || bestMethod?.payment_type || paymentMethod)

  const { validateMarketplaceCheckoutPayment } = await import(
    "@/lib/commerce/validate-marketplace-checkout-payment"
  )
  const paymentValidation = validateMarketplaceCheckoutPayment({
    requirements,
    paymentOption: useMercadoPago ? "mercadopago" : "traditional",
    paymentMethodType: useMercadoPago ? null : chosenType,
    productDeliveryType: deliveryType,
    useMercadoPago,
  })
  if (!paymentValidation.valid) return { error: paymentValidation.error }

  if (!bestMethod && !useMercadoPago) {
    bestMethod = await pickBestPaymentMethod(supabase as any, chosenType, partnerId, { preferDefault: true })
  }

  if (!bestMethod && !useMercadoPago) {
    return { error: "Nenhum método de pagamento ativo foi encontrado para o tipo selecionado." }
  }

  // Build payment method config for the unified engine
  let pmtConfig: import("@/lib/services/pricing-engine").PricingInput["paymentMethod"] = null
  if (bestMethod?.id) {
    let fees = bestMethod.payment_method_installment_fees || null
    if (!fees) {
      const { data: feesData } = await supabase
        .from("payment_method_installment_fees")
        .select("installment_number, fee_percent")
        .eq("payment_method_id", bestMethod.id)
      fees = feesData || []
    }
    pmtConfig = {
      discountPercent: Number(bestMethod.discount_percent || 0),
      feePercent: Number(bestMethod.fee_percent || bestMethod.percentage_rate || 0),
      feeFixed: Number(bestMethod.fee_fixed || bestMethod.fixed_amount || 0),
      feeBearer: (bestMethod.fee_bearer || "merchant") as "merchant" | "customer",
      maxInstallments: Number(bestMethod.max_installments || 1),
      installmentNumber: Math.max(1, Number(installments || 1)),
      installmentFees: (fees || []).map((row: any) => ({
        installmentNumber: Number(row.installment_number || 1),
        feePercent: Number(row.fee_percent || 0),
      })),
    }
  }

  // ── Single engine call with payment method ──
  const pricingResult = calculateOrderPricing({
    items: pricingItems,
    shippingCost: deliveryFee,
    coupon: couponPricingData,
    promotions: promotionsData,
    paymentMethod: pmtConfig,
  })

  totalAmount = pricingResult.finalAmountWithPayment
  couponDiscountAmount = pricingResult.couponDiscountAmount
  const paymentMethodDiscountAmount = pricingResult.paymentMethodDiscountAmount
  const paymentMethodExtraAmount = pricingResult.paymentMethodInterestAmount + pricingResult.paymentMethodFeeAmount

  // Handle gift items insertion
  const giftProductIds = pricingResult.appliedGiftProductIds || []
  if (giftProductIds.length > 0) {
    const { buildGiftOrderItems } = await import("@/app/actions/shared/promotions")
    const giftOrderItems = await buildGiftOrderItems(adminClient, giftProductIds, promotionsData)
    orderItems.push(...giftOrderItems)
  }


  // Snapshot structure for promotions_applied field in orders
  const promotionsAppliedSnapshot = (pricingResult.appliedPromotionIds || []).map(id => {
    const p = promotionsData.find(promo => promo.id === id)
    return {
      id,
      name: p?.name || "Promoção",
      type: p?.promotionType,
      discount_amount: p?.promotionType === "discount" || p?.promotionType === "buy_x_pay_y" ? pricingResult.promotionDiscountAmount : 0,
    }
  })

  const normalizedSnapshot = normalizeCheckoutPricingSnapshot(checkoutPricingSnapshot)
  if (checkoutPricingSnapshot && !normalizedSnapshot) {
    return { error: "Os valores do checkout não conferem. Atualize a página e tente novamente." }
  }

  // When deposit is active, the client snapshot may have been computed before the deposit
  // choice was confirmed. Always use server-calculated values in this case.
  const useServerValues = Boolean(payDepositOnly)
  const persistedSubtotal = useServerValues ? pricingResult.subtotal : (normalizedSnapshot?.subtotal ?? pricingResult.subtotal)
  const persistedDeliveryFee = useServerValues ? deliveryFee : (normalizedSnapshot?.deliveryFee ?? deliveryFee)
  const persistedCouponDiscount = useServerValues ? couponDiscountAmount : (normalizedSnapshot?.couponDiscount ?? couponDiscountAmount)
  const persistedPaymentMethodDiscount = useServerValues ? paymentMethodDiscountAmount : (normalizedSnapshot?.paymentMethodDiscount ?? paymentMethodDiscountAmount)
  const persistedPaymentMethodExtra = paymentMethodExtraAmount
  const persistedTotal = useServerValues ? totalAmount : (normalizedSnapshot?.finalTotal ?? totalAmount)
  const persistedCheckoutPricing = (useServerValues ? null : normalizedSnapshot) || {
    subtotal: persistedSubtotal,
    couponDiscount: persistedCouponDiscount,
    paymentMethodDiscount: persistedPaymentMethodDiscount,
    paymentMethodInterest: pricingResult.paymentMethodInterestAmount || 0,
    paymentMethodFee: pricingResult.paymentMethodFeeAmount || 0,
    paymentMethodFixedFee: pricingResult.paymentMethodFixedFeeAmount || 0,
    deliveryFee: persistedDeliveryFee,
    finalTotal: persistedTotal,
  }

  if (normalizedSnapshot && !useServerValues) {
    console.info("[CHECKOUT_PRICING_AUDIT]", {
      source: "checkoutCartAction",
      checkout: normalizedSnapshot,
      serverRecalculated: {
        subtotal: pricingResult.subtotal,
        couponDiscount: couponDiscountAmount,
        paymentMethodDiscount: pricingResult.paymentMethodDiscountAmount,
        paymentMethodExtra: pricingResult.paymentMethodInterestAmount + pricingResult.paymentMethodFeeAmount,
        deliveryFee,
        finalTotal: pricingResult.finalAmountWithPayment,
      },
    })
  }

  if (chosenType === "cash" && deliveryType === "delivery") {
    if (wantsChange === undefined || wantsChange === null) {
      return { error: "Por favor, informe se precisa de troco para o pagamento em dinheiro." }
    }
    if (wantsChange && (payWithAmount === undefined || payWithAmount === null || payWithAmount < persistedTotal)) {
      return { error: "O valor informado para o troco é menor que o total do pedido." }
    }
  }

  const financeAccountId = (bestMethod as any)?.default_finance_account_id || await resolveMarketplaceOrderFinanceAccountId(
    adminClient,
    partnerId,
    Boolean(useMercadoPago),
  )

  if (!financeAccountId) {
    return {
      error: useMercadoPago
        ? "Esta loja não possui conta Mercado Pago cadastrada no financeiro. Configure em Financeiro > Contas."
        : "Esta loja não possui conta bancária ou caixa ativa para registrar o pedido. Configure em Financeiro > Contas.",
    }
  }

  const orderPreparation = hasProducts
    ? computeOrderPreparationEstimate({
      products: products || [],
      openingHours: (partner as any)?.opening_hours || null,
      pickupWindowMinutes: 30,
      deliveryTimeEstimateMinutes: 0,
    })
    : null

  const preparationPayload = orderPreparation ? {
    preparation_time_minutes: orderPreparation.preparationTimeMinutes,
    estimated_ready_at: orderPreparation.readyAt.toISOString(),
    pickup_window_start: orderPreparation.pickupWindowStart.toISOString(),
    pickup_window_end: orderPreparation.pickupWindowEnd.toISOString(),
    estimated_delivery_at: orderDelivery === "delivery" ? orderPreparation.estimatedDeliveryAt.toISOString() : null,
  } : {}

  let paymentMethodName = paymentMethod
  if (bestMethod?.name) {
    paymentMethodName = bestMethod.name
  } else {
    paymentMethodName = formatPaymentMethodLabel(paymentMethod)
  }

  if (chosenType === "cash" && deliveryType === "delivery") {
    if (wantsChange) {
      paymentMethodName = `Dinheiro (Troco para R$ ${payWithAmount?.toFixed(2).replace('.', ',')})`
    } else {
      paymentMethodName = "Dinheiro (Valor exato)"
    }
  }

  // Ensure customer exists/is updated for this partner
  let resolvedCustomerId: string | null = null
  try {
    const { ensureMarketplaceCustomer } = await import("@/lib/services/marketplace-customer")
    resolvedCustomerId = await ensureMarketplaceCustomer({
      partnerId,
      name: buyerProfile?.full_name || user.email?.split("@")[0] || "Cliente",
      email: user.email,
      phone: buyerProfile?.phone || null,
      cpf: null,
      userId: user.id,
    })
  } catch (e) {
    console.error("Error ensuring marketplace customer in checkoutCartAction:", e)
  }

  // Fetch delivery_payer setting for snapshot
  const { data: deliverySettings } = await getAdminClient()
    .from("delivery_settings")
    .select("delivery_payer")
    .eq("partner_id", partnerId)
    .maybeSingle()

  const deliveryPayer: "customer" | "seller" = deliverySettings?.delivery_payer === "seller" ? "seller" : "customer"

  // For marketplace orders (customer-initiated), seller_commission_amount is 0
  const sellerCommissionAmount = 0

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      buyer_id: user.id,
      customer_id: resolvedCustomerId,
      customer_name: buyerProfile?.full_name || null,
      partner_id: partnerId,
      total_amount: persistedTotal,
      delivery_fee: persistedDeliveryFee,
      distance_km: distanceKm,
      delivery_breakdown: deliveryBreakdown,
      delivery_type: orderDelivery,
      delivery_address: hasDeliveryLines ? deliveryAddress : deliveryAddress || null,
      payment_method: useMercadoPago ? "Mercado Pago" : paymentMethodName,
      delivery_payer: deliveryPayer,
      seller_commission_amount: sellerCommissionAmount,
      payment_breakdown: useMercadoPago
        ? []
        : [{
          method: chosenType,
          amount: persistedTotal,
          paymentMethodId: bestMethod.id,
          installmentNumber: Math.max(1, Number(installments || 1)),
          checkoutPricing: persistedCheckoutPricing,
          feeBearer: pmtConfig?.feeBearer || "merchant",
          interestAmount: pricingResult.paymentMethodInterestAmount || 0,
          feeAmount: pricingResult.paymentMethodFeeAmount || 0,
          fixedFeeAmount: pricingResult.paymentMethodFixedFeeAmount || 0,
          effectiveAmount: persistedTotal,
          netAmount: pmtConfig?.feeBearer === "merchant"
            ? Math.max(0, persistedTotal - (pricingResult.paymentMethodInterestAmount || 0) - (pricingResult.paymentMethodFeeAmount || 0) - (pricingResult.paymentMethodFixedFeeAmount || 0))
            : persistedTotal,
          ...(payDepositOnly ? (() => {
            const serviceDepositTotal = resolvedLines
              .filter((l) => l.itemType === "service_booking" && l.payDepositOnly && l.depositAmount != null)
              .reduce((sum, l) => sum + Number(l.depositAmount || 0) * l.quantity, 0)
            const fullServiceTotal = resolvedLines
              .filter((l) => l.itemType === "service_booking")
              .reduce((sum, l) => sum + Number(l.fullPrice || l.unitPrice) * l.quantity, 0)
            return {
              isDeposit: true,
              depositPercent: Math.round((serviceDepositTotal / (fullServiceTotal || 1)) * 100),
              depositAmount: serviceDepositTotal,
              fullOrderTotal: resolvedLines.reduce((sum, l) => sum + Number(l.fullPrice || l.unitPrice) * l.quantity, 0) + deliveryFee,
              remainingAfterDeposit: Math.max(0, fullServiceTotal - serviceDepositTotal),
            }
          })() : {}),
          ...(chosenType === "cash" && deliveryType === "delivery" ? {
            wantsChange,
            payWithAmount: wantsChange ? payWithAmount : null,
            changeAmount: wantsChange ? Number((payWithAmount! - persistedTotal).toFixed(2)) : 0
          } : {})
        }],
      payment_provider: useMercadoPago ? "Mercado Pago" : null,
      situation: paymentMethodName === "Assinatura (Créditos)" ? "paid" : (isPickupPayment && orderDelivery === "pickup" ? "awaiting_pickup_payment" : "pending"),
      notes,
      finance_account_id: financeAccountId,
      coupon_id: couponIdToSave,
      discount_amount: persistedCouponDiscount,
      payment_method_discount_amount: persistedPaymentMethodDiscount,
      payment_method_extra_amount: persistedPaymentMethodExtra,
      promotions_applied: promotionsAppliedSnapshot,
      checkout_fulfillment: fulfillmentPayload,
      order_source: "Vitrine Online",
      pricing_version: pricingResult.pricingVersion,
      ...preparationPayload,
    })
    .select()
    .single()

  if (orderError || !order) return { error: orderError?.message || "Erro ao criar pedido" }

  // Set payment expiration
  {
    const { computePaymentExpiresAt, computePickupPaymentExpiresAt } = await import("@/lib/services/order-expiration")
    const expiresAt = isPickupPayment
      ? computePickupPaymentExpiresAt()
      : computePaymentExpiresAt(paymentMethodName)
    await supabase
      .from("orders")
      .update({ payment_expires_at: expiresAt.toISOString() })
      .eq("id", order.id)
  }

  // Increment usage counter
  increment_usage_counter(partnerId, "orders_month_count").catch(console.error)

  const itemsToInsert = orderItems.map((item: any) => ({
    ...item,
    order_id: order.id,
    is_promotional: item.is_promotional ?? false,
    promotion_id: item.promotion_id ?? null,
    is_gift: item.is_gift ?? false,
    original_price: item.original_price ?? null,
  }))

  const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)

  if (itemsError) {
    console.error("[CHECKOUT] Erro ao inserir order_items:", {
      orderId: order.id,
      errorMessage: itemsError.message,
      errorCode: itemsError.code,
      errorDetails: itemsError.details,
      errorHint: itemsError.hint,
      itemCount: itemsToInsert.length,
      itemKeys: itemsToInsert.map((item: any) => Object.keys(item)),
      items: itemsToInsert.map((item: any) => ({
        product_id: item.product_id,
        service_id: item.service_id,
        product_name: item.product_name,
        product_price: item.product_price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        line_type: item.line_type,
        fulfillment_mode: item.fulfillment_mode,
        is_gift: item.is_gift,
        is_promotional: item.is_promotional,
        promotion_id: item.promotion_id,
        original_price: item.original_price,
      })),
    })
    await supabase.from("orders").delete().eq("id", order.id)
    return { error: `Erro ao adicionar itens ao pedido: ${itemsError.message}${itemsError.details ? ` (${itemsError.details})` : ""}${itemsError.hint ? ` - ${itemsError.hint}` : ""}` }
  }

  // ATOMIC STOCK DECREMENT (MED-04) - Paralelizado para performance
  if (false) await Promise.all(
    partnerItems.map(async (item) => {
      const { error: stockError } = await adminClient.rpc("decrement_stock_atomic", {
        p_product_id: item.productId,
        p_quantity: item.quantity,
        p_variant_id: item.variantId || null
      })

      if (stockError) {
        console.error("[CART-STOCK] Erro ao decrementar estoque:", stockError)
        // O pedido já foi criado neste ponto, registramos o erro no log
        // para monitoramento pois transações JS multi-tabela não são ACID seguras no Supabase sem RPC.'
      }
    })
  )

  const reserveItems = [
    ...resolvedLines
      .filter((line) => line.requiresStock && line.stockProductId)
      .map((line) => ({
        product_id: line.stockProductId!,
        variant_id: line.stockVariantId || null,
        quantity: line.quantity,
      })),
    ...orderItems
      .filter((item: any) => item.is_promotional && item.product_id)
      .map((item: any) => ({
        product_id: item.product_id,
        variant_id: null,
        quantity: 1,
      })),
  ]

  const reserveResult = await reserveOrderInventory({
    client: adminClient,
    partnerId,
    orderId: order.id,
    items: reserveItems,
  })

  if ("error" in reserveResult) {
    await supabase.from("order_items").delete().eq("order_id", order.id)
    await supabase.from("orders").delete().eq("id", order.id)
    return { error: reserveResult.error }
  }

  // SECURITY FIX (MED-02): Scope cart deletion to current user
  await supabase.from("cart_items").delete().in("id", cartItemIds).eq("user_id", user.id)

  const hasServiceLines = resolvedLines.some((l) => l.itemType === "service_booking")
  if (!useMercadoPago && (String(order.situation).toLowerCase() === "paid" || hasServiceLines)) {
    await fulfillMarketplaceOrder(adminClient, order.id, { force: true })
  }

  if (couponIdToSave) {
    await adminClient.from("coupon_usages").upsert(
      {
        coupon_id: couponIdToSave,
        customer_id: customerIdForPromo || resolvedCustomerId,
        order_id: order.id,
      },
      { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
    )
  }

  if (pricingResult.appliedPromotionIds && pricingResult.appliedPromotionIds.length > 0) {
    await adminClient.from("promotion_usages").insert(
      pricingResult.appliedPromotionIds.map(promoId => ({
        promotion_id: promoId,
        customer_id: customerIdForPromo,
        order_id: order.id,
      }))
    )
  }

  // Limpa Cache
  if (productIds.length > 0) {
    await Promise.all(
      [...new Set(productIds)].map(productId =>
        invalidateProductCache(productId, partnerId, "update", { silent: true })
      )
    )
  }
  await revalidateCart(user.id)
  await revalidateOrders(partnerId)

  import("@/lib/services/notification-automation.service")
    .then(({ onOrderStatusChanged }) =>
      onOrderStatusChanged(
        {
          ...order,
          partner_id: partnerId,
          buyer_id: user.id,
          customer_name: order.customer_name || user.email,
        },
        "pending",
      ),
    )
    .catch(console.error)

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    useMercadoPago,
    couponApplied: Boolean(couponIdToSave),
    couponDiscount: persistedCouponDiscount,
    finalTotal: persistedTotal,
  }
}

export async function updateCartItemFulfillmentModeAction(cartItemId: string, mode: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  // Verify ownership
  const { data: item } = await supabase
    .from("cart_items")
    .select("user_id")
    .eq("id", cartItemId)
    .single()

  if (!item || item.user_id !== user.id) return { error: "Sem permissão" }

  const { error } = await supabase
    .from("cart_items")
    .update({ fulfillment_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", cartItemId)

  if (error) return { error: error.message }

  await revalidateCart(user.id)
  return { success: true }
}

export async function deleteCartItemsAction(cartItemIds: string[]) {
  const user = await requireUser()
  if (!user) return { error: "Não autenticado" }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .in("id", cartItemIds)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  await revalidateCart(user.id)
  return { success: true }
}

