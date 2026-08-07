import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { validateCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { cachedResolveCheckoutCartLines } from "@/lib/cache/checkout-cache"

interface PreferenceRequest {
  items?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
  }>
  products?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
  }>
  partnerId?: string
  buyerId?: string
  couponCode?: string | null
  deliveryFee?: number
  deliveryType?: "delivery" | "pickup"
  deliveryAddress?: string
  cartItemIds?: string[]
  payDepositOnly?: boolean
  checkoutPricing?: {
    finalTotal: number
  }
}

async function handler(request: NextRequest) {
  try {
    const body: PreferenceRequest = await request.json()
    console.log("Request body:", { ...body, partnerId: body.partnerId ? "[HIDDEN]" : undefined })

    const user = await getCurrentUser()
    const adminClient = createAdminClient()

    // SEGURANÇA: Verificar que o usuário está autenticado
    if (!user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Normalizar items (podem vir como 'products' ou 'items')
    const items = body.items || body.products || []

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Nenhum produto fornecido" }, { status: 400 })
    }

    // O partnerId do client Ã© apenas uma alegação. Resolva o parceiro real
    // diretamente no carrinho/produtos antes de consultar configuração/token MP.
    let partnerId: string | undefined
    const useUnifiedCart = Boolean(body.cartItemIds && body.cartItemIds.length > 0)

    if (useUnifiedCart) {
      const resolved = await cachedResolveCheckoutCartLines(adminClient, user.id, body.cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      partnerId = resolved.partnerId
    } else {
      const productIds = items.filter(i => !i.variant_id).map(i => i.id)
      const variantIds = items.map(i => i.variant_id || i.id).filter(Boolean) as string[]
      const [productsRes, variantsRes] = await Promise.all([
        adminClient.from("products").select("id, partner_id").in("id", productIds),
        adminClient.from("product_variants").select("id, products!inner(partner_id)").in("id", variantIds),
      ])
      const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
      const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))
      const resolvedPartnerIds = items.map(item => {
        const variant = item.variant_id ? variantsMap.get(item.variant_id) : variantsMap.get(item.id)
        return variant?.products?.partner_id || productsMap.get(item.id)?.partner_id
      })
      if (resolvedPartnerIds.some(id => !id) || new Set(resolvedPartnerIds).size !== 1) {
        return NextResponse.json({ error: "Itens de vendedores diferentes ou inválidos" }, { status: 400 })
      }
      partnerId = resolvedPartnerIds[0]
    }

    if (!partnerId) {
      return NextResponse.json({ error: "Vendedor não identificado" }, { status: 400 })
    }
    if (body.partnerId && body.partnerId !== partnerId) {
      SecureLogger.warn("Client partnerId mismatch in preference", { claimedPartnerId: body.partnerId, resolvedPartnerId: partnerId })
      return NextResponse.json({ error: "Vendedor inválido para os itens informados" }, { status: 400 })
    }

    if (!partnerId && items.length > 0) {
      // Tentar obter partner_id do primeiro item (pode ser produto ou variante)
      const { data: product } = await adminClient
        .from("products")
        .select("partner_id")
        .eq("id", items[0].id)
        .single()

      if (product) {
        partnerId = product.partner_id
      } else {
        // Pode ser uma variante — buscar via product_variants
        const { data: variant } = await adminClient
          .from("product_variants")
          .select("products(partner_id)")
          .eq("id", items[0].id)
          .single()

        if (variant) {
          partnerId = (variant.products as any)?.partner_id
        }
      }
    }

    if (!partnerId) {
      return NextResponse.json({ error: "Vendedor não identificado" }, { status: 400 })
    }

    const { data: partner, error: partnerError } = await adminClient
      .from("partners")
      .select("id, mp_accepted_payment_methods")
      .eq("id", partnerId)
      .single()

    if (partnerError) {
      console.error("Partner query error:", partnerError)
      return NextResponse.json({ error: `Erro ao buscar vendedor: ${partnerError.message}` }, { status: 400 })
    }

    if (!partner) {
      console.error("Partner not found for ID:", partnerId)
      return NextResponse.json({ error: "Vendedor não encontrado" }, { status: 400 })
    }

    let mpAccessToken: string
    try {
      mpAccessToken = await getValidMercadoPagoAccessToken(partnerId)
    } catch (err: any) {
      SecureLogger.error("Failed to obtain valid MP token", { partnerId, error: err.message })
      return NextResponse.json({ error: "Sessão do Mercado Pago inválida ou expirada" }, { status: 400 })
    }

    let totalAmount = 0
    const preferenceItems: any[] = []
    let couponItems: any[] = []

    if (useUnifiedCart) {
      // Update pay_deposit_only in DB
      await adminClient
        .from("cart_items")
        .update({ pay_deposit_only: Boolean(body.payDepositOnly), updated_at: new Date().toISOString() })
        .in("id", body.cartItemIds!)
        .eq("user_id", user.id)

      if (body.deliveryType) {
        const targetFulfillmentMode = body.deliveryType === "delivery" ? "delivery" : "pickup"
        await adminClient
          .from("cart_items")
          .update({ fulfillment_mode: targetFulfillmentMode, updated_at: new Date().toISOString() })
          .in("id", body.cartItemIds!)
          .eq("user_id", user.id)
          .or("item_type.eq.product,item_type.is.null,product_id.not.is.null")
      }

      const resolved = await cachedResolveCheckoutCartLines(adminClient, user.id, body.cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }

      for (const line of resolved.lines) {
        preferenceItems.push({
          title: line.lineName,
          description: `Item: ${line.lineName}`,
          unit_price: line.unitPrice,
          quantity: line.quantity,
          currency_id: "BRL",
        })
        totalAmount += line.unitPrice * line.quantity
      }

      couponItems = resolved.lines.map(l => ({
        productId: l.productId || null,
        serviceId: l.serviceId || null,
        recurringPlanId: l.recurringPlanId || null,
      }))
    } else {
      const productIds = items.filter(i => !i.variant_id).map(i => i.id)
      const variantIds = items.map(i => i.variant_id || i.id).filter(Boolean) as string[]

      const [productsRes, variantsRes] = await Promise.all([
        adminClient
          .from("products")
          .select("id, price, promotional_price, stock_available, partner_id, name")
          .in("id", productIds),
        adminClient
          .from("product_variants")
          .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price, name)")
          .in("id", variantIds)
      ])

      const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
      const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))

      for (const item of items) {
        // Validar quantidade
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) {
          return NextResponse.json({ error: `Quantidade inválida para ${item.name}` }, { status: 400 })
        }

        let resolvedPrice: number
        let resolvedStock: number
        let resolvedPartnerId: string
        let resolvedName: string

        const variant = item.variant_id ? variantsMap.get(item.variant_id) : (variantsMap.get(item.id) || null)

        if (variant) {
          // Encontrado como variante
          const parentProduct = variant.products as any
          resolvedPrice = variant.price_adjustment
            ? Number(variant.price_adjustment)
            : Number(parentProduct.price)
          resolvedStock = variant.stock_available ?? 0
          resolvedPartnerId = parentProduct.partner_id
          resolvedName = parentProduct.name
        } else {
          // Tentar como produto
          const product = productsMap.get(item.id)
          if (product) {
            const basePrice = Number(product.price)
            const promoPrice = product.promotional_price ? Number(product.promotional_price) : 0
            resolvedPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
            resolvedStock = product.stock_available
            resolvedPartnerId = product.partner_id
            resolvedName = product.name
          } else {
            return NextResponse.json({ error: `Produto/Variante ${item.id} não encontrado` }, { status: 400 })
          }
        }

        // Verificar que o produto pertence ao parceiro
        if (resolvedPartnerId !== partnerId) {
          SecureLogger.error("Product partner mismatch in preference", { productId: item.id })
          return NextResponse.json({ error: "Produto não pertence a este vendedor" }, { status: 400 })
        }

        // Verificar estoque
        if (resolvedStock < item.quantity) {
          return NextResponse.json({ error: `Estoque insuficiente para ${resolvedName}` }, { status: 400 })
        }

        const itemTotal = resolvedPrice * item.quantity
        totalAmount += itemTotal

        preferenceItems.push({
          title: resolvedName,
          description: `Produto: ${resolvedName}`,
          unit_price: resolvedPrice,
          quantity: item.quantity,
          currency_id: "BRL",
        })
      }

      couponItems = items.map(i => ({ productId: i.id }))
    }

    // ── Central pricing engine (única fonte de verdade) ──────────────────────
    const deliveryFee = Number(body.deliveryFee || 0)

    // Build pricing items from already-resolved preference items
    type PricingItem = import("@/lib/services/pricing-engine").PricingItem
    type PricingCoupon = import("@/lib/services/pricing-engine").PricingCoupon
    const pricingItems: PricingItem[] = preferenceItems
      .filter((p: any) => p.unit_price > 0)
      .map((p: any) => ({
        unitPrice: p.unit_price,
        quantity: p.quantity,
      }))

    // Coupon validation
    let couponPricingData: PricingCoupon | null = null
    let couponDiscount = 0
    if (body.couponCode) {
      const itemsSubtotal = pricingItems.reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0)
      const couponResult = await validateCoupon({
        partnerId,
        code: body.couponCode,
        customerId: user.id,
        subtotal: itemsSubtotal,
        shippingCost: deliveryFee,
        items: couponItems,
      }, adminClient)

      if (couponResult.valid) {
        couponDiscount = couponResult.discountAmount
        couponPricingData = {
          id: couponResult.couponId || "",
          code: body.couponCode,
          discountType: "fixed",
          discountValue: couponDiscount,
          maxDiscountValue: null,
          freeShipping: false,
          allowCombination: true,
        }

        if (couponDiscount > 0) {
          preferenceItems.push({
            title: `Desconto: ${body.couponCode}`,
            unit_price: -couponDiscount,
            quantity: 1,
            currency_id: "BRL",
          })
        }
      }
    }

    // Delivery fee item for MP display
    if (deliveryFee > 0) {
      preferenceItems.push({
        title: "Taxa de entrega",
        unit_price: deliveryFee,
        quantity: 1,
        currency_id: "BRL",
      })
    }

    // Run central pricing for authoritative total
    const pricingResult = calculateOrderPricing({
      items: pricingItems,
      shippingCost: deliveryFee,
      coupon: couponPricingData,
    })
    totalAmount = pricingResult.finalTotal

    // SEGURANÇA: Validar total
    const checkoutFinalTotal = Number(body.checkoutPricing?.finalTotal || 0)
    if (checkoutFinalTotal > 0) {
      const adjustment = Math.round((checkoutFinalTotal - totalAmount + Number.EPSILON) * 100) / 100
      if (Math.abs(adjustment) > 0.01) {
        preferenceItems.push({
          title: "Ajuste do checkout",
          unit_price: adjustment,
          quantity: 1,
          currency_id: "BRL",
        })
      }
      totalAmount = checkoutFinalTotal
    }

    if (totalAmount <= 0 || totalAmount > 999999) {
      SecureLogger.error("Invalid preference total amount", { totalAmount })
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    // Criar preferência no Mercado Pago
    const preferencePayload: Record<string, any> = {
      items: preferenceItems,
      payer: {
        name: "Cliente",
        email: user.email,
      },
      external_reference: `${partnerId}-${Date.now()}`,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/webhook`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL}/payment/failure`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL}/payment/pending`,
      },
      auto_return: "approved",
    }

    // Filter payment methods based on partner's MP accepted payment methods
    const acceptedMethods = (partner as any)?.mp_accepted_payment_methods || {}
    const excludedPaymentTypes: Array<{ id: string }> = []
    if (acceptedMethods.pix === false) excludedPaymentTypes.push({ id: "pix" })
    if (acceptedMethods.credit_card === false) excludedPaymentTypes.push({ id: "credit_card" })
    if (acceptedMethods.debit_card === false) excludedPaymentTypes.push({ id: "debit_card" })
    if (acceptedMethods.boleto === false) excludedPaymentTypes.push({ id: "ticket" })
    if (acceptedMethods.mercado_pago_wallet === false) excludedPaymentTypes.push({ id: "account_money" })
    if (excludedPaymentTypes.length > 0) {
      preferencePayload.payment_methods = {
        excluded_payment_types: excludedPaymentTypes,
      }
    }

    // Adicionar expiração de 30 minutos (1800 segundos) para PIX
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000)
    preferencePayload.expiration_date_from = new Date().toISOString()
    preferencePayload.expiration_date_to = thirtyMinutesFromNow.toISOString()

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferencePayload),
    })

    console.log("MP Response status:", mpResponse.status)

    if (!mpResponse.ok) {
      let errorMessage = "Erro ao criar preferência de pagamento"
      let mpErrorData: any = null
      try {
        mpErrorData = await mpResponse.json()
        console.error("MP Error Response (full):", JSON.stringify(mpErrorData, null, 2))

        if (mpErrorData?.message) {
          errorMessage = mpErrorData.message
        } else if (mpErrorData?.error?.message) {
          errorMessage = mpErrorData.error.message
        } else if (mpErrorData?.errors?.[0]?.message) {
          errorMessage = mpErrorData.errors[0].message
        }
      } catch (parseErr) {
        console.error("Failed to parse MP error:", parseErr)
        errorMessage = `HTTP ${mpResponse.status}`
      }

      console.error("Final error message to return:", errorMessage)
      SecureLogger.error("Mercado Pago preference creation failed", {
        status: mpResponse.status,
        errorMessage,
        mpErrorData
      })
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const preference = await mpResponse.json()

    return NextResponse.json({
      success: true,
      preference_id: preference.id,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      init_point: preference.init_point,
    })
  } catch (error: any) {
    console.error("API Error:", error)
    console.error("Error stack:", error?.stack)
    SecureLogger.error("Failed to create preference", { error: error?.message })
    return NextResponse.json(
      { error: error?.message || "Erro interno ao criar preferência" },
      { status: 500 }
    )
  }
}

export const POST = withCSRFProtection(handler)
