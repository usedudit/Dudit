"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidateCart, revalidateOrders } from "@/lib/utils/revalidation"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { getAdminClient } from "@/lib/supabase/admin"
import { getUserSessionData } from "@/lib/data/user"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { isPartnerWhatsappFlow } from "@/lib/partner-order-flow"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { resolveDeliverySettingsRow } from "@/app/actions/shared/delivery"
import { toCanonicalPaymentType, formatPaymentMethodLabel } from "@/lib/payments/payment-method"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import {
  quoteCarrierFreightFee,
  extractPostalCodeFromAddress,
} from "@/lib/services/shipping/carrier-checkout"
import { listActivePromotionsInBatch } from "@/app/actions/shared/promotions"
import { cachedListActivePromotionsForMarketplaceAction } from "@/lib/cache/checkout-cache"
import {
  buildFulfillmentPayload,
} from "@/lib/services/marketplace-cart-resolver"
import { resolveCheckoutCartLinesFresh } from "@/lib/cache/checkout-cache"
import { fulfillMarketplaceOrder } from "@/lib/services/marketplace-checkout-fulfillment"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { isStoreOpen } from "@/lib/utils/opening-hours"

export type MarketplaceCartPageData = {
  itemsByPartner: Record<string, any>
  cartCount: number
  userProfile: {
    full_name: string | null
    address: string | null
    avatar_url: string | null
  } | null
  userAddresses: any[]
}

