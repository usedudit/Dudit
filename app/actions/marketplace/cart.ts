"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidateCart, revalidateOrders } from "@/lib/utils/revalidation"
// Removed createSupabaseAdmin
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getAdminClient } from "@/lib/supabase/admin"
import { getUserSessionData } from "@/lib/data/user"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { reserveOrderInventory } from "@/lib/stock/reservations"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import { toCanonicalPaymentType } from "@/lib/payments/payment-method"
import { pickBestPaymentMethod } from "@/lib/services/payment-method.service"
import { calculatePaymentAmounts } from "@/lib/payments/calculation"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"

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
export const getCachedCart = async (userId: string) => {
  const supabase = getAdminClient()

  // 1. Busca Itens do Carrinho e Dados Relacionados
  // Endereços são buscados separadamente para não quebrar a query principal
  const { data: cartItems, error } = await supabase
    .from("cart_items")
    .select(`
      id,
      product_id,
      variant_id,
      partner_id,
      quantity,
      selected,
      created_at,
      products(id, name, price, promotional_price, images, stock_quantity, stock_available, availability_value, availability_unit),
      product_variants(id, variant_name, variant_type, variant_value, price_adjustment, stock_quantity, stock_available, variant_options),
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

  // 2. Busca Métodos de Pagamento dos Parceiros Envolvidos
  const partnerIds = [...new Set(cartItems.map((item: any) => item.partner_id))]

  const { data: paymentMethods } = await supabase
    .from("payment_methods")
    .select("partner_id, payment_type, type, is_active")
    .in("partner_id", partnerIds)
    .eq("is_active", true)

  // 2b. Busca Endereços dos Parceiros (separado para não quebrar a query principal)
  let partnerAddresses: Record<string, any[]> = {}
  try {
    const { data: addresses } = await supabase
      .from("addresses")
      .select("id, partner_id, zip_code, street, number, complement, neighborhood, city, state, is_default")
      .in("partner_id", partnerIds)

    if (addresses) {
      partnerAddresses = addresses.reduce((acc: any, addr: any) => {
        if (!acc[addr.partner_id]) acc[addr.partner_id] = []
        acc[addr.partner_id].push(addr)
        return acc
      }, {})
    }
  } catch (e) {
    console.error("Erro ao buscar endereços dos parceiros (não-crítico):", e)
  }

  // 3. Agrupa os itens por Loja (Parceiro)
  const itemsByPartner = cartItems.reduce((acc: any, item: any) => {
    const partnerId = item.partner_id
    if (!acc[partnerId]) {
      const partner = item.partners ? { ...item.partners } : null
      // Anexa endereços ao parceiro
      if (partner) {
        partner.addresses = partnerAddresses[partnerId] || []
      }
      acc[partnerId] = {
        partner,
        items: [],
        paymentMethods: Array.from(
          new Set(
            (paymentMethods || [])
              .filter((pm: any) => pm.partner_id === partnerId)
              .map((pm: any) => toCanonicalPaymentType(pm.type || pm.payment_type))
          )
        ),
      }
    }
    acc[partnerId].items.push(item)
    return acc
  }, {})

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
        product_id: resolvedProductId,
        variant_id: variantId || null,
        quantity,
        selected: true
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

export async function checkoutCartAction(
  partnerItems: { cartItemId: string; productId: string; variantId?: string; quantity: number }[],
  deliveryType: "delivery" | "pickup",
  deliveryAddress: string,
  paymentMethod: string,
  installments = 1,
  notes?: string,
  couponCode?: string | null,
  useMercadoPago?: boolean,
  csrf_token?: string,
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

  // 0. Check subscription limits
  const firstItem = partnerItems[0]
  const adminClient = getAdminClient()
  const { data: firstProduct } = await adminClient.from("products").select("partner_id").eq("id", firstItem.productId).single()
  const partnerIdForLimit = firstProduct?.partner_id

  if (partnerIdForLimit) {
    const limitCheck = await checkLimit(partnerIdForLimit, "orders_per_month")
    if (!limitCheck.allowed) {
      return { error: limitCheck.message || "A loja atingiu o limite mensal de pedidos." }
    }
  }

  if (!partnerItems || partnerItems.length === 0) {
    return { error: "Por favor, selecione pelo menos um item para finalizar o pedido" }
  }

  const { data: buyerProfile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .single()

  const productIds = [...new Set(partnerItems.map((item: any) => item.productId))]
  const { data: products } = await adminClient.from("products").select("*").in("id", productIds)

  if (!products || products.length === 0) return { error: "Produtos não encontrados" }

  // Buscar variantes se houver itens com variantId
  const variantIds = partnerItems.map((item: any) => item.variantId).filter(Boolean) as string[]
  let variants: any[] = []
  if (variantIds.length > 0) {
    const { data: variantData } = await adminClient
      .from("product_variants")
      .select("id, variant_name, price_adjustment, stock_available, is_active")
      .in("id", variantIds)
    variants = variantData || []
  }

  let totalAmount = 0
  const orderItems = []

  for (const item of partnerItems) {
    const product = products.find((p: any) => p.id === item.productId)
    if (!product || !product.is_active) return { error: `Produto inativo ou não encontrado: ${product?.name || item.productId}` }

    let itemPrice: number
    let itemName: string
    if (item.variantId) {
      const variant = variants.find((v: any) => v.id === item.variantId)
      if (!variant || !variant.is_active) return { error: `Variante inativa ou não encontrada.` }
      if ((variant.stock_available ?? 0) < item.quantity) return { error: `Estoque insuficiente para: ${variant.variant_name}` }
      // Variante: usar price_adjustment como preço (preço da variante)
      itemPrice = Number(variant.price_adjustment || product.price)
      itemName = `${product.name} - ${variant.variant_name}`
    } else {
      if ((product.stock_available ?? 0) < item.quantity) return { error: `Estoque insuficiente para o produto: ${product.name}` }
      // Produto normal: usar preço promocional se disponível
      const basePrice = Number(product.price)
      const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
      itemPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
      itemName = product.name
    }

    const subtotal = itemPrice * item.quantity
    totalAmount += subtotal

    orderItems.push({
      product_id: product.id, // Always use Parent Product ID
      variant_id: item.variantId || null, // Explicitly save Variant ID
      product_name: itemName,
      product_price: itemPrice,
      quantity: item.quantity,
      subtotal,
    })
  }

  const partnerId = products[0].partner_id
  const { data: partner } = await adminClient
    .from("partners")
    .select("opening_hours")
    .eq("id", partnerId)
    .maybeSingle()
  let couponIdToSave: string | null = null
  let couponDiscountAmount = 0
  let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null

  if (couponCode?.trim()) {
    const couponResult = await validateCoupon({
      partnerId,
      code: couponCode,
      customerId: user.id,
      subtotal: totalAmount,
      items: partnerItems.map((item) => ({ productId: item.productId })),
    })

    if (couponResult.valid) {
      couponIdToSave = couponResult.couponId || null
      couponDiscountAmount = couponResult.discountAmount
      couponPricingData = couponResult.pricingCoupon || null
    }
  } else {
    const autoResult = await findBestAutomaticCoupon({
      partnerId,
      customerId: user.id,
      subtotal: totalAmount,
      items: partnerItems.map((item) => ({ productId: item.productId })),
    })

    if (autoResult.valid) {
      couponIdToSave = autoResult.couponId || null
      couponDiscountAmount = autoResult.discountAmount
      couponPricingData = autoResult.pricingCoupon || null
    }
  }

  let deliveryFee = 0
  let distanceKm: number | null = null
  let deliveryBreakdown: Record<string, unknown> | null = null
  if (deliveryType === "delivery") {
    const quote = await quoteDeliveryFeeAction({
      partnerId,
      destinationAddress: deliveryAddress,
      freeDeliveryCoupon: Boolean(couponPricingData?.freeShipping || couponPricingData?.discountType === "free_shipping"),
    })
    if (!quote.success) return { error: quote.error }
    deliveryFee = Number(quote.fee || 0)
    distanceKm = Number(quote.distanceKm || 0)
    deliveryBreakdown = quote.breakdown
  }

  const pricingResult = calculateOrderPricing({
    items: orderItems.map((item: any) => ({
      productId: item.product_id,
      serviceId: null,
      unitPrice: Number(item.product_price || 0),
      quantity: Number(item.quantity || 0),
    })),
    shippingCost: deliveryFee,
    coupon: couponPricingData,
  })

  totalAmount = pricingResult.finalTotal
  couponDiscountAmount = pricingResult.couponDiscountAmount

  const chosenType = toCanonicalPaymentType(paymentMethod)
  const bestMethod = await pickBestPaymentMethod(supabase as any, chosenType, partnerId, { preferDefault: true })
  if (!bestMethod) {
    return { error: "Nenhum método de pagamento ativo foi encontrado para o tipo selecionado." }
  }

  let paymentAwareTotal = totalAmount
  if (bestMethod?.id) {
    const { data: fees } = await supabase
      .from("payment_method_installment_fees")
      .select("installment_number, fee_percent")
      .eq("payment_method_id", bestMethod.id)
    const calc = calculatePaymentAmounts({
      originalAmount: totalAmount,
      installmentNumber: Math.max(1, Number(installments || 1)),
      paymentMethod: {
        feePercent: Number(bestMethod.fee_percent || bestMethod.percentage_rate || 0),
        feeFixed: Number(bestMethod.fee_fixed || bestMethod.fixed_amount || 0),
        feeBearer: (bestMethod.fee_bearer || "merchant") as "merchant" | "customer",
        discountPercent: Number(bestMethod.discount_percent || 0),
        maxInstallments: Number(bestMethod.max_installments || 1),
        installmentFees: (fees || []).map((row: any) => ({
          installmentNumber: Number(row.installment_number || 1),
          feePercent: Number(row.fee_percent || 0),
        })),
      },
    })
    paymentAwareTotal = Number(calc.finalAmount || totalAmount)
  }

  const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(
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

  const orderPreparation = computeOrderPreparationEstimate({
    products,
    openingHours: (partner as any)?.opening_hours || null,
    pickupWindowMinutes: 30,
    deliveryTimeEstimateMinutes: 0,
  })

  const preparationPayload = orderPreparation ? {
    preparation_time_minutes: orderPreparation.preparationTimeMinutes,
    estimated_ready_at: orderPreparation.readyAt.toISOString(),
    pickup_window_start: orderPreparation.pickupWindowStart.toISOString(),
    pickup_window_end: orderPreparation.pickupWindowEnd.toISOString(),
    estimated_delivery_at: deliveryType === "delivery" ? orderPreparation.estimatedDeliveryAt.toISOString() : null,
  } : {}

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      buyer_id: user.id,
      customer_name: buyerProfile?.full_name || null,
      partner_id: partnerId,
      total_amount: paymentAwareTotal,
      shipping_cost: deliveryFee,
      delivery_fee: deliveryFee,
      distance_km: distanceKm,
      delivery_breakdown: deliveryBreakdown,
      delivery_type: deliveryType,
      delivery_address: deliveryAddress,
      payment_method: useMercadoPago ? "Mercado Pago" : paymentMethod,
      payment_breakdown: useMercadoPago
        ? []
        : [{
          method: chosenType,
          amount: paymentAwareTotal,
          paymentMethodId: bestMethod.id,
          installmentNumber: Math.max(1, Number(installments || 1)),
        }],
      payment_provider: useMercadoPago ? "Mercado Pago" : paymentMethod,
      situation: "pending",
      notes,
      finance_account_id: financeAccountId,
      coupon_id: couponIdToSave,
      discount_amount: couponDiscountAmount,
      ...preparationPayload,
    })
    .select()
    .single()

  if (orderError || !order) return { error: orderError?.message || "Erro ao criar pedido" }

  // Increment usage counter
  increment_usage_counter(partnerId, "orders_month_count").catch(console.error)

  const itemsToInsert = orderItems.map((item: any) => ({
    ...item,
    order_id: order.id,
  }))

  const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)

  if (itemsError) {
    await supabase.from("orders").delete().eq("id", order.id)
    return { error: "Erro ao adicionar itens ao pedido" }
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

  const reserveResult = await reserveOrderInventory({
    client: adminClient,
    partnerId,
    orderId: order.id,
    items: partnerItems.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId || null,
      quantity: item.quantity,
    })),
  })

  if ("error" in reserveResult) {
    await supabase.from("order_items").delete().eq("order_id", order.id)
    await supabase.from("orders").delete().eq("id", order.id)
    return { error: reserveResult.error }
  }

  // SECURITY FIX (MED-02): Scope cart deletion to current user
  const cartItemIds = partnerItems.map((item: any) => item.cartItemId)
  await supabase.from("cart_items").delete().in("id", cartItemIds).eq("user_id", user.id)

  if (couponIdToSave) {
    await supabase.from("coupon_usages").upsert(
      {
        coupon_id: couponIdToSave,
        customer_id: user.id,
        order_id: order.id,
      },
      { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
    )
  }

  // Limpa Cache
  for (const productId of [...new Set(partnerItems.map((item: any) => item.productId))]) {
    await invalidateProductCache(productId, partnerId, "update", { silent: true })
  }
  await revalidateCart(user.id)
  await revalidateOrders(products[0].partner_id)

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    useMercadoPago,
    couponApplied: Boolean(couponIdToSave),
    couponDiscount: couponDiscountAmount,
    finalTotal: paymentAwareTotal,
  }
}
