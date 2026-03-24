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
      products(id, name, price, promotional_price, images, stock_quantity),
      product_variants(id, variant_name, variant_type, variant_value, price_adjustment, stock_quantity, variant_options),
      partners(
        id, 
        store_name, 
        store_image_url,
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
    .select("partner_id, payment_type, is_active")
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
        paymentMethods:
          paymentMethods
            ?.filter((pm: any) => pm.partner_id === partnerId)
            .map((pm: any) => pm.payment_type) || [],
      }
    }
    acc[partnerId].items.push(item)
    return acc
  }, {})

  return itemsByPartner
}

// --- ACTIONS DE ESCRITA (Adicionar/Remover/Checkout) ---

export async function addToCartAction(productId: string, quantity = 1, csrf_token?: string, variantId?: string) {
  await requireRateLimit(RateLimitCategory.CART)
  // Validação CSRF
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  // LOW-04: Limit cart items per user
  const { count: currentCartCount } = await supabase
    .from("cart_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)

  if (currentCartCount && currentCartCount >= 50) {
    return { error: "O limite de itens na sua sacola foi atingido. Remova alguns itens para adicionar mais." }
  }

  let resolvedProductId = productId
  let partnerId: string
  let partnerUserId: string | null = null

  // Use admin client to read product and variant to bypass strict RLS 
  // that might block public users from viewing full relation chains.
  const adminClient = getAdminClient()

  if (variantId) {
    // Busca variante e resolve o produto pai
    const { data: variant, error: variantError } = await adminClient
      .from("product_variants")
      .select("id, product_id, products(partner_id, partners(user_id))")
      .eq("id", variantId)
      .single()

    if (variantError || !variant) {
      return { error: "Variante não encontrada" }
    }

    resolvedProductId = variant.product_id
    const parentProduct = variant.products as any
    partnerId = parentProduct.partner_id
    partnerUserId = parentProduct.partners?.user_id
  } else {
    // Busca produto normal
    const { data: product, error: productError } = await adminClient
      .from("products")
      .select("partner_id, partners(user_id)")
      .eq("id", productId)
      .single()

    if (productError || !product) {
      return { error: "Produto não encontrado" }
    }

    partnerId = product.partner_id
    // @ts-ignore
    partnerUserId = product.partners?.user_id
  }

  // Bloqueia compra da própria loja: verifica dono (legado) E membros da equipe
  if (partnerUserId === user.id) {
    return { error: "Você não pode comprar produtos da sua própria loja" }
  }

  // Verifica se o comprador é membro da equipe do vendedor (via partner_users)
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

  // Verifica item existente (Upsert logic) — inclui variant_id na busca
  let existingQuery = supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("product_id", resolvedProductId)

  if (variantId) {
    existingQuery = existingQuery.eq("variant_id", variantId)
  } else {
    existingQuery = existingQuery.is("variant_id", null)
  }

  const { data: existingItem } = await existingQuery.maybeSingle()

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
}export async function toggleCartPartnerSelectionAction(partnerId: string, selected: boolean, csrf_token?: string) {
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

// --- CHECKOUT HELPER ---
async function generateOrderNumber(supabase: any): Promise<string> {
  const { data: lastOrder } = await supabase
    .from("orders")
    .select("order_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  let nextNumber = 1
  if (lastOrder?.order_number) {
    const match = lastOrder.order_number.match(/#([A-Z0-9]{3})-/)
    if (match) {
      const currentBase36 = match[1]
      const currentNum = parseInt(currentBase36, 36)
      nextNumber = currentNum + 1
    }
  }

  const firstPart = nextNumber.toString(36).toUpperCase().padStart(3, "0")
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let secondPart = ""
  for (let i = 0; i < 5; i++) {
    secondPart += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return `#${firstPart}-${secondPart}`
}

export async function checkoutCartAction(
  partnerItems: { cartItemId: string; productId: string; variantId?: string; quantity: number }[],
  deliveryType: "delivery" | "pickup",
  deliveryAddress: string,
  paymentMethod: string,
  notes?: string,
  useMercadoPago?: boolean,
  csrf_token?: string,
) {
  await requireRateLimit(RateLimitCategory.ORDER_CREATE)

  // Validação CSRF
  // SECURITY: CSRF validation is mandatory — cannot be skipped
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
      .select("id, variant_name, price_adjustment, stock_quantity, is_active")
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
    let itemId: string

    if (item.variantId) {
      const variant = variants.find((v: any) => v.id === item.variantId)
      if (!variant || !variant.is_active) return { error: `Variante inativa ou não encontrada.` }
      if (variant.stock_quantity < item.quantity) return { error: `Estoque insuficiente para: ${variant.variant_name}` }
      // Variante: usar price_adjustment como preço (preço da variante)
      itemPrice = Number(variant.price_adjustment || product.price)
      itemName = `${product.name} - ${variant.variant_name}`
      itemId = variant.id
    } else {
      if (product.stock_quantity < item.quantity) return { error: `Estoque insuficiente para o produto: ${product.name}` }
      // Produto normal: usar preço promocional se disponível
      const basePrice = Number(product.price)
      const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
      itemPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
      itemName = product.name
      itemId = product.id
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
  const orderNumber = await generateOrderNumber(supabase)

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      buyer_id: user.id,
      customer_name: buyerProfile?.full_name || null,
      partner_id: partnerId,
      total_amount: totalAmount,
      delivery_type: deliveryType,
      delivery_address: deliveryAddress,
      payment_method: useMercadoPago ? "Mercado Pago" : paymentMethod,
      situation: "pending",
      notes,
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
  await Promise.all(
    partnerItems.map(async (item) => {
      const { error: stockError } = await adminClient.rpc("decrement_stock_atomic", {
        p_product_id: item.productId,
        p_quantity: item.quantity,
        p_variant_id: item.variantId || null
      })

      if (stockError) {
        console.error("[CART-STOCK] Erro ao decrementar estoque:", stockError)
        // O pedido já foi criado neste ponto, registramos o erro no log
        // para monitoramento pois transações JS multi-tabela não são ACID seguras no Supabase sem RPC.
      }
    })
  )

  // SECURITY FIX (MED-02): Scope cart deletion to current user
  const cartItemIds = partnerItems.map((item: any) => item.cartItemId)
  await supabase.from("cart_items").delete().in("id", cartItemIds).eq("user_id", user.id)

  // Limpa Cache
  await revalidateCart(user.id)
  await revalidateOrders(products[0].partner_id)

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    useMercadoPago,
  }
}
