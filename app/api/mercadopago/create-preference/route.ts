import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/authorization"
import { SecureLogger } from "@/lib/secure-logger"
import { withCSRFProtection } from "@/lib/security/csrf-middleware"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import { validateCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import { resolveCheckoutCartLinesFresh } from "@/lib/cache/checkout-cache"
import { quoteDeliveryFeeAction } from "@/app/actions/shared/delivery"
import { issuePaymentQuote } from "@/lib/mercadopago/payment-quote"

interface PreferenceRequest {
  items?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
    service_id?: string
  }>
  products?: Array<{
    id: string
    name: string
    price: number
    quantity: number
    variant_id?: string
    service_id?: string
  }>
  partnerId?: string
  storeId?: string
  buyerId?: string
  couponCode?: string | null
  deliveryFee?: number
  deliveryType?: "delivery" | "pickup"
  deliveryAddress?: string
  cartItemIds?: string[]
  payDepositOnly?: boolean
  quoteOnly?: boolean
  checkoutPricing?: {
    subtotal?: number
    couponDiscount?: number
    paymentMethodDiscount?: number
    paymentMethodInterest?: number
    paymentMethodFee?: number
    paymentMethodFixedFee?: number
    deliveryFee?: number
    finalTotal: number
  }
}

async function handler(request: NextRequest) {
  try {
    const body: PreferenceRequest = await request.json()
    SecureLogger.info("MP preference request received", {
      hasItems: Boolean(body.items?.length || body.products?.length),
      cartItemCount: body.cartItemIds?.length || 0,
      hasCoupon: Boolean(body.couponCode),
      deliveryType: body.deliveryType || "pickup",
      hasClientPricingSnapshot: Boolean(body.checkoutPricing),
    })

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
      const resolved = await resolveCheckoutCartLinesFresh(adminClient, user.id, body.cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      partnerId = resolved.partnerId
    } else {
      const productIds = items.filter(i => !i.variant_id && !i.service_id).map(i => i.id).filter(Boolean)
      const serviceIds = items.map(i => i.service_id).filter(Boolean) as string[]
      const variantIds = items.map(i => i.variant_id || i.id).filter(Boolean) as string[]
      const [productsRes, variantsRes, servicesRes] = await Promise.all([
        adminClient.from("products").select("id, partner_id").in("id", productIds),
        adminClient.from("product_variants").select("id, products!inner(partner_id)").in("id", variantIds),
        adminClient.from("services").select("id, partner_id").in("id", serviceIds),
      ])
      const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
      const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))
      const servicesMap = new Map<string, any>(servicesRes.data?.map((s: any) => [s.id, s]))
      const resolvedPartnerIds = items.map(item => {
        const variant = item.variant_id ? variantsMap.get(item.variant_id) : variantsMap.get(item.id)
        return variant?.products?.partner_id || productsMap.get(item.id)?.partner_id || (item.service_id ? servicesMap.get(item.service_id)?.partner_id : undefined)
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
        // Pode ser uma variante - buscar via product_variants
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
    let deliveryFee = 0
    let deliveryStoreId: string | null = body.storeId || null

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

      const resolved = await resolveCheckoutCartLinesFresh(adminClient, user.id, body.cartItemIds!)
      if (!resolved.success) {
        return NextResponse.json({ error: resolved.error }, { status: 400 })
      }
      deliveryStoreId = resolved.lines.find((line) => line.storeId)?.storeId || deliveryStoreId

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
      const productIds = items.filter(i => !i.variant_id && !i.service_id).map(i => i.id).filter(Boolean)
      const serviceIds = items.map(i => i.service_id).filter(Boolean) as string[]
      const variantIds = items.map(i => i.variant_id || i.id).filter(Boolean) as string[]

      const [productsRes, variantsRes, servicesRes] = await Promise.all([
        adminClient
          .from("products")
          .select("id, price, promotional_price, stock_available, partner_id, name, store_id")
          .in("id", productIds),
        adminClient
          .from("product_variants")
          .select("id, price_adjustment, stock_available, product_id, products!inner(partner_id, price, promotional_price, name, store_id)")
          .in("id", variantIds),
        adminClient
          .from("services")
          .select("id, price, promotional_price, partner_id, name, store_id")
          .in("id", serviceIds)
      ])

      const productsMap = new Map<string, any>(productsRes.data?.map((p: any) => [p.id, p]))
      const variantsMap = new Map<string, any>(variantsRes.data?.map((v: any) => [v.id, v]))
      const servicesMap = new Map<string, any>(servicesRes.data?.map((s: any) => [s.id, s]))

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
        const service = item.service_id ? servicesMap.get(item.service_id) : null

        if (service) {
          const basePrice = Number(service.price)
          const promoPrice = service.promotional_price ? Number(service.promotional_price) : 0
          resolvedPrice = (promoPrice > 0 && promoPrice < basePrice) ? promoPrice : basePrice
          resolvedStock = Number.MAX_SAFE_INTEGER
          resolvedPartnerId = service.partner_id
          resolvedName = service.name
          deliveryStoreId = deliveryStoreId || service.store_id || null
        } else if (variant) {
          // Encontrado como variante
          const parentProduct = variant.products as any
          resolvedPrice = variant.price_adjustment
            ? Number(variant.price_adjustment)
            : Number(parentProduct.price)
          resolvedStock = variant.stock_available ?? 0
          resolvedPartnerId = parentProduct.partner_id
          resolvedName = parentProduct.name
          deliveryStoreId = deliveryStoreId || parentProduct.store_id || null
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
            deliveryStoreId = deliveryStoreId || product.store_id || null
          } else {
            return NextResponse.json({ error: `Produto/Variante ${item.id} não encontrado` }, { status: 400 })
          }
        }

        // Verificar que o produto pertence ao parceiro
        if (resolvedPartnerId !== partnerId) {
          SecureLogger.error("Catalog item partner mismatch in preference", { productId: item.id, serviceId: item.service_id })
          return NextResponse.json({ error: "Produto não pertence a este vendedor" }, { status: 400 })
        }

        const itemTotal = resolvedPrice * item.quantity
        totalAmount += itemTotal

        preferenceItems.push({
          title: resolvedName,
          description: `${service ? "Serviço" : "Produto"}: ${resolvedName}`,
          unit_price: resolvedPrice,
          quantity: item.quantity,
          currency_id: "BRL",
        })
      }

      couponItems = items.map(i => ({ productId: i.id }))
    }

    // ── Central pricing engine (única fonte de verdade) ──────────────────────
    if (body.deliveryType === "delivery") {
      if (!body.deliveryAddress?.trim()) {
        return NextResponse.json({ error: "Endereço de entrega não informado" }, { status: 400 })
      }
      const deliveryQuote = await quoteDeliveryFeeAction({
        partnerId,
        storeId: deliveryStoreId,
        destinationAddress: body.deliveryAddress,
        orderSubtotal: totalAmount,
      })
      if (!deliveryQuote.success) {
        return NextResponse.json({ error: deliveryQuote.error }, { status: 400 })
      }
      deliveryFee = Number(deliveryQuote.fee || 0)
    }

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

    // SEGURANÇA: Validar total usando o snapshot do checkout quando disponível
    const checkoutPricing = body.checkoutPricing
    if (checkoutPricing) {
      const snapshotFinalTotal = Number(checkoutPricing.finalTotal || 0)
      if (snapshotFinalTotal > 0 && Math.abs(snapshotFinalTotal - totalAmount) > 0.01) {
        const snapshotSubtotal = Number(checkoutPricing.subtotal || 0)
        const snapshotDeliveryFee = Number(checkoutPricing.deliveryFee || 0)
        const snapshotCouponDiscount = Number(checkoutPricing.couponDiscount || 0)
        const snapshotMethodDiscount = Number(checkoutPricing.paymentMethodDiscount || 0)
        const snapshotMethodInterest = Number(checkoutPricing.paymentMethodInterest || 0)
        const snapshotMethodFee = Number(checkoutPricing.paymentMethodFee || 0)
        const snapshotMethodFixedFee = Number(checkoutPricing.paymentMethodFixedFee || 0)
        const expectedFromSnapshot = Math.round((snapshotSubtotal + snapshotDeliveryFee - snapshotCouponDiscount - snapshotMethodDiscount + snapshotMethodInterest + snapshotMethodFee + snapshotMethodFixedFee + Number.EPSILON) * 100) / 100
        if (Math.abs(expectedFromSnapshot - snapshotFinalTotal) > 0.01) {
          SecureLogger.warn("MP preference pricing snapshot self-validation mismatch", {
            expectedFromSnapshot,
            snapshotFinalTotal,
            serverTotal: totalAmount,
          })
          return NextResponse.json({ error: "Os valores do checkout não conferem. Atualize a página e tente novamente." }, { status: 400 })
        }
      }
    }

    if (totalAmount <= 0 || totalAmount > 999999) {
      SecureLogger.error("Invalid preference total amount", { totalAmount })
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    const paymentQuote = issuePaymentQuote({
      userId: user.id,
      partnerId,
      maxAmount: totalAmount,
    })

    if (body.quoteOnly) {
      return NextResponse.json({ success: true, payment_quote: paymentQuote })
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

      SecureLogger.error("Mercado Pago preference creation failed", {
        status: mpResponse.status,
        errorMessage,
        providerErrorCode: mpErrorData?.error || mpErrorData?.code || null,
        providerCauseCount: Array.isArray(mpErrorData?.cause) ? mpErrorData.cause.length : 0,
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
      payment_quote: paymentQuote,
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