export type MarketplaceCheckoutPricingSnapshot = {
  subtotal: number
  couponDiscount: number
  paymentMethodDiscount: number
  paymentMethodInterest: number
  paymentMethodFee: number
  paymentMethodFixedFee?: number
  deliveryFee: number
  finalTotal: number
  /** Selected carrier freight service (SuperFrete) when own delivery has no coverage */
  carrierServiceId?: number | null
  destinationPostalCode?: string | null
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
    carrierServiceId: typeof input.carrierServiceId === "number" && Number.isFinite(input.carrierServiceId) ? Number(input.carrierServiceId) : null,
    destinationPostalCode: typeof input.destinationPostalCode === "string" ? input.destinationPostalCode : null,
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
export async function getCachedCart(userId: string): Promise<MarketplaceCartPageData> {
  const supabase = getAdminClient()

  // Dados usados pela página e pelo cabeçalho são carregados no mesmo request.
  // Isso evita uma segunda hidratação do perfil/carrinho no cliente.
  const [cartResult, profileResult, addressesResult] = await Promise.all([
    supabase
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
      store_id,
      quantity,
      selected,
      created_at,
      products(id, name, price, promotional_price, images, stock_quantity, stock_available, availability_value, availability_unit, allow_sell_without_stock, is_active, short_id),
      product_variants(id, variant_name, variant_type, variant_value, price_adjustment, stock_quantity, stock_available, variant_options, is_active),
      services(id, name, price, promotional_price, duration_minutes, is_active, short_id),
      recurring_plans(
        id, name, status, short_id,
        recurring_plan_items(unit_price, quantity)
      ),
      partners(
        id,
        user_id,
        mp_user_id,
        mp_public_key,
        is_showcase_active
      )
    `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_profiles")
      .select("full_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  const { data: cartItems, error } = cartResult
  const userAddresses = addressesResult.data || []
  const defaultAddress = userAddresses.find((address: any) => address.is_default) || userAddresses[0]
  const pageData = {
    cartCount: (cartItems || []).reduce((sum: number, item: any) => sum + (item.quantity || 1), 0),
    userProfile: profileResult.data
      ? {
          full_name: profileResult.data.full_name || null,
          address: defaultAddress?.city && defaultAddress?.state
            ? `${defaultAddress.city} - ${defaultAddress.state}`
            : null,
          avatar_url: profileResult.data.avatar_url || null,
        }
      : null,
    userAddresses,
  }

  if (error) {
    console.error("Erro ao buscar sacola:", error)
    return { ...pageData, itemsByPartner: {} }
  }

  if (!cartItems || cartItems.length === 0) return { ...pageData, itemsByPartner: {} }

  // 2. Busca Métodos de Pagamento, Endereços, Configurações de Entrega, Promoções e Lojas em Paralelo (Batching)
  const partnerIds = [...new Set(cartItems.map((item: any) => item.partner_id))] as string[]
  const storeIds = [...new Set(cartItems.map((item: any) => item.store_id).filter(Boolean))] as string[]

  let paymentMethods: any[] | null = null
  let partnerAddresses: Record<string, any[]> = {}
  let partnerDeliverySettings: Record<string, any> = {}
  let partnerPromotions: Record<string, any[]> = {}
  let storesMap: Record<string, any> = {}
  let partnerStoresMap: Record<string, any> = {}

  try {
    const [pmResult, addrResult, delResult, promosBatch, storesResult, partnerStoresResult] = await Promise.all([
      supabase
        .from("payment_methods")
        .select("partner_id, store_id, payment_type, type, is_active")
        .in("partner_id", partnerIds)
        .eq("is_active", true),
      supabase
        .from("addresses")
        .select("id, partner_id, zip_code, street, number, complement, neighborhood, city, state, is_default")
        .in("partner_id", partnerIds),
      supabase
        .from("delivery_settings")
        .select("id, partner_id, store_id, base_fee, is_delivery_enabled, is_pickup_enabled, included_km, extra_km_price, max_delivery_km, free_delivery_threshold, delivery_payer")
        .in("partner_id", partnerIds),
      listActivePromotionsInBatch(partnerIds, userId),
      storeIds.length > 0
        ? supabase
          .from("stores")
          .select("id, partner_id, name, slug, short_id, logo_url, opening_hours, phone, description, is_showcase_active, addresses!store_id!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
          .in("id", storeIds)
        : Promise.resolve({ data: [] as any[] }),
      partnerIds.length > 0
        ? supabase
          .from("stores")
          .select("id, partner_id, is_showcase_active, accept_orders_when_closed, opening_hours, timezone")
          .in("partner_id", partnerIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    paymentMethods = pmResult.data
    partnerPromotions = promosBatch || {}

    if (storesResult.data) {
      storesMap = storesResult.data.reduce((acc: any, s: any) => {
        if (s?.id) acc[s.id] = s
        return acc
      }, {})
    }

    if (partnerStoresResult?.data) {
      partnerStoresMap = partnerStoresResult.data.reduce((acc: any, s: any) => {
        if (s?.partner_id && !acc[s.partner_id]) acc[s.partner_id] = s
        return acc
      }, {})
    }

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
        const key = ds.store_id || ds.partner_id
        if (typeof key === "string" && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
          acc[key] = ds
        }
        return acc
      }, {})
    }
  } catch (e) {
    console.error("Erro ao buscar dados complementares dos parceiros em paralelo (com batching):", e)
  }

  // 3. Agrupa os itens por Loja (store_id com fallback para partner_id)
  const itemsByPartner = cartItems.reduce((acc: any, item: any) => {
    const partnerId = item.partner_id
    if (typeof partnerId !== "string" || partnerId === "__proto__" || partnerId === "constructor" || partnerId === "prototype") return acc
    const storeId = item.store_id || null
    const storeKey = item.store_id || partnerId
    const store = storeId ? storesMap[storeId] || null : null

    if (!acc[storeKey]) {
      const partner = item.partners ? { ...item.partners } : null
      if (partner) {
        partner.addresses = partnerAddresses[partnerId] || []
      }

      const rawPm = paymentMethods || []
      const storePms = storeId ? rawPm.filter((pm: any) => pm.store_id === storeId) : []
      const effectivePms = storePms.length > 0 ? storePms : rawPm.filter((pm: any) => pm.partner_id === partnerId)
      const partnerStore = partnerStoresMap[partnerId] || null
      const isShowcaseActive = store?.is_showcase_active !== undefined
        ? store.is_showcase_active
        : (partnerStore?.is_showcase_active !== undefined
          ? partnerStore.is_showcase_active
          : (partner?.is_showcase_active ?? true))
      const acceptOrdersWhenClosed = store?.accept_orders_when_closed !== undefined
        ? store.accept_orders_when_closed
        : (partnerStore?.accept_orders_when_closed !== undefined
          ? partnerStore.accept_orders_when_closed
          : true)
      const openingHours = store?.opening_hours || partnerStore?.opening_hours || partner?.opening_hours || null
      const timezone = store?.timezone || partnerStore?.timezone || partner?.timezone || "America/Sao_Paulo"
      const isStoreCurrentlyOpen = isStoreOpen(openingHours, new Date(), timezone)
      const isAcceptingOrders = isShowcaseActive && (acceptOrdersWhenClosed || isStoreCurrentlyOpen)

      acc[storeKey] = {
        storeId,
        partnerId,
        partner,
        store,
        isShowcaseActive,
        acceptOrdersWhenClosed,
        openingHours,
        timezone,
        isStoreOpen: isStoreCurrentlyOpen,
        isAcceptingOrders,
        items: [],
        products: [],
        services: [],
        subscriptions: [],
        paymentMethods: Array.from(
          new Set(
            effectivePms.map((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type))
          )
        ),
        deliverySettings: (storeId && partnerDeliverySettings[storeId]) || partnerDeliverySettings[partnerId] || null,
        promotions: partnerPromotions[partnerId] || [],
      }
    }
    acc[storeKey].items.push(item)
    const type = item.item_type || "product"
    if (type === "product") acc[storeKey].products.push(item)
    else if (type === "service_booking") acc[storeKey].services.push(item)
    else if (type === "subscription") acc[storeKey].subscriptions.push(item)
    return acc
  }, {})

  // 4. Busca variantes alternativas para itens com variante esgotada
  const outOfStockVariantProductIds: string[] = []
  const outOfStockVariantIds: string[] = []

  for (const storeKey of Object.keys(itemsByPartner)) {
    for (const item of (itemsByPartner as any)[storeKey].items) {
      if (item.variant_id && item.product_variants) {
        const allowSell = Boolean(item.products?.allow_sell_without_stock)
        const stock = item.product_variants.stock_available ?? item.product_variants.stock_quantity ?? 0
        const isActive = item.product_variants.is_active !== false && item.products?.is_active !== false
        if (!allowSell && (stock <= 0 || !isActive)) {
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

      for (const storeKey of Object.keys(itemsByPartner)) {
        for (const item of (itemsByPartner as any)[storeKey].items) {
          if (item.variant_id && outOfStockVariantIds.includes(item.variant_id)) {
            item.available_alternatives = availableAlts
              .filter((v: any) => v.product_id === item.product_id && v.id !== item.variant_id)
          }
        }
      }
    }
  }

  return { ...pageData, itemsByPartner }
}

// --- ACTIONS DE ESCRITA (Adicionar/Remover/Checkout) ---

export async function addToCartAction(
  productId: string,
  quantity = 1,
  csrf_token?: string,
  variantId?: string,
  storeId?: string,
  selectedAddons?: Array<{
    groupId: string
    groupName: string
    optionId: string
    optionName: string
    price: number
  }>
) {
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
    .select("id, quantity, booking_metadata")
    .eq("user_id", user.id)
    .eq("product_id", productId)

  if (variantId) {
    existingQuery = existingQuery.eq("variant_id", variantId)
  } else {
    existingQuery = existingQuery.is("variant_id", null)
  }
  const existingItemPromise = existingQuery.maybeSingle()

  // 2.C - Busca detalhes de quem é o dono do produto/variante e estoque
  let productPromise
  if (variantId) {
    let query = adminClient
      .from("product_variants")
      .select("id, product_id, stock_available, stock_quantity, is_active, products!inner(partner_id, store_id, allow_sell_without_stock, is_active, partners!inner(user_id))")
      .eq("id", variantId)
    productPromise = query.maybeSingle()
  } else {
    let query = adminClient
      .from("products")
      .select("partner_id, store_id, stock_available, stock_quantity, allow_sell_without_stock, is_active, partners!inner(user_id)")
      .eq("id", productId)
    productPromise = query.maybeSingle()
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
    if (parentProduct.store_id && storeId && parentProduct.store_id !== storeId) {
      return { error: "Este produto não está disponível nesta filial." }
    }
  } else {
    partnerId = entity.partner_id
    if (entity.store_id && storeId && entity.store_id !== storeId) {
      return { error: "Este produto não está disponível nesta filial." }
    }
  }

  // 3. Segurança: Bloqueia compra da própria loja ou de loja da qual faz parte da equipe
  const { assertCanBuyFromStore } = await import("@/app/actions/marketplace/cart-extensions")
  const canBuyGuard = await assertCanBuyFromStore(user.id, partnerId, storeId)
  if (canBuyGuard.error) {
    return { error: canBuyGuard.error }
  }

  // 3.0. Validação de Vitrine Ativa
  const effectiveStoreId = storeId || (variantId ? (entity.products as any)?.store_id : entity.store_id)
  const { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } = await import("@/lib/commerce/store-showcase")
  const acceptance = await canStoreAcceptOrders(adminClient, { storeId: effectiveStoreId, partnerId })
  if (!acceptance.allowed) {
    return { error: acceptance.message || INACTIVE_SHOWCASE_ERROR }
  }

  // 3.1. Validação de Estoque e Status Ativo
  const parentProd = variantId ? (entity.products as any) : entity
  const isItemActive = variantId
    ? entity.is_active !== false && parentProd?.is_active !== false
    : entity.is_active !== false

  if (!isItemActive) {
    return { error: "Este produto está temporariamente indisponível." }
  }

  const allowSellWithoutStock = Boolean(parentProd?.allow_sell_without_stock)
  if (!allowSellWithoutStock) {
    const availableStock = Math.max(
      0,
      variantId
        ? (entity.stock_available ?? entity.stock_quantity ?? 0)
        : (entity.stock_available ?? entity.stock_quantity ?? 0)
    )

    if (availableStock <= 0) {
      return { error: "Este produto está esgotado no momento." }
    }

    const currentQtyInCart = initialExistingItem ? Number(initialExistingItem.quantity || 0) : 0
    const desiredTotalQty = currentQtyInCart + quantity

    if (desiredTotalQty > availableStock) {
      const remainingAllowed = Math.max(0, availableStock - currentQtyInCart)
      if (remainingAllowed <= 0) {
        return { error: `Você já possui o limite máximo disponível (${availableStock} un.) deste produto na sacola.` }
      }
      return { error: `Estoque insuficiente. Você só pode adicionar mais ${remainingAllowed} unidade(s) (Estoque total: ${availableStock}).` }
    }
  }

  // 4. Executa Inserção ou Atualização
  let existingItem = initialExistingItem

  // Condição Rara (Anti-Falsificação): Se o Front enviou um productId forjado e desatualizado comparado a variante real.
  // Pesquisamos novamente pelo verdadeiro dono pra não criar um item clonado fantasma.
  if (variantId && resolvedProductId !== productId) {
    const { data: retryExisting } = await supabase
      .from("cart_items")
      .select("id, quantity, booking_metadata")
      .eq("user_id", user.id)
      .eq("product_id", resolvedProductId)
      .eq("variant_id", variantId)
      .maybeSingle()
    existingItem = retryExisting
  }

  const bookingMetadataPayload = selectedAddons && selectedAddons.length > 0
    ? { selectedAddons }
    : null

  let error
  if (existingItem) {
    const { error: e } = await supabase
      .from("cart_items")
      .update({
        quantity: existingItem.quantity + quantity,
        booking_metadata: bookingMetadataPayload || (existingItem as any).booking_metadata || null,
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
        store_id: storeId || null,
        item_type: "product",
        product_id: resolvedProductId,
        variant_id: variantId || null,
        quantity,
        selected: true,
        booking_metadata: bookingMetadataPayload,
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

  // Verifica dono do item e detalhes de produto/estoque
  const { data: item } = await supabase
    .from("cart_items")
    .select(`
      id, user_id, item_type, product_id, variant_id,
      products(id, stock_available, stock_quantity, allow_sell_without_stock, is_active),
      product_variants(id, stock_available, stock_quantity, is_active)
    `)
    .eq("id", cartItemId)
    .single()

  if (!item || item.user_id !== user.id) return { error: "Sem permissão" }

  if (quantity > 0 && (item.item_type || "product") === "product") {
    const prod = item.products as any
    const variant = item.product_variants as any
    const isVariant = Boolean(item.variant_id && variant)

    const isItemActive = isVariant
      ? variant.is_active !== false && prod?.is_active !== false
      : prod?.is_active !== false

    if (!isItemActive) {
      return { error: "Este produto está temporariamente indisponível." }
    }

    const allowSell = Boolean(prod?.allow_sell_without_stock)
    if (!allowSell) {
      const availableStock = Math.max(
        0,
        isVariant
          ? (variant.stock_available ?? variant.stock_quantity ?? 0)
          : (prod?.stock_available ?? prod?.stock_quantity ?? 0)
      )

      if (availableStock <= 0) {
        return { error: "Este produto está esgotado no momento." }
      }

      if (quantity > availableStock) {
        return { error: `Quantidade solicitada excede o estoque disponível (${availableStock} un.).` }
      }
    }
  }

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
      .select("stock_available, stock_quantity, is_active, products!inner(allow_sell_without_stock, is_active)")
      .eq("id", newVariantId)
      .single()

    const allowSellWithoutStock = Boolean((variantData?.products as any)?.allow_sell_without_stock)
    const isVariantActive = variantData?.is_active !== false && (variantData?.products as any)?.is_active !== false

    if (!isVariantActive) {
      return { error: "Variante selecionada está temporariamente indisponível." }
    }

    const stock = allowSellWithoutStock
      ? 999
      : Math.max(0, variantData ? (variantData.stock_available ?? variantData.stock_quantity ?? 0) : 0)

    if (stock <= 0) {
      return { error: "Variante selecionada está esgotada." }
    }

    const finalQty = Math.max(1, Math.min(newQty, stock))

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
      .select("stock_available, stock_quantity, is_active, products!inner(allow_sell_without_stock, is_active)")
      .eq("id", newVariantId)
      .single()

    const allowSellWithoutStock = Boolean((variantData?.products as any)?.allow_sell_without_stock)
    const isVariantActive = variantData?.is_active !== false && (variantData?.products as any)?.is_active !== false

    if (!isVariantActive) {
      return { error: "Variante selecionada está temporariamente indisponível." }
    }

    const stock = allowSellWithoutStock
      ? 999
      : Math.max(0, variantData ? (variantData.stock_available ?? variantData.stock_quantity ?? 0) : 0)

    if (stock <= 0) {
      return { error: "Variante selecionada está esgotada." }
    }

    const finalQty = Math.max(1, Math.min(currentItem.quantity, stock))

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
  storeId?: string,
  useStoreCredit?: boolean,
) {
  if (paymentMethod === "mercadopago" || paymentMethod === "mp") {
    useMercadoPago = true
  }

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

  // Checkout can be reached again after a stale click/re-render. Avoid
  // touching rows whose checkout flags already have the requested value;
  // besides reducing write traffic, this prevents needless updated_at churn.
  await adminClient
    .from("cart_items")
    .update({ pay_deposit_only: Boolean(payDepositOnly), updated_at: new Date().toISOString() })
    .in("id", cartItemIds)
    .eq("user_id", user.id)
    .eq("item_type", "service_booking")
    .or(`pay_deposit_only.is.null,pay_deposit_only.neq.${Boolean(payDepositOnly)}`)

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
        .eq("user_id", user.id)
        .or(`fulfillment_mode.is.null,fulfillment_mode.neq.${mode}`),
    ),
  )

  const resolved = await resolveCheckoutCartLinesFresh(adminClient, user.id, cartItemIds)
  if (!resolved.success) return { error: resolved.error }

  const { lines: resolvedLines, partnerId, hasProducts, hasDeliveryLines } = resolved

  const { canStoreAcceptOrders, INACTIVE_SHOWCASE_ERROR } = await import("@/lib/commerce/store-showcase")
  const checkoutStoreId = storeId || resolvedLines.find((l: any) => l.storeId)?.storeId || null
  const acceptance = await canStoreAcceptOrders(adminClient, { storeId: checkoutStoreId, partnerId })
  if (!acceptance.allowed) {
    return { error: acceptance.message || INACTIVE_SHOWCASE_ERROR }
  }
  const capabilities = await getPartnerCapabilities(partnerId, { storeId })
  addMonitoringBreadcrumb({
    domain: "checkout",
    message: "started",
    metadata: { partnerId, storeId, itemCount: resolvedLines.length, paymentProvider: useMercadoPago ? "mercadopago" : "other" },
  })

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
    deliveryType,
  )
  const orderDelivery = deliveryType || fulfillmentPayload.deliveryType

  const productIds = resolvedLines
    .filter((l) => l.productId)
    .map((l) => l.productId as string)

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentMethod)

  let targetStoreId = storeId || resolvedLines.find((l) => l.storeId)?.storeId || null
  if (!targetStoreId) {
    const { data: defaultStore } = await adminClient
      .from("stores")
      .select("id")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (defaultStore?.id) {
      targetStoreId = defaultStore.id
    }
  }

  const shouldQuoteDelivery = (hasDeliveryLines || (hasProducts && orderDelivery === "delivery")) && Boolean(deliveryAddress) && orderDelivery === "delivery"

  // 1. Parallel independent reads block
  const [
    limitCheck,
    buyerProfileResult,
    productsResult,
    partnerResult,
    deliveryQuote,
    promotionsData,
    methodResult,
    isWhatsappFlow,
  ] = await Promise.all([
    checkLimit(partnerId, "monthly_orders"),
    supabase
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .single(),
    productIds.length
      ? (targetStoreId
          ? adminClient.from("products").select("*").in("id", productIds).eq("store_id", targetStoreId)
          : adminClient.from("products").select("*").in("id", productIds))
      : Promise.resolve({ data: [] as any[] }),
    adminClient
      .from("stores")
      .select("opening_hours, is_showcase_active")
      .eq("partner_id", partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle(),
    shouldQuoteDelivery
      ? quoteDeliveryFeeAction({
        partnerId,
        storeId: targetStoreId,
        destinationAddress: deliveryAddress,
        freeDeliveryCoupon: false,
        orderSubtotal: totalAmount,
      })
      : Promise.resolve({ success: true, fee: 0, distanceKm: null, breakdown: null }),
    cachedListActivePromotionsForMarketplaceAction(partnerId, user.id),
    (isUuid && !useMercadoPago)
      ? adminClient
        .from("payment_methods")
        .select("*, payment_method_installment_fees(installment_number, fee_percent)")
        .eq("id", paymentMethod)
        .eq("partner_id", partnerId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isPartnerWhatsappFlow(partnerId),
  ])

  if (!limitCheck.allowed && !isWhatsappFlow) {
    return { error: limitCheck.message || "A loja atingiu o limite mensal de pedidos.", whatsappFallback: true }
  }

  const buyerProfile = buyerProfileResult.data
  const products = productsResult.data
  const partner = partnerResult.data

  if (partner && partner.is_showcase_active === false) {
    return { error: "Esta loja está com a vitrine inativa e não pode receber pedidos no momento." }
  }

  let deliveryFee = 0
  let distanceKm: number | null = null
  let deliveryBreakdown: Record<string, unknown> | null = null
  let carrierApplied = false
  if (shouldQuoteDelivery) {
    if (!deliveryQuote.success) {
      const carrierServiceId = checkoutPricingSnapshot?.carrierServiceId ?? null
      if (!carrierServiceId) return { error: (deliveryQuote as any).error }
      // Own delivery has no coverage → fallback to carrier freight (SuperFrete)
      const cep =
        String(checkoutPricingSnapshot?.destinationPostalCode || "").replace(/\D/g, "") ||
        extractPostalCodeFromAddress(deliveryAddress)
      const carrier = await quoteCarrierFreightFee(adminClient, {
        partnerId,
        toPostalCode: cep,
        serviceId: carrierServiceId,
      })
      if (!carrier.success) return { error: carrier.error }
      deliveryFee = carrier.fee
      distanceKm = null
      deliveryBreakdown = carrier.breakdown
      carrierApplied = true
    } else {
      deliveryFee = Number(deliveryQuote.fee || 0)
      distanceKm = Number(deliveryQuote.distanceKm || 0)
      deliveryBreakdown = deliveryQuote.breakdown
    }
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
  if ((hasDeliveryLines || carrierApplied) && isFreeShippingCoupon) {
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
    bestMethod = await pickBestPaymentMethod(adminClient as any, chosenType, partnerId, { preferDefault: true, storeId })
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
      installmentFeeBearer: (bestMethod.installment_fee_bearer || "merchant") as "merchant" | "customer",
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

  // Zero out delivery fee when free shipping comes from a campaign promotion
  // (coupon-driven free shipping is already handled above)
   if (pricingResult.freeShippingApplied && !isFreeShippingCoupon) {
     deliveryFee = 0
     if (deliveryBreakdown) {
       deliveryBreakdown = { ...deliveryBreakdown, freeShippingApplied: true }
     }
   }

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

  let financeAccountId: string | null = null
  if (capabilities.hasFinancial) {
    financeAccountId = (bestMethod as any)?.default_finance_account_id || await resolveMarketplaceOrderFinanceAccountId(
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

  const fallbackCustomerName = buyerProfile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || (user.email ? user.email.split("@")[0] : null) || user.email || "Cliente"
  let resolvedCustomerId: string | null = null
  try {
    const { ensureMarketplaceCustomer } = await import("@/lib/services/marketplace-customer")
    resolvedCustomerId = await ensureMarketplaceCustomer({
      partnerId,
      name: fallbackCustomerName,
      email: user.email,
      phone: buyerProfile?.phone || null,
      cpf: null,
      userId: user.id,
    })
  } catch (e) {
    captureError(e, {
      module: "checkout",
      action: "ensure_marketplace_customer",
      userId: user.id,
      partnerId,
      storeId: targetStoreId,
    })
    console.error("Error ensuring marketplace customer in checkoutCartAction:", e)
  }

  // Fetch delivery_payer setting for snapshot (store-aware)
  const deliveryRow = await resolveDeliverySettingsRow(getAdminClient(), partnerId, targetStoreId)
  const fallbackDeliveryPayer: "customer" | "seller" = deliveryRow?.delivery_payer === "seller" ? "seller" : "customer"
  const effectiveDeliveryPayer: "customer" | "seller" = (deliveryBreakdown?.deliveryPayer as "seller" | "customer") || fallbackDeliveryPayer
  if (targetStoreId && deliveryRow?.store_id === targetStoreId) {
    console.log(`[delivery_payer] Marketplace checkout using store override: store=${targetStoreId}, partner=${partnerId}, payer=${effectiveDeliveryPayer}`)
  }

  // For marketplace orders (customer-initiated), seller_commission_amount is 0
  const sellerCommissionAmount = 0

  let appliedStoreCredit = 0
  if (useStoreCredit) {
    let creditQuery = adminClient
      .from("store_credits")
      .select("remaining_amount")
      .eq("partner_id", partnerId)
      .eq("status", "ACTIVE")
      .gt("remaining_amount", 0)

    if (resolvedCustomerId) {
      creditQuery = creditQuery.or(`customer_id.eq.${resolvedCustomerId},customer_user_id.eq.${user.id}`)
    } else {
      creditQuery = creditQuery.eq("customer_user_id", user.id)
    }

    const { data: creditRows } = await creditQuery
    const availableCredit = (creditRows || []).reduce((sum: number, c: any) => sum + Number(c.remaining_amount || 0), 0)
    appliedStoreCredit = Math.min(availableCredit, persistedTotal)
  }

  const remainingBalanceToPay = Math.max(0, Number((persistedTotal - appliedStoreCredit).toFixed(2)))
  const isFullyPaidWithStoreCredit = appliedStoreCredit > 0 && remainingBalanceToPay <= 0.009

  const finalPaymentBreakdown: any[] = []
  if (appliedStoreCredit > 0) {
    finalPaymentBreakdown.push({
      method: "store_credit",
      amount: appliedStoreCredit,
      effectiveAmount: appliedStoreCredit,
      netAmount: appliedStoreCredit,
    })
  }

  if (remainingBalanceToPay > 0 && !useMercadoPago && bestMethod) {
    finalPaymentBreakdown.push({
      method: chosenType,
      amount: remainingBalanceToPay,
      paymentMethodId: bestMethod.id,
      installmentNumber: Math.max(1, Number(installments || 1)),
      checkoutPricing: persistedCheckoutPricing,
      feeBearer: pmtConfig?.feeBearer || "merchant",
      interestAmount: pricingResult.paymentMethodInterestAmount || 0,
      feeAmount: pricingResult.paymentMethodFeeAmount || 0,
      fixedFeeAmount: pricingResult.paymentMethodFixedFeeAmount || 0,
      effectiveAmount: remainingBalanceToPay,
      netAmount: pmtConfig?.feeBearer === "merchant"
        ? Math.max(0, remainingBalanceToPay - (pricingResult.paymentMethodInterestAmount || 0) - (pricingResult.paymentMethodFeeAmount || 0) - (pricingResult.paymentMethodFixedFeeAmount || 0))
        : remainingBalanceToPay,
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
        changeAmount: wantsChange ? Number((payWithAmount! - remainingBalanceToPay).toFixed(2)) : 0
      } : {})
    })
  }

  let finalPaymentMethodLabel = useMercadoPago ? "Mercado Pago" : paymentMethodName
  if (isFullyPaidWithStoreCredit) {
    finalPaymentMethodLabel = "Vale-compra"
  } else if (appliedStoreCredit > 0) {
    finalPaymentMethodLabel = `Vale-compra (R$ ${appliedStoreCredit.toFixed(2).replace('.', ',')}) + ${finalPaymentMethodLabel}`
  }

  let finalSituation = paymentMethodName === "Assinatura (Créditos)" ? "paid" : (isPickupPayment && orderDelivery === "pickup" ? "awaiting_pickup_payment" : "pending")
  if (isFullyPaidWithStoreCredit) {
    finalSituation = "paid"
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      buyer_id: user.id,
      customer_id: resolvedCustomerId,
      customer_name: fallbackCustomerName,
      partner_id: partnerId,
      store_id: targetStoreId,
      total_amount: persistedTotal,
      delivery_fee: persistedDeliveryFee,
      distance_km: distanceKm,
      delivery_breakdown: deliveryBreakdown,
      delivery_type: orderDelivery,
      delivery_address: hasDeliveryLines ? deliveryAddress : deliveryAddress || null,
      payment_method: finalPaymentMethodLabel,
      delivery_payer: effectiveDeliveryPayer,
      seller_commission_amount: sellerCommissionAmount,
      payment_breakdown: finalPaymentBreakdown,
      payment_provider: isFullyPaidWithStoreCredit ? null : (useMercadoPago ? "Mercado Pago" : null),
      situation: finalSituation,
      notes: sanitizeNotes(notes),
      finance_account_id: financeAccountId,
      coupon_id: couponIdToSave,
      discount_amount: persistedCouponDiscount,
      payment_method_discount_amount: persistedPaymentMethodDiscount,
      payment_method_extra_amount: persistedPaymentMethodExtra,
      store_credit_amount: appliedStoreCredit,
      promotions_applied: promotionsAppliedSnapshot,
      checkout_fulfillment: fulfillmentPayload,
      order_source: "Vitrine Online",
      pricing_version: pricingResult.pricingVersion,
      ...preparationPayload,
    })
    .select()
    .single()

  if (orderError || !order) {
    captureError(orderError || new Error("Pedido não retornado após insert"), {
      module: "checkout",
      action: "create_order",
      userId: user.id,
      partnerId,
      storeId: targetStoreId,
      errorCode: orderError?.code,
      metadata: { paymentProvider: useMercadoPago ? "mercadopago" : "other" },
    })
    return { error: "Não foi possível criar o pedido. Tente novamente." }
  }

  if (appliedStoreCredit > 0 && resolvedCustomerId) {
    const { applyStoreCreditDeduction } = await import("@/app/actions/erp/orders")
    await applyStoreCreditDeduction(adminClient, {
      partnerId,
      customerId: resolvedCustomerId,
      amount: appliedStoreCredit,
    })
  }

  // Set payment expiration - ONLY for Mercado Pago payments.
  // Manual payments (Dinheiro, PIX sem integração MP, etc) should not be auto-cancelled
  // by the cron job since they are handled by the seller at the point of sale.
  if (useMercadoPago && !isFullyPaidWithStoreCredit) {
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
  if (!isWhatsappFlow) {
    increment_usage_counter(partnerId, "orders_month_count").catch(console.error)
  }

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
    captureError(itemsError, {
      module: "checkout",
      action: "insert_order_items",
      userId: user.id,
      partnerId,
      storeId: targetStoreId,
      entityId: order.id,
      errorCode: itemsError.code,
      metadata: { itemCount: itemsToInsert.length },
    })
    await supabase.from("orders").delete().eq("id", order.id)
    return { error: "Não foi possível adicionar os itens ao pedido. Tente novamente." }
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

  if (capabilities.hasStockMovements) {
    const reserveResult = await reserveOrderInventory({
      client: adminClient,
      partnerId,
      orderId: order.id,
      items: reserveItems,
    })

    if ("error" in reserveResult) {
      captureError(new Error(reserveResult.error), {
        module: "stock",
        action: "reserve_order_inventory",
        userId: user.id,
        partnerId,
        storeId: targetStoreId,
        entityId: order.id,
        metadata: { itemCount: reserveItems.length },
      })
      await supabase.from("order_items").delete().eq("order_id", order.id)
      await supabase.from("orders").delete().eq("id", order.id)
      return { error: reserveResult.error }
    }
  }

  // SECURITY FIX (MED-02): Scope cart deletion to current user
  await supabase.from("cart_items").delete().in("id", cartItemIds).eq("user_id", user.id)

  const hasServiceLines = resolvedLines.some((l) => l.itemType === "service_booking")
  if (!useMercadoPago && (String(order.situation).toLowerCase() === "paid" || hasServiceLines)) {
    await fulfillMarketplaceOrder(adminClient, order.id, { force: true })
  }

  if (capabilities.hasCoupons && couponIdToSave) {
    await adminClient.from("coupon_usages").upsert(
      {
        coupon_id: couponIdToSave,
        customer_id: customerIdForPromo || resolvedCustomerId,
        order_id: order.id,
      },
      { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
    )
  }

  if (capabilities.hasCampaigns && pricingResult.appliedPromotionIds && pricingResult.appliedPromotionIds.length > 0) {
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

export async function bulkUpdateFulfillmentModesAction(
  changes: Array<{ cartItemId: string; mode: string }>,
  csrf_token?: string
) {
  await requireRateLimit(RateLimitCategory.CART)
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) return { error: csrfValidation.error }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const cartItemIds = changes.map((c) => c.cartItemId)
  const { data: items } = await supabase
    .from("cart_items")
    .select("id, user_id")
    .in("id", cartItemIds)

  if (!items || items.length !== cartItemIds.length || items.some((i) => i.user_id !== user.id)) {
    return { error: "Sem permissão" }
  }

  const now = new Date().toISOString()
  for (const change of changes) {
    const { error } = await supabase
      .from("cart_items")
      .update({ fulfillment_mode: change.mode, updated_at: now })
      .eq("id", change.cartItemId)
    if (error) return { error: error.message }
  }

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

export async function getMarketplaceCustomerStoreCreditAction(partnerId: string) {
  const user = await requireUser()
  if (!user) return { success: false, availableCredit: 0 }

  const admin = getAdminClient()

  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("is_active", true)
    .neq("erp_disabled", true)
    .maybeSingle()
  if (!partner?.id) return { success: false, availableCredit: 0 }

  // Buscar cliente por marketplace_user_id ou email para este parceiro
  const { data: customer } = await admin
    .from("customers")
    .select("id, store_credit")
    .eq("partner_id", partnerId)
    .or(`marketplace_user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle()

  const customerId = customer?.id || null

  let query = admin
    .from("store_credits")
    .select("remaining_amount")
    .eq("partner_id", partnerId)
    .eq("status", "ACTIVE")
    .gt("remaining_amount", 0)

  if (customerId) {
    query = query.or(`customer_id.eq.${customerId},customer_user_id.eq.${user.id}`)
  } else {
    query = query.eq("customer_user_id", user.id)
  }

  const { data: credits, error } = await query

  if (error) {
    console.error("Erro ao buscar store_credits do cliente:", error)
    return { success: false, availableCredit: Number(customer?.store_credit || 0) }
  }

  const totalCredit = (credits || []).reduce((sum: number, c: any) => sum + Number(c.remaining_amount || 0), 0)

  return {
    success: true,
    availableCredit: totalCredit,
    customerId,
  }
}

